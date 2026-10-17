import { StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { STATUS_LABELS, STATUS_RAMP } from '@/data/attendance/mock';
import { formatHours } from '@/data/attendance/live-shared';
import type { DayDetail } from '@/data/attendance/types';

/** Status chip + the late/cut badges the reference report shows beside it. */
export function DayStatusRow({ detail }: { detail: DayDetail }) {
  const theme = useTheme();
  const ramp = STATUS_RAMP[theme.scheme];
  const tone = detail.status ? ramp[detail.status] : null;

  return (
    <View style={styles.badgeRow}>
      {tone && detail.status ? (
        <View style={[styles.pill, { backgroundColor: tone.chipBg }]}>
          <View style={[styles.pillDot, { backgroundColor: tone.dot }]} />
          <Text style={[styles.pillLabel, { color: tone.chipFg }]}>{STATUS_LABELS[detail.status]}</Text>
        </View>
      ) : (
        <View style={[styles.pill, { backgroundColor: theme.draftWash }]}>
          <Text style={[styles.pillLabel, { color: theme.textSecondary }]}>
            {detail.isWeeklyOff ? 'Weekly off' : 'No record'}
          </Text>
        </View>
      )}

      {detail.lateCutApplied ? (
        <View style={[styles.badge, { backgroundColor: theme.dangerWash }]}>
          <Text style={[styles.badgeLabel, { color: theme.dangerWashText }]}>25% cut</Text>
        </View>
      ) : null}

      {detail.status === 'late' && detail.lateMinutes > 0 ? (
        <View style={[styles.badge, { backgroundColor: ramp.late.chipBg }]}>
          <Text style={[styles.badgeLabel, tabularNums, { color: ramp.late.chipFg }]}>
            {detail.lateMinutes}m late{detail.lateCutApplied ? '' : ' · grace'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function Row({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[styles.rowValue, mono ? tabularNums : null, { color: theme.textPrimary }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

/**
 * One day's punch record: the real clock-in / clock-out, the time actually
 * between them, and the shift it was measured against. Reused by the "Mine"
 * calendar and the admin member sheet.
 */
export function DayDetailBody({ detail }: { detail: DayDetail }) {
  const theme = useTheme();
  const worked = detail.workedHours;
  const over = worked != null && detail.scheduledHours > 0 ? worked - detail.scheduledHours : null;

  return (
    <View style={styles.body}>
      <DayStatusRow detail={detail} />

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Row label="Clocked in" value={detail.clockIn ?? '—'} />
        <Row label="Clocked out" value={detail.clockOut ?? (detail.clockIn ? 'Still on the clock' : '—')} />
        <Row
          label="Time on the clock"
          value={worked != null ? formatHours(worked) : detail.clockIn ? 'Running' : '—'}
        />
        <Row label="Schedule" value={detail.shiftLabel ?? 'Weekly off'} />
        {over != null ? (
          <Row
            label={over >= 0 ? 'Over schedule' : 'Under schedule'}
            value={formatHours(Math.abs(over))}
          />
        ) : null}
        {detail.distanceToSiteM != null ? <Row label="Distance to site" value={`${detail.distanceToSiteM} m`} /> : null}
        {detail.note ? <Row label="Note" value={detail.note} mono={false} /> : null}
      </View>
    </View>
  );
}

export interface DayDetailSheetProps {
  visible: boolean;
  detail: DayDetail | null;
  onClose: () => void;
}

/** Tapping a day in the "Mine" calendar opens this. */
export function DayDetailSheet({ visible, detail, onClose }: DayDetailSheetProps) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title={detail?.label ?? 'Day'} maxHeight={480}>
      {detail ? <DayDetailBody detail={detail} /> : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 14 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 11, borderRadius: 999 },
  pillDot: { width: 6, height: 6, borderRadius: 99 },
  pillLabel: { fontSize: 12.5, fontWeight: '600' },
  badge: { height: 24, paddingHorizontal: 8, borderRadius: 7, justifyContent: 'center' },
  badgeLabel: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  card: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, paddingVertical: 10 },
  rowLabel: { fontFamily: fontFamily.mono, fontSize: 10.5, letterSpacing: 0.08 * 10.5, textTransform: 'uppercase' },
  rowValue: { fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
});
