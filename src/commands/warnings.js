const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { query, execute: dbExecute }                 = require('../db');
const { auditLog, modLog, buildModEmbed }           = require('../utils/logger');
const { getConfig }                                 = require('../utils/guildConfig');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('View or manage warnings for a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)

    // ─── list ──────────────────────────────────────
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('List all warnings for a member')
      .addUserOption(opt => opt
        .setName('user')
        .setDescription('The member to check')
        .setRequired(true)))

    // ─── remove ────────────────────────────────────
    .addSubcommand(sub => sub
      .setName('remove')
      .setDescription('Remove a specific warning by ID')
      .addIntegerOption(opt => opt
        .setName('id')
        .setDescription('The warning ID to remove')
        .setRequired(true)
        .setMinValue(1)))

    // ─── clear ─────────────────────────────────────
    .addSubcommand(sub => sub
      .setName('clear')
      .setDescription('Clear all warnings for a member')
      .addUserOption(opt => opt
        .setName('user')
        .setDescription('The member to clear warnings for')
        .setRequired(true))),

  permissions: [PermissionFlagsBits.ModerateMembers],
  cooldown: 5,

  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const sub                        = interaction.options.getSubcommand();
    const { guild, user: moderator } = interaction;

    // ─── list ──────────────────────────────────────
    if (sub === 'list') {
      const target = interaction.options.getUser('user');

      const warnings = await query(
        `SELECT w.id, w.reason, w.moderator_id, w.created_at
         FROM warnings w
         WHERE w.guild_id = ? AND w.user_id = ?
         ORDER BY w.created_at DESC
         LIMIT 25`,
        [guild.id, target.id],
      );

      if (warnings.length === 0) {
        return interaction.editReply({
          content: `✅ **${target.tag}** has no warnings in this server.`,
        });
      }

      const fields = warnings.map(w => ({
        name:   `#${w.id} — <t:${Math.floor(new Date(w.created_at) / 1000)}:D>`,
        value:  `**Reason:** ${w.reason}\n**Moderator:** <@${w.moderator_id}>`,
        inline: false,
      }));

      return interaction.editReply({
        embeds: [{
          color:  0xfee75c,
          title:  `⚠️ Warnings for ${target.tag}`,
          fields,
          footer: {
            text: `Total: ${warnings.length} warning${warnings.length !== 1 ? 's' : ''} — User ID: ${target.id}`,
          },
          thumbnail: {
            url: target.displayAvatarURL({ dynamic: true, size: 128 }),
          },
          timestamp: new Date().toISOString(),
        }],
      });
    }

    // ─── remove ────────────────────────────────────
    if (sub === 'remove') {
      const warnId = interaction.options.getInteger('id');

      // Verify the warning exists and belongs to this guild
      const rows = await query(
        `SELECT * FROM warnings WHERE id = ? AND guild_id = ?`,
        [warnId, guild.id],
      );

      if (rows.length === 0) {
        return interaction.editReply({
          content: `❌ Warning #${warnId} not found in this server.`,
        });
      }

      const warning = rows[0];

      await dbExecute(
        `DELETE FROM warnings WHERE id = ?`,
        [warnId],
      );

      await auditLog({
        guildId:     guild.id,
        moderatorId: moderator.id,
        targetId:    warning.user_id,
        action:      'WARN_REMOVE',
        reason:      `Removed warning #${warnId}`,
        metadata:    { warnId, originalReason: warning.reason },
      });

      return interaction.editReply({
        embeds: [{
          color:  0x57f287,
          title:  '✅ Warning Removed',
          fields: [
            { name: 'Warning ID',      value: `#${warnId}`,          inline: true  },
            { name: 'Original reason', value: warning.reason,         inline: false },
            { name: 'Removed by',      value: moderator.tag,          inline: true  },
          ],
          timestamp: new Date().toISOString(),
        }],
      });
    }

    // ─── clear ─────────────────────────────────────
    if (sub === 'clear') {
      const target = interaction.options.getUser('user');

      // Count before deleting so we can report how many were cleared
      const countRows = await query(
        `SELECT COUNT(*) AS total FROM warnings WHERE guild_id = ? AND user_id = ?`,
        [guild.id, target.id],
      );

      const total = countRows[0]?.total ?? 0;

      if (total === 0) {
        return interaction.editReply({
          content: `✅ **${target.tag}** has no warnings to clear.`,
        });
      }

      await dbExecute(
        `DELETE FROM warnings WHERE guild_id = ? AND user_id = ?`,
        [guild.id, target.id],
      );

      await auditLog({
        guildId:     guild.id,
        moderatorId: moderator.id,
        targetId:    target.id,
        action:      'WARN_CLEAR',
        reason:      `Cleared all warnings`,
        metadata:    { total },
      });

      // ─── Mod log channel ────────────────────────
      const config = await getConfig(guild.id);

      await modLog(client, guild.id, config.log_channel,
        buildModEmbed({
          action:    'Warnings Cleared',
          color:     0x57f287,
          target,
          moderator,
          reason:    `All ${total} warning${total !== 1 ? 's' : ''} cleared`,
        }),
      );

      return interaction.editReply({
        embeds: [{
          color:  0x57f287,
          title:  '✅ Warnings Cleared',
          fields: [
            { name: 'User',     value: `${target.tag} (${target.id})`,                      inline: true  },
            { name: 'Cleared',  value: `${total} warning${total !== 1 ? 's' : ''} removed`, inline: true  },
            { name: 'By',       value: moderator.tag,                                        inline: true  },
          ],
          timestamp: new Date().toISOString(),
        }],
      });
    }
  },
};