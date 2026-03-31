const { InteractionType } = require('discord.js');
const { execute: dbExecute } = require('../db');

module.exports = {
  name: 'interactionCreate',
  once: false,

  async execute(interaction, client) {

    // ─── Button interactions ──────────────────────────
    if (interaction.isButton()) {
      if (interaction.customId === 'ticket_close') {
        const ticketCommand = require('../commands/ticket');
        interaction.options = {
          getSubcommand: () => 'close',
          getString: () => null,
        };
        try {
          await ticketCommand.execute(interaction, client);
        } catch (err) {
          console.error('[Interactions] Error in ticket_close button:', err);
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: '❌ Something went wrong closing the ticket.', ephemeral: true });
          } else {
            await interaction.reply({ content: '❌ Something went wrong closing the ticket.', ephemeral: true });
          }
        }
      }
      return;
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

    // ─── Log command usage ────────────────────────────
    try {
      const options = {};
      interaction.options.data.forEach(opt => {
        options[opt.name] = opt.value ?? null;
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

    // ─── Execute command ──────────────────────────────
    try {
      await command.execute(interaction, client);
    } catch (err) {
      console.error(`[Interactions] Error in /${interaction.commandName}:`, err);

      const errorPayload = {
        content: '❌ Something went wrong while running that command.',
        ephemeral: true,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorPayload);
      } else {
        await interaction.reply(errorPayload);
      }
    }
  },
};