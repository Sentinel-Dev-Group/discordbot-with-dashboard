const { execute: dbExecute, query } = require('../db');
const { calculateLevel, xpForLevel } = require('../utils/xp');

module.exports = {
  name: 'messageCreate',
  once: false,

  async execute(message, client) {
    // ─── Basic guards ────────────────────────────────
    if (message.author.bot)     return; // ignore bots
    if (!message.guild)         return; // ignore DMs
    if (!message.content)       return; // ignore empty/system messages

    const { guild, author } = message;

    // ─── XP handling ─────────────────────────────────
    try {
      // Fetch or create member row
      let rows = await query(
        `SELECT * FROM guild_members WHERE guild_id = ? AND user_id = ?`,
        [guild.id, author.id],
      );

      // First time we've seen this member — insert them
      if (rows.length === 0) {
        await dbExecute(
          `INSERT IGNORE INTO guild_members (guild_id, user_id, username)
           VALUES (?, ?, ?)`,
          [guild.id, author.id, author.tag],
        );

        rows = await query(
          `SELECT * FROM guild_members WHERE guild_id = ? AND user_id = ?`,
          [guild.id, author.id],
        );
      }

      const member = rows[0];

      // ─── Cooldown check ───────────────────────────
      const cooldownSeconds = parseInt(process.env.XP_COOLDOWN_SECONDS) || 60;
      const now             = new Date();

      if (member.last_xp_at) {
        const lastXp      = new Date(member.last_xp_at);
        const diffSeconds = (now - lastXp) / 1000;

        if (diffSeconds < cooldownSeconds) return; // still on cooldown
      }

      // ─── Award XP ─────────────────────────────────
      const xpMin    = parseInt(process.env.XP_MIN) || 15;
      const xpMax    = parseInt(process.env.XP_MAX) || 25;
      const xpGained = Math.floor(Math.random() * (xpMax - xpMin + 1)) + xpMin;

      const newXp      = member.xp + xpGained;
      const oldLevel   = member.level;
      const newLevel   = calculateLevel(newXp);

      await dbExecute(
        `UPDATE guild_members
         SET xp         = ?,
             level      = ?,
             username   = ?,
             last_xp_at = NOW()
         WHERE guild_id = ? AND user_id = ?`,
        [newXp, newLevel, author.tag, guild.id, author.id],
      );

      // ─── Level-up notification ────────────────────
      if (newLevel > oldLevel) {
        console.log(`[XP] ${author.tag} levelled up to ${newLevel} in ${guild.name}`);

        try {
          await message.channel.send({
            embeds: [
              {
                color: 0xfee75c,
                title: '⬆️ Level up!',
                description: [
                  `Congrats ${author}, you reached **level ${newLevel}**!`,
                  `Next level: **${xpForLevel(newLevel + 1) - newXp} XP** to go`,
                ].join('\n'),
                thumbnail: {
                  url: author.displayAvatarURL({ dynamic: true, size: 128 }),
                },
                footer: { text: `Total XP: ${newXp.toLocaleString()}` },
                timestamp: new Date().toISOString(),
              },
            ],
          });
        } catch (err) {
          console.warn(`[XP] Could not send level-up message in ${guild.id}:`, err.message);
        }
      }
    } catch (err) {
      console.error('[MessageCreate] XP error:', err.message);
    }
  },
};