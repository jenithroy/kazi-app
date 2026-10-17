import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';

export interface SummaryProps {
  outstandingTotal: string;
  openCount: number;
  fxExposure: string;
  collectedMonth: string;
  collectedPct: number;
  collectedMeta: string;
  vatTotal: string;
  vatPct: number;
  vatMeta: string;
}

export function Summary({ outstandingTotal, openCount, fxExposure, collectedMonth, collectedPct, collectedMeta, vatTotal, vatPct, vatMeta }: SummaryProps) {
  const theme = useTheme();

  return (
    <View style={styles.wrap}>
      <Card elevation="hero" style={styles.heroCard}>
        <View style={styles.heroRow}>
          {/* Amounts are shown in full — the figure shrinks to fit rather than
              truncating to "रु 4,21…", which is unreadable on an ERP screen. */}
          <View style={[styles.gap6, styles.heroMain]}>
            <Text style={[styles.eyebrow, { color: theme.onHero.textMuted }]}>Outstanding</Text>
            <Text
              style={[styles.heroValue, tabularNums, { color: theme.onHero.text }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}
            >
              {outstandingTotal}
            </Text>
          </View>
          <View style={[styles.gap5, styles.alignEnd]}>
            <Text style={[styles.eyebrow, { color: theme.onHero.textMuted }]}>Open invoices</Text>
            <Text style={[styles.heroSubValue, tabularNums, { color: theme.onHero.text }]}>{openCount}</Text>
          </View>
        </View>
        <View style={[styles.divider, { backgroundColor: theme.onHero.divider }]} />
        <Text style={[styles.fxLine, tabularNums, { color: theme.onHero.textMuted }]}>{fxExposure}</Text>
      </Card>

      <View style={styles.metricsRow}>
        <Card elevation="raised" style={styles.metricCard}>
          <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Collected · Aug</Text>
          <Text
            style={[styles.metricValue, tabularNums, { color: theme.textPrimary }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.5}
          >
            {collectedMonth}
          </Text>
          <View style={[styles.progressTrack, { backgroundColor: theme.draftWash }]}>
            <View style={[styles.progressFill, { width: `${collectedPct}%`, backgroundColor: theme.accent }]} />
          </View>
          <Text style={[styles.metricFoot, tabularNums, { color: theme.textSecondary }]} numberOfLines={1}>
            {collectedMeta}
          </Text>
        </Card>
        <Card elevation="raised" style={styles.metricCard}>
          <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>VAT invoiced</Text>
          <Text
            style={[styles.metricValue, tabularNums, { color: theme.textPrimary }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.5}
          >
            {vatTotal}
          </Text>
          <View style={[styles.progressTrack, { backgroundColor: theme.draftWash }]}>
            <View style={[styles.progressFill, { width: `${vatPct}%`, backgroundColor: theme.warning }]} />
          </View>
          <Text style={[styles.metricFoot, tabularNums, { color: theme.textSecondary }]} numberOfLines={1}>
            {vatMeta}
          </Text>
        </Card>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  heroCard: { padding: 17, gap: 13 },
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14 },
  heroMain: { flex: 1 },
  gap5: { gap: 5 },
  gap6: { gap: 6 },
  alignEnd: { alignItems: 'flex-end' },
  eyebrow: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.12 * 10, textTransform: 'uppercase' },
  heroValue: { fontFamily: fontFamily.semibold, fontSize: 30, letterSpacing: -0.03 * 30, lineHeight: 34 },
  heroSubValue: { fontFamily: fontFamily.semibold, fontSize: 17, lineHeight: 17 },
  divider: { height: 1 },
  fxLine: { fontFamily: fontFamily.mono, fontSize: 10.5, lineHeight: 10.5 * 1.4 },
  metricsRow: { flexDirection: 'row', gap: 10 },
  metricCard: { flex: 1, padding: 15, gap: 9 },
  metricLabel: { fontFamily: fontFamily.mono, fontSize: 9.5, letterSpacing: 0.11 * 9.5, textTransform: 'uppercase' },
  metricValue: { fontFamily: fontFamily.semibold, fontSize: 22, letterSpacing: -0.03 * 22, lineHeight: 26 },
  progressTrack: { height: 6, borderRadius: 99, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 99 },
  metricFoot: { fontFamily: fontFamily.mono, fontSize: 10 },
});
