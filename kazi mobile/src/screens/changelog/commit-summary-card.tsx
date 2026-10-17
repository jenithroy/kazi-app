import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import { relativeTime, tally } from '@/data/changelog/parse';
import type { CommitFeed } from '@/data/changelog/types';

export interface CommitSummaryCardProps {
  feed: CommitFeed;
}

/** The one inverted "highlight" card per screen — commit count, freshness, and a feature/fix/other split. */
export function CommitSummaryCard({ feed }: CommitSummaryCardProps) {
  const theme = useTheme();
  const t = tally(feed.commits);

  return (
    <View style={[styles.card, { backgroundColor: theme.surfaceHero, borderColor: theme.surfaceHeroBorder, borderWidth: theme.scheme === 'dark' ? 1 : 0, boxShadow: theme.shadows.raised }]}>
      <View style={styles.headRow}>
        <View style={styles.headText}>
          <Text style={[styles.title, { color: theme.onHero.text }]} numberOfLines={1}>
            {feed.commits.length} commits
          </Text>
          <Text style={[styles.meta, { color: theme.onHero.textMuted }]} numberOfLines={1}>
            Updated {relativeTime(feed.fetchedAt)}
          </Text>
        </View>
        <View style={[styles.stateChip, { backgroundColor: feed.stale ? theme.onHero.warningWash : theme.onHero.accentWash }]}>
          <View style={[styles.stateDot, { backgroundColor: feed.stale ? theme.onHero.warningWashText : theme.onHero.accentWashText }]} />
          <Text style={[styles.stateLabel, { color: feed.stale ? theme.onHero.warningWashText : theme.onHero.accentWashText }]}>
            {feed.stale ? 'Offline' : 'Live'}
          </Text>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: theme.onHero.divider }]} />

      <View style={styles.countsRow}>
        <CountCell label="Features" value={t.Feature} theme={theme} />
        <CountCell label="Fixes" value={t.Fix} theme={theme} />
        <CountCell label="Other" value={t.other} theme={theme} />
      </View>
    </View>
  );
}

function CountCell({ label, value, theme }: { label: string; value: number; theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={styles.countCell}>
      <Text style={[styles.countLabel, { color: theme.onHero.textMuted }]}>{label}</Text>
      <Text style={[styles.countValue, { color: theme.onHero.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 17, gap: 12 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headText: { flex: 1, gap: 3, minWidth: 0 },
  title: { fontFamily: fontFamily.semibold, fontSize: 16, letterSpacing: -0.01 * 16 },
  meta: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  stateChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 26, paddingHorizontal: 10, borderRadius: 999, flexShrink: 0 },
  stateDot: { width: 6, height: 6, borderRadius: 99 },
  stateLabel: { fontFamily: fontFamily.semibold, fontSize: 11.5 },
  divider: { height: 1, opacity: 0.14 },
  countsRow: { flexDirection: 'row', gap: 10 },
  countCell: { flex: 1, gap: 5 },
  countLabel: { fontFamily: fontFamily.mono, fontSize: 9.5, letterSpacing: 0.1 * 9.5, textTransform: 'uppercase' },
  countValue: { fontFamily: fontFamily.semibold, fontSize: 17, letterSpacing: -0.02 * 17 },
});
