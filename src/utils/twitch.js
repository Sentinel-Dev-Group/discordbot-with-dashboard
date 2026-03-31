const https = require('https');
const { query, execute: dbExecute } = require('../db');
require('dotenv').config();

// ─── Token cache ──────────────────────────────────────────
let appAccessToken   = null;
let tokenExpiresAt   = 0;

// ─── Get app access token ─────────────────────────────────
async function getAccessToken() {
  if (appAccessToken && Date.now() < tokenExpiresAt) {
    return appAccessToken;
  }

  const body = `client_id=${encodeURIComponent(process.env.TWITCH_CLIENT_ID)}&client_secret=${encodeURIComponent(process.env.TWITCH_CLIENT_SECRET)}&grant_type=client_credentials`;

  const data = await post('https://id.twitch.tv/oauth2/token', body, {
    'Content-Type':   'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(body).toString(),
  });

  console.log('[Twitch Debug] Token response:', JSON.stringify(data));

  if (!data.access_token) {
    throw new Error(`Twitch token error: ${JSON.stringify(data)}`);
  }

  appAccessToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000;

  console.log('[Twitch] Access token refreshed');
  return appAccessToken;
}

// ─── Get Twitch user by login name ────────────────────────
async function getTwitchUser(login) {
  const token = await getAccessToken();

  console.log('[Twitch Debug] Fetching user:', login, 'with token:', token ? 'present' : 'MISSING');

  const data = await get(
    `https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`,
    {
      'Client-ID':     process.env.TWITCH_CLIENT_ID,
      'Authorization': `Bearer ${token}`,
    },
  );

  console.log('[Twitch Debug] getTwitchUser response:', JSON.stringify(data));

  return data.data?.[0] ?? null;
}

// ─── Get stream info for a user ───────────────────────────
async function getStream(userId) {
  const token = await getAccessToken();

  const data = await get(
    `https://api.twitch.tv/helix/streams?user_id=${userId}`,
    {
      'Client-ID':     process.env.TWITCH_CLIENT_ID,
      'Authorization': `Bearer ${token}`,
    },
  );

  return data.data?.[0] ?? null;
}

// ─── Subscribe to EventSub stream.online ─────────────────
async function subscribeToStreamer(twitchUserId) {
  const token = await getAccessToken();

  const body = JSON.stringify({
    type:      'stream.online',
    version:   '1',
    condition: { broadcaster_user_id: twitchUserId },
    transport: {
      method:   'webhook',
      callback: `${process.env.DASHBOARD_URL}/twitch/webhook`,
      secret:   process.env.TWITCH_WEBHOOK_SECRET,
    },
  });

  try {
    const data = await post(
      'https://api.twitch.tv/helix/eventsub/subscriptions',
      body,
      {
        'Client-ID':     process.env.TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
      },
    );

    return data.data?.[0] ?? null;
  } catch (err) {
    console.error('[Twitch] Failed to subscribe to EventSub:', err.message);
    return null;
  }
}

// ─── Unsubscribe from EventSub ────────────────────────────
async function unsubscribeFromStreamer(subscriptionId) {
  const token = await getAccessToken();

  try {
    await deleteReq(
      `https://api.twitch.tv/helix/eventsub/subscriptions?id=${subscriptionId}`,
      {
        'Client-ID':     process.env.TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${token}`,
      },
    );
    return true;
  } catch (err) {
    console.error('[Twitch] Failed to unsubscribe from EventSub:', err.message);
    return false;
  }
}

// ─── List all EventSub subscriptions ─────────────────────
async function listSubscriptions() {
  const token = await getAccessToken();

  const data = await get(
    'https://api.twitch.tv/helix/eventsub/subscriptions',
    {
      'Client-ID':     process.env.TWITCH_CLIENT_ID,
      'Authorization': `Bearer ${token}`,
    },
  );

  return data.data ?? [];
}

// ─── Verify webhook signature ─────────────────────────────
function verifySignature(messageId, timestamp, body, signature) {
  const crypto  = require('crypto');
  const message = messageId + timestamp + body;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', process.env.TWITCH_WEBHOOK_SECRET)
    .update(message)
    .digest('hex');

  return expected === signature;
}

// ─── HTTP helpers ─────────────────────────────────────────
function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });
    req.on('error', reject);
  });
}

function post(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj  = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path:     urlObj.pathname + urlObj.search,
      method:   'POST',
      headers:  { ...headers, 'Content-Length': Buffer.byteLength(body).toString() },
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({});
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function deleteReq(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj  = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path:     urlObj.pathname + urlObj.search,
      method:   'DELETE',
      headers,
    };

    const req = https.request(options, res => {
      res.on('data', () => {});
      res.on('end', resolve);
    });

    req.on('error', reject);
    req.end();
  });
}

module.exports = {
  getAccessToken,
  getTwitchUser,
  getStream,
  subscribeToStreamer,
  unsubscribeFromStreamer,
  listSubscriptions,
  verifySignature,
};