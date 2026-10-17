import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import { leadMessageClock } from '@/data/leads/format';
import type { LeadMessage } from '@/data/leads/types';
import type { Attachment } from '@/data/chat/types';

import { VoicePlayer } from '../voice-player';

const MAX_WIDTH = 232;

function isImage(mediaType: string | null): boolean {
  return (mediaType ?? '').startsWith('image/');
}

function replyLabel(replyTo: LeadMessage['replyTo']): string {
  if (!replyTo) return '';
  return replyTo.content || (replyTo.mediaType ? (isImage(replyTo.mediaType) ? 'Photo' : 'Voice note') : '');
}

export interface LeadBubbleProps {
  message: LeadMessage;
  onOpenMedia: (attachment: Attachment) => void;
  onJumpTo: (id: number) => void;
}

/**
 * One message in a lead's conversation. Simpler than Team chat's bubble on
 * purpose — no reactions or edits (Instagram's Send API has neither) and no
 * authoring a reply of our own — Meta's API can only show a quote the
 * customer sent, never let us originate one.
 */
export function LeadBubble({ message, onOpenMedia, onJumpTo }: LeadBubbleProps) {
  const theme = useTheme();
  const mine = message.role === 'assistant';
  const hasMedia = !!message.media_path;
  const media = isImage(message.media_type);

  return (
    <View style={[styles.row, mine ? styles.rowMine : null]}>
      <View
        style={[
          styles.bubble,
          hasMedia && media ? styles.bubbleMedia : null,
          {
            backgroundColor: mine ? theme.surfaceInverted : theme.surface,
            borderColor: mine ? 'transparent' : theme.border,
            borderWidth: mine ? 0 : 1,
          },
        ]}
      >
        {message.replyTo ? (
          <Pressable onPress={() => onJumpTo(message.replyTo!.id)} style={[styles.quote, { borderLeftColor: mine ? theme.onDark.accent : theme.accent }]}>
            <Text numberOfLines={1} style={[styles.quoteText, { color: mine ? theme.onDark.textMuted : theme.textSecondary }]}>
              {replyLabel(message.replyTo)}
            </Text>
          </Pressable>
        ) : null}

        {hasMedia ? (
          media ? (
            message.mediaUrl ? (
              <Pressable
                onPress={() =>
                  onOpenMedia({
                    kind: 'image',
                    path: String(message.id),
                    name: 'Photo',
                    mime: message.media_type ?? 'image/jpeg',
                    size: 0,
                    url: message.mediaUrl,
                  })
                }
                style={styles.imageWrap}
              >
                <Image source={{ uri: message.mediaUrl }} style={styles.image} resizeMode="cover" />
              </Pressable>
            ) : (
              <View style={[styles.imageWrap, styles.imagePlaceholder, { backgroundColor: theme.draftWash }]}>
                <Icon name="image" size={20} color={theme.draftWashText} />
                <Text style={[styles.placeholderText, { color: theme.draftWashText }]}>Link unavailable</Text>
              </View>
            )
          ) : (
            <VoicePlayer src={message.mediaUrl} mine={mine} />
          )
        ) : null}

        {message.content ? (
          <Text style={[styles.text, { color: mine ? theme.onDark.text : theme.textPrimary }]}>{message.content}</Text>
        ) : null}
      </View>

      <View style={[styles.metaRow, mine ? styles.metaRowMine : null]}>
        <Text style={[styles.meta, { color: theme.textSecondary }]}>{leadMessageClock(message.created_at)}</Text>
        {mine ? <Text style={[styles.meta, { color: theme.textSecondary }]}>· Sent</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'flex-start', gap: 4, maxWidth: '84%' },
  rowMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 10,
    gap: 6,
  },
  bubbleMedia: { padding: 5 },
  quote: {
    borderLeftWidth: 2,
    paddingLeft: 8,
    paddingVertical: 2,
  },
  quoteText: { fontSize: 12 },
  imageWrap: {
    width: MAX_WIDTH,
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  placeholderText: { fontSize: 11, fontFamily: fontFamily.mono },
  text: { fontSize: 15, lineHeight: 15 * 1.4 },
  metaRow: { flexDirection: 'row', gap: 4, paddingHorizontal: 4 },
  metaRowMine: { alignSelf: 'flex-end' },
  meta: { fontFamily: fontFamily.mono, fontSize: 10 },
});
