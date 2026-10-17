import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { useTheme } from '@/theme/theme-provider';
import { fontFamily, radii } from '@/theme';
import { typePalette } from '@/data/changelog/parse';
import type { Commit, CommitDay } from '@/data/changelog/types';

export interface DayGroupProps {
  day: CommitDay;
  index: number;
  onOpen: (commit: Commit) => void;
}

export function DayGroup({ day, index, onOpen }: DayGroupProps) {
  const theme = useTheme();

  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 40).duration(220)} style={styles.group}>
      <View style={styles.groupHead}>
        <Text style={[styles.groupTitle, { color: theme.textPrimary }]}>{day.title}</Text>
        <Text style={[styles.groupMeta, { color: theme.textSecondary }]}>
          {day.commits.length} {day.commits.length === 1 ? 'commit' : 'commits'}
        </Text>
        <View style={[styles.headLine, { backgroundColor: theme.border }]} />
      </View>

      <View style={[styles.card, { backgroundColor: theme.surface, boxShadow: theme.shadows.card }]}>
        {day.commits.map((commit, i) => {
          const palette = typePalette(theme, commit.type);
          const last = i === day.commits.length - 1;

          return (
            <Pressable
              key={commit.sha}
              onPress={() => onOpen(commit)}
              style={[styles.row, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border } : null]}
            >
              <View style={styles.rail}>
                <View style={[styles.railDot, { backgroundColor: palette.dot }]} />
                {!last ? <View style={[styles.railLine, { backgroundColor: theme.background }]} /> : null}
              </View>

              <View style={styles.rowText}>
                <View style={styles.rowTop}>
                  <View style={[styles.tag, { backgroundColor: palette.bg }]}>
                    <Text style={[styles.tagLabel, { color: palette.fg }]}>{commit.type}</Text>
                  </View>
                  {commit.scope ? (
                    <Text style={[styles.scope, { color: theme.textSecondary }]} numberOfLines={1}>
                      {commit.scope}
                    </Text>
                  ) : null}
                  <Text style={[styles.sha, { color: theme.textSecondary }]}>{commit.shortSha}</Text>
                </View>
                <Text style={[styles.title, { color: theme.textPrimary }]}>{commit.subject}</Text>
                <Text style={[styles.author, { color: theme.textSecondary }]} numberOfLines={1}>
                  {commit.authorName}
                  {commit.authorLogin ? ` · @${commit.authorLogin}` : ''}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 9 },
  groupHead: { flexDirection: 'row', alignItems: 'baseline', gap: 9, paddingHorizontal: 2 },
  groupTitle: { fontFamily: fontFamily.semibold, fontSize: 15, letterSpacing: -0.01 * 15 },
  groupMeta: { fontFamily: fontFamily.mono, fontSize: 10.5, flexShrink: 0 },
  headLine: { flex: 1, height: 1 },
  card: { borderRadius: radii.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', gap: 11, paddingVertical: 13, paddingRight: 15, paddingLeft: 13 },
  rail: { width: 10, alignItems: 'center', paddingTop: 5, flexShrink: 0 },
  railDot: { width: 9, height: 9, borderRadius: 99, flexShrink: 0 },
  railLine: { flex: 1, width: 1.5, marginTop: 4, minHeight: 8 },
  rowText: { flex: 1, gap: 5, minWidth: 0 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tag: { height: 21, paddingHorizontal: 8, borderRadius: 7, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  tagLabel: { fontFamily: fontFamily.mono, fontSize: 9.5, letterSpacing: 0.11 * 9.5, textTransform: 'uppercase' },
  scope: { flex: 1, fontFamily: fontFamily.mono, fontSize: 10.5 },
  sha: { fontFamily: fontFamily.mono, fontSize: 10.5, flexShrink: 0 },
  title: { fontFamily: fontFamily.semibold, fontSize: 14.5, lineHeight: 14.5 * 1.3 },
  author: { fontFamily: fontFamily.mono, fontSize: 10 },
});
