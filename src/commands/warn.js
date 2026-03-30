const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { execute: dbExecute, query }                 = require('../db');
const { getConfig }                                 = require('../utils/guildConfig');
const { auditLog, modLog, buildModEmbed }           = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Issue a warning to a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(opt => opt
      .setName('user')
      .setDescription('The member to warn')
      .setRequired(true))
    .addStringOption(opt => opt
      .setName('reason')
      .setDescription('Reason for the warning')
      .setRequired(true)
      .setMaxLength(500)),

  permissions: [PermissionFlagsBits.ModerateMembers],
  cooldown: 5,

  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const target    = interaction.options.getUser('user');
    const reason    = interaction.options.getString('reason');
    const { guild, user: moderator } = interaction;

    // ─── Guards ───────────────────────────────────
    if (target.id === moderator.id) {
      return interaction.editReply({ content: '❌ You cannot warn yourself.' });
    }

    if (target.bot) {
      return interaction.editReply({ content: '❌ You cannot warn a bot.' });
    }

    const member = await guild.members.fetch(target.id).catch(() => null);

    if (!member) {
      return interaction.editReply({
        content: '❌ That user is not in this server.',
      });
    }

    if (
      interaction.member.roles.highest.position <= member.roles.highest.position &&
      guild.ownerId !== moderator.id
    ) {
      return interaction.editReply({
        content: '❌ You cannot warn someone with an equal or higher role than you.',
      });
    }

    // ─── Insert warning ───────────────────────────
    const result = await dbExecute(
      `INSERT INTO warnings (guild_id, user_id, moderator_id, reason)
       VALUES (?, ?, ?, ?)`,
      [guild.id, target.id, moderator.id, reason],
    );

    const warnId = result.insertId;

    // ─── Get total warning count ──────────────────
    const countRows = await query(
      `SELECT COUNT(*) AS total FROM warnings WHERE guild_id = ? AND user_id = ?`,
      [guild.id, target.id],
    );

    const totalWarnings = countRows[0]?.total ?? 1;

    // ─── DM the user ──────────────────────────────
    try {
      await target.send({
        embeds: [{
          color: 0xfee75c,
          title: `⚠️ You have been warned in ${guild.name}`,
          fields: [
            { name: 'Reason',          value: reason,                    inline: false },
            { name: 'Moderator',       value: moderator.tag,             inline: true  },
            { name: 'Total warnings',  value: `${totalWarnings}`,        inline: true  },
            { name: 'Warning ID',      value: `#${warnId}`,              inline: true  },
          ],
          footer: {
            text: 'Please review the server rules to avoid further action.',
          },
          timestamp: new Date().toISOString(),
        }],
      });
    } catch {
      // DMs disabled — not a blocker
    }

    // ─── Audit log ────────────────────────────────
    await auditLog({
      guildId:     guild.id,
      moderatorId: moderator.id,
      targetId:    target.id,
      action:      'WARN',
      reason,
      metadata:    { warnId, totalWarnings },
    });

    // ─── Mod log channel ──────────────────────────
    const config = await getConfig(guild.id);

    await modLog(client, guild.id, config.log_channel,
      buildModEmbed({
        action:    'Member Warned',
        color:     0xfee75c,
        target,
        moderator,
        reason,
        extraFields: [
          {
            name:   'Warning ID',
            value:  `#${warnId}`,
            inline: true,
          },
          {
            name:   'Total warnings',
            value:  `${totalWarnings}`,
            inline: true,
          },
        ],
      }),
    );

    // ─── Auto-escalation thresholds ───────────────
    // Notify moderator if user is accumulating warnings
    let escalationNote = '';

    if (totalWarnings === 3) {
      escalationNote = '\n⚠️ **Note:** This user now has **3 warnings**. Consider a mute.';
    } else if (totalWarnings === 5) {
      escalationNote = '\n🔴 **Note:** This user now has **5 warnings**. Consider a ban.';
    } else if (totalWarnings > 5) {
      escalationNote = `\n🔴 **Note:** This user now has **${totalWarnings} warnings**.`;
    }

    // ─── Reply ────────────────────────────────────
    return interaction.editReply({
      embeds: [{
        color:  0x57f287,
        title:  '✅ Warning Issued',
        fields: [
          { name: 'User',           value: `${target.tag} (${target.id})`, inline: true  },
          { name: 'Warning ID',     value: `#${warnId}`,                   inline: true  },
          { name: 'Total warnings', value: `${totalWarnings}`,             inline: true  },
          { name: 'Reason',         value: reason,                          inline: false },
        ],
        footer: {
          text: escalationNote
            ? escalationNote.replace(/\n|⚠️|🔴|\*\*/g, '').trim()
            : `Warning #${warnId}`,
        },
        timestamp: new Date().toISOString(),
      }],
      content: escalationNote || undefined,
    });
  },
};