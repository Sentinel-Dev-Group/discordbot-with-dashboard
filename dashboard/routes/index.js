const express = require('express');
const router  = express.Router();
const { query } = require('../../src/db');

// ─── Middleware: require login ─────────────────────────────
function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  req.flash('error', 'You must be logged in to access that page.');
  res.redirect('/auth/login');
}

// ─── GET / ────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    // Fetch some global stats for the landing page
    const guildCount = await query(
      `SELECT COUNT(*) AS total FROM guilds WHERE active = 1`,
    );

    const memberCount = await query(
      `SELECT SUM(member_count) AS total FROM guilds WHERE active = 1`,
    );

    const commandCount = await query(
      `SELECT COUNT(*) AS total FROM command_logs`,
    );

    const stats = {
      guilds:   guildCount[0]?.total   ?? 0,
      members:  memberCount[0]?.total  ?? 0,
      commands: commandCount[0]?.total ?? 0,
    };

    return res.render('index', {
      title: 'Home',
      stats,
    });
  } catch (err) {
    console.error('[Routes/Index] Error fetching stats:', err.message);
    return res.render('index', {
      title: 'Home',
      stats: { guilds: 0, members: 0, commands: 0 },
    });
  }
});

// ─── GET /servers ─────────────────────────────────────────
// Shows the list of servers the logged-in user can manage
router.get('/servers', requireAuth, async (req, res) => {
  try {
    // Filter user's guilds to ones where they have MANAGE_GUILD (0x20)
    // and where the bot is also present (active = 1 in our DB)
    const userGuilds = req.user.guilds ?? [];

    const manageableGuilds = userGuilds.filter(g => {
      const perms = BigInt(g.permissions);
      return (perms & BigInt(0x20)) === BigInt(0x20);
    });

    // Get guild IDs the bot is actually in
    const botGuildIds = await query(
      `SELECT id FROM guilds WHERE active = 1`,
    );

    const botIds = new Set(botGuildIds.map(r => r.id));

    // Split into bot-present and invite-needed
    const activeGuilds  = manageableGuilds.filter(g => botIds.has(g.id));
    const inviteGuilds  = manageableGuilds.filter(g => !botIds.has(g.id));

    const inviteUrl = `https://discord.com/api/oauth2/authorize`
      + `?client_id=${process.env.CLIENT_ID}`
      + `&permissions=8`
      + `&scope=bot%20applications.commands`;

    return res.render('servers', {
      title:        'My Servers',
      activeGuilds,
      inviteGuilds,
      inviteUrl,
    });
  } catch (err) {
    console.error('[Routes/Index] Error fetching servers:', err.message);
    req.flash('error', 'Failed to load servers. Please try again.');
    return res.redirect('/');
  }
});

module.exports = router;
module.exports.requireAuth = requireAuth;