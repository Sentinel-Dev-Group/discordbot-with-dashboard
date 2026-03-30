-- ─────────────────────────────────────────────────────────
-- Discord Bot — full schema
-- Run once:  mysql -u botuser -p discordbot < src/db/migrations/001_schema.sql
-- ─────────────────────────────────────────────────────────

SET FOREIGN_KEY_CHECKS = 0;

-- ─── Guilds ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guilds (
  id            VARCHAR(20)   NOT NULL,
  name          VARCHAR(100)  NOT NULL,
  icon          VARCHAR(255)  DEFAULT NULL,
  member_count  INT           DEFAULT 0,
  joined_at     TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  active        TINYINT(1)    DEFAULT 1,   -- 0 when bot is kicked/leaves
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Guild config ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guild_config (
  guild_id          VARCHAR(20)   NOT NULL,
  log_channel       VARCHAR(20)   DEFAULT NULL,  -- audit log channel ID
  welcome_channel   VARCHAR(20)   DEFAULT NULL,
  welcome_message   TEXT          DEFAULT NULL,  -- supports {user} {server} tokens
  mute_role         VARCHAR(20)   DEFAULT NULL,
  auto_role         VARCHAR(20)   DEFAULT NULL,  -- role assigned on join
  ticket_category   VARCHAR(20)   DEFAULT NULL,  -- category channel for tickets
  ticket_log        VARCHAR(20)   DEFAULT NULL,  -- channel to log closed tickets
  updated_at        TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (guild_id),
  CONSTRAINT fk_config_guild FOREIGN KEY (guild_id)
    REFERENCES guilds (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Users (per guild) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS guild_members (
  guild_id    VARCHAR(20)   NOT NULL,
  user_id     VARCHAR(20)   NOT NULL,
  username    VARCHAR(100)  DEFAULT NULL,
  xp          INT           DEFAULT 0,
  level       INT           DEFAULT 0,
  last_xp_at  TIMESTAMP     DEFAULT NULL,  -- XP cooldown tracking
  joined_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (guild_id, user_id),
  CONSTRAINT fk_member_guild FOREIGN KEY (guild_id)
    REFERENCES guilds (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Warnings ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS warnings (
  id            INT           NOT NULL AUTO_INCREMENT,
  guild_id      VARCHAR(20)   NOT NULL,
  user_id       VARCHAR(20)   NOT NULL,
  moderator_id  VARCHAR(20)   NOT NULL,
  reason        TEXT          DEFAULT NULL,
  created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_warn_guild_user (guild_id, user_id),
  CONSTRAINT fk_warn_guild FOREIGN KEY (guild_id)
    REFERENCES guilds (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Bans ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bans (
  id            INT           NOT NULL AUTO_INCREMENT,
  guild_id      VARCHAR(20)   NOT NULL,
  user_id       VARCHAR(20)   NOT NULL,
  moderator_id  VARCHAR(20)   NOT NULL,
  reason        TEXT          DEFAULT NULL,
  expires_at    TIMESTAMP     DEFAULT NULL,  -- NULL = permanent
  active        TINYINT(1)    DEFAULT 1,
  created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_ban_guild_user (guild_id, user_id),
  CONSTRAINT fk_ban_guild FOREIGN KEY (guild_id)
    REFERENCES guilds (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Mutes ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mutes (
  id            INT           NOT NULL AUTO_INCREMENT,
  guild_id      VARCHAR(20)   NOT NULL,
  user_id       VARCHAR(20)   NOT NULL,
  moderator_id  VARCHAR(20)   NOT NULL,
  reason        TEXT          DEFAULT NULL,
  expires_at    TIMESTAMP     DEFAULT NULL,  -- NULL = permanent until unmuted
  active        TINYINT(1)    DEFAULT 1,
  created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_mute_guild_user (guild_id, user_id),
  CONSTRAINT fk_mute_guild FOREIGN KEY (guild_id)
    REFERENCES guilds (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Tickets ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets (
  id            INT           NOT NULL AUTO_INCREMENT,
  guild_id      VARCHAR(20)   NOT NULL,
  channel_id    VARCHAR(20)   NOT NULL,  -- the created ticket channel
  user_id       VARCHAR(20)   NOT NULL,  -- opener
  subject       VARCHAR(255)  DEFAULT NULL,
  status        ENUM('open','closed') DEFAULT 'open',
  closed_by     VARCHAR(20)   DEFAULT NULL,
  created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  closed_at     TIMESTAMP     DEFAULT NULL,
  PRIMARY KEY (id),
  INDEX idx_ticket_guild (guild_id),
  INDEX idx_ticket_channel (channel_id),
  CONSTRAINT fk_ticket_guild FOREIGN KEY (guild_id)
    REFERENCES guilds (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Command logs ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS command_logs (
  id          INT           NOT NULL AUTO_INCREMENT,
  guild_id    VARCHAR(20)   NOT NULL,
  user_id     VARCHAR(20)   NOT NULL,
  username    VARCHAR(100)  DEFAULT NULL,
  command     VARCHAR(100)  NOT NULL,
  options     JSON          DEFAULT NULL,  -- slash command options as JSON
  channel_id  VARCHAR(20)   DEFAULT NULL,
  used_at     TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_log_guild (guild_id),
  INDEX idx_log_used_at (used_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Audit log ────────────────────────────────────────────
-- Internal record of all mod actions (separate from Discord's own audit log)
CREATE TABLE IF NOT EXISTS audit_log (
  id            INT           NOT NULL AUTO_INCREMENT,
  guild_id      VARCHAR(20)   NOT NULL,
  moderator_id  VARCHAR(20)   NOT NULL,
  target_id     VARCHAR(20)   DEFAULT NULL,  -- user acted upon (if any)
  action        VARCHAR(50)   NOT NULL,      -- BAN, KICK, WARN, MUTE, UNMUTE etc.
  reason        TEXT          DEFAULT NULL,
  metadata      JSON          DEFAULT NULL,  -- extra context (duration, channel etc.)
  created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_audit_guild (guild_id),
  INDEX idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;