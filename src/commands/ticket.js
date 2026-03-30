const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { execute: dbExecute, query } = require('../db');
const { getConfig }                 = require('../utils/guildConfig');
const { auditLog }                  = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Ticket system')

    // ─── open ──────────────────────────────────────
    .addSubcommand(sub => sub
      .setName('open')
      .setDescription('Open a new support ticket')
      .addStringOption(opt => opt
        .setName('subject')
        .setDescription('Brief description of your issue')
        .setRequired(true)
        .setMaxLength(100)))

    // ─── close ─────────────────────────────────────
    .addSubcommand(sub => sub
      .setName('close')
      .setDescription('Close the current ticket channel')
      .addStringOption(opt => opt
        .setName('reason')
        .setDescription('Reason for closing')
        .setRequired(false)
        .setMaxLength(300)))

    // ─── add ───────────────────────────────────────
    .addSubcommand(sub => sub
      .setName('add')
      .setDescription('Add a member to this ticket')
      .addUserOption(opt => opt
        .setName('user')
        .setDescription('Member to add')
        .setRequired(true)))

    // ─── remove ────────────────────────────────────
    .addSubcommand(sub => sub
      .setName('remove')
      .setDescription('Remove a member from this ticket')
      .addUserOption(opt => opt
        .setName('user')
        .setDescription('Member to remove')
        .setRequired(true))),

  cooldown: 10,

  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const sub                        = interaction.options.getSubcommand();
    const { guild, user: invoker }   = interaction;
    const config                     = await getConfig(guild.id);

    // ─── open ──────────────────────────────────────
    if (sub === 'open') {
      if (!config.ticket_category) {
        return interaction.editReply({
          content: '❌ Ticket category not configured. Ask an admin to run `/config ticketcategory`.',
        });
      }

      const subject = interaction.options.getString('subject');

      // Check for existing open ticket from this user
      const existing = await query(
        `SELECT channel_id FROM tickets
         WHERE guild_id = ? AND user_id = ? AND status = 'open'`,
        [guild.id, invoker.id],
      );

      if (existing.length > 0) {
        return interaction.editReply({
          content: `❌ You already have an open ticket: <#${existing[0].channel_id}>`,
        });
      }

      // Create the ticket channel
      let ticketChannel;
      try {
        ticketChannel = await guild.channels.create({
          name:   `ticket-${invoker.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
          type:   ChannelType.GuildText,
          parent: config.ticket_category,
          topic:  `Ticket opened by ${invoker.tag} — ${subject}`,
          permissionOverwrites: [
            {
              // @everyone — deny view
              id:   guild.id,
              deny: [PermissionFlagsBits.ViewChannel],
            },
            {
              // Ticket opener — allow view + send
              id:    invoker.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
              ],
            },
            {
              // Bot itself — allow everything
              id:    client.user.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.ReadMessageHistory,
              ],
            },
          ],
        });
      } catch (err) {
        return interaction.editReply({
          content: `❌ Failed to create ticket channel: ${err.message}`,
        });
      }

      // Record in DB
      const result = await dbExecute(
        `INSERT INTO tickets (guild_id, channel_id, user_id, subject, status)
         VALUES (?, ?, ?, ?, 'open')`,
        [guild.id, ticketChannel.id, invoker.id, subject],
      );

      const ticketId = result.insertId;

      // Send opening message with close button
      const closeButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_close')
          .setLabel('Close Ticket')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🔒'),
      );

      await ticketChannel.send({
        content: `${invoker} — your ticket has been created.`,
        embeds: [{
          color: 0x5865f2,
          title: `🎫 Ticket #${ticketId}`,
          fields: [
            { name: 'Opened by', value: `${invoker.tag}`,  inline: true  },
            { name: 'Subject',   value: subject,            inline: false },
          ],
          footer: { text: 'Support will be with you shortly. Click Close to resolve.' },
          timestamp: new Date().toISOString(),
        }],
        components: [closeButton],
      });

      await auditLog({
        guildId:     guild.id,
        moderatorId: invoker.id,
        action:      'TICKET_OPEN',
        metadata:    { ticketId, channelId: ticketChannel.id, subject },
      });

      return interaction.editReply({
        content: `✅ Ticket opened: ${ticketChannel}`,
      });
    }

    // ─── close ─────────────────────────────────────
    if (sub === 'close') {
      const reason = interaction.options.getString('reason') ?? 'No reason provided';

      // Verify this channel is an open ticket
      const ticketRows = await query(
        `SELECT * FROM tickets WHERE channel_id = ? AND status = 'open'`,
        [interaction.channelId],
      );

      if (ticketRows.length === 0) {
        return interaction.editReply({
          content: '❌ This channel is not an open ticket.',
        });
      }

      const ticket = ticketRows[0];

      // Only the opener or a moderator can close
      const isMod = interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels);
      if (ticket.user_id !== invoker.id && !isMod) {
        return interaction.editReply({
          content: '❌ Only the ticket opener or a moderator can close this ticket.',
        });
      }

      // Update DB
      await dbExecute(
        `UPDATE tickets
         SET status = 'closed', closed_by = ?, closed_at = NOW()
         WHERE channel_id = ?`,
        [invoker.id, interaction.channelId],
      );

      await auditLog({
        guildId:     guild.id,
        moderatorId: invoker.id,
        targetId:    ticket.user_id,
        action:      'TICKET_CLOSE',
        reason,
        metadata:    { ticketId: ticket.id, channelId: ticket.channel_id },
      });

      // Log to ticket log channel
      if (config.ticket_log) {
        const logChannel = guild.channels.cache.get(config.ticket_log);
        if (logChannel) {
          await logChannel.send({
            embeds: [{
              color: 0xed4245,
              title: `🔒 Ticket #${ticket.id} Closed`,
              fields: [
                { name: 'Opened by', value: `<@${ticket.user_id}>`, inline: true  },
                { name: 'Closed by', value: `${invoker.tag}`,        inline: true  },
                { name: 'Subject',   value: ticket.subject,           inline: false },
                { name: 'Reason',    value: reason,                   inline: false },
              ],
              timestamp: new Date().toISOString(),
            }],
          });
        }
      }

      // Send closing message then delete channel after 5 seconds
      await interaction.editReply({ content: '🔒 Closing ticket in 5 seconds...' });

      await interaction.channel.send({
        embeds: [{
          color:       0xed4245,
          title:       '🔒 Ticket Closed',
          description: `Closed by ${invoker.tag}\n**Reason:** ${reason}`,
          timestamp:   new Date().toISOString(),
        }],
      }).catch(() => null);

      setTimeout(async () => {
        await interaction.channel.delete(`Ticket closed by ${invoker.tag}`).catch(() => null);
      }, 5000);

      return;
    }

    // ─── add ───────────────────────────────────────
    if (sub === 'add') {
      const target = interaction.options.getUser('user');

      // Verify this is a ticket channel
      const ticketRows = await query(
        `SELECT * FROM tickets WHERE channel_id = ? AND status = 'open'`,
        [interaction.channelId],
      );

      if (ticketRows.length === 0) {
        return interaction.editReply({
          content: '❌ This channel is not an open ticket.',
        });
      }

      try {
        await interaction.channel.permissionOverwrites.create(target.id, {
          ViewChannel:        true,
          SendMessages:       true,
          ReadMessageHistory: true,
        });
      } catch (err) {
        return interaction.editReply({
          content: `❌ Failed to add user: ${err.message}`,
        });
      }

      await interaction.channel.send({
        content: `✅ ${target} has been added to this ticket by ${invoker}.`,
      });

      return interaction.editReply({
        content: `✅ Added ${target.tag} to the ticket.`,
      });
    }

    // ─── remove ────────────────────────────────────
    if (sub === 'remove') {
      const target = interaction.options.getUser('user');

      // Prevent removing the ticket opener
      const ticketRows = await query(
        `SELECT * FROM tickets WHERE channel_id = ? AND status = 'open'`,
        [interaction.channelId],
      );

      if (ticketRows.length === 0) {
        return interaction.editReply({
          content: '❌ This channel is not an open ticket.',
        });
      }

      if (ticketRows[0].user_id === target.id) {
        return interaction.editReply({
          content: '❌ You cannot remove the ticket opener.',
        });
      }

      try {
        await interaction.channel.permissionOverwrites.delete(target.id);
      } catch (err) {
        return interaction.editReply({
          content: `❌ Failed to remove user: ${err.message}`,
        });
      }

      await interaction.channel.send({
        content: `✅ ${target.tag} has been removed from this ticket by ${invoker}.`,
      });

      return interaction.editReply({
        content: `✅ Removed ${target.tag} from the ticket.`,
      });
    }
  },
};