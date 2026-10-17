import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeInUp,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import * as haptics from '@/lib/haptics';
import type { Message } from '@/data/chat/types';
import { firstName, isMe, messageMeta, messageText, personFor } from '@/data/chat/utils';

import { MessageAttachment } from './message-attachment';

/** How far the bubble travels, and how far it must travel to actually arm the reply. */
const SWIPE_MAX = 84;
const SWIPE_ARM = 52;
const GUTTER = 32;

export interface MessageBubbleProps {
  message: Message;
  /** The message above it, used to decide whether this one starts a new run by its author. */
  previous?: Message;
  index: number;
  isGroup: boolean;
  /** Resolved by the parent — the bubble never reaches into the thread itself. */
  replyTarget?: Message;
  selectionMode: boolean;
  selected: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onReply: () => void;
  onToggleReaction: (emoji: string) => void;
  /** Opens the "who reacted with what" sheet. Groups only — see the chip's `onPress`. */
  onOpenReactions: () => void;
  /** View-only profiles can read a thread but not reply into or react to it. */
  canPost: boolean;
}

export function MessageBubble({
  message,
  previous,
  index,
  isGroup,
  replyTarget,
  selectionMode,
  selected,
  onPress,
  onLongPress,
  onReply,
  onToggleReaction,
  onOpenReactions,
  canPost,
}: MessageBubbleProps) {
  const theme = useTheme();
  const mine = isMe(message.authorId);
  const author = personFor(message.authorId);
  const newRun = !previous || previous.authorId !== message.authorId || message.at - previous.at > 5 * 60_000;
  const showIdentity = isGroup && !mine && newRun;

  const translateX = useSharedValue(0);
  /**
   * Whether the swipe is currently past the point of no return. Tracked so the
   * tick fires once on crossing rather than on every frame beyond it — and
   * fires again if you drag back under and over.
   */
  const armed = useSharedValue(false);

  // Each bubble swipes towards the middle of the screen — your own messages
  // are on the right and drag left, everyone else's are on the left and drag
  // right. Swiping a bubble away from its own edge is the direction there is
  // actually room to move in, and it keeps the gesture symmetrical rather than
  // asking you to drag your own message further off screen.
  const direction = mine ? -1 : 1;

  const pan = Gesture.Pan()
    // `pending` is excluded because the message has no server id yet — see
    // `startReply` in `thread-view.tsx`.
    .enabled(canPost && !selectionMode && !message.deleted && !message.pending)
    // One direction only, and it gives up the moment the drag looks vertical
    // so the message list keeps scrolling normally.
    .activeOffsetX(mine ? -14 : 14)
    .failOffsetY([-14, 14])
    .onUpdate((e) => {
      // Measured as distance travelled the allowed way; the sign goes back on
      // at render time, so both sides share one set of thresholds.
      const travel = e.translationX * direction;
      translateX.value = Math.max(0, Math.min(SWIPE_MAX, travel));

      // You are watching your thumb, not the bubble, so the moment the swipe
      // becomes a reply is announced rather than shown.
      const past = translateX.value >= SWIPE_ARM;
      if (past !== armed.value) {
        armed.value = past;
        if (past) runOnJS(haptics.armed)();
      }
    })
    .onEnd(() => {
      if (translateX.value >= SWIPE_ARM) runOnJS(onReply)();
      armed.value = false;
      translateX.value = withTiming(0, { duration: 180 });
    });

  const slideStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value * direction }] }));
  const hintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, SWIPE_ARM], [0, 1], 'clamp'),
    transform: [{ scale: interpolate(translateX.value, [0, SWIPE_ARM], [0.6, 1], 'clamp') }],
  }));

  const quoteAccent = mine ? theme.onDark.accent : theme.accentDeep;
  const quoteBody = mine ? theme.onDark.textMuted : theme.textSecondary;
  const bodyColor = message.deleted ? (mine ? theme.onDark.textMuted : theme.textSecondary) : mine ? theme.onDark.text : theme.textPrimary;

  return (
    <Animated.View
      entering={FadeInUp.delay(Math.min(index, 6) * 30).duration(200)}
      style={[styles.outer, selected ? { backgroundColor: theme.accentWash } : null]}
    >
      {/* The hint sits in the edge the bubble is pulling away from, so it is
          revealed by the swipe rather than chased by it. */}
      <Animated.View style={[styles.hint, mine ? styles.hintRight : styles.hintLeft, hintStyle]}>
        <View style={[styles.hintCircle, { backgroundColor: theme.accentWash }]}>
          <Icon name={mine ? 'corner-up-right' : 'corner-up-left'} size={14} color={theme.accentWashText} />
        </View>
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View style={slideStyle}>
          <View style={[styles.line, { justifyContent: mine ? 'flex-end' : 'flex-start' }]}>
            {selectionMode ? (
              <Icon
                name={selected ? 'check-circle' : 'circle'}
                size={18}
                color={selected ? theme.accentDeep : theme.textSecondary}
              />
            ) : null}

            {isGroup && !mine ? (
              <View style={styles.gutter}>
                {newRun ? <Avatar initials={author.initials} tint={author.avatarTint} size="sm" /> : null}
              </View>
            ) : null}

            <View style={[styles.column, { alignItems: mine ? 'flex-end' : 'flex-start' }]}>
              {showIdentity ? (
                <Text style={[styles.author, { color: theme.textSecondary }]} numberOfLines={1}>
                  {author.name} <Text style={[styles.authorRole, { color: theme.textSecondary }]}>· {author.role}</Text>
                </Text>
              ) : null}

              <Pressable
                onPress={onPress}
                onLongPress={onLongPress}
                delayLongPress={280}
                style={[
                  styles.bubble,
                  mine
                    ? { backgroundColor: theme.surfaceInverted, borderBottomRightRadius: 6 }
                    : { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderBottomLeftRadius: 6 },
                ]}
              >
                {replyTarget ? (
                  <View style={[styles.quote, { borderLeftColor: quoteAccent }]}>
                    <Text style={[styles.quoteName, { color: quoteAccent }]} numberOfLines={1}>
                      {isMe(replyTarget.authorId) ? 'You' : firstName(replyTarget.authorId)}
                    </Text>
                    <Text style={[styles.quoteBody, { color: quoteBody }]} numberOfLines={2}>
                      {messageText(replyTarget)}
                    </Text>
                  </View>
                ) : null}

                {/* The tile shares the bubble's gestures — see `MessageAttachment`. */}
                {message.attachment ? (
                  <MessageAttachment
                    attachment={message.attachment}
                    mine={mine}
                    onPress={onPress}
                    onLongPress={onLongPress}
                  />
                ) : null}

                {/* A photo sent without a caption has no text row at all —
                    `messageText` would otherwise fill it with the filename,
                    which the tile is already showing. */}
                {message.deleted || message.text || !message.attachment ? (
                  <Text style={[styles.text, message.deleted ? styles.deleted : null, { color: bodyColor }]}>
                    {messageText(message)}
                  </Text>
                ) : null}
              </Pressable>

              {message.reactions.length > 0 ? (
                <View style={[styles.reactions, { justifyContent: mine ? 'flex-end' : 'flex-start' }]}>
                  {message.reactions.map((r) => {
                    const isMine = r.by.some(isMe);
                    return (
                      <Pressable
                        key={r.emoji}
                        // In a group the count is the question — three people
                        // agreed and the chip will not say which — so a tap
                        // opens the list, and taking your own back is a row in
                        // it. A dm has exactly one other person, so there is
                        // nothing to look up and the tap stays a toggle.
                        onPress={() => (isGroup ? onOpenReactions() : canPost && onToggleReaction(r.emoji))}
                        onLongPress={onOpenReactions}
                        delayLongPress={280}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: isMine ? theme.accentWash : theme.surface,
                            borderColor: isMine ? theme.accent : theme.border,
                          },
                        ]}
                      >
                        <Text style={styles.chipEmoji}>{r.emoji}</Text>
                        <Text style={[styles.chipCount, { color: isMine ? theme.accentWashText : theme.textSecondary }]}>
                          {r.by.length}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              <Text style={[styles.meta, { color: theme.textSecondary }]}>{messageMeta(message)}</Text>
            </View>
          </View>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Negative margins let a selected message's tint reach the screen edges
  // even though the list itself is padded.
  outer: {
    marginHorizontal: -18,
    paddingHorizontal: 18,
    paddingVertical: 2,
    justifyContent: 'center',
  },
  hint: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  hintLeft: { left: 18 },
  hintRight: { right: 18 },
  hintCircle: {
    width: 28,
    height: 28,
    borderRadius: 99,
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  gutter: {
    width: GUTTER,
    flexShrink: 0,
    alignItems: 'flex-start',
  },
  column: {
    gap: 4,
    maxWidth: '82%',
  },
  author: {
    fontFamily: fontFamily.semibold,
    fontSize: 11.5,
    paddingHorizontal: 4,
  },
  authorRole: {
    fontFamily: fontFamily.mono,
    fontSize: 9.5,
    textTransform: 'uppercase',
  },
  bubble: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    gap: 7,
    boxShadow: '0 1px 2px rgba(15,36,29,0.04)',
  },
  quote: {
    borderLeftWidth: 2,
    paddingLeft: 8,
    gap: 2,
  },
  quoteName: {
    fontFamily: fontFamily.semibold,
    fontSize: 11.5,
  },
  quoteBody: {
    fontSize: 12.5,
    lineHeight: 12.5 * 1.35,
  },
  text: {
    fontSize: 14.5,
    lineHeight: 14.5 * 1.45,
  },
  deleted: {
    fontStyle: 'italic',
  },
  reactions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 99,
    borderWidth: 1,
  },
  chipEmoji: {
    fontSize: 12,
  },
  chipCount: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
  },
  meta: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    paddingHorizontal: 4,
  },
});
