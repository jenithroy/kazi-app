import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { Avatar } from '@/components/ui/avatar';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { INVOICE_PILL, PAN_REQUIRED_ABOVE_NPR } from '@/data/billing/mock';
import type { Invoice } from '@/data/billing/types';
import { appliesVAT, balance, clientInitialsOf, clientNameOf, money, npr, nprOf, paid, statusFull, total as invTotal, vat } from '@/data/billing/utils';
import { useDateText } from '@/lib/date-display';

export interface InvoiceRowProps {
  invoice: Invoice;
  index: number;
  showFx: boolean;
  onPress: () => void;
}

export function InvoiceRow({ invoice: v, index, showFx, onPress }: InvoiceRowProps) {
  const theme = useTheme();
  const dateText = useDateText();
  const st = statusFull(v);
  const pill = INVOICE_PILL[st];
  const tot = invTotal(v);
  const pd = paid(v);
  const bal = balance(v);
  const part = st === 'Partial';
  const late = st === 'Overdue';
  // The web table's "Credit Due" column — the number someone scanning the list
  // is actually after, which the total alone never tells them.
  const showDue = !v.cancelled && bal > 0.5;
  const vatAmt = appliesVAT(v) ? vat(v) : 0;
  // A missing PAN only matters above the IRD threshold, so it's flagged as an
  // exception rather than given a column of dashes.
  const panMissing = !v.clientPAN?.trim() && nprOf(v, tot) > PAN_REQUIRED_ABOVE_NPR;
  const related = v.challans.length
    ? v.challans.length > 1
      ? `${v.challans[0].no} +${v.challans.length - 1}`
      : v.challans[0].no
    : (v.relatedQuotation ?? v.relatedChallan ?? v.so ?? '');
  const issued = v.issuedISO ? dateText(v.issuedISO) : v.issued;
  const due = v.cancelled ? 'voided' : st === 'Paid' ? 'settled' : late ? `due ${v.due} · ${Math.abs(v.dueDays)}d late` : `due ${v.dueISO ? dateText(v.dueISO) : v.due}`;
  const paidPct = tot > 0 ? Math.min(100, (pd / tot) * 100) : 0;

  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 30).duration(220)}>
      <Pressable
        onPress={onPress}
        style={[styles.card, { backgroundColor: theme.surface, boxShadow: theme.shadows.card, borderLeftColor: pill.accent }]}
      >
        <View style={styles.topRow}>
          <Avatar initials={clientInitialsOf(v)} tint={index % 2 === 0 ? 'mint' : 'dark'} size="md" />
          <View style={styles.textWrap}>
            <Text style={[styles.client, { color: theme.textPrimary }]} numberOfLines={1}>
              {clientNameOf(v)}
            </Text>
            <Text style={[styles.sub, tabularNums, { color: theme.textSecondary }]} numberOfLines={1}>
              {v.ref} · {issued}
            </Text>
          </View>
          <View style={styles.amountCol}>
            <Text
              style={[
                styles.amount,
                tabularNums,
                { color: v.cancelled ? theme.textSecondary : theme.textPrimary, textDecorationLine: v.cancelled ? 'line-through' : 'none' },
              ]}
            >
              {npr(nprOf(v, tot))}
            </Text>
            {showFx && v.cur !== 'NPR' ? <Text style={[styles.fxAmount, tabularNums, { color: theme.textSecondary }]}>{money(v.cur, tot)}</Text> : null}
            <Text style={[styles.vatLine, tabularNums, { color: theme.textSecondary }]}>
              {vatAmt > 0.5 ? `incl. VAT ${npr(nprOf(v, vatAmt))}` : 'no VAT'}
            </Text>
            {showDue ? (
              <Text style={[styles.dueAmount, tabularNums, { color: theme.dangerWashText }]}>{npr(nprOf(v, bal))} due</Text>
            ) : null}
          </View>
        </View>

        {part ? (
          <View style={styles.progressWrap}>
            <View style={[styles.progressTrack, { backgroundColor: theme.draftWash }]}>
              <View style={[styles.progressFill, { width: `${paidPct}%`, backgroundColor: theme.accent }]} />
            </View>
            <Text style={[styles.progressMeta, tabularNums, { color: theme.textSecondary }]}>
              {money(v.cur, pd)} of {money(v.cur, tot)} collected
            </Text>
          </View>
        ) : null}

        <View style={styles.bottomRow}>
          <View style={[styles.pill, { backgroundColor: pill.bg }]}>
            <View style={[styles.pillDot, { backgroundColor: pill.dot }]} />
            <Text style={[styles.pillLabel, { color: pill.fg }]}>{pill.label}</Text>
          </View>
          {related ? (
            <View style={[styles.chip, { backgroundColor: theme.draftWash }]}>
              <Text style={[styles.chipText, tabularNums, { color: theme.textPrimary }]}>{related}</Text>
            </View>
          ) : null}
          {panMissing ? (
            <View style={[styles.chip, { backgroundColor: theme.warningWash }]}>
              <Text style={[styles.chipText, { color: theme.warningWashText }]}>No PAN</Text>
            </View>
          ) : null}
          <View style={styles.flex1} />
          <Text style={[styles.due, tabularNums, { color: late ? theme.dangerWashText : theme.textSecondary }]} numberOfLines={1}>
            {due}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 15, gap: 11, borderLeftWidth: 4 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  textWrap: { flex: 1, gap: 3, minWidth: 0 },
  client: { fontFamily: fontFamily.semibold, fontSize: 15.5, letterSpacing: -0.01 * 15.5 },
  sub: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  amountCol: { alignItems: 'flex-end', gap: 3, flexShrink: 0 },
  amount: { fontSize: 14.5, fontWeight: '600' },
  fxAmount: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  vatLine: { fontFamily: fontFamily.mono, fontSize: 10 },
  dueAmount: { fontFamily: fontFamily.mono, fontSize: 11, fontWeight: '500' },
  progressWrap: { gap: 5 },
  progressTrack: { height: 5, borderRadius: 99, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 99 },
  progressMeta: { fontFamily: fontFamily.mono, fontSize: 10 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 26, paddingHorizontal: 10, borderRadius: 999 },
  pillDot: { width: 6, height: 6, borderRadius: 99 },
  pillLabel: { fontSize: 12, fontWeight: '600' },
  chip: { height: 26, paddingHorizontal: 9, borderRadius: 8, justifyContent: 'center' },
  chipText: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  flex1: { flex: 1 },
  due: { fontFamily: fontFamily.mono, fontSize: 10.5, flexShrink: 0 },
});
