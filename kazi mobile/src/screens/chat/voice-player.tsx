import { useEffect, useId } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { clipTime } from '@/data/chat/utils';

/**
 * Every bubble owns its own player, so nothing but this would stop two notes
 * playing over each other. Module-level rather than a context: the bubbles
 * share no ancestor worth threading a provider through, and only one note is
 * ever meant to be audible in the whole app.
 */
const listeners = new Set<(playingId: string) => void>();

function claimPlayback(id: string): void {
  for (const listener of listeners) listener(id);
}

/**
 * A voice-note bubble: play/pause, a progress bar, and elapsed/total time.
 * Shared by Team chat and the Leads inbox.
 *
 * Simpler than the web version's real waveform (decoded with the Web Audio
 * API, which has no RN equivalent) — a plain progress fill reads just as
 * clearly on a phone and costs nothing to decode.
 */
export function VoicePlayer({ src, mine }: { src?: string; mine: boolean }) {
  const theme = useTheme();
  const player = useAudioPlayer(src ?? null);
  const status = useAudioPlayerStatus(player);
  const id = useId();

  useEffect(() => {
    const yieldTo = (playingId: string) => {
      if (playingId !== id) player.pause();
    };
    listeners.add(yieldTo);
    return () => {
      listeners.delete(yieldTo);
    };
  }, [id, player]);

  const toggle = async () => {
    if (status.playing) {
      player.pause();
      return;
    }
    // A finished note sits at its end; playing again without rewinding it does
    // nothing at all.
    if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration)) {
      await player.seekTo(0);
    }
    claimPlayback(id);
    player.play();
  };

  const fg = mine ? theme.onDark.text : theme.textPrimary;
  const track = mine ? theme.onDark.accentWash : theme.draftWash;
  const fill = mine ? theme.onDark.accent : theme.accent;

  if (!src) {
    return (
      <View style={styles.wrap}>
        <View style={[styles.playBtn, { backgroundColor: track }]}>
          <Icon name="play" size={13} color={fg} />
        </View>
        <View style={[styles.track, { backgroundColor: track }]} />
        <Text style={[styles.time, { color: fg }]}>Link unavailable</Text>
      </View>
    );
  }

  const duration = status.duration || 0;
  const current = status.currentTime || 0;
  const ratio = duration ? Math.min(1, current / duration) : 0;
  const label = clipTime(status.playing || current ? current : duration);

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => void toggle()}
        style={[styles.playBtn, { backgroundColor: track }]}
        accessibilityRole="button"
        accessibilityLabel={status.playing ? 'Pause' : 'Play'}
      >
        <Icon name={status.playing ? 'pause' : 'play'} size={13} color={fg} />
      </Pressable>
      <View style={[styles.track, { backgroundColor: track }]}>
        <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: fill }]} />
      </View>
      <Text style={[styles.time, tabularNums, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 168,
    paddingVertical: 2,
  },
  playBtn: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  track: {
    flex: 1,
    height: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
  time: {
    fontFamily: fontFamily.mono,
    fontSize: 10.5,
    flexShrink: 0,
  },
});
