import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { CollapsedSection } from '@/components/ui/collapsed-section';
import { Avatar } from '@/components/ui/avatar';
import { DualDate } from '@/components/ui/dual-date';
import { EmptyState } from '@/components/ui/empty-state';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { CHALLAN_STATUSES, DOC_STATUS_PILL, QUOTATION_STATUSES } from '@/data/billing/mock';
import type { Challan, Quotation } from '@/data/billing/types';
import { calcTotals, money, n0 } from '@/data/billing/utils';
import { useDateText } from '@/lib/date-display';


type DocKind = 'challan' | 'quotation';
type AnyDoc = Challan | Quotation;

export interface DocListProps {
  kind: DocKind;
  docs: AnyDoc[];
  statusFilter: string;
  onStatusFilter: (s: string) => void;
  onOpen: (doc: AnyDoc) => void;
}

function isQuotation(d: AnyDoc): d is Quotation {
  return 'validUntil' in d;
}

export function DocList({ kind, docs, statusFilter, onStatusFilter, onOpen }: DocListProps) {
  const theme = useTheme();
  const dateText = useDateText();
  const todayISO = new Date().toISOString().slice(0, 10);
  const statuses = kind === 'challan' ? CHALLAN_STATUSES : QUOTATION_STATUSES;

  const matching = docs.filter((d) => statusFilter === 'all' || d.status === statusFilter);
  // Cancelled documents are kept as a record but collapse into their own
  // section at the bottom, out of the working list.
  const rows = matching.filter((d) => d.status !== 'Cancelled');
  const cancelled = matching.filter((d) => d.status === 'Cancelled');
  const live = docs.filter((d) => d.status !== 'Cancelled');
  const chips: { id: string; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: live.length },
    ...statuses
      .filter((s) => s !== 'Cancelled')
      .map((s) => ({ id: s as string, label: s as string, count: docs.filter((d) => d.status === s).length })),
  ];

  const renderCard = (d: AnyDoc, i: number) => {
    const quote = isQuotation(d);
    const cur = quote ? d.currency : 'NPR';
    const totals = calcTotals(d.lines, false, d.discountMode, d.discountPct, d.discountFlatAmt);
    const pill = DOC_STATUS_PILL[d.status] ?? DOC_STATUS_PILL.Draft;
    const initials = d.clientName.split(/[\s&]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    // A quotation nobody acted on before its date is dead paper — say so
    // rather than printing a date the reader has to compare themselves.
    const expired = quote && !!d.validUntil && d.validUntil < todayISO && (d.status === 'Draft' || d.status === 'Sent');
    const secondLine = quote
      ? expired
        ? `expired ${dateText(d.validUntil)}`
        : `valid to ${d.validUntil ? dateText(d.validUntil) : '—'}`
      : d.routeFrom || d.routeTo
        ? `${d.routeFrom || '—'} → ${d.routeTo || '—'}`
        : 'no route set';
    const units = d.lines.reduce((n, l) => n + l.qty, 0);
    const countChip = quote ? `${d.lines.length} item${d.lines.length === 1 ? '' : 's'}` : `${n0(units)} pcs`;

    return (
      <Animated.View key={d.id} entering={FadeInUp.delay(Math.min(i, 6) * 28).duration(220)}>
        <Pressable
          onPress={() => onOpen(d)}
          style={[styles.card, { backgroundColor: theme.surface, boxShadow: theme.shadows.card, borderLeftColor: pill.dot }]}
        >
          <View style={styles.topRow}>
            <Avatar initials={initials || '—'} tint={i % 2 === 0 ? 'mint' : 'dark'} size="md" />
            <View style={styles.textWrap}>
              <Text style={[styles.client, { color: theme.textPrimary }]} numberOfLines={1}>
                {d.clientName}
              </Text>
              <View style={styles.metaRow}>
                <Text style={[styles.sub, tabularNums, { color: theme.textSecondary }]}>{d.number}</Text>
                <DualDate iso={d.date} inline size={10} bsStyle="numeric" secondary={false} />
              </View>
            </View>
            <Text style={[styles.amount, tabularNums, { color: theme.textPrimary }]}>{money(cur, totals.total)}</Text>
          </View>

          <View style={styles.bottomRow}>
            <View style={[styles.pill, { backgroundColor: pill.bg }]}>
              <View style={[styles.pillDot, { backgroundColor: pill.dot }]} />
              <Text style={[styles.pillLabel, { color: pill.fg }]}>{d.status}</Text>
            </View>
            <View style={[styles.metaChip, { backgroundColor: theme.draftWash }]}>
              <Text style={[styles.metaChipText, tabularNums, { color: theme.textPrimary }]}>{countChip}</Text>
            </View>
            {d.relatedInvoice ? (
              <View style={[styles.metaChip, { backgroundColor: theme.accentWash }]}>
                <Text style={[styles.metaChipText, tabularNums, { color: theme.accentWashText }]}>{d.relatedInvoice}</Text>
              </View>
            ) : null}
            <View style={styles.flex1} />
            <Text
              style={[styles.secondLine, tabularNums, { color: expired ? theme.dangerWashText : theme.textSecondary }]}
              numberOfLines={1}
            >
              {secondLine}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    );
  };

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
        {chips.map((c) => {
          const on = statusFilter === c.id;
          return (
            <Pressable
              key={c.id}
              onPress={() => onStatusFilter(c.id)}
              style={[styles.chip, { backgroundColor: on ? theme.selectedSurface : theme.surface, borderColor: on ? theme.selectedBorder : theme.border }]}
            >
              <Text style={[styles.chipLabel, { color: on ? theme.selectedText : theme.textPrimary }]}>{c.label}</Text>
              <Text style={[styles.chipCount, tabularNums, { color: on ? theme.selectedTextMuted : theme.textSecondary }]}>{c.count}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {rows.length === 0 && cancelled.length === 0 ? (
        <EmptyState
          icon="file-text"
          title={`No ${kind === 'challan' ? 'challans' : 'quotations'} here`}
          message={`Tap "All" to see every ${kind}, or add one with the button below.`}
        />
      ) : (
        rows.map(renderCard)
      )}

      <CollapsedSection label={`Cancelled ${kind === 'challan' ? 'challans' : 'quotations'}`} count={cancelled.length}>
        {cancelled.map(renderCard)}
      </CollapsedSection>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  chipsRow: { gap: 7, paddingTop: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1 },
  chipLabel: { fontFamily: fontFamily.semibold, fontSize: 12.5 },
  chipCount: { fontFamily: fontFamily.mono, fontSize: 10 },
  card: { borderRadius: 20, padding: 15, gap: 11, borderLeftWidth: 4 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  textWrap: { flex: 1, gap: 3, minWidth: 0 },
  client: { fontFamily: fontFamily.semibold, fontSize: 15.5, letterSpacing: -0.01 * 15.5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sub: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  amount: { fontSize: 14.5, fontWeight: '600', flexShrink: 0 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 26, paddingHorizontal: 10, borderRadius: 999 },
  pillDot: { width: 6, height: 6, borderRadius: 99 },
  pillLabel: { fontSize: 12, fontWeight: '600' },
  metaChip: { height: 26, paddingHorizontal: 9, borderRadius: 8, justifyContent: 'center' },
  metaChipText: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  flex1: { flex: 1 },
  secondLine: { fontFamily: fontFamily.mono, fontSize: 10.5, flexShrink: 1 },
});
