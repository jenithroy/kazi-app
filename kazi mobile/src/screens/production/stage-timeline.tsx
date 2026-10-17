import { useState } from 'react';
import { LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { STAGES, stageIndex } from '@/data/sales/mock';
import type { StageHistoryEntry, StageId } from '@/data/sales/types';
import { useCalendarPreference } from '@/lib/calendar-preference';
import { dateText, isoDay } from '@/lib/date-display';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface StageTimelineProps {
  stage: StageId;
  history: StageHistoryEntry[];
}

function when(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return dateText(isoDay(iso));
}

/**
 * The ten stages as a vertical rail, each row expandable to the history for
 * that stage — when it was entered, by whom, and whether it was reverted back
 * to. This is the stage history: keeping a separate list of the same entries
 * meant reading the same events twice, in two different orders.
 */
export function StageTimeline({ stage, history }: StageTimelineProps) {
  const theme = useTheme();
  // `fmtDate` reads the calendar preference, so subscribe to it.
  useCalendarPreference();
  const [openId, setOpenId] = useState<StageId | null>(stage);
  const current = stageIndex(stage);

  const toggle = (id: StageId) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenId((prev) => (prev === id ? null : id));
  };

  return (
    <View>
      {STAGES.map((s, i) => {
        const done = i < current;
        const on = i === current;
        const open = openId === s.id;
        // Every visit to this stage, oldest first — an order can pass through
        // the same stage twice when someone steps it back.
        const entries = history.filter((h) => h.stage === s.id);
        const latest = entries[entries.length - 1];

        const summary = on
          ? 'In progress'
          : done
            ? latest
              ? `Completed · ${when(latest.at)}`
              : 'Completed'
            : 'Not started';

        return (
          <Pressable key={s.id} onPress={() => toggle(s.id)} style={styles.row}>
            <View style={styles.markCol}>
              <View
                style={[
                  styles.mark,
                  {
                    backgroundColor: done ? theme.accent : on ? theme.surface : theme.draftWash,
                    borderColor: on ? theme.accent : 'transparent',
                    borderWidth: on ? 2.5 : 0,
                  },
                ]}
              >
                {done ? (
                  <Icon name="check" size={13} color={theme.accentText} />
                ) : (
                  <Text style={[styles.markNum, tabularNums, { color: on ? theme.accent : theme.textSecondary }]}>
                    {i + 1}
                  </Text>
                )}
              </View>
              {i < STAGES.length - 1 ? (
                <View style={[styles.line, { backgroundColor: i < current ? theme.accent : theme.border }]} />
              ) : null}
            </View>

            <View style={styles.body}>
              <View style={styles.headRow}>
                <View style={styles.headText}>
                  <Text
                    style={[
                      styles.label,
                      {
                        color: done || on ? theme.textPrimary : theme.textSecondary,
                        fontFamily: on ? fontFamily.semibold : done ? fontFamily.medium : fontFamily.regular,
                      },
                    ]}
                  >
                    {s.label}
                  </Text>
                  <Text style={[styles.summary, tabularNums, { color: theme.textSecondary }]}>{summary}</Text>
                </View>
                {on ? (
                  <View style={[styles.chip, { backgroundColor: theme.accentWash }]}>
                    <Text style={[styles.chipText, { color: theme.accentWashText }]}>Here</Text>
                  </View>
                ) : null}
                <Icon name={open ? 'chevron-up' : 'chevron-down'} size={15} color={theme.textSecondary} />
              </View>

              {open ? (
                <View style={[styles.detail, { borderTopColor: theme.border }]}>
                  {entries.length === 0 ? (
                    <Text style={[styles.detailMuted, { color: theme.textSecondary }]}>
                      {done ? 'No record of who moved it here.' : 'This stage hasn’t been reached yet.'}
                    </Text>
                  ) : (
                    entries.map((h, k) => (
                      <View key={`${h.at}-${k}`} style={styles.entry}>
                        <View
                          style={[
                            styles.entryDot,
                            { backgroundColor: h.reverted ? theme.warningWashText : s.dot },
                          ]}
                        />
                        <View style={styles.entryText}>
                          <Text style={[styles.entryTitle, { color: theme.textPrimary }]}>
                            {h.reverted ? 'Stepped back to here' : k === 0 ? 'Entered this stage' : 'Returned to this stage'}
                          </Text>
                          <Text style={[styles.entryMeta, tabularNums, { color: theme.textSecondary }]}>
                            {when(h.at)}
                            {h.by ? ` · ${h.by}` : ' · who made the change wasn’t recorded'}
                          </Text>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  markCol: { alignItems: 'center', width: 28 },
  mark: { width: 28, height: 28, borderRadius: 99, alignItems: 'center', justifyContent: 'center' },
  markNum: { fontFamily: fontFamily.semibold, fontSize: 11.5 },
  line: { width: 2, flex: 1, minHeight: 12, marginVertical: 3, borderRadius: 99 },
  body: { flex: 1, paddingBottom: 14 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
  headText: { flex: 1, gap: 2 },
  label: { fontSize: 14, letterSpacing: -0.01 * 14 },
  summary: { fontFamily: fontFamily.mono, fontSize: 10 },
  chip: { height: 20, paddingHorizontal: 8, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: fontFamily.mono, fontSize: 9, letterSpacing: 0.08 * 9, textTransform: 'uppercase' },
  detail: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 9, paddingTop: 10, gap: 9 },
  detailMuted: { fontSize: 12, lineHeight: 17 },
  entry: { flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
  entryDot: { width: 7, height: 7, borderRadius: 99, marginTop: 5 },
  entryText: { flex: 1, gap: 2 },
  entryTitle: { fontSize: 12.5, fontFamily: fontFamily.medium },
  entryMeta: { fontFamily: fontFamily.mono, fontSize: 10 },
});
