const { execute: dbExecute, query } = require('../db');

module.exports = {
  name: 'guildMemberAdd',
  once: false,

  async execute(member, client) {
    const { guild } = member;
    console.log(`[MemberAdd] ${member.user.tag} joined ${guild.name} (${guild.id})`);

    // ─── Upsert member in DB ─────────────────────────
    try {
      await dbExecute(
        `INSERT INTO guild_members (guild_id, user_id, username)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           username = VALUES(username)`,
        [guild.id, member.user.id, member.user.tag],
      );
    } catch (err) {
      console.error(`[MemberAdd] Failed to upsert member ${member.user.id}:`, err.message);
    }

    // ─── Fetch guild config ──────────────────────────
    let config;
    try {
      const rows = await query(
        `SELECT * FROM guild_config WHERE guild_id = ?`,
        [guild.id],
      );
      config = rows[0];
    } catch (err) {
      console.error(`[MemberAdd] Failed to fetch config for ${guild.id}:`, err.message);
      return;
    }

    if (!config) return;

    // ─── Auto-role ───────────────────────────────────
    if (config.auto_role) {
      try {
        const role = guild.roles.cache.get(config.auto_role);

        if (role) {
          await member.roles.add(role, 'Auto-role on join');
          console.log(`[MemberAdd] Assigned auto-role ${role.name} to ${member.user.tag}`);
        } else {
          console.warn(`[MemberAdd] Auto-role ${config.auto_role} not found in ${guild.id}`);
        }
      } catch (err) {
        console.error(`[MemberAdd] Failed to assign auto-role in ${guild.id}:`, err.message);
      }
    }

    // ─── Welcome message ─────────────────────────────
    if (config.welcome_channel && config.welcome_message) {
      try {
        const channel = guild.channels.cache.get(config.welcome_channel);

        if (!channel) {
          console.warn(`[MemberAdd] Welcome channel ${config.welcome_channel} not found in ${guild.id}`);
          return;
        }

        // Replace tokens in welcome message
        const message = config.welcome_message
          .replace(/{user}/g,       member.toString())       // @mention
          .replace(/{username}/g,   member.user.username)
          .replace(/{server}/g,     guild.name)
          .replace(/{membercount}/g, guild.memberCount.toString());

        await channel.send({
          embeds: [
            {
              color: 0x57f287,
              title: `👋 Welcome to ${guild.name}!`,
              description: message,
              thumbnail: {
                url: member.user.displayAvatarURL({ dynamic: true, size: 256 }),
              },
              footer: {
                text: `Member #${guild.memberCount}`,
              },
              timestamp: new Date().toISOString(),
            },
          ],
        });
      } catch (err) {
        console.error(`[MemberAdd] Failed to send welcome message in ${guild.id}:`, err.message);
      }
    }

    // ─── Update guild member count in DB ────────────
    try {
      await dbExecute(
        `UPDATE guilds SET member_count = ? WHERE id = ?`,
        [guild.memberCount, guild.id],
      );
    } catch (err) {
      console.error(`[MemberAdd] Failed to update member count for ${guild.id}:`, err.message);
    }
  },
};