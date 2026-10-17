import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, radii, tabularNums } from '@/theme';
import { ACCOUNTS, METHODS, SYM } from '@/data/billing/mock';
import type { Currency, Invoice, PaymentMethod } from '@/data/billing/types';
import { balance, money, n2, nprLiteral, todaysRate } from '@/data/billing/utils';

export interface PayDraft {
  amount: string;
  cur: Currency;
  method: PaymentMethod;
  acct: string;
  ref: string;
}

export interface PaySheetProps {
  visible: boolean;
  invoice: Invoice | null;
  draft: PayDraft;
  onClose: () => void;
  onChange: (patch: Partial<PayDraft>) => void;
  onSave: () => void;
}

export function PaySheet({ visible, invoice: v, draft, onClose, onChange, onSave }: PaySheetProps) {
  const theme = useTheme();
  if (!v) return null;

  const bal = balance(v);
  const amt = parseFloat(draft.amount.replace(/[^0-9.]/g, '')) || 0;
  const rate = draft.cur === 'NPR' ? 1 : todaysRate(draft.cur);
  const creditFx = draft.cur === v.cur ? amt : draft.cur === 'NPR' ? amt / v.rate : (amt * rate) / v.rate;
  const after = Math.max(0, bal - creditFx);
  const nprIn = draft.cur === 'NPR' ? amt : amt * rate;
  const fxDiff = v.cur !== 'NPR' && draft.cur === v.cur ? amt * (rate - v.rate) : 0;
  const showConversion = draft.cur !== 'NPR' || v.cur !== 'NPR';
  const hasFxDiff = Math.abs(fxDiff) > 1;

  const conversionLine =
    draft.cur === 'NPR'
      ? amt
        ? `${nprLiteral(amt)} ÷ ${n2(v.rate)} = ${money(v.cur, amt / v.rate)} off the invoice`
        : `Enter an NPR amount to credit against ${v.cur}`
      : amt
        ? `${SYM[draft.cur]}${n2(amt)} × ${n2(rate)} = ${nprLiteral(nprIn)}`
        : `Enter a ${draft.cur} amount to see the NPR credit`;

  const fxLabel = hasFxDiff
    ? fxDiff > 0
      ? `FX gain vs invoice rate ${n2(v.rate)}`
      : `FX loss vs invoice rate ${n2(v.rate)}`
    : draft.cur === 'NPR'
      ? 'Credited at the invoice rate — no FX difference'
      : 'No FX difference at this rate';
  const fxValue = hasFxDiff ? `${fxDiff > 0 ? '+' : '−'}${nprLiteral(Math.abs(fxDiff))}` : 'रु 0';
  const fxBg = hasFxDiff ? (fxDiff > 0 ? theme.accentWash : theme.dangerWash) : theme.surfaceRaised;
  const fxFg = hasFxDiff ? (fxDiff > 0 ? theme.accentWashText : theme.dangerWashText) : theme.textSecondary;

  const refPlaceholder = draft.method === 'cash' ? 'e.g. CRV-0132' : draft.method === 'bank' ? 'e.g. BRV-0232' : 'e.g. CN-0032 · credit note';
  const paySymbol = draft.cur === 'NPR' ? 'रु' : SYM[draft.cur];
  const acctLabel = ACCOUNTS.find((a) => a.id === draft.acct)?.label ?? '';
  const summary = `${METHODS.find((m) => m.id === draft.method)?.label ?? ''}${draft.method === 'bank' ? ` · ${acctLabel}` : ''} · ${draft.cur}`;

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Add payment" maxHeight={700}>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        {v.ref} · balance {money(v.cur, bal)}
      </Text>

      <View style={styles.group}>
        <View style={styles.amountHeaderRow}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>Amount received</Text>
          <Pressable
            onPress={() => onChange({ amount: draft.cur === v.cur ? bal.toFixed(2) : String(Math.round(bal * v.rate)) })}
            style={[styles.settleButton, { borderColor: theme.scheme === 'light' ? '#CFD8D2' : theme.border }]}
          >
            <Text style={[styles.settleLabel, { color: theme.accentDeep }]}>Settle in full</Text>
          </Pressable>
        </View>
        <View style={[styles.amountRow, { borderColor: amt ? theme.accent : theme.border, backgroundColor: theme.surface }]}>
          <Text style={[styles.currencySign, { color: theme.textSecondary }]}>{paySymbol}</Text>
          <TextInput
            value={draft.amount}
            onChangeText={(v2) => onChange({ amount: v2 })}
            placeholder="0"
            keyboardType="numeric"
            placeholderTextColor={theme.textSecondary}
            style={[styles.amountInput, { color: theme.textPrimary }]}
          />
        </View>
        {v.cur !== 'NPR' ? (
          <View style={[styles.curToggle, { backgroundColor: theme.draftWash, borderColor: theme.border }]}>
            {([v.cur, 'NPR'] as Currency[]).map((cu) => {
              const on = draft.cur === cu;
              return (
                <Pressable
                  key={cu}
                  onPress={() => onChange({ cur: cu, amount: '' })}
                  style={[styles.curButton, { backgroundColor: on ? theme.segmentSurface : 'transparent', borderColor: on ? theme.segmentBorder : 'transparent', boxShadow: on ? theme.shadows.card : undefined }]}
                >
                  <Text style={[styles.curLabel, { color: on ? theme.segmentText : theme.textSecondary }]}>{cu === 'NPR' ? 'Paid in NPR' : `Paid in ${cu}`}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      <View style={styles.group}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Method</Text>
        <View style={styles.methodRow}>
          {METHODS.map((m) => {
            const on = draft.method === m.id;
            return (
              <Pressable
                key={m.id}
                onPress={() => onChange({ method: m.id })}
                style={[styles.methodButton, { backgroundColor: on ? theme.selectedSurface : theme.surface, borderColor: on ? theme.selectedBorder : theme.border }]}
              >
                <Text style={[styles.methodLabel, { color: on ? theme.selectedText : theme.textPrimary }]}>{m.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {draft.method === 'bank' ? (
        <View style={styles.group}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>Received into</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.acctRow}>
            {ACCOUNTS.map((a) => {
              const on = draft.acct === a.id;
              return (
                <Pressable
                  key={a.id}
                  onPress={() => onChange({ acct: a.id })}
                  style={[styles.acctButton, { backgroundColor: on ? theme.selectedSurface : theme.surface, borderColor: on ? theme.selectedBorder : theme.border }]}
                >
                  <Text style={[styles.acctCode, { color: on ? theme.selectedTextMuted : theme.textSecondary }]}>{a.code}</Text>
                  <Text style={[styles.acctLabel, { color: on ? theme.selectedText : theme.textPrimary }]}>{a.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {showConversion ? (
        <View style={[styles.conversionCard, { backgroundColor: theme.surface, boxShadow: theme.shadows.card }]}>
          <View style={styles.conversionHeader}>
            <Text style={[styles.conversionLabel, { color: theme.textSecondary }]}>Conversion</Text>
            <Text style={[styles.rateNote, tabularNums, { color: theme.textSecondary }]}>{draft.cur === 'NPR' ? `invoiced at ${n2(v.rate)}` : `today ${n2(rate)}`}</Text>
          </View>
          <Text style={[styles.conversionLine, tabularNums, { color: theme.textPrimary }]}>{conversionLine}</Text>
          <View style={[styles.fxBox, { backgroundColor: fxBg }]}>
            <Text style={[styles.fxBoxLabel, { color: fxFg }]}>{fxLabel}</Text>
            <Text style={[styles.fxBoxValue, tabularNums, { color: fxFg }]}>{fxValue}</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.group}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Reference</Text>
        <TextInput
          value={draft.ref}
          onChangeText={(v2) => onChange({ ref: v2 })}
          placeholder={refPlaceholder}
          placeholderTextColor={theme.textSecondary}
          style={[styles.refInput, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.textPrimary }]}
        />
      </View>

      <View style={[styles.balanceCard, { backgroundColor: theme.surface, boxShadow: theme.shadows.card }]}>
        <View style={styles.balanceRow}>
          <Text style={[styles.balanceLabel, { color: theme.textSecondary }]}>Balance now</Text>
          <Text style={[styles.balanceValue, tabularNums, { color: theme.textPrimary }]}>{money(v.cur, bal)}</Text>
        </View>
        <View style={[styles.balanceRow, styles.balanceAfterRow, { borderTopColor: theme.background }]}>
          <Text style={[styles.balanceAfterLabel, { color: theme.textPrimary }]}>Balance after</Text>
          <Text style={[styles.balanceAfterValue, tabularNums, { color: after < 0.5 ? theme.accentWashText : theme.textPrimary }]}>{money(v.cur, after)}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryText, { color: theme.textSecondary }]} numberOfLines={1}>
            {summary}
          </Text>
          <Text style={[styles.summaryDate, tabularNums, { color: theme.textSecondary }]}>23 Aug 2026</Text>
        </View>
        <Pressable onPress={onSave} disabled={!amt} style={[styles.saveButton, { backgroundColor: amt ? theme.accent : theme.draftWash }]}>
          <Text style={[styles.saveLabel, tabularNums, { color: amt ? theme.accentText : theme.draftWashText }]}>{amt ? `Record ${money(draft.cur, amt)}` : 'Enter an amount'}</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.11 * 10, textTransform: 'uppercase', marginTop: -12 },
  group: { gap: 8 },
  label: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.11 * 10, textTransform: 'uppercase' },
  amountHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  settleButton: { height: 26, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  settleLabel: { fontSize: 11.5, fontWeight: '600' },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 64, paddingHorizontal: 16, borderRadius: radii.lg - 2, borderWidth: 1 },
  currencySign: { fontFamily: fontFamily.mono, fontSize: 15 },
  amountInput: { flex: 1, fontSize: 28, fontWeight: '600', letterSpacing: -0.02 * 28, padding: 0 },
  curToggle: { flexDirection: 'row', padding: 4, borderRadius: 13, borderWidth: 1, gap: 4 },
  curButton: { flex: 1, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  curLabel: { fontFamily: fontFamily.semibold, fontSize: 13 },
  methodRow: { flexDirection: 'row', gap: 8 },
  methodButton: { flex: 1, height: 52, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  methodLabel: { fontFamily: fontFamily.semibold, fontSize: 13.5 },
  acctRow: { gap: 7 },
  acctButton: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, paddingHorizontal: 14, borderRadius: 13, borderWidth: 1 },
  acctCode: { fontFamily: fontFamily.mono, fontSize: 10 },
  acctLabel: { fontFamily: fontFamily.semibold, fontSize: 13 },
  conversionCard: { borderRadius: 16, padding: 15, gap: 10 },
  conversionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  conversionLabel: { flex: 1, fontFamily: fontFamily.mono, fontSize: 9.5, letterSpacing: 0.1 * 9.5, textTransform: 'uppercase' },
  rateNote: { fontFamily: fontFamily.mono, fontSize: 10 },
  conversionLine: { fontSize: 13.5, lineHeight: 13.5 * 1.4 },
  fxBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, padding: 10 },
  fxBoxLabel: { flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 12 * 1.35 },
  fxBoxValue: { fontFamily: fontFamily.mono, fontSize: 11.5, flexShrink: 0 },
  refInput: { height: 50, paddingHorizontal: 15, borderRadius: 14, borderWidth: 1, fontSize: 15 },
  balanceCard: { borderRadius: 16, padding: 15, gap: 11 },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  balanceLabel: { flex: 1, fontSize: 13 },
  balanceValue: { fontFamily: fontFamily.mono, fontSize: 12.5 },
  balanceAfterRow: { paddingTop: 11, borderTopWidth: 1 },
  balanceAfterLabel: { flex: 1, fontSize: 13, fontWeight: '600' },
  balanceAfterValue: { fontFamily: fontFamily.mono, fontSize: 13, fontWeight: '500' },
  footer: { gap: 10 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  summaryText: { flex: 1, fontSize: 13.5 },
  summaryDate: { fontSize: 11, flexShrink: 0 },
  saveButton: { height: 54, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  saveLabel: { fontSize: 16, fontWeight: '600' },
});
