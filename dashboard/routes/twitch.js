const express                        = require('express');
const router                         = express.Router();
const { query, execute: dbExecute }  = require('../../src/db');
const { verifySignature, getStream } = require('../../src/utils/twitch');

// ─── Twitch EventSub webhook ──────────────────────────────
// Twitch sends raw body — must be parsed as raw bytes for signature verification
// This route must be registered BEFORE express.json() middleware in app.js
router.post('/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const messageId   = req.headers['twitch-eventsub-message-id'];
    const timestamp   = req.headers['twitch-eventsub-message-timestamp'];
    const signature   = req.headers['twitch-eventsub-message-signature'];
    const messageType = req.headers['twitch-eventsub-message-type'];
    const rawBody     = req.body.toString('utf8');

    // ─── Verify signature ───────────────────────────
    if (!verifySignature(messageId, timestamp, rawBody, signature)) {
      console.warn('[Twitch Webhook] Invalid signature — rejected');
      return res.status(403).send('Forbidden');
    }

    let body;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return res.status(400).send('Bad Request');
    }

    // ─── Handle challenge (subscription verification) ──
    if (messageType === 'webhook_callback_verification') {
      console.log('[Twitch Webhook] Subscription verified:', body.subscription?.id);
      return res.status(200).send(body.challenge);
    }

    // ─── Handle revocation ──────────────────────────
    if (messageType === 'revocation') {
      console.warn('[Twitch Webhook] Subscription revoked:', body.subscription?.id);
      await dbExecute(
        `UPDATE twitch_subscriptions
         SET subscription_id = NULL
         WHERE subscription_id = ?`,
        [body.subscription?.id],
      ).catch(() => null);
      return res.status(200).send('OK');
    }

    // ─── Handle stream.online event ─────────────────
    if (messageType === 'notification' && body.subscription?.type === 'stream.online') {
      res.status(200).send('OK'); // respond immediately to avoid Twitch timeout

      const twitchUserId = body.event?.broadcaster_user_id;
      const twitchLogin  = body.event?.broadcaster_user_login;

      console.log(`[Twitch Webhook] Stream online: ${twitchLogin}`);

      try {
        // Find all guilds tracking this streamer
        const subscriptions = await query(
          `SELECT * FROM twitch_subscriptions
           WHERE twitch_user_id = ?`,
          [twitchUserId],
        );

        if (subscriptions.length === 0) return;

        // Fetch live stream details from Twitch API
        const stream = await getStream(twitchUserId);
        if (!stream) return;

        // Get the client from the app (attached in app.js)
        const client = req.app.get('discordClient');
        if (!client) return;

        for (const sub of subscriptions) {
          try {
            const guild = client.guilds.cache.get(sub.guild_id);
            if (!guild) continue;

            const channel = guild.channels.cache.get(sub.channel_id);
            if (!channel) continue;

            // Build notification message
            const message = (sub.custom_message ?? '{streamer} is now live on Twitch playing {game}!')
              .replace(/{streamer}/g, stream.user_name)
              .replace(/{title}/g,    stream.title)
              .replace(/{game}/g,     stream.game_name  ?? 'Unknown')
              .replace(/{url}/g,      `https://twitch.tv/${twitchLogin}`);

            // Build thumbnail URL (replace template with actual size)
            const thumbnail = stream.thumbnail_url
              ?.replace('{width}', '1280')
              ?.replace('{height}', '720');

            const notifMsg = await channel.send({
              content: message,
              embeds: [{
                color:  0x9147ff,
                title:  `🔴 ${stream.user_name} is live!`,
                url:    `https://twitch.tv/${twitchLogin}`,
                fields: [
                  { name: '📺 Title',   value: stream.title        || 'No title',    inline: false },
                  { name: '🎮 Game',    value: stream.game_name    || 'Unknown',     inline: true  },
                  { name: '👥 Viewers', value: stream.viewer_count?.toLocaleString() || '0', inline: true },
                ],
                image:     thumbnail ? { url: thumbnail } : undefined,
                footer:    { text: 'Twitch • Live now' },
                timestamp: new Date().toISOString(),
              }],
            });

            // Mark as live and save message ID for potential later use
            await dbExecute(
              `UPDATE twitch_subscriptions
               SET live = 1, message_id = ?
               WHERE id = ?`,
              [notifMsg.id, sub.id],
            );
          } catch (err) {
            console.error(`[Twitch Webhook] Failed to notify guild ${sub.guild_id}:`, err.message);
          }
        }
      } catch (err) {
        console.error('[Twitch Webhook] Error handling stream.online:', err.message);
      }

      return;
    }

    // ─── Handle stream.offline event ────────────────
    if (messageType === 'notification' && body.subscription?.type === 'stream.offline') {
      res.status(200).send('OK');

      const twitchUserId = body.event?.broadcaster_user_id;

      await dbExecute(
        `UPDATE twitch_subscriptions SET live = 0 WHERE twitch_user_id = ?`,
        [twitchUserId],
      ).catch(() => null);

      console.log(`[Twitch Webhook] Stream offline: ${body.event?.broadcaster_user_login}`);
      return;
    }

    return res.status(200).send('OK');
  },
);

// ─── Dashboard: list tracked streamers for a guild ────────
router.get('/:guildId', async (req, res) => {
  try {
    const { guildId } = req.params;

    const streamers = await query(
      `SELECT * FROM twitch_subscriptions
       WHERE guild_id = ?
       ORDER BY twitch_login ASC`,
      [guildId],
    );

    return res.json({ streamers });
  } catch (err) {
    console.error('[Twitch] Error fetching streamers:', err.message);
    return res.status(500).json({ error: 'Failed to fetch streamers' });
  }
});

module.exports = router;