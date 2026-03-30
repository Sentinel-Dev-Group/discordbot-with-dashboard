const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { execute: dbExecute }                        = require('../db');
const { getConfig }                                 = require('../utils/guildConfig');
const { auditLog, modLog, buildModEmbed }           = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Mute a member in the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(opt => opt
      .setName('user')
      .setDescription('The member to mute')
      .setRequired(true))
    .addIntegerOption(opt => opt
      .setName('duration')
      .setDescription('Mute duration in minutes (omit for permanent)')
      .setMinValue(1)
      .setMaxValue(40320) // 28 days max
      .setRequired(false))
    .addStringOption(opt => opt
      .setName('reason')
      .setDescription('Reason for the mute')
      .setRequired(false)
      .setMaxLength(500)),

  permissions: [PermissionFlagsBits.ModerateMembers],
  cooldown: 5,

  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const target    = interaction.options.getUser('user');
    const duration  = interaction.options.getInteger('duration')
                        ?? parseInt(process.env.DEFAULT_MUTE_MINUTES) ?? 10;
    const permanent = !interaction.options.getInteger('duration');
    const reason    = interaction.options.getString('reason') ?? 'No reason provided';
    const { guild, user: moderator } = interaction;

    // ─── Guards ───────────────────────────────────
    if (target.id === moderator.id) {
      return interaction.editReply({ content: '❌ You cannot mute yourself.' });
    }

    if (target.bot) {
      return interaction.editReply({ content: '❌ You cannot mute a bot.' });
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
        content: '❌ You cannot mute someone with an equal or higher role than you.',
      });
    }

    // ─── Fetch mute role from config ──────────────
    const config = await getConfig(guild.id);

    if (!config.mute_role) {
      return interaction.editReply({
        content: '❌ No mute role configured. Use `/config muterole` to set one.',
      });
    }

    const muteRole = guild.roles.cache.get(config.mute_role);

    if (!muteRole) {
      return interaction.editReply({
        content: '❌ The configured mute role no longer exists. Please update it with `/config muterole`.',
      });
    }

    // ─── Check if already muted ───────────────────
    if (member.roles.cache.has(muteRole.id)) {
      return interaction.editReply({
        content: '❌ That member is already muted.',
      });
    }

    // ─── Calculate expiry ─────────────────────────
    const expiresAt = permanent
      ? null
      : new Date(Date.now() + duration * 60 * 1000);

    const durationText = permanent
      ? 'Permanent'
      : `${duration} minute${duration !== 1 ? 's' : ''}`;

    // ─── Assign mute role ─────────────────────────
    try {
      await member.roles.add(muteRole, `${moderator.tag}: ${reason}`);
    } catch (err) {
      return interaction.editReply({
        content: `❌ Failed to assign mute role: ${err.message}`,
      });
    }

    // ─── Record in DB ─────────────────────────────
    await dbExecute(
      `INSERT INTO mutes (guild_id, user_id, moderator_id, reason, expires_at, active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [guild.id, target.id, moderator.id, reason, expiresAt],
    );

    // ─── DM the user ──────────────────────────────
    try {
      await target.send({
        embeds: [{
          color: 0xed4245,
          title: `🔇 You have been muted in ${guild.name}`,
          fields: [
            { name: 'Reason',    value: reason,        inline: false },
            { name: 'Duration',  value: durationText,  inline: true  },
            { name: 'Moderator', value: moderator.tag, inline: true  },
          ],
          footer: {
            text: permanent
              ? 'Contact a moderator to appeal.'
              : `Mute expires: ${expiresAt.toUTCString()}`,
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
      action:      'MUTE',
      reason,
      metadata:    { duration, permanent, expiresAt },
    });

    // ─── Mod log channel ──────────────────────────
    await modLog(client, guild.id, config.log_channel,
      buildModEmbed({
        action:    'Member Muted',
        color:     0xed4245,
        target,
        moderator,
        reason,
        extraFields: [
          {
            name:   'Duration',
            value:  durationText,
            inline: true,
          },
          {
            name:   'Expires',
            value:  permanent ? 'Never' : `<t:${Math.floor(expiresAt / 1000)}:R>`,
            inline: true,
          },
        ],
      }),
    );

    // ─── Reply ────────────────────────────────────
    return interaction.editReply({
      embeds: [{
        color:  0x57f287,
        title:  '✅ Member Muted',
        fields: [
          { name: 'User',     value: `${target.tag} (${target.id})`, inline: true  },
          { name: 'Duration', value: durationText,                    inline: true  },
          { name: 'Expires',  value: permanent
              ? 'Never'
              : `<t:${Math.floor(expiresAt / 1000)}:R>`,             inline: true  },
          { name: 'Reason',   value: reason,                          inline: false },
        ],
        timestamp: new Date().toISOString(),
      }],
    });
  },
};