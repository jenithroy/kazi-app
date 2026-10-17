import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusPill, type StatusKind } from '@/components/ui/status-pill';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { REVIEW_STATUS } from '@/data/budget-requirements/mock';
import { gbp, short } from '@/data/budget-requirements/utils';
import type { BudgetRequest, ReviewStatus } from '@/data/budget-requirements/types';

const PILL_KIND: Record<ReviewStatus, StatusKind> = {
  Pending: 'at-risk',
  Approved: 'on-track',
  Rejected: 'blocked',
};

export interface RequestDetailViewProps {
  item: BudgetRequest;
  canDecide: boolean;
  awaitingReviewer: boolean;
  onApprove: () => void;
  onReject: () => void;
}

/** Budget Request detail (item 17) — GBP-primary, UK-director approval. */
export function RequestDetailView({ item, canDecide, awaitingReviewer, onApprove, onReject }: RequestDetailViewProps) {
  const theme = useTheme();
  const status = REVIEW_STATUS[item.status];
  const statusLine =
    item.status === 'Pending'
      ? `Raised by ${item.requestedBy} (${item.requestedByRole}) on ${item.date}`
      : `${status.label} by ${item.reviewedBy ?? 'a UK director'} · originally raised ${item.date}`;

  const facts = [
    { label: 'Amount · GBP', value: gbp(item.amountGBP) },
    { label: 'Amount · NPR', value: short(item.amountNPR) },
    { label: 'Urgency', value: item.urgency },
    { label: 'Category', value: item.category },
    { label: 'Requested by', value: item.requestedBy },
    { label: 'Reference', value: item.ref },
  ];

  return (
    <Animated.View entering={FadeInUp.duration(220)} style={styles.wrap}>
      <Card elevation="hero" style={styles.amountCard}>
        <View style={styles.amountRow}>
          <View style={styles.gap5}>
            <Text style={[styles.eyebrow, { color: theme.onHero.textMuted }]}>Amount requested</Text>
            <Text style={[styles.amountValue, tabularNums, { color: theme.onHero.text }]}>{gbp(item.amountGBP)}</Text>
            <Text style={[styles.amountSub, tabularNums, { color: theme.onHero.textMuted }]}>≈ {short(item.amountNPR)} at 200</Text>
          </View>
          <StatusPill status={PILL_KIND[item.status]} label={status.label} />
        </View>
        <View style={[styles.divider, { backgroundColor: theme.onHero.divider }]} />
        <Text style={[styles.statusLine, { color: theme.onHero.avatarText }]}>{statusLine}</Text>
        {canDecide ? (
          <View style={styles.decideRow}>
            <Button label="Approve" onPress={onApprove} style={styles.approveButton} />
            <Pressable onPress={onReject} style={[styles.declineButton, { borderColor: theme.onHero.divider }]}>
              <Text style={[styles.declineLabel, { color: theme.onHero.dangerWashText }]}>Reject</Text>
            </Pressable>
          </View>
        ) : null}
        {awaitingReviewer ? (
          <Text style={[styles.awaitingLine, { color: theme.onHero.textMuted }]}>Only a UK director can approve budget requests</Text>
        ) : null}
      </Card>

      <View style={styles.factsGrid}>
        {facts.map((f) => (
          <View key={f.label} style={[styles.factCard, { backgroundColor: theme.surface }]}>
            <Text style={[styles.factLabel, { color: theme.textSecondary }]}>{f.label}</Text>
            <Text style={[styles.factValue, tabularNums, { color: theme.textPrimary }]}>{f.value}</Text>
          </View>
        ))}
      </View>

      <Card elevation="raised" style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Justification</Text>
        <Text style={[styles.noteBody, { color: theme.textPrimary }]}>{item.justification}</Text>
      </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  amountCard: { padding: 18, gap: 14 },
  amountRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14 },
  gap5: { gap: 5 },
  eyebrow: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.12 * 10, textTransform: 'uppercase' },
  amountValue: { fontFamily: fontFamily.semibold, fontSize: 32, letterSpacing: -0.03 * 32, lineHeight: 32 },
  amountSub: { fontFamily: fontFamily.mono, fontSize: 11 },
  divider: { height: 1 },
  statusLine: { fontSize: 13, lineHeight: 13 * 1.45 },
  decideRow: { flexDirection: 'row', gap: 10 },
  approveButton: { flex: 1.4, height: 48 },
  declineButton: { flex: 1, height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  declineLabel: { fontSize: 15, fontWeight: '600' },
  awaitingLine: { fontFamily: fontFamily.mono, fontSize: 10.5, letterSpacing: 0.1 * 10.5, textTransform: 'uppercase' },
  factsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  factCard: { width: '47%', flexGrow: 1, borderRadius: 16, padding: 13, gap: 5 },
  factLabel: { fontFamily: fontFamily.mono, fontSize: 9.5, letterSpacing: 0.11 * 9.5, textTransform: 'uppercase' },
  factValue: { fontSize: 14.5, fontWeight: '600' },
  section: { padding: 16, gap: 12 },
  sectionTitle: { fontFamily: fontFamily.semibold, fontSize: 15 },
  noteBody: { fontSize: 13.5, lineHeight: 13.5 * 1.55 },
});
