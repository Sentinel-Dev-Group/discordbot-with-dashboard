const { SlashCommandBuilder } = require('discord.js');
const { useQueue }            = require('discord-player');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Set or check the playback volume')
    .addIntegerOption(opt => opt
      .setName('level')
      .setDescription('Volume level (1–100), omit to check current volume')
      .setMinValue(1)
      .setMaxValue(100)
      .setRequired(false)),

  cooldown: 3,

  async execute(interaction) {
    await interaction.deferReply();

    const queue = useQueue(interaction.guild.id);

    if (!queue || !queue.isPlaying()) {
      return interaction.editReply({
        embeds: [{
          color:       0xed4245,
          description: '❌ Nothing is playing right now.',
        }],
      });
    }

    // ─── Check user is in same voice channel ──────
    if (interaction.member.voice.channelId !== queue.channel?.id) {
      return interaction.editReply({
        embeds: [{
          color:       0xed4245,
          description: '❌ You need to be in the same voice channel as the bot.',
        }],
      });
    }

    const level = interaction.options.getInteger('level');

    // ─── No level provided — show current ─────────
    if (level === null) {
      const current = queue.node.volume;
      const bar     = volumeBar(current);

      return interaction.editReply({
        embeds: [{
          color:       0x5865f2,
          title:       '🔊 Current volume',
          description: `\`${bar}\` **${current}%**`,
          timestamp:   new Date().toISOString(),
        }],
      });
    }

    // ─── Set volume ───────────────────────────────
    const previous = queue.node.volume;
    queue.node.setVolume(level);

    const bar      = volumeBar(level);
    const arrow    = level > previous ? '🔊' : level < previous ? '🔈' : '🔉';

    return interaction.editReply({
      embeds: [{
        color:  0x57f287,
        title:  `${arrow} Volume updated`,
        fields: [
          {
            name:   'Volume',
            value:  `\`${bar}\` **${level}%**`,
            inline: false,
          },
          {
            name:   'Previous',
            value:  `${previous}%`,
            inline: true,
          },
          {
            name:   'Set by',
            value:  interaction.user.tag,
            inline: true,
          },
        ],
        timestamp: new Date().toISOString(),
      }],
    });
  },
};

// ─── Volume bar helper ────────────────────────────────────
function volumeBar(volume, length = 15) {
  const filled = Math.round((volume / 100) * length);
  const empty  = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}