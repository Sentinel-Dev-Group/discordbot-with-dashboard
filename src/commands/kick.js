const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { execute: dbExecute }                        = require('../db');
const { getConfig }                                 = require('../utils/guildConfig');
const { auditLog, modLog, buildModEmbed }           = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(opt => opt
      .setName('user')
      .setDescription('The member to kick')
      .setRequired(true))
    .addStringOption(opt => opt
      .setName('reason')
      .setDescription('Reason for the kick')
      .setRequired(false)
      .setMaxLength(500)),

  permissions: [PermissionFlagsBits.KickMembers],
  cooldown: 5,

  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const target    = interaction.options.getUser('user');
    const reason    = interaction.options.getString('reason') ?? 'No reason provided';
    const { guild, user: moderator } = interaction;

    // ─── Guards ───────────────────────────────────
    if (target.id === moderator.id) {
      return interaction.editReply({ content: '❌ You cannot kick yourself.' });
    }

    if (target.id === client.user.id) {
      return interaction.editReply({ content: '❌ I cannot kick myself.' });
    }

    // Fetch guild member to check kickability
    const member = await guild.members.fetch(target.id).catch(() => null);

    if (!member) {
      return interaction.editReply({
        content: '❌ That user is not in this server.',
      });
    }

    if (!member.kickable) {
      return interaction.editReply({
        content: '❌ I don\'t have permission to kick that user. Check my role is above theirs.',
      });
    }

    if (
      interaction.member.roles.highest.position <= member.roles.highest.position &&
      guild.ownerId !== moderator.id
    ) {
      return interaction.editReply({
        content: '❌ You cannot kick someone with an equal or higher role than you.',
      });
    }

    // ─── DM the user before kicking ───────────────
    try {
      await target.send({
        embeds: [{
          color: 0xfee75c,
          title: `👢 You have been kicked from ${guild.name}`,
          fields: [
            { name: 'Reason',    value: reason,        inline: false },
            { name: 'Moderator', value: moderator.tag, inline: true  },
          ],
          footer: {
            text: 'You may rejoin with a valid invite link.',
          },
          timestamp: new Date().toISOString(),
        }],
      });
    } catch {
      // DMs disabled — not a blocker
    }

    // ─── Execute kick ─────────────────────────────
    try {
      await member.kick(`${moderator.tag}: ${reason}`);
    } catch (err) {
      return interaction.editReply({
        content: `❌ Failed to kick: ${err.message}`,
      });
    }

    // ─── Audit log ────────────────────────────────
    await auditLog({
      guildId:     guild.id,
      moderatorId: moderator.id,
      targetId:    target.id,
      action:      'KICK',
      reason,
    });

    // ─── Mod log channel ──────────────────────────
    const config = await getConfig(guild.id);

    await modLog(client, guild.id, config.log_channel,
      buildModEmbed({
        action:    'Member Kicked',
        color:     0xfee75c,
        target,
        moderator,
        reason,
      }),
    );

    // ─── Reply ────────────────────────────────────
    return interaction.editReply({
      embeds: [{
        color:  0x57f287,
        title:  '✅ Member Kicked',
        fields: [
          { name: 'User',   value: `${target.tag} (${target.id})`, inline: true  },
          { name: 'Reason', value: reason,                          inline: false },
        ],
        timestamp: new Date().toISOString(),
      }],
    });
  },
};