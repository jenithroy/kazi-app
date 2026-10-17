import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { EmojiPicker } from '@/components/ui/emoji-picker';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import { useRecentEmoji } from '@/data/chat/recent-emoji';
import { QUICK_REACTIONS, type Message, type Thread } from '@/data/chat/types';
import { isMe, messageText, messageTimestamp, personFor, reactionCount } from '@/data/chat/utils';

import { ActionRow } from './action-row';

export interface MessageActionsSheetProps {
  /** The long-pressed message; null closes the sheet. */
  message: Message | null;
  thread: Thread;
  canPost: boolean;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  /** Groups only — opens (or starts) a dm with this message's author. */
  onReplyPrivately: () => void;
  onCopy: () => void;
  onSelect: () => void;
  onDelete: () => void;
  /** Opens the "who reacted with what" sheet. Offered only once something is on the message. */
  onSeeReactions: () => void;
}

export function MessageActionsSheet({
  message,
  thread,
  canPost,
  onClose,
  onReact,
  onReply,
  onReplyPrivately,
  onCopy,
  onSelect,
  onDelete,
  onSeeReactions,
}: MessageActionsSheetProps) {
  const theme = useTheme();
  const { recent, remember } = useRecentEmoji();
  const [picking, setPicking] = useState(false);

  const mine = !!message && isMe(message.authorId);
  const author = message ? personFor(message.authorId) : null;
  const canDelete = !!message && mine && !message.deleted;
  const reactable = !!message && canPost && !message.deleted;

  /** Everything I have already put on this message, so a second tap reads as "take it back". */
  const myReactions = (message?.reactions ?? []).filter((r) => r.by.some(isMe)).map((r) => r.emoji);

  const react = (emoji: string) => {
    remember(emoji);
    onReact(emoji);
  };

  const close = () => {
    setPicking(false);
    onClose();
  };

  return (
    <BottomSheet
      visible={!!message}
      onClose={close}
      title={picking ? 'Pick a reaction' : 'Message'}
      maxHeight={picking ? 640 : 560}
      // Two vertical scroll views cannot share one drag; while the emoji grid
      // is up it is the only thing that should be moving.
      scrollEnabled={!picking}
    >
      {message ? (
        <>
          <View style={[styles.preview, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.previewFrom, { color: theme.textSecondary }]} numberOfLines={1}>
              {mine ? 'You' : author?.name} · {messageTimestamp(message)}
              {mine && !message.deleted ? ` · ${message.read ? 'Read' : 'Sent'}` : ''}
              {reactionCount(message) > 0 ? ` · ${reactionCount(message)} reactions` : ''}
            </Text>
            <Text style={[styles.previewBody, { color: theme.textPrimary }]} numberOfLines={picking ? 2 : 4}>
              {messageText(message)}
            </Text>
          </View>

          {reactable ? (
            <View style={styles.emojiRow}>
              {QUICK_REACTIONS.map((emoji) => {
                const active = myReactions.includes(emoji);
                return (
                  <Pressable
                    key={emoji}
                    onPress={() => react(emoji)}
                    style={[
                      styles.emojiButton,
                      {
                        backgroundColor: active ? theme.accentWash : theme.surface,
                        borderColor: active ? theme.accent : theme.border,
                      },
                    ]}
                  >
                    <Text style={styles.emoji}>{emoji}</Text>
                  </Pressable>
                );
              })}
              {/* The six presets cover most reactions; this is the rest of them. */}
              <Pressable
                onPress={() => setPicking((on) => !on)}
                accessibilityLabel={picking ? 'Hide the emoji picker' : 'More reactions'}
                style={[
                  styles.emojiButton,
                  {
                    backgroundColor: picking ? theme.accentWash : theme.surface,
                    borderColor: picking ? theme.accent : theme.border,
                  },
                ]}
              >
                <Icon
                  name={picking ? 'chevron-up' : 'plus'}
                  size={18}
                  color={picking ? theme.accentWashText : theme.textSecondary}
                />
              </Pressable>
            </View>
          ) : null}

          {reactable && picking ? (
            <Animated.View entering={FadeIn.duration(150)}>
              <EmojiPicker onPick={react} active={myReactions} recent={recent} height={280} />
            </Animated.View>
          ) : null}

          {picking ? null : (
            <View style={styles.actions}>
              {canPost && !message.deleted && !message.pending ? (
                <ActionRow icon="corner-up-left" label="Reply" detail="Or swipe the message right" onPress={onReply} />
              ) : null}
              {canPost && thread.kind === 'group' && !mine ? (
                <ActionRow icon="user" label={`Reply privately to ${author?.name.split(' ')[0]}`} detail="Opens a direct message" onPress={onReplyPrivately} />
              ) : null}
              {reactionCount(message) > 0 ? (
                <ActionRow
                  icon="smile"
                  label="See who reacted"
                  detail={message.reactions.map((r) => `${r.emoji} ${r.by.length}`).join('   ')}
                  onPress={onSeeReactions}
                />
              ) : null}
              {!message.deleted ? <ActionRow icon="copy" label="Copy text" onPress={onCopy} /> : null}
              <ActionRow icon="check-circle" label="Select messages" detail="Copy or delete several at once" onPress={onSelect} />
              {canDelete ? <ActionRow icon="trash-2" label="Delete message" destructive onPress={onDelete} /> : null}
            </View>
          )}
        </>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  preview: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 13,
    gap: 5,
  },
  previewFrom: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.08 * 10,
    textTransform: 'uppercase',
  },
  previewBody: {
    fontSize: 14,
    lineHeight: 14 * 1.45,
  },
  emojiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  emojiButton: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 22,
  },
  actions: {
    gap: 2,
  },
});
