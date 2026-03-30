const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check the bot\'s latency and API response time'),

  cooldown: 10, // seconds

  async execute(interaction, client) {
    // Defer so we can measure round-trip time accurately
    await interaction.deferReply();

    const sent     = await interaction.fetchReply();
    const roundTrip = sent.createdTimestamp - interaction.createdTimestamp;
    const wsLatency = client.ws.ping;

    // Colour the embed based on latency
    let color;
    if (roundTrip < 150)      color = 0x57f287; // green  — fast
    else if (roundTrip < 400) color = 0xfee75c; // yellow — acceptable
    else                      color = 0xed4245; // red    — slow

    await interaction.editReply({
      embeds: [
        {
          color,
          title: '🏓 Pong!',
          fields: [
            {
              name:   '↩️ Round-trip',
              value:  `\`${roundTrip}ms\``,
              inline: true,
            },
            {
              name:   '🌐 WebSocket',
              value:  `\`${wsLatency}ms\``,
              inline: true,
            },
            {
              name:   '📡 API',
              value:  wsLatency < 0 ? '`Connecting...`' : '`Online`',
              inline: true,
            },
          ],
          footer: {
            text: `Requested by ${interaction.user.tag}`,
            icon_url: interaction.user.displayAvatarURL({ dynamic: true }),
          },
          timestamp: new Date().toISOString(),
        },
      ],
    });
  },
};