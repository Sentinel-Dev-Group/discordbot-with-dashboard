const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { execute: dbExecute }                        = require('../db');
const { getConfig }                                 = require('../utils/guildConfig');
const { auditLog, modLog, buildModEmbed }           = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(opt => opt
      .setName('user')
      .setDescription('The user to ban')
      .setRequired(true))
    .addStringOption(opt => opt
      .setName('reason')
      .setDescription('Reason for the ban')
      .setRequired(false)
      .setMaxLength(500))
    .addIntegerOption(opt => opt
      .setName('days')
      .setDescription('Number of days of messages to delete (0–7)')
      .setMinValue(0)
      .setMaxValue(7)
      .setRequired(false)),

  permissions: [PermissionFlagsBits.BanMembers],
  cooldown: 5,

  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    const days   = interaction.options.getInteger('days')  ?? 0;
    const { guild, user: moderator } = interaction;

    // ─── Guards ───────────────────────────────────
    if (target.id === moderator.id) {
      return interaction.editReply({ content: '❌ You cannot ban yourself.' });
    }

    if (target.id === client.user.id) {
      return interaction.editReply({ content: '❌ I cannot ban myself.' });
    }

    // Check if target is bannable (role hierarchy)
    const member = await guild.members.fetch(target.id).catch(() => null);

    if (member) {
      if (!member.bannable) {
        return interaction.editReply({
          content: '❌ I don\'t have permission to ban that user. Check my role is above theirs.',
        });
      }

      if (
        interaction.member.roles.highest.position <= member.roles.highest.position &&
        guild.ownerId !== moderator.id
      ) {
        return interaction.editReply({
          content: '❌ You cannot ban someone with an equal or higher role than you.',
        });
      }
    }

    // ─── DM the user before banning ───────────────
    try {
      await target.send({
        embeds: [{
          color: 0xed4245,
          title: `🔨 You have been banned from ${guild.name}`,
          fields: [
            { name: 'Reason',    value: reason,         inline: false },
            { name: 'Moderator', value: moderator.tag,  inline: true  },
          ],
          timestamp: new Date().toISOString(),
        }],
      });
    } catch {
      // User may have DMs disabled — not a blocker
    }

    // ─── Execute ban ──────────────────────────────
    try {
      await guild.members.ban(target.id, {
        reason:                   `${moderator.tag}: ${reason}`,
        deleteMessageSeconds:     days * 24 * 60 * 60,
      });
    } catch (err) {
      return interaction.editReply({
        content: `❌ Failed to ban: ${err.message}`,
      });
    }

    // ─── Record in DB ─────────────────────────────
    await dbExecute(
      `INSERT INTO bans (guild_id, user_id, moderator_id, reason, active)
       VALUES (?, ?, ?, ?, 1)`,
      [guild.id, target.id, moderator.id, reason],
    );

    // ─── Audit log ────────────────────────────────
    await auditLog({
      guildId:     guild.id,
      moderatorId: moderator.id,
      targetId:    target.id,
      action:      'BAN',
      reason,
      metadata:    { days },
    });

    // ─── Mod log channel ──────────────────────────
    const config = await getConfig(guild.id);

    await modLog(client, guild.id, config.log_channel,
      buildModEmbed({
        action:    'Member Banned',
        color:     0xed4245,
        target,
        moderator,
        reason,
        extraFields: [
          {
            name:   'Messages deleted',
            value:  `${days} day${days !== 1 ? 's' : ''}`,
            inline: true,
          },
        ],
      }),
    );

    // ─── Reply ────────────────────────────────────
    return interaction.editReply({
      embeds: [{
        color:  0x57f287,
        title:  '✅ Member Banned',
        fields: [
          { name: 'User',      value: `${target.tag} (${target.id})`, inline: true  },
          { name: 'Reason',    value: reason,                          inline: false },
          { name: 'Msg purge', value: `${days} day(s)`,               inline: true  },
        ],
        timestamp: new Date().toISOString(),
      }],
    });
  },
};