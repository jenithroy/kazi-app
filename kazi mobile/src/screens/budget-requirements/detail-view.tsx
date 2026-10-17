import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Money } from '@/components/ui/money';
import { StatusPill, type StatusKind } from '@/components/ui/status-pill';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { STATUS } from '@/data/budget-requirements/mock';
import type { RequestStatus, Requirement } from '@/data/budget-requirements/types';

const PILL_KIND: Record<RequestStatus, StatusKind> = {
  pending: 'at-risk',
  approved: 'on-track',
  declined: 'blocked',
};

export interface DetailViewProps {
  item: Requirement;
  canDecide: boolean;
  awaitingAdmin: boolean;
  onApprove: () => void;
  onDecline: () => void;
}

export function DetailView({ item, canDecide, awaitingAdmin, onApprove, onDecline }: DetailViewProps) {
  const theme = useTheme();
  const status = STATUS[item.status];
  const decidedBy = item.decidedBy?.trim();
  const byWhom = decidedBy ? ` by ${decidedBy}` : '';
  const statusLine =
    item.status === 'pending'
      ? `Raised by ${item.who} on ${item.date} · needed ${item.by.toLowerCase()}`
      : item.status === 'approved'
        ? `Approved${byWhom} · release against ${item.cat.toLowerCase()} budget`
        : `Declined${byWhom} · can be raised again next month`;

  const facts = [
    { label: 'Quantity', value: item.quantity },
    { label: 'Priority', value: item.priority },
    { label: 'Needed by', value: item.by },
    { label: 'Requested by', value: item.who },
    { label: 'Team', value: item.team },
    { label: 'Category', value: item.cat },
    { label: 'Reference', value: item.ref },
  ];

  const trail = [
    { who: item.init, what: 'Request submitted', when: `${item.date} · 08:40`, bg: theme.accentWash, fg: theme.accentWashText },
    { who: 'PT', what: 'Store confirmed nothing in stock', when: `${item.date} · 10:15`, bg: theme.draftWash, fg: theme.textSecondary },
    item.status === 'pending'
      ? { who: '··', what: 'Waiting with an admin', when: 'Pending', bg: theme.warningWash, fg: theme.warningWashText }
      : {
          who: decidedBy ? decidedBy.slice(0, 2).toUpperCase() : '··',
          what: decidedBy ? `${status.label} · ${decidedBy}` : status.label,
          when: `${item.date} · 17:20`,
          bg: item.status === 'approved' ? theme.accentWash : theme.dangerWash,
          fg: item.status === 'approved' ? theme.accentWashText : theme.dangerWashText,
        },
  ];

  return (
    <Animated.View entering={FadeInUp.duration(220)} style={styles.wrap}>
      <Card elevation="hero" style={styles.amountCard}>
        <View style={styles.amountRow}>
          <View style={styles.gap5}>
            <Text style={[styles.eyebrow, { color: theme.onHero.textMuted }]}>Amount requested</Text>
            <Money npr={item.amount} hero size={30} primaryStyle={styles.amountValue} />
          </View>
          <StatusPill status={PILL_KIND[item.status]} label={status.label} />
        </View>
        <View style={[styles.divider, { backgroundColor: theme.onHero.divider }]} />
        <Text style={[styles.statusLine, { color: theme.onHero.avatarText }]}>{statusLine}</Text>
        {canDecide ? (
          <View style={styles.decideRow}>
            <Button label="Approve" onPress={onApprove} style={styles.approveButton} />
            <Pressable onPress={onDecline} style={[styles.declineButton, { borderColor: theme.onHero.divider }]}>
              <Text style={[styles.declineLabel, { color: theme.onHero.dangerWashText }]}>Decline</Text>
            </Pressable>
          </View>
        ) : null}
        {awaitingAdmin ? <Text style={[styles.awaitingLine, { color: theme.onHero.textMuted }]}>Only admins can approve · sent to A. Karki</Text> : null}
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
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Why it is needed</Text>
        <Text style={[styles.noteBody, { color: theme.textPrimary }]}>{item.note}</Text>
      </Card>

      <Card elevation="raised" style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Trail</Text>
        {trail.map((t, i) => (
          <View key={i} style={styles.trailRow}>
            <View style={[styles.trailAvatar, { backgroundColor: t.bg }]}>
              <Text style={[styles.trailWho, { color: t.fg }]}>{t.who}</Text>
            </View>
            <View style={styles.trailTextWrap}>
              <Text style={[styles.trailWhat, { color: theme.textPrimary }]}>{t.what}</Text>
              <Text style={[styles.trailWhen, tabularNums, { color: theme.textSecondary }]}>{t.when}</Text>
            </View>
          </View>
        ))}
      </Card>

      <Pressable style={[styles.quoteRow, { backgroundColor: theme.surface, boxShadow: theme.shadows.card }]}>
        <View style={[styles.quoteThumb, { borderColor: theme.border, backgroundColor: theme.draftWash }]} />
        <View style={styles.quoteTextWrap}>
          <Text style={[styles.quoteTitle, { color: theme.textPrimary }]}>Quotation</Text>
          <Text style={[styles.quoteHint, tabularNums, { color: theme.textSecondary }]}>{item.quote}</Text>
        </View>
        <Icon name="chevron-right" size={16} color={theme.textSecondary} />
      </Pressable>
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
  trailRow: { flexDirection: 'row', gap: 11 },
  trailAvatar: { width: 30, height: 30, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  trailWho: { fontSize: 11, fontWeight: '600' },
  trailTextWrap: { flex: 1, gap: 3, minWidth: 0 },
  trailWhat: { fontSize: 13.5, fontWeight: '600' },
  trailWhen: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  quoteRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, padding: 16 },
  quoteThumb: { width: 44, height: 54, borderRadius: 11, borderWidth: 1, flexShrink: 0 },
  quoteTextWrap: { flex: 1, gap: 3, minWidth: 0 },
  quoteTitle: { fontSize: 13.5, fontWeight: '600' },
  quoteHint: { fontFamily: fontFamily.mono, fontSize: 10.5 },
});
