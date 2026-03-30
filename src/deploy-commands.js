const { REST, Routes } = require('discord.js');
const fs   = require('fs');
const path = require('path');
require('dotenv').config();

// ─── Collect command data ─────────────────────────────────
const commands     = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));

  if (!command.data) {
    console.warn(`[Deploy] Skipping ${file} — no data export`);
    continue;
  }

  commands.push(command.data.toJSON());
  console.log(`[Deploy] Queued: /${command.data.name}`);
}

// ─── REST client ─────────────────────────────────────────
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// ─── Deploy ───────────────────────────────────────────────
(async () => {
  try {
    console.log(`\n[Deploy] Registering ${commands.length} slash command(s) globally...`);
    console.log('[Deploy] This can take up to 1 hour to propagate to all servers.\n');

    const data = await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands },
    );

    console.log(`[Deploy] Successfully registered ${data.length} command(s).`);
    console.log('[Deploy] Done.\n');
  } catch (err) {
    console.error('[Deploy] Failed to register commands:', err);
    process.exit(1);
  }
})();