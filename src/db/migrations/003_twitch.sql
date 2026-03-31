-- ─────────────────────────────────────────────────────────
-- Twitch notifications
-- Run: mysql -u novabot -p discordbot < src/db/migrations/003_twitch.sql
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS twitch_subscriptions (
  id              INT           NOT NULL AUTO_INCREMENT,
  guild_id        VARCHAR(20)   NOT NULL,
  channel_id      VARCHAR(20)   NOT NULL,  -- Discord channel to post in
  twitch_user_id  VARCHAR(50)   NOT NULL,  -- Twitch user ID
  twitch_login    VARCHAR(50)   NOT NULL,  -- Twitch username (display)
  subscription_id VARCHAR(100)  DEFAULT NULL, -- Twitch EventSub subscription ID
  live            TINYINT(1)    DEFAULT 0, -- currently live?
  message_id      VARCHAR(20)   DEFAULT NULL, -- last posted Discord message ID
  custom_message  TEXT          DEFAULT NULL, -- optional custom notification message
  added_by        VARCHAR(20)   NOT NULL,  -- Discord user ID who added this
  created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY unique_guild_streamer (guild_id, twitch_user_id),
  INDEX idx_twitch_guild (guild_id),
  INDEX idx_twitch_user (twitch_user_id),
  CONSTRAINT fk_twitch_guild FOREIGN KEY (guild_id)
    REFERENCES guilds (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;