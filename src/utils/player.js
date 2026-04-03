const { Player }          = require('discord-player');
const { YoutubeiExtractor, DefaultExtractors } = require('@discord-player/extractor');

let playerInstance = null;

async function initPlayer(client) {
  if (playerInstance) return playerInstance;

  const player = new Player(client, {
    ytdlOptions: {
      quality:        'highestaudio',
      highWaterMark:  1 << 25,
    },
  });

  // ─── Load extractors ──────────────────────────────
  await player.extractors.loadMulti(DefaultExtractors);
  console.log('[Player] Extractors loaded');

  // ─── Player events ────────────────────────────────
  player.events.on('playerStart', (queue, track) => {
    queue.metadata.channel.send({
      embeds: [{
        color:  0x5865f2,
        title:  '🎵 Now playing',
        fields: [
          { name: 'Track',     value: `[${track.title}](${track.url})`, inline: false },
          { name: 'Duration',  value: track.duration,                    inline: true  },
          { name: 'Requested', value: `${track.requestedBy}`,           inline: true  },
        ],
        thumbnail: { url: track.thumbnail },
        footer:    { text: `Queue: ${queue.tracks.size} track(s) remaining` },
      }],
    }).catch(() => null);
  });

  player.events.on('audioTrackAdd', (queue, track) => {
    queue.metadata.channel.send({
      embeds: [{
        color:       0x57f287,
        title:       '✅ Track added to queue',
        description: `[${track.title}](${track.url}) — ${track.duration}`,
        thumbnail:   { url: track.thumbnail },
        footer:      { text: `Position: #${queue.tracks.size}` },
      }],
    }).catch(() => null);
  });

  player.events.on('disconnect', queue => {
    queue.metadata.channel.send({
      embeds: [{
        color:       0xed4245,
        description: '❌ Disconnected from voice channel — queue cleared.',
      }],
    }).catch(() => null);
  });

  player.events.on('emptyQueue', queue => {
    queue.metadata.channel.send({
      embeds: [{
        color:       0xfee75c,
        description: '✅ Queue finished — no more tracks to play.',
      }],
    }).catch(() => null);
  });

  player.events.on('emptyChannel', queue => {
    queue.metadata.channel.send({
      embeds: [{
        color:       0xfee75c,
        description: '👋 Left voice channel — everyone left.',
      }],
    }).catch(() => null);
  });

  player.events.on('error', (queue, err) => {
    console.error('[Player] Queue error:', err.message);
    queue.metadata.channel.send({
      embeds: [{
        color:       0xed4245,
        description: `❌ Player error: ${err.message}`,
      }],
    }).catch(() => null);
  });

  player.events.on('playerError', (queue, err) => {
    console.error('[Player] Player error:', err.message);
  });

  playerInstance = player;
  console.log('[Player] Initialised successfully');
  return player;
}

function getPlayer() {
  return playerInstance;
}

module.exports = { initPlayer, getPlayer };