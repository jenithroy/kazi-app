import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Avatar } from '@/components/ui/avatar';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { EmojiPicker } from '@/components/ui/emoji-picker';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import { useRecentEmoji } from '@/data/chat/recent-emoji';
import { QUICK_REACTIONS, type Message, type PersonId } from '@/data/chat/types';
import { isMe, personFor, reactionCount } from '@/data/chat/utils';

export interface ReactionSheetProps {
  /** The message whose reactions are being read; null closes the sheet. */
  message: Message | null;
  canPost: boolean;
  onClose: () => void;
  onToggle: (emoji: string) => void;
}

/** The "All" pseudo-tab, kept out of the emoji space so it can never collide with one. */
const ALL = '';

interface Entry {
  personId: PersonId;
  emoji: string;
}

/**
 * Who reacted, and with what.
 *
 * A chip that only ever toggled your own reaction answered the wrong question:
 * on a group message the count is the interesting part, and "3" tells you
 * nothing about which three. This is the shape every messenger uses — a tab
 * per emoji across the top, the people under it, your own row first and marked
 * as the one a tap takes back.
 *
 * Adding is here too rather than behind a second long-press: once you have
 * opened the list to see who agreed, "and so do I" is the next thing you want,
 * and sending someone back out to the actions sheet for it is a detour.
 */
export function ReactionSheet({ message, canPost, onClose, onToggle }: ReactionSheetProps) {
  const theme = useTheme();
  const { recent, remember } = useRecentEmoji();
  const [tab, setTab] = useState<string>(ALL);
  const [picking, setPicking] = useState(false);

  // Memoised for its identity, not its cost: it feeds the `useMemo`s below,
  // and a fresh `[]` on every render would rebuild both each time.
  const reactions = useMemo(() => message?.reactions ?? [], [message]);
  const total = message ? reactionCount(message) : 0;

  /** Flattened to one row per person per emoji, which is what the list renders. */
  const entries = useMemo<Entry[]>(
    () => reactions.flatMap((r) => r.by.map((personId) => ({ personId, emoji: r.emoji }))),
    [reactions],
  );

  // A tab whose last reaction was just removed would otherwise leave an empty
  // list with no way back, so it falls to "All" as soon as it empties.
  const activeTab = tab !== ALL && !reactions.some((r) => r.emoji === tab) ? ALL : tab;

  // Mine first — it is the only row that does anything when tapped.
  const shown = useMemo(() => {
    const filtered = activeTab === ALL ? entries : entries.filter((e) => e.emoji === activeTab);
    return [...filtered].sort((a, b) => Number(isMe(b.personId)) - Number(isMe(a.personId)));
  }, [entries, activeTab]);

  const mine = reactions.filter((r) => r.by.some(isMe)).map((r) => r.emoji);

  const react = (emoji: string) => {
    remember(emoji);
    onToggle(emoji);
  };

  const close = () => {
    setPicking(false);
    setTab(ALL);
    onClose();
  };

  return (
    <BottomSheet
      visible={!!message}
      onClose={close}
      title={picking ? 'Add a reaction' : `${total} ${total === 1 ? 'reaction' : 'reactions'}`}
      maxHeight={picking ? 660 : 560}
      scrollEnabled={!picking}
    >
      {message ? (
        <>
          {reactions.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
              {[{ emoji: ALL, count: total }, ...reactions.map((r) => ({ emoji: r.emoji, count: r.by.length }))].map(
                (t) => {
                  const on = t.emoji === activeTab;
                  return (
                    <Pressable
                      key={t.emoji || 'all'}
                      onPress={() => setTab(t.emoji)}
                      style={[
                        styles.tab,
                        {
                          backgroundColor: on ? theme.accentWash : theme.surface,
                          borderColor: on ? theme.accent : theme.border,
                        },
                      ]}
                    >
                      {t.emoji ? (
                        <Text style={styles.tabEmoji}>{t.emoji}</Text>
                      ) : (
                        <Text style={[styles.tabAll, { color: on ? theme.accentWashText : theme.textSecondary }]}>
                          All
                        </Text>
                      )}
                      <Text style={[styles.tabCount, { color: on ? theme.accentWashText : theme.textSecondary }]}>
                        {t.count}
                      </Text>
                    </Pressable>
                  );
                },
              )}
            </ScrollView>
          ) : null}

          {picking ? null : (
            <View style={styles.list}>
              {shown.map((entry) => {
                const person = personFor(entry.personId);
                const own = isMe(entry.personId);
                return (
                  <Pressable
                    key={`${entry.personId}-${entry.emoji}`}
                    onPress={() => own && canPost && react(entry.emoji)}
                    disabled={!own || !canPost}
                    style={({ pressed }) => [
                      styles.row,
                      {
                        backgroundColor: pressed ? theme.background : theme.surface,
                        borderColor: own ? theme.accent : theme.border,
                      },
                    ]}
                  >
                    <Avatar initials={person.initials} tint={person.avatarTint} size="md" online={person.online} />
                    <View style={styles.rowText}>
                      <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>
                        {own ? 'You' : person.name}
                      </Text>
                      <Text style={[styles.detail, { color: theme.textSecondary }]} numberOfLines={1}>
                        {own && canPost ? 'Tap to remove' : person.role}
                      </Text>
                    </View>
                    <Text style={styles.rowEmoji}>{entry.emoji}</Text>
                  </Pressable>
                );
              })}

              {shown.length === 0 ? (
                <Text style={[styles.empty, { color: theme.textSecondary }]}>Nobody has reacted to this yet</Text>
              ) : null}
            </View>
          )}

          {canPost ? (
            <View style={styles.addRow}>
              {QUICK_REACTIONS.map((emoji) => {
                const on = mine.includes(emoji);
                return (
                  <Pressable
                    key={emoji}
                    onPress={() => react(emoji)}
                    style={[
                      styles.addButton,
                      {
                        backgroundColor: on ? theme.accentWash : theme.surface,
                        borderColor: on ? theme.accent : theme.border,
                      },
                    ]}
                  >
                    <Text style={styles.addEmoji}>{emoji}</Text>
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => setPicking((p) => !p)}
                accessibilityLabel={picking ? 'Hide the emoji picker' : 'More reactions'}
                style={[
                  styles.addButton,
                  {
                    backgroundColor: picking ? theme.accentWash : theme.surface,
                    borderColor: picking ? theme.accent : theme.border,
                  },
                ]}
              >
                <Icon
                  name={picking ? 'chevron-up' : 'plus'}
                  size={17}
                  color={picking ? theme.accentWashText : theme.textSecondary}
                />
              </Pressable>
            </View>
          ) : null}

          {canPost && picking ? (
            <Animated.View entering={FadeIn.duration(150)}>
              <EmojiPicker onPick={react} active={mine} recent={recent} height={280} />
            </Animated.View>
          ) : null}
        </>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 7, paddingRight: 4 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 34,
    paddingHorizontal: 11,
    borderRadius: 11,
    borderWidth: 1,
  },
  tabEmoji: { fontSize: 15 },
  tabAll: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.08 * 10,
    textTransform: 'uppercase',
  },
  tabCount: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderRadius: 16,
    borderWidth: 1,
    padding: 11,
  },
  rowText: { flex: 1, gap: 3, minWidth: 0 },
  name: { fontFamily: fontFamily.semibold, fontSize: 14.5 },
  detail: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.08 * 10,
    textTransform: 'uppercase',
  },
  rowEmoji: { fontSize: 20 },
  empty: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    textAlign: 'center',
    paddingVertical: 24,
  },
  addRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  addButton: {
    flex: 1,
    height: 46,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addEmoji: { fontSize: 21 },
});
