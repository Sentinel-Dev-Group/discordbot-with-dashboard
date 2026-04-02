const { ActivityType } = require('discord.js');
const { execute: dbExecute, query } = require('../db');
const { subscribeToStreamer, listSubscriptions, getAccessToken } = require('../utils/twitch');

module.exports = {
  name: 'ready',
  once: true,

  async execute(client) {
    console.log(`[Ready] Logged in as ${client.user.tag}`);
    console.log(`[Ready] Serving ${client.guilds.cache.size} guild(s)`);

    // ─── Sync all current guilds into DB ────────────────
    const guilds = client.guilds.cache.values();

    for (const guild of guilds) {
      try {
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
    setInterval(setPresence, 10 * 60 * 1000);

    // ─── Expired mute checker ───────────────────────────
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

    await checkExpiredMutes();
    setInterval(checkExpiredMutes, 60 * 1000);
    console.log('[Ready] Expired mute checker started');

    // ─── Pre-warm Twitch token ──────────────────────────
    try {
      await getAccessToken();
      console.log('[Ready] Twitch token pre-warmed');
    } catch (err) {
      console.warn('[Ready] Twitch token pre-warm failed:', err.message);
    }

    // ─── Twitch EventSub subscription sync ──────────────
    const syncTwitchSubscriptions = async () => {
      try {
        const tracked = await query(
          `SELECT DISTINCT twitch_user_id, twitch_login FROM twitch_subscriptions`,
        );

        if (tracked.length === 0) return;

        console.log(`[Twitch] Syncing ${tracked.length} EventSub subscription(s)...`);

        const activeSubs = await listSubscriptions();
        const activeUserIds = new Set(
          activeSubs
            .filter(s => s.status === 'enabled')
            .map(s => s.condition?.broadcaster_user_id)
        );

        for (const streamer of tracked) {
          if (!activeUserIds.has(streamer.twitch_user_id)) {
            console.log(`[Twitch] Re-subscribing to ${streamer.twitch_login}...`);
            const sub = await subscribeToStreamer(streamer.twitch_user_id);

            if (sub?.id) {
              await dbExecute(
                `UPDATE twitch_subscriptions
                 SET subscription_id = ?
                 WHERE twitch_user_id = ?`,
                [sub.id, streamer.twitch_user_id],
              );
              console.log(`[Twitch] Re-subscribed to ${streamer.twitch_login}`);
            }
          }
        }

        console.log('[Twitch] EventSub sync complete');
      } catch (err) {
        console.error('[Twitch] EventSub sync failed:', err.message);
      }
    };

    setTimeout(syncTwitchSubscriptions, 10000);
  },
};