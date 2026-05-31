const { InteractionType, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { execute: dbExecute } = require('../db');

module.exports = {
  name: 'interactionCreate',
  once: false,

  async execute(interaction, client) {

    // ─── Button interactions ──────────────────────────
    if (interaction.isButton()) {
      const ticketCommand = require('../commands/ticket');

      if (interaction.customId === 'ticket_open') {
        interaction.options = {
          getSubcommand: () => 'button_open',
          getString:     () => null,
          getUser:       () => null,
          getChannel:    () => null,
          data:          [],
        };
        try {
          await ticketCommand.execute(interaction, client);
        } catch (err) {
          console.error('[Interactions] Error in ticket_open button:', err);
          if (interaction.replied) {
            await interaction.followUp({ content: '❌ Something went wrong opening the ticket.', ephemeral: true });
          } else if (interaction.deferred) {
            await interaction.editReply({ content: '❌ Something went wrong opening the ticket.' });
          } else {
            await interaction.reply({ content: '❌ Something went wrong opening the ticket.', ephemeral: true });
          }
        }
        return;
      }

      if (interaction.customId === 'ticket_close') {
        // Show a modal so the user can optionally enter a close reason
        const modal = new ModalBuilder()
          .setCustomId('ticket_close_modal')
          .setTitle('Close Ticket');

        const reasonInput = new TextInputBuilder()
          .setCustomId('close_reason')
          .setLabel('Reason for closing')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Describe why this ticket is being closed…')
          .setRequired(false)
          .setMaxLength(300);

        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));

        try {
          await interaction.showModal(modal);
        } catch (err) {
          console.error('[Interactions] Error showing close modal:', err);
        }
        return;
      }

      return;
    }

    // ─── Modal submissions ────────────────────────────
    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'ticket_close_modal') {
        const ticketCommand = require('../commands/ticket');
        const reason = interaction.fields.getTextInputValue('close_reason')?.trim() || 'No reason provided';

        interaction.options = {
          getSubcommand: () => 'close',
          getString:     (key) => key === 'reason' ? reason : null,
          getUser:       () => null,
          getChannel:    () => null,
          data:          [],
        };

        try {
          await ticketCommand.execute(interaction, client);
        } catch (err) {
          console.error('[Interactions] Error in ticket_close_modal:', err);
          if (interaction.replied) {
            await interaction.followUp({ content: '❌ Something went wrong closing the ticket.', ephemeral: true });
          } else if (interaction.deferred) {
            await interaction.editReply({ content: '❌ Something went wrong closing the ticket.' });
          } else {
            await interaction.reply({ content: '❌ Something went wrong closing the ticket.', ephemeral: true });
          }
        }
        return;
      }
    }

    // ─── Slash commands only ──────────────────────────
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
      console.warn(`[Interactions] Unknown command: ${interaction.commandName}`);
      await interaction.reply({
        content: '❌ Unknown command.',
        ephemeral: true,
      });
      return;
    }

    // ─── Cooldown check ───────────────────────────────
    if (command.cooldown) {
      const cooldowns = client.cooldowns;

      if (!cooldowns.has(command.data.name)) {
        cooldowns.set(command.data.name, new Map());
      }

      const now          = Date.now();
      const timestamps   = cooldowns.get(command.data.name);
      const cooldownMs   = command.cooldown * 1000;

      if (timestamps.has(interaction.user.id)) {
        const expiry = timestamps.get(interaction.user.id) + cooldownMs;

        if (now < expiry) {
          const remaining = ((expiry - now) / 1000).toFixed(1);
          await interaction.reply({
            content: `⏳ Please wait **${remaining}s** before using \`/${command.data.name}\` again.`,
            ephemeral: true,
          });
          return;
        }
      }

      timestamps.set(interaction.user.id, now);
      setTimeout(() => timestamps.delete(interaction.user.id), cooldownMs);
    }

    // ─── Permission check ─────────────────────────────
    if (command.permissions) {
      const missing = command.permissions.filter(
        perm => !interaction.memberPermissions?.has(perm),
      );

      if (missing.length > 0) {
        await interaction.reply({
          content: `🔒 You need the following permission(s) to use this command: \`${missing.join(', ')}\``,
          ephemeral: true,
        });
        return;
      }
    }

    // ─── Owner-only check ─────────────────────────────
    if (command.ownerOnly) {
      const ownerIds = (process.env.OWNER_IDS || '').split(',').map(id => id.trim());
      if (!ownerIds.includes(interaction.user.id)) {
        await interaction.reply({
          content: '🔒 This command is restricted to the bot owner.',
          ephemeral: true,
        });
        return;
      }
    }

    // ─── Execute command ──────────────────────────────
    try {
      await command.execute(interaction, client);
    } catch (err) {
      console.error(`[Interactions] Error in /${interaction.commandName}:`, err);
      try {
        const errorPayload = {
          content: '❌ Something went wrong while running that command.',
          ephemeral: true,
        };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(errorPayload);
        } else {
          await interaction.reply(errorPayload);
        }
      } catch (replyErr) {
        console.error('[Interactions] Failed to send error response:', replyErr.message);
      }
    }

    // ─── Log command usage (after execution) ──────────
    try {
      const options = {};
      interaction.options.data.forEach(opt => {
        if (opt.type === 1 || opt.type === 2) {
          opt.options?.forEach(subOpt => {
            options[subOpt.name] = subOpt.value ?? null;
          });
        } else {
          options[opt.name] = opt.value ?? null;
        }
      });

      await dbExecute(
        `INSERT INTO command_logs
           (guild_id, user_id, username, command, options, channel_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          interaction.guildId,
          interaction.user.id,
          interaction.user.tag,
          interaction.commandName,
          JSON.stringify(options),
          interaction.channelId,
        ],
      );
    } catch (err) {
      console.error('[Interactions] Failed to log command:', err.message);
    }
  },
};