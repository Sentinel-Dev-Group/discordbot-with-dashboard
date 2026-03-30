const { SlashCommandBuilder } = require('discord.js');
const { query }               = require('../db');
const { calculateLevel, formatXp } = require('../utils/xp');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show the top members by XP in this server')
    .addIntegerOption(opt => opt
      .setName('page')
      .setDescription('Page number (10 members per page)')
      .setMinValue(1)
      .setRequired(false)),

  cooldown: 15,

  async execute(interaction) {
    await interaction.deferReply();

    const page     = interaction.options.getInteger('page') ?? 1;
    const pageSize = 10;
    const offset   = (page - 1) * pageSize;
    const { guild } = interaction;

    // ─── Fetch leaderboard page ───────────────────
    const rows = await query(
      `SELECT user_id, username, xp, level
       FROM guild_members
       WHERE guild_id = ? AND xp > 0
       ORDER BY xp DESC
       LIMIT ? OFFSET ?`,
      [guild.id, pageSize, offset],
    );

    if (rows.length === 0) {
      return interaction.editReply({
        content: page === 1
          ? '❌ No members have earned XP in this server yet.'
          : `❌ No members found on page ${page}.`,
      });
    }

    // ─── Fetch total count for pagination ─────────
    const countRows = await query(
      `SELECT COUNT(*) AS total
       FROM guild_members
       WHERE guild_id = ? AND xp > 0`,
      [guild.id],
    );

    const totalMembers = countRows[0]?.total ?? 0;
    const totalPages   = Math.ceil(totalMembers / pageSize);

    // ─── Medal emojis for top 3 ───────────────────
    const medals = ['🥇', '🥈', '🥉'];

    // ─── Build leaderboard rows ───────────────────
    const leaderboardLines = rows.map((row, i) => {
      const position   = offset + i + 1;
      const medal      = position <= 3 ? medals[position - 1] : `**#${position}**`;
      const level      = calculateLevel(row.xp);
      const isYou      = row.user_id === interaction.user.id;

      return [
        `${medal} ${isYou ? '**→ ' : ''}<@${row.user_id}>${isYou ? ' ←**' : ''}`,
        `Level **${level}** • ${formatXp(row.xp)} XP`,
      ].join('\n');
    });

    // ─── Find calling user's position ─────────────
    const userRows = await query(
      `SELECT COUNT(*) AS rank_pos
       FROM guild_members
       WHERE guild_id = ? AND xp > (
         SELECT xp FROM guild_members WHERE guild_id = ? AND user_id = ?
       )`,
      [guild.id, guild.id, interaction.user.id],
    );

    const userRank = userRows[0]?.rank_pos != null
      ? userRows[0].rank_pos + 1
      : null;

    // ─── Build embed ──────────────────────────────
    return interaction.editReply({
      embeds: [{
        color: 0xfee75c,
        title: `🏆 ${guild.name} Leaderboard`,
        description: leaderboardLines.join('\n\n'),
        fields: userRank
          ? [{
              name:   'Your position',
              value:  `#${userRank} of ${totalMembers}`,
              inline: true,
            }]
          : [],
        footer: {
          text: `Page ${page} of ${totalPages} • ${totalMembers} member${totalMembers !== 1 ? 's' : ''} ranked`,
        },
        timestamp: new Date().toISOString(),
      }],
    });
  },
};