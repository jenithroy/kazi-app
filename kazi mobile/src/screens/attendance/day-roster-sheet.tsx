import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar, tintFromSeed } from '@/components/ui/avatar';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { STATUS_LABELS, STATUS_RAMP } from '@/data/attendance/mock';
import { formatHours } from '@/data/attendance/live-shared';
import type { DayRosterEntry } from '@/data/attendance/types';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

function Row({ entry }: { entry: DayRosterEntry }) {
  const theme = useTheme();
  const ramp = STATUS_RAMP[theme.scheme];
  const tone = entry.status ? ramp[entry.status] : null;

  return (
    <View style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Avatar initials={initialsOf(entry.name)} tint={tintFromSeed(entry.name)} size="sm" />

      <View style={styles.identity}>
        <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>
          {entry.name}
        </Text>
        <Text style={[styles.role, { color: theme.textSecondary }]} numberOfLines={1}>
          {entry.role}
          {entry.lateMinutes > 0 ? ` · ${entry.lateMinutes}m late` : ''}
          {entry.lateCutApplied ? ' · 25% cut' : ''}
        </Text>
      </View>

      <View style={styles.times}>
        <Text style={[styles.punch, tabularNums, { color: theme.textPrimary }]}>
          {entry.clockIn ?? '—'} <Text style={{ color: theme.textSecondary }}>→</Text>{' '}
          {entry.clockOut ?? (entry.clockIn ? '···' : '—')}
        </Text>
        <View style={styles.metaRow}>
          {entry.workedHours != null ? (
            <Text style={[styles.worked, tabularNums, { color: theme.textSecondary }]}>
              {formatHours(entry.workedHours)}
            </Text>
          ) : null}
          {tone && entry.status ? (
            <View style={[styles.pill, { backgroundColor: tone.chipBg }]}>
              <Text style={[styles.pillLabel, { color: tone.chipFg }]}>{STATUS_LABELS[entry.status]}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export interface DayRosterSheetProps {
  visible: boolean;
  /** e.g. "Sun 31 Aug" — the tapped day, already formatted. */
  label: string;
  entries: DayRosterEntry[] | undefined;
  loading: boolean;
  onClose: () => void;
}

/**
 * Tapping a day in the admin calendar opens this: every staffer's clock-in and
 * clock-out for that date, earliest punch first, with the people who never
 * punched at the bottom.
 */
export function DayRosterSheet({ visible, label, entries, loading, onClose }: DayRosterSheetProps) {
  const theme = useTheme();
  const punched = (entries ?? []).filter((e) => e.clockIn).length;

  return (
    <BottomSheet visible={visible} onClose={onClose} title={label} maxHeight={620}>
      <View style={styles.body}>
        <Text style={[styles.summary, { color: theme.textSecondary }]}>
          {loading
            ? 'Reading the day…'
            : entries?.length
              ? `${punched} of ${entries.length} clocked in`
              : 'Nobody clocked in and no roll call was taken'}
        </Text>

        {loading && !entries ? (
          <View style={styles.pending}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : (
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {(entries ?? []).map((e) => (
              <Row key={`${e.staffId}-${e.name}`} entry={e} />
            ))}
          </ScrollView>
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 12 },
  summary: {
    fontFamily: fontFamily.mono,
    fontSize: 10.5,
    letterSpacing: 0.08 * 10.5,
    textTransform: 'uppercase',
  },
  pending: { paddingVertical: 48, alignItems: 'center' },
  // Capped so a long roster scrolls inside the sheet rather than pushing it
  // past `maxHeight` and clipping the last rows.
  list: { maxHeight: 460 },
  listContent: { gap: 8, paddingBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  identity: { flex: 1, gap: 2 },
  name: { fontSize: 14, fontWeight: '600' },
  role: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.06 * 10 },
  times: { alignItems: 'flex-end', gap: 4 },
  punch: { fontSize: 13, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  worked: { fontFamily: fontFamily.mono, fontSize: 10 },
  pill: { height: 20, paddingHorizontal: 8, borderRadius: 999, justifyContent: 'center' },
  pillLabel: { fontSize: 10.5, fontWeight: '600' },
});
