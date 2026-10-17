import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { DateField } from '@/components/ui/date-field';
import { Icon } from '@/components/ui/icon';
import { TextField } from '@/components/ui/text-field';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, radii, tabularNums } from '@/theme';
import {
  CHALLAN_STATUSES,
  CLIENTS,
  DOC_UNITS,
  QUOTATION_STATUSES,
  QUOTATION_TERMS_DEFAULT,
} from '@/data/billing/mock';
import type { Challan, DiscountMode, DocCurrency, Quotation } from '@/data/billing/types';
import { calcTotals, money } from '@/data/billing/utils';

export interface DocDraftLine {
  desc: string;
  qty: string;
  unit: string;
  rate: string;
}

export interface DocDraft {
  date: string;
  clientName: string;
  clientPAN: string;
  clientPhone: string;
  clientAddress: string;
  lines: DocDraftLine[];
  discountMode: DiscountMode;
  discountPct: string;
  discountFlatAmt: string;
  note: string;
  status: string;
  // challan-only
  vehicleNo: string;
  driverName: string;
  routeFrom: string;
  routeTo: string;
  // quotation-only
  currency: DocCurrency;
  validUntil: string;
  terms: string;
}

export function emptyLine(): DocDraftLine {
  return { desc: '', qty: '', unit: 'Pcs', rate: '' };
}

const today = () => new Date().toISOString().slice(0, 10);
const in30Days = () => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
};

export function emptyDocDraft(kind: 'challan' | 'quotation'): DocDraft {
  return {
    date: today(),
    clientName: '',
    clientPAN: '',
    clientPhone: '',
    clientAddress: '',
    lines: [emptyLine(), emptyLine()],
    discountMode: 'pct',
    discountPct: '',
    discountFlatAmt: '',
    note: '',
    status: 'Draft',
    vehicleNo: '',
    driverName: '',
    routeFrom: '',
    routeTo: '',
    currency: 'NPR',
    validUntil: kind === 'quotation' ? in30Days() : today(),
    terms: kind === 'quotation' ? QUOTATION_TERMS_DEFAULT : '',
  };
}

/** Prefill the editor from a saved challan or quotation (the Edit action). */
export function draftFromDoc(doc: Challan | Quotation): DocDraft {
  const quote = 'validUntil' in doc;
  const q = quote ? (doc as Quotation) : null;
  const c = quote ? null : (doc as Challan);
  return {
    date: doc.date,
    clientName: doc.clientName,
    clientPAN: doc.clientPAN,
    clientPhone: doc.clientPhone,
    clientAddress: doc.clientAddress,
    lines: doc.lines.length
      ? doc.lines.map((l) => ({ desc: l.desc, qty: String(l.qty), unit: l.unit, rate: String(l.rate) }))
      : [emptyLine(), emptyLine()],
    discountMode: doc.discountMode,
    discountPct: doc.discountPct ? String(doc.discountPct) : '',
    discountFlatAmt: doc.discountFlatAmt ? String(doc.discountFlatAmt) : '',
    note: doc.note,
    status: doc.status,
    vehicleNo: c?.vehicleNo ?? '',
    driverName: c?.driverName ?? '',
    routeFrom: c?.routeFrom ?? '',
    routeTo: c?.routeTo ?? '',
    currency: q?.currency ?? 'NPR',
    validUntil: q?.validUntil ?? doc.date,
    terms: q?.terms ?? '',
  };
}

const toNum = (s: string) => parseFloat(s.replace(/[^0-9.]/g, '')) || 0;

export interface DocSheetProps {
  visible: boolean;
  kind: 'challan' | 'quotation';
  draft: DocDraft;
  /** The document number: the next free one when creating, its own when editing. */
  nextNumber: string;
  /** Editing an existing document rather than creating one. */
  editing?: boolean;
  onClose: () => void;
  onChange: (patch: Partial<DocDraft>) => void;
  onSave: () => void;
}

export function DocSheet({ visible, kind, draft, nextNumber, editing = false, onClose, onChange, onSave }: DocSheetProps) {
  const theme = useTheme();

  const isQuote = kind === 'quotation';
  const cur: DocCurrency = isQuote ? draft.currency : 'NPR';
  const statuses = isQuote ? QUOTATION_STATUSES : CHALLAN_STATUSES;

  const totals = calcTotals(
    draft.lines.map((l) => ({ desc: l.desc, unit: l.unit, qty: toNum(l.qty), rate: toNum(l.rate) })),
    false,
    draft.discountMode,
    toNum(draft.discountPct),
    toNum(draft.discountFlatAmt),
  );
  const ready = draft.clientName.trim().length > 0 && totals.subtotal > 0;

  const patchLine = (i: number, patch: Partial<DocDraftLine>) =>
    onChange({ lines: draft.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) });
  const addLine = () => onChange({ lines: [...draft.lines, emptyLine()] });
  const removeLine = (i: number) => onChange({ lines: draft.lines.filter((_, idx) => idx !== i) });

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={editing ? `Edit ${nextNumber}` : isQuote ? 'New quotation' : 'New challan'}
      maxHeight={760}
    >
      <Text style={[styles.numberHint, { color: theme.textSecondary }]}>
        {editing ? `${nextNumber} · status, prices and items are all editable` : 'The number is assigned when you save'}
      </Text>

      {/* Client */}
      <View style={styles.group}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Client</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {Object.values(CLIENTS).map((c) => {
            const on = draft.clientName === c.name;
            return (
              <Pressable
                key={c.name}
                onPress={() => onChange({ clientName: c.name })}
                style={[styles.chip, { backgroundColor: on ? theme.selectedSurface : theme.surface, borderColor: on ? theme.selectedBorder : theme.border }]}
              >
                <Text style={[styles.chipLabel, { color: on ? theme.selectedText : theme.textPrimary }]}>{c.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <TextField value={draft.clientName} onChangeText={(v) => onChange({ clientName: v })} placeholder="or type a client name" />
      </View>

      <TextField label="Client PAN / VAT" value={draft.clientPAN} onChangeText={(v) => onChange({ clientPAN: v })} placeholder="Registration no." compact />
      <TextField label="Client phone" value={draft.clientPhone} onChangeText={(v) => onChange({ clientPhone: v })} placeholder="Phone" compact />
      <TextField label="Client address" value={draft.clientAddress} onChangeText={(v) => onChange({ clientAddress: v })} placeholder="Billing address" compact />

      {/* Date + (quotation) currency + valid until */}
      <DateField label="Date" value={draft.date} onChange={(iso) => onChange({ date: iso })} pickerTitle="Document date" />

      {isQuote ? (
        <>
          <View style={styles.group}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Currency</Text>
            <View style={styles.segRow}>
              {(['NPR', 'GBP'] as DocCurrency[]).map((c) => {
                const on = draft.currency === c;
                return (
                  <Pressable
                    key={c}
                    onPress={() => onChange({ currency: c })}
                    style={[styles.segButton, { backgroundColor: on ? theme.selectedSurface : theme.surface, borderColor: on ? theme.selectedBorder : theme.border }]}
                  >
                    <Text style={[styles.segLabel, { color: on ? theme.selectedText : theme.textPrimary }]}>{c}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <DateField label="Valid until" value={draft.validUntil} onChange={(iso) => onChange({ validUntil: iso })} pickerTitle="Valid until" />
        </>
      ) : null}

      {/* Line items */}
      <View style={styles.group}>
        <View style={styles.lineHeader}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>Line items</Text>
          <Pressable onPress={addLine} style={styles.addLineBtn}>
            <Icon name="plus" size={13} color={theme.link} />
            <Text style={[styles.addLineText, { color: theme.link }]}>Add line</Text>
          </Pressable>
        </View>

        {draft.lines.map((l, i) => (
          <View key={i} style={[styles.lineCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.lineTopRow}>
              <TextInput
                value={l.desc}
                onChangeText={(v) => patchLine(i, { desc: v })}
                placeholder="Description"
                placeholderTextColor={theme.textSecondary}
                style={[styles.lineDesc, { color: theme.textPrimary }]}
              />
              {draft.lines.length > 1 ? (
                <Pressable onPress={() => removeLine(i)} hitSlop={8}>
                  <Icon name="x" size={15} color={theme.textSecondary} />
                </Pressable>
              ) : null}
            </View>
            <View style={styles.lineBottomRow}>
              <TextInput
                value={l.qty}
                onChangeText={(v) => patchLine(i, { qty: v })}
                placeholder="Qty"
                keyboardType="numeric"
                placeholderTextColor={theme.textSecondary}
                style={[styles.lineNum, { color: theme.textPrimary, borderColor: theme.border }]}
              />
              <View style={styles.unitRow}>
                {DOC_UNITS.slice(0, 4).map((u) => {
                  const on = l.unit === u;
                  return (
                    <Pressable
                      key={u}
                      onPress={() => patchLine(i, { unit: u })}
                      style={[styles.unitChip, { backgroundColor: on ? theme.selectedSurface : 'transparent', borderColor: on ? theme.selectedBorder : theme.border }]}
                    >
                      <Text style={[styles.unitText, { color: on ? theme.selectedText : theme.textSecondary }]}>{u}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                value={l.rate}
                onChangeText={(v) => patchLine(i, { rate: v })}
                placeholder="Rate"
                keyboardType="numeric"
                placeholderTextColor={theme.textSecondary}
                style={[styles.lineNum, { color: theme.textPrimary, borderColor: theme.border }]}
              />
            </View>
            <Text style={[styles.lineAmount, tabularNums, { color: theme.textSecondary }]}>
              = {money(cur, toNum(l.qty) * toNum(l.rate))}
            </Text>
          </View>
        ))}
      </View>

      {/* Challan transport details */}
      {!isQuote ? (
        <View style={styles.group}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>Transport (Nepal compliance)</Text>
          <TextField value={draft.vehicleNo} onChangeText={(v) => onChange({ vehicleNo: v })} placeholder="Vehicle no. · BA 1 KA 1234" compact />
          <TextField value={draft.driverName} onChangeText={(v) => onChange({ driverName: v })} placeholder="Driver name" compact />
          <View style={styles.routeRow}>
            <View style={styles.routeCol}>
              <TextField value={draft.routeFrom} onChangeText={(v) => onChange({ routeFrom: v })} placeholder="From" compact />
            </View>
            <View style={styles.routeCol}>
              <TextField value={draft.routeTo} onChangeText={(v) => onChange({ routeTo: v })} placeholder="To" compact />
            </View>
          </View>
        </View>
      ) : null}

      {/* Discount */}
      <View style={styles.group}>
        <View style={styles.lineHeader}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>Discount</Text>
          <View style={styles.segRowSmall}>
            {(['pct', 'amount'] as DiscountMode[]).map((m) => {
              const on = draft.discountMode === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => onChange({ discountMode: m })}
                  style={[styles.segChip, { backgroundColor: on ? theme.selectedSurface : theme.surface, borderColor: on ? theme.selectedBorder : theme.border }]}
                >
                  <Text style={[styles.segChipText, { color: on ? theme.selectedText : theme.textSecondary }]}>{m === 'pct' ? '%' : 'Amt'}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={[styles.amountRow, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <Text style={[styles.rupeeSign, { color: theme.textSecondary }]}>{draft.discountMode === 'pct' ? '%' : cur === 'GBP' ? '£' : 'रु'}</Text>
          <TextInput
            value={draft.discountMode === 'pct' ? draft.discountPct : draft.discountFlatAmt}
            onChangeText={(v) => onChange(draft.discountMode === 'pct' ? { discountPct: v } : { discountFlatAmt: v })}
            placeholder="0"
            keyboardType="numeric"
            placeholderTextColor={theme.textSecondary}
            style={[styles.discountInput, { color: theme.textPrimary }]}
          />
        </View>
      </View>

      {/* Status */}
      <View style={styles.group}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Status</Text>
        <View style={styles.wrapRow}>
          {statuses.map((s) => {
            const on = draft.status === s;
            return (
              <Pressable
                key={s}
                onPress={() => onChange({ status: s })}
                style={[styles.pill, { backgroundColor: on ? theme.accentWash : theme.surface, borderColor: on ? theme.accent : theme.border }]}
              >
                <Text style={[styles.pillLabel, { color: on ? theme.accentWashText : theme.textPrimary }]}>{s}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Terms (quotation) */}
      {isQuote ? (
        <View style={styles.group}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>Terms &amp; conditions</Text>
          <TextInput
            value={draft.terms}
            onChangeText={(v) => onChange({ terms: v })}
            multiline
            placeholder="Payment terms, delivery window…"
            placeholderTextColor={theme.textSecondary}
            style={[styles.multiline, { color: theme.textPrimary, borderColor: theme.border, backgroundColor: theme.surface }]}
          />
        </View>
      ) : null}

      {/* Note */}
      <View style={styles.group}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Notes / remarks</Text>
        <TextInput
          value={draft.note}
          onChangeText={(v) => onChange({ note: v })}
          multiline
          placeholder="Bank details, handling notes…"
          placeholderTextColor={theme.textSecondary}
          style={[styles.multiline, { color: theme.textPrimary, borderColor: theme.border, backgroundColor: theme.surface }]}
        />
      </View>

      {/* Totals */}
      <View style={[styles.totalsCard, { backgroundColor: theme.surfaceRaised, borderColor: theme.border }]}>
        <TotalRow label="Subtotal" value={money(cur, totals.subtotal)} theme={theme} />
        {totals.discountAmt > 0 ? (
          <>
            <TotalRow label="Discount" value={`− ${money(cur, totals.discountAmt)}`} theme={theme} />
            <TotalRow label="Taxable amount" value={money(cur, totals.taxableAmt)} theme={theme} />
          </>
        ) : null}
        <View style={[styles.grandRow, { borderTopColor: theme.border }]}>
          <Text style={[styles.grandLabel, { color: theme.textPrimary }]}>Grand total</Text>
          <Text style={[styles.grandValue, tabularNums, { color: theme.textPrimary }]}>{money(cur, totals.total)}</Text>
        </View>
        {isQuote ? <Text style={[styles.vatNote, { color: theme.textSecondary }]}>13% VAT added on conversion to invoice</Text> : null}
      </View>

      <Pressable onPress={onSave} disabled={!ready} style={[styles.saveButton, { backgroundColor: ready ? theme.accent : theme.draftWash }]}>
        <Text style={[styles.saveLabel, tabularNums, { color: ready ? theme.accentText : theme.draftWashText }]}>
          {ready
            ? `${editing ? `Save ${nextNumber}` : isQuote ? 'Create quotation' : 'Create challan'} · ${money(cur, totals.total)}`
            : 'Add a client and a line item'}
        </Text>
      </Pressable>

    </BottomSheet>
  );
}

function TotalRow({ label, value, theme }: { label: string; value: string; theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={styles.totalRow}>
      <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[styles.totalValue, tabularNums, { color: theme.textPrimary }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  numberHint: { fontFamily: fontFamily.mono, fontSize: 11, marginBottom: 2 },
  group: { gap: 8 },
  label: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.11 * 10, textTransform: 'uppercase' },
  chipRow: { gap: 7, paddingVertical: 1 },
  chip: { height: 38, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipLabel: { fontFamily: fontFamily.semibold, fontSize: 12.5 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  pill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  pillLabel: { fontFamily: fontFamily.semibold, fontSize: 12.5 },
  segRow: { flexDirection: 'row', gap: 8 },
  segButton: { flex: 1, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  segLabel: { fontFamily: fontFamily.semibold, fontSize: 13 },
  segRowSmall: { flexDirection: 'row', gap: 6 },
  segChip: { width: 44, height: 28, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  segChipText: { fontFamily: fontFamily.mono, fontSize: 11 },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 52, paddingHorizontal: 16, borderRadius: radii.lg - 2, borderWidth: 1 },
  lineHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addLineBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addLineText: { fontFamily: fontFamily.semibold, fontSize: 12.5 },
  lineCard: { borderRadius: 14, borderWidth: 1, padding: 12, gap: 10 },
  lineTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lineDesc: { flex: 1, fontSize: 14.5, fontWeight: '600', padding: 0 },
  lineBottomRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lineNum: { width: 62, height: 40, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, fontSize: 14, textAlign: 'center' },
  unitRow: { flex: 1, flexDirection: 'row', gap: 4, justifyContent: 'center' },
  unitChip: { paddingHorizontal: 8, height: 28, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  unitText: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  lineAmount: { fontFamily: fontFamily.mono, fontSize: 11, textAlign: 'right' },
  routeRow: { flexDirection: 'row', gap: 8 },
  routeCol: { flex: 1 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, paddingHorizontal: 16, borderRadius: radii.lg - 2, borderWidth: 1 },
  rupeeSign: { fontFamily: fontFamily.mono, fontSize: 14 },
  discountInput: { flex: 1, fontSize: 18, fontWeight: '600', padding: 0 },
  multiline: { minHeight: 72, borderWidth: 1, borderRadius: radii.md, padding: 12, fontSize: 13, textAlignVertical: 'top' },
  totalsCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  totalLabel: { fontFamily: fontFamily.mono, fontSize: 10.5, letterSpacing: 0.08 * 10.5, textTransform: 'uppercase' },
  totalValue: { fontSize: 13.5, fontWeight: '600' },
  grandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1.5, paddingTop: 10, marginTop: 2 },
  grandLabel: { fontFamily: fontFamily.semibold, fontSize: 14 },
  grandValue: { fontSize: 15, fontWeight: '700' },
  vatNote: { fontSize: 10.5, fontStyle: 'italic' },
  saveButton: { height: 54, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  saveLabel: { fontSize: 15, fontWeight: '600' },
});
