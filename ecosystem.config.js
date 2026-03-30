require('dotenv').config();

module.exports = {
  apps: [
    // ─── Discord Bot ──────────────────────────────────
    {
      name: 'discord-bot',
      script: 'src/bot.js',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,       // wait 5s before restarting
      exp_backoff_restart_delay: 100,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: 'logs/bot-error.log',
      out_file: 'logs/bot-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },

    // ─── Web Dashboard ────────────────────────────────
    {
      name: 'discord-dashboard',
      script: 'dashboard/app.js',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      exp_backoff_restart_delay: 100,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: 'logs/dashboard-error.log',
      out_file: 'logs/dashboard-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};