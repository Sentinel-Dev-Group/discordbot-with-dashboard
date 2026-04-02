const { SlashCommandBuilder } = require('discord.js');
const { useQueue }            = require('discord-player');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the current track')
    .addIntegerOption(opt => opt
      .setName('to')
      .setDescription('Skip to a specific position in the queue')
      .setMinValue(1)
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

    const skipTo = interaction.options.getInteger('to');
    const currentTrack = queue.currentTrack;

    // ─── Skip to position ─────────────────────────
    if (skipTo) {
      if (skipTo > queue.tracks.size) {
        return interaction.editReply({
          embeds: [{
            color:       0xed4245,
            description: `❌ There are only **${queue.tracks.size}** track(s) in the queue.`,
          }],
        });
      }

      queue.node.skipTo(skipTo - 1);

      return interaction.editReply({
        embeds: [{
          color:       0x57f287,
          description: `⏭️ Skipped to track **#${skipTo}** in the queue.`,
        }],
      });
    }

    // ─── Skip current track ───────────────────────
    queue.node.skip();

    return interaction.editReply({
      embeds: [{
        color:  0x57f287,
        title:  '⏭️ Skipped',
        fields: [
          {
            name:  'Skipped track',
            value: currentTrack
              ? `[${currentTrack.title}](${currentTrack.url})`
              : 'Unknown',
            inline: false,
          },
          {
            name:   'Up next',
            value:  queue.tracks.size > 0
              ? `[${queue.tracks.at(0).title}](${queue.tracks.at(0).url})`
              : 'Nothing — queue is empty',
            inline: false,
          },
        ],
      }],
    });
  },
};