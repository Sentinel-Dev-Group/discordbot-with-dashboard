const { SlashCommandBuilder } = require('discord.js');
const { useMainPlayer }       = require('discord-player');
const { getPlayer }           = require('../utils/player');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song or playlist from YouTube, Spotify or SoundCloud')
    .addStringOption(opt => opt
      .setName('query')
      .setDescription('Song name, URL, or playlist URL')
      .setRequired(true)),

  cooldown: 3,

  async execute(interaction, client) {
    await interaction.deferReply();

    // ─── Check player is ready ────────────────────
    if (!getPlayer()) {
      return interaction.editReply({
        embeds: [{
          color:       0xed4245,
          description: '❌ Music player is still initialising. Please wait a moment and try again.',
        }],
      });
    }

    const { guild, member, channel } = interaction;
    const query = interaction.options.getString('query');

    // ─── Must be in a voice channel ───────────────
    const voiceChannel = member.voice.channel;

    if (!voiceChannel) {
      return interaction.editReply({
        embeds: [{
          color:       0xed4245,
          description: '❌ You need to be in a voice channel to play music.',
        }],
      });
    }

    // ─── Check bot permissions in voice channel ───
    const permissions = voiceChannel.permissionsFor(client.user);
    if (!permissions.has('Connect') || !permissions.has('Speak')) {
      return interaction.editReply({
        embeds: [{
          color:       0xed4245,
          description: '❌ I need **Connect** and **Speak** permissions in your voice channel.',
        }],
      });
    }

    // ─── Play ─────────────────────────────────────
    try {
      const player = useMainPlayer();

      const { track } = await player.play(voiceChannel, query, {
        nodeOptions: {
          metadata: {
            channel,
            interaction,
          },
          selfDeaf:          true,
          volume:            80,
          leaveOnEmpty:      true,
          leaveOnEmptyDelay: 30000,
          leaveOnEnd:        true,
          leaveOnEndDelay:   30000,
        },
      });

      const queue = player.nodes.get(guild.id);
      if (queue && queue.isPlaying()) return interaction.editReply({
        embeds: [{
          color:       0x57f287,
          description: `✅ Added **${track.title}** to the queue.`,
        }],
      });

      return interaction.editReply({
        embeds: [{
          color:  0x5865f2,
          title:  '🎵 Starting playback',
          fields: [
            { name: 'Track',    value: `[${track.title}](${track.url})`, inline: false },
            { name: 'Duration', value: track.duration,                    inline: true  },
          ],
          thumbnail: { url: track.thumbnail },
        }],
      });
    } catch (err) {
      console.error('[Play] Error:', err.message);
      return interaction.editReply({
        embeds: [{
          color:       0xed4245,
          description: `❌ Could not play that track: ${err.message}`,
        }],
      });
    }
  },
};