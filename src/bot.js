const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
} = require('discord.js');
const fs   = require('fs');
const path = require('path');
require('dotenv').config();

const { initPlayer } = require('./utils/player');

// ─── Client ───────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
  partials: [
    Partials.GuildMember,
    Partials.Message,
    Partials.Channel,
  ],
});

// ─── Collections ──────────────────────────────────────────
client.commands  = new Collection();
client.cooldowns = new Collection();

// ─── Load commands ────────────────────────────────────────
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));

  if (!command.data || !command.execute) {
    console.warn(`[Commands] Skipping ${file} — missing data or execute`);
    continue;
  }

  client.commands.set(command.data.name, command);
  console.log(`[Commands] Loaded /${command.data.name}`);
}

// ─── Load events ──────────────────────────────────────────
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'));

for (const file of eventFiles) {
  const event = require(path.join(eventsPath, file));

  if (!event.name || !event.execute) {
    console.warn(`[Events] Skipping ${file} — missing name or execute`);
    continue;
  }

  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }

  console.log(`[Events] Registered: ${event.name}${event.once ? ' (once)' : ''}`);
}

// ─── Initialise music player ──────────────────────────────
client.once('ready', async () => {
  try {
    await initPlayer(client);
  } catch (err) {
    console.error('[Player] Failed to initialise:', err.message);
  }
});

// ─── Unhandled errors ─────────────────────────────────────
process.on('unhandledRejection', err => {
  console.error('[Process] Unhandled rejection:', err);
});

process.on('uncaughtException', err => {
  console.error('[Process] Uncaught exception:', err);
});

// ─── Login ────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log('[Bot] Logged in successfully'))
  .catch(err => {
    console.error('[Bot] Login failed:', err.message);
    process.exit(1);
  });

module.exports = client;