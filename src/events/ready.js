const { ActivityType } = require('discord.js');
const { execute: dbExecute, query } = require('../db');

module.exports = {
  name: 'ready',
  once: true,

  async execute(client) {
    console.log(`[Ready] Logged in as ${client.user.tag}`);
    console.log(`[Ready] Serving ${client.guilds.cache.size} guild(s)`);

    // ─── Sync all current guilds into DB ────────────────
    // Catches any guilds added while the bot was offline
    const guilds = client.guilds.cache.values();

    for (const guild of guilds) {
      try {
        // Upsert guild row
        await dbExecute(
          `INSERT INTO guilds (id, name, icon, member_count, active)
           VALUES (?, ?, ?, ?, 1)
           ON DUPLICATE KEY UPDATE
             name         = VALUES(name),
             icon         = VALUES(icon),
             member_count = VALUES(member_count),
             active       = 1`,
          [guild.id, guild.name, guild.icon ?? null, guild.memberCount],
        );

        // Ensure config row exists
        await dbExecute(
          `INSERT IGNORE INTO guild_config (guild_id) VALUES (?)`,
          [guild.id],
        );
      } catch (err) {
        console.error(`[Ready] Failed to sync guild ${guild.id}:`, err.message);
      }
    }

    console.log('[Ready] Guild sync complete');

    // ─── Set bot presence ───────────────────────────────
    const setPresence = () => {
      const guildCount = client.guilds.cache.size;

      client.user.setPresence({
        status: 'online',
        activities: [
          {
            name: `${guildCount} server${guildCount !== 1 ? 's' : ''} | /help`,
            type: ActivityType.Watching,
          },
        ],
      });
    };

    setPresence();

    // Refresh presence every 10 minutes
    setInterval(setPresence, 10 * 60 * 1000);

    // ─── Expired mute checker ───────────────────────────
    // Polls DB every minute and lifts mutes that have expired
    const checkExpiredMutes = async () => {
      try {
        const expired = await query(
          `SELECT m.*, gc.mute_role
           FROM mutes m
           JOIN guild_config gc ON gc.guild_id = m.guild_id
           WHERE m.active = 1
             AND m.expires_at IS NOT NULL
             AND m.expires_at <= NOW()`,
        );

        for (const mute of expired) {
          try {
            const guild = client.guilds.cache.get(mute.guild_id);
            if (!guild) continue;

            const member = await guild.members.fetch(mute.user_id).catch(() => null);
            if (member && mute.mute_role) {
              await member.roles.remove(mute.mute_role, 'Mute expired');
            }

            await dbExecute(
              `UPDATE mutes SET active = 0 WHERE id = ?`,
              [mute.id],
            );

            console.log(`[Mutes] Lifted expired mute for ${mute.user_id} in ${mute.guild_id}`);
          } catch (err) {
            console.error(`[Mutes] Failed to lift mute id ${mute.id}:`, err.message);
          }
        }
      } catch (err) {
        console.error('[Mutes] Expired mute check failed:', err.message);
      }
    };

    // Run immediately on startup then every 60 seconds
    await checkExpiredMutes();
    setInterval(checkExpiredMutes, 60 * 1000);

    console.log('[Ready] Expired mute checker started');
  },
};