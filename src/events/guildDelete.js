const { execute: dbExecute } = require('../db');

module.exports = {
  name: 'guildDelete',
  once: false,

  async execute(guild, client) {
    // guildDelete fires for both kicks and outages
    // guild.available === false means Discord outage — don't mark as inactive
    if (!guild.available) {
      console.warn(`[GuildDelete] Guild ${guild.id} unavailable (possible outage) — skipping`);
      return;
    }

    console.log(`[GuildDelete] Left/kicked from: ${guild.name} (${guild.id})`);

    // ─── Mark guild inactive in DB ──────────────────────
    // We keep all data (warnings, logs etc.) for potential re-add
    // Only flip the active flag so dashboard hides it
    try {
      await dbExecute(
        `UPDATE guilds SET active = 0 WHERE id = ?`,
        [guild.id],
      );

      console.log(`[GuildDelete] Marked guild ${guild.id} as inactive`);
    } catch (err) {
      console.error(`[GuildDelete] Failed to update guild ${guild.id}:`, err.message);
    }

    // ─── Update presence to reflect new guild count ─────
    try {
      const guildCount = client.guilds.cache.size;
      client.user.setActivity(
        `${guildCount} server${guildCount !== 1 ? 's' : ''} | /help`,
        { type: 0 },
      );
    } catch (err) {
      console.warn('[GuildDelete] Failed to update presence:', err.message);
    }
  },
};