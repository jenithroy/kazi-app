import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import type { Attachment } from '@/data/chat/types';
import { clipLength, fileSize } from '@/data/chat/utils';

import { VoicePlayer } from './voice-player';

export interface MessageAttachmentProps {
  attachment: Attachment;
  /** Own bubbles are ink; the caption under the tile has to flip with them. */
  mine: boolean;
  /**
   * The enclosing bubble's handlers, not the tile's own. A nested `Pressable`
   * takes the touch responder from its parent, so a tile with its own `onPress`
   * swallowed the bubble's long-press — you could never open the actions sheet
   * (and so never reply to) a message carrying a photo or a file. Routing both
   * gestures back to the bubble also makes tapping a tile select the message
   * while selection mode is on, as tapping its text already did.
   */
  onPress: () => void;
  onLongPress: () => void;
}

/** The widest a media tile gets. The bubble caps at 82% of the screen, so this sits just inside it. */
const MAX_WIDTH = 232;
const MAX_HEIGHT = 300;

const KIND_ICON = { image: 'image', video: 'film', file: 'file-text' } as const;

/**
 * One attachment inside a bubble.
 *
 * A photo renders at its own aspect ratio, bounded, so a portrait shot of a
 * garment is not letterboxed into a square. A video renders the same way with
 * a play badge — there is no inline player, and one would be the wrong call
 * anyway: autoplaying video down a thread on a shop-floor data connection is
 * how you burn somebody's allowance. Tapping opens it.
 *
 * A document has no preview to show, so it gets a row: type, name, size.
 *
 * A voice note plays inline through `VoicePlayer` — its own play button
 * handles the tap, so unlike every other kind here it does NOT forward
 * `onPress` (that would fight the internal playback control the way opening
 * the media viewer or `Linking.openURL` never had to). Long-press still opens
 * the same actions sheet as any other bubble.
 */
export function MessageAttachment({ attachment, mine, onPress, onLongPress }: MessageAttachmentProps) {
  const theme = useTheme();

  if (attachment.kind === 'voice') {
    return (
      <Pressable onLongPress={onLongPress} delayLongPress={280} style={styles.voice}>
        <VoicePlayer src={attachment.url} mine={mine} />
      </Pressable>
    );
  }

  const media = attachment.kind === 'image' || attachment.kind === 'video';

  const captionColor = mine ? theme.onDark.textMuted : theme.textSecondary;

  if (media) {
    const ratio = attachment.width && attachment.height ? attachment.width / attachment.height : 4 / 3;
    const width = MAX_WIDTH;
    const height = Math.min(MAX_HEIGHT, Math.round(width / Math.max(ratio, 0.5)));

    return (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={280}
        style={[styles.media, { width, height, backgroundColor: theme.draftWash }]}
      >
        {attachment.url ? (
          <Image source={{ uri: attachment.url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          // The signed link has lapsed or was refused; the next refetch mints
          // a new one, so this is a moment rather than a dead end.
          <View style={[StyleSheet.absoluteFill, styles.centre]}>
            <Icon name={KIND_ICON[attachment.kind]} size={22} color={theme.draftWashText} />
          </View>
        )}

        {attachment.kind === 'video' ? (
          <View style={styles.playWrap}>
            <View style={styles.play}>
              <Icon name="play" size={20} color="#FFFFFF" />
            </View>
            {attachment.duration ? (
              <View style={styles.duration}>
                <Text style={styles.durationLabel}>{clipLength(attachment.duration)}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={280}
      style={[
        styles.file,
        {
          backgroundColor: mine ? theme.onDark.accentWash : theme.background,
          borderColor: mine ? 'transparent' : theme.border,
        },
      ]}
    >
      <View style={[styles.fileIcon, { backgroundColor: mine ? theme.onDark.avatarBg : theme.accentWash }]}>
        <Icon name="file-text" size={16} color={mine ? theme.onDark.accent : theme.accentWashText} />
      </View>
      <View style={styles.fileText}>
        <Text style={[styles.fileName, { color: mine ? theme.onDark.text : theme.textPrimary }]} numberOfLines={1}>
          {attachment.name}
        </Text>
        <Text style={[styles.fileMeta, { color: captionColor }]} numberOfLines={1}>
          {fileSize(attachment.size)} · tap to open
        </Text>
      </View>
      <Icon name="external-link" size={15} color={captionColor} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  voice: {
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  media: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  centre: { alignItems: 'center', justifyContent: 'center' },
  playWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  play: {
    width: 46,
    height: 46,
    borderRadius: 99,
    // Fixed rather than themed: it sits on the video frame, not on a surface,
    // so it has to read against whatever that frame happens to be.
    backgroundColor: 'rgba(10,21,18,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  duration: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 99,
    backgroundColor: 'rgba(10,21,18,0.62)',
  },
  durationLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    color: '#FFFFFF',
  },
  file: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 9,
    minWidth: 190,
  },
  fileIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  fileText: { flex: 1, gap: 2, minWidth: 0 },
  fileName: { fontFamily: fontFamily.semibold, fontSize: 13 },
  fileMeta: { fontFamily: fontFamily.mono, fontSize: 10 },
});
