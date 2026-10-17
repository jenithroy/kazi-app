import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { Icon } from '@/components/ui/icon';
import { StatusPill } from '@/components/ui/status-pill';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { SEVERITY_META, STATUS_META } from '@/data/bug-reports/mock';
import type { BugReport } from '@/data/bug-reports/types';
import { useCalendarPreference } from '@/lib/calendar-preference';
import { dateText, isoDay } from '@/lib/date-display';

export interface ReportRowProps {
  report: BugReport;
  index: number;
  onPress: () => void;
}

function shortDate(iso: string): string {
  return dateText(isoDay(iso), { bsStyle: 'numeric' });
}

export function ReportRow({ report, index, onPress }: ReportRowProps) {
  const theme = useTheme();
  // `shortDate` reads the calendar preference, so subscribe to it.
  useCalendarPreference();
  const sev = SEVERITY_META[report.severity];
  const status = STATUS_META[report.status];

  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 30).duration(220)}>
      <Pressable onPress={onPress} style={[styles.card, { backgroundColor: theme.surface, boxShadow: theme.shadows.card }]}>
        <View style={styles.topRow}>
          <View style={[styles.sevDot, { backgroundColor: sev.dot }]} />
          <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={2}>
            {report.title}
          </Text>
        </View>

        <Text style={[styles.sub, tabularNums, { color: theme.textSecondary }]} numberOfLines={1}>
          {report.ref} · {report.area} · {sev.label}
        </Text>

        <View style={styles.bottomRow}>
          <StatusPill status={status.pill} label={status.label} />
          <View style={styles.flex1} />
          {report.screenshot ? <Icon name="paperclip" size={13} color={theme.textSecondary} /> : null}
          <Text style={[styles.meta, tabularNums, { color: theme.textSecondary }]}>
            {report.reportedBy} · {shortDate(report.createdAt)}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 15, gap: 9 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  sevDot: { width: 9, height: 9, borderRadius: 99, marginTop: 5, flexShrink: 0 },
  title: { flex: 1, fontFamily: fontFamily.semibold, fontSize: 14.5, lineHeight: 14.5 * 1.35, letterSpacing: -0.01 * 14.5 },
  sub: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex1: { flex: 1 },
  meta: { fontFamily: fontFamily.mono, fontSize: 10, flexShrink: 0 },
});
