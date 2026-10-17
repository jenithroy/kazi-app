import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { fontFamily, radii } from '@/theme';

import { EMOJI_GROUPS, searchEmoji } from './emoji-data';
import { Icon } from './icon';

export interface EmojiPickerProps {
  onPick: (emoji: string) => void;
  /** Emoji already on the message, drawn with an accent ring so a second tap reads as "remove". */
  active?: string[];
  /** Recently used, offered above the groups. */
  recent?: string[];
  /** Height of the scrolling grid. The sheet around it is fixed, so this cannot be `flex`. */
  height?: number;
}

/** How many recents to keep on screen. The grid itself wraps to whatever the width allows. */
const RECENT_SHOWN = 16;

/**
 * The whole emoji keyboard, for when none of the six presets is the reaction
 * somebody wants.
 *
 * Deliberately not the OS keyboard: reacting with a system keyboard means a
 * text field, a send action and a way to reject the two words typed by
 * accident. A grid is one tap, and it is the shape every messenger uses.
 *
 * Rendered as a plain grid rather than a virtualised list — the curated set is
 * a few hundred glyphs and a `FlashList` inside a `ScrollView` inside a
 * `Modal` is three nested scroll containers fighting over the same gesture.
 */
export function EmojiPicker({ onPick, active = [], recent = [], height = 300 }: EmojiPickerProps) {
  const theme = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const [query, setQuery] = useState('');
  const [groupId, setGroupId] = useState(EMOJI_GROUPS[0].id);

  const results = useMemo(() => searchEmoji(query), [query]);
  const searching = query.trim().length > 0;
  const group = EMOJI_GROUPS.find((g) => g.id === groupId) ?? EMOJI_GROUPS[0];

  const cell = (emoji: string, key: string) => {
    const on = active.includes(emoji);
    return (
      <Pressable
        key={key}
        onPress={() => onPick(emoji)}
        style={({ pressed }) => [
          styles.cell,
          on ? { backgroundColor: theme.accentWash, borderColor: theme.accent } : null,
          pressed ? { backgroundColor: theme.background } : null,
        ]}
      >
        <Text style={styles.glyph}>{emoji}</Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.root}>
      <View style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Icon name="search" size={15} color={theme.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search emoji"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.searchInput, { color: theme.textPrimary, fontFamily: fontFamily.regular }]}
        />
        {searching ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Icon name="x" size={14} color={theme.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {!searching ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {EMOJI_GROUPS.map((g) => {
            const on = g.id === group.id;
            return (
              <Pressable
                key={g.id}
                onPress={() => {
                  setGroupId(g.id);
                  scrollRef.current?.scrollTo({ y: 0, animated: false });
                }}
                style={[
                  styles.tab,
                  {
                    backgroundColor: on ? theme.accentWash : theme.surface,
                    borderColor: on ? theme.accent : theme.border,
                  },
                ]}
              >
                <Text style={styles.tabIcon}>{g.icon}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {/* `nestedScrollEnabled` is the Android half of the fix; the sheet
          freezing its own ScrollView is the other half (see `scrollEnabled`
          on `BottomSheet`). Without both, the drag is taken by whichever
          scroll view is outermost and the grid never moves. */}
      <ScrollView
        ref={scrollRef}
        style={{ height }}
        contentContainerStyle={styles.grid}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        showsVerticalScrollIndicator
      >
        {searching ? (
          results.length ? (
            <View style={styles.row}>{results.map((e, i) => cell(e, `${e}-${i}`))}</View>
          ) : (
            <Text style={[styles.empty, { color: theme.textSecondary }]}>Nothing matches “{query.trim()}”</Text>
          )
        ) : (
          <>
            {recent.length > 0 ? (
              <>
                <Text style={[styles.groupLabel, { color: theme.textSecondary }]}>Recent</Text>
                <View style={styles.row}>{recent.slice(0, RECENT_SHOWN).map((e, i) => cell(e, `recent-${e}-${i}`))}</View>
              </>
            ) : null}
            <Text style={[styles.groupLabel, { color: theme.textSecondary }]}>{group.label}</Text>
            <View style={styles.row}>{group.emoji.map(([e], i) => cell(e, `${group.id}-${e}-${i}`))}</View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 10 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    height: 42,
    paddingHorizontal: 13,
    borderRadius: 13,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 14.5, padding: 0 },
  tabs: { flexDirection: 'row', gap: 7, paddingRight: 4 },
  tab: {
    width: 38,
    height: 34,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIcon: { fontSize: 17 },
  grid: { paddingBottom: 8, gap: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  // A fixed cell plus `flexWrap` fits as many columns as the width allows,
  // which is one fewer measurement to get wrong than a computed percentage —
  // and it lays out sensibly on a tablet without a second branch.
  cell: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: { fontSize: 24, lineHeight: 30 },
  groupLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.12 * 10,
    textTransform: 'uppercase',
    paddingTop: 4,
  },
  empty: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    textAlign: 'center',
    paddingVertical: 28,
  },
});
