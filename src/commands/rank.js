const { SlashCommandBuilder } = require('discord.js');
const { query }               = require('../db');
const { xpProgress, progressBar, formatXp } = require('../utils/xp');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Check your XP rank or another member\'s')
    .addUserOption(opt => opt
      .setName('user')
      .setDescription('Member to check (defaults to yourself)')
      .setRequired(false)),

  cooldown: 10,

  async execute(interaction) {
    await interaction.deferReply();

    const target  = interaction.options.getUser('user') ?? interaction.user;
    const { guild } = interaction;

    // ─── Fetch member XP row ──────────────────────
    const rows = await query(
      `SELECT * FROM guild_members WHERE guild_id = ? AND user_id = ?`,
      [guild.id, target.id],
    );

    if (rows.length === 0 || rows[0].xp === 0) {
      return interaction.editReply({
        content: target.id === interaction.user.id
          ? '❌ You haven\'t earned any XP yet. Start chatting!'
          : `❌ **${target.tag}** hasn't earned any XP in this server yet.`,
      });
    }

    const memberRow = rows[0];

    // ─── Fetch server rank position ───────────────
    const rankRows = await query(
      `SELECT COUNT(*) AS rank_pos
       FROM guild_members
       WHERE guild_id = ? AND xp > ?`,
      [guild.id, memberRow.xp],
    );

    const rankPos = (rankRows[0]?.rank_pos ?? 0) + 1;

    // ─── Fetch total members with XP ──────────────
    const totalRows = await query(
      `SELECT COUNT(*) AS total
       FROM guild_members
       WHERE guild_id = ? AND xp > 0`,
      [guild.id],
    );

    const totalMembers = totalRows[0]?.total ?? 1;

    // ─── Calculate progress ───────────────────────
    const { level, current, needed, percent } = xpProgress(memberRow.xp);
    const bar = progressBar(percent, 18);

    // ─── Build embed ──────────────────────────────
    return interaction.editReply({
      embeds: [{
        color: 0x5865f2,
        author: {
          name:     target.tag,
          icon_url: target.displayAvatarURL({ dynamic: true, size: 128 }),
        },
        title: `📊 Rank Card`,
        fields: [
          {
            name:   '🏆 Server rank',
            value:  `**#${rankPos}** of ${totalMembers}`,
            inline: true,
          },
          {
            name:   '⭐ Level',
            value:  `**${level}**`,
            inline: true,
          },
          {
            name:   '✨ Total XP',
            value:  formatXp(memberRow.xp),
            inline: true,
          },
          {
            name:   `Progress to level ${level + 1}`,
            value:  [
              `\`${bar}\``,
              `${formatXp(current)} / ${formatXp(needed)} XP`,
            ].join('\n'),
            inline: false,
          },
        ],
        footer: {
          text: `Guild: ${guild.name}`,
        },
        timestamp: new Date().toISOString(),
      }],
    });
  },
};