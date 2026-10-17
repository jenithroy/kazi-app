import { StyleSheet, Text, View } from 'react-native';

import { Avatar, tintFromSeed } from '@/components/ui/avatar';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import { ACTION_TONE, VERB_LABEL, type ActionTone } from '@/data/usage/aggregate';
import { clockOf, humanDuration, initialsOf, relativeTime } from '@/data/usage/format';
import type { FeedEntryGroup } from '@/data/usage/types';

export interface ActivityFeedItemProps {
  entry: FeedEntryGroup;
}

export function ActivityFeedItem({ entry }: ActivityFeedItemProps) {
  const theme = useTheme();
  const tone = ACTION_TONE[entry.action] ?? 'neutral';
  const verb = VERB_LABEL[entry.action] ?? entry.action;

  const tonePalette: Record<ActionTone, { bg: string; text: string }> = {
    good: { bg: theme.accentWash, text: theme.accentWashText },
    warning: { bg: theme.warningWash, text: theme.warningWashText },
    bad: { bg: theme.dangerWash, text: theme.dangerWashText },
    neutral: { bg: theme.draftWash, text: theme.draftWashText },
  };
  const { bg, text } = tonePalette[tone];

  const tag = entry.action === 'view' ? entry.sectionLabel : entry.target;

  return (
    <View style={styles.row}>
      <Avatar initials={initialsOf(entry.personName)} tint={tintFromSeed(entry.personName)} size="sm" />
      <View style={styles.body}>
        <Text style={[styles.line, { color: theme.textPrimary }]}>
          <Text style={styles.name}>{entry.personName}</Text>
          <Text style={{ color: theme.textSecondary }}> {verb} </Text>
          {tag ? <Text style={[styles.tag, { color: theme.textPrimary }]}>{tag}</Text> : null}
          {entry.action !== 'view' && entry.target && entry.sectionLabel ? (
            <Text style={{ color: theme.textSecondary }}> in {entry.sectionLabel}</Text>
          ) : null}
          {entry.count > 1 ? <Text style={[styles.count, { color: theme.textSecondary }]}> ×{entry.count}</Text> : null}
        </Text>
        <View style={styles.metaRow}>
          {entry.positionLabel ? <Text style={[styles.meta, { color: theme.textSecondary }]}>{entry.positionLabel}</Text> : null}
          {entry.durationMs ? (
            <Text style={[styles.meta, { color: theme.textSecondary }]}>{humanDuration(entry.durationMs)} on the page</Text>
          ) : null}
        </View>
      </View>
      <View style={styles.when}>
        <View style={[styles.pill, { backgroundColor: bg }]}>
          <Text style={[styles.pillText, { color: text }]}>{verb}</Text>
        </View>
        <Text style={[styles.clock, { color: theme.textSecondary }]}>{clockOf(entry.createdAt)}</Text>
        <Text style={[styles.rel, { color: theme.textSecondary }]}>{relativeTime(entry.createdAt)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, paddingVertical: 10 },
  body: { flex: 1, minWidth: 0, gap: 3 },
  line: { fontSize: 13.5, lineHeight: 13.5 * 1.35 },
  name: { fontFamily: fontFamily.semibold },
  tag: { fontFamily: fontFamily.medium },
  count: { fontFamily: fontFamily.mono, fontSize: 11 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  meta: { fontFamily: fontFamily.mono, fontSize: 10 },
  when: { alignItems: 'flex-end', gap: 4, width: 68 },
  pill: { height: 20, paddingHorizontal: 8, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  pillText: { fontFamily: fontFamily.semibold, fontSize: 9.5 },
  clock: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  rel: { fontFamily: fontFamily.mono, fontSize: 9.5 },
});
