import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { DateField } from '@/components/ui/date-field';
import { Icon } from '@/components/ui/icon';
import { Money } from '@/components/ui/money';
import { TextField } from '@/components/ui/text-field';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, radii, tabularNums, type Theme } from '@/theme';
import { STATUS } from '@/data/purchases/mock';
import {
  PURCHASE_BANKS,
  PURCHASE_CATEGORIES,
  PURCHASE_REGIONS,
  PURCHASE_UNITS,
  type PaymentType,
  type PurchaseDraft,
  type PurchaseDraftLine,
  type PurchaseStatus,
  type VatBillState,
} from '@/data/purchases/types';
import { applyLineChange, computeTotals, emptyLine, toNum } from '@/data/purchases/utils';

export interface AddSheetProps {
  visible: boolean;
  draft: PurchaseDraft;
  onClose: () => void;
  onChange: (patch: Partial<PurchaseDraft>) => void;
  onSave: () => void;
  /** Party names already on file, offered as one-tap shortcuts. */
  parties?: string[];
  /** Shown as a "Delete purchase" action when editing. */
  onDelete?: () => void;
}

const STATUS_OPTIONS: PurchaseStatus[] = ['paid', 'partial', 'unpaid'];
const PAYMENT_OPTIONS: { id: PaymentType; label: string; icon: 'credit-card' | 'home' | 'clock' }[] = [
  { id: 'Cash', label: 'Cash', icon: 'credit-card' },
  { id: 'Bank', label: 'Bank', icon: 'home' },
  { id: 'Credit', label: 'Credit', icon: 'clock' },
];
const VAT_OPTIONS: { id: string; label: string; value: VatBillState }[] = [
  { id: 'yes', label: 'Yes · 13%', value: true },
  { id: 'no', label: 'No', value: false },
  { id: 'na', label: 'N/A', value: null },
];

/** Sentinel for "Other" while the free-text field is still empty. */
const OTHER = '__other__';

export function AddSheet({ visible, draft, onClose, onChange, onSave, parties = [], onDelete }: AddSheetProps) {
  const theme = useTheme();

  const editing = draft.id !== null;
  const lines = draft.lines.length ? draft.lines : [emptyLine()];
  const totals = computeTotals(
    lines.map((l) => ({ amount: l.amount.trim() === '' ? toNum(l.quantity) * toNum(l.rate) : toNum(l.amount) })),
    toNum(draft.discountAmt),
    draft.vatBill,
    toNum(draft.taxableAmt),
  );
  const ready = draft.party.trim().length > 0 && lines.some((l) => l.particulars.trim());

  const patchLine = (index: number, patch: Partial<PurchaseDraftLine>) =>
    onChange({ lines: applyLineChange(lines, index, patch) });
  const addLine = () => onChange({ lines: [...lines, emptyLine()] });
  const removeLine = (index: number) => onChange({ lines: lines.filter((_, i) => i !== index) });

  const bankIsOther =
    draft.bankName !== '' && !PURCHASE_BANKS.includes(draft.bankName as (typeof PURCHASE_BANKS)[number]);

  return (
    <BottomSheet visible={visible} onClose={onClose} title={editing ? 'Edit purchase' : 'Add purchase'} maxHeight={760}>
      <DateField label="Date" value={draft.date} onChange={(iso) => onChange({ date: iso })} pickerTitle="Purchase date" />

      {/* Party */}
      <Field label="Party name">
        {parties.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {parties.map((p) => (
              <Chip key={p} label={p} on={draft.party === p} onPress={() => onChange({ party: p })} theme={theme} />
            ))}
          </ScrollView>
        ) : null}
        <TextField
          value={draft.party}
          onChangeText={(v) => onChange({ party: v })}
          placeholder={parties.length ? 'or type a party name' : 'Party name'}
          autoCapitalize="words"
        />
      </Field>

      {/* Category */}
      <Field label="Category">
        <View style={styles.wrapRow}>
          {PURCHASE_CATEGORIES.map((c) => (
            <Pill key={c} label={c} on={draft.category === c} onPress={() => onChange({ category: c })} theme={theme} />
          ))}
        </View>
      </Field>

      {/* Region — an untagged purchase belongs to both arms of the business. */}
      <Field label="Region">
        <View style={styles.row8}>
          {PURCHASE_REGIONS.map((r) => (
            <Segment
              key={r.id}
              label={r.label}
              on={draft.region === r.id}
              onPress={() => onChange({ region: r.id })}
              theme={theme}
            />
          ))}
          <Segment label="Not set" on={draft.region === ''} onPress={() => onChange({ region: '' })} theme={theme} />
        </View>
      </Field>

      {/* Payment */}
      <Field label="Payment type">
        <View style={styles.row8}>
          {PAYMENT_OPTIONS.map((m) => {
            const on = draft.paymentType === m.id;
            return (
              <Pressable
                key={m.id}
                onPress={() => onChange({ paymentType: m.id })}
                style={[
                  styles.methodButton,
                  {
                    backgroundColor: on ? theme.selectedSurface : theme.surface,
                    borderColor: on ? theme.selectedBorder : theme.border,
                  },
                ]}
              >
                <Icon name={m.icon} size={16} color={on ? theme.selectedText : theme.textPrimary} />
                <Text style={[styles.methodLabel, { color: on ? theme.selectedText : theme.textPrimary }]}>{m.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {draft.paymentType === 'Bank' ? (
          <>
            <View style={styles.wrapRow}>
              {PURCHASE_BANKS.map((b) => (
                <Pill key={b} label={b} on={draft.bankName === b} onPress={() => onChange({ bankName: b })} theme={theme} />
              ))}
              <Pill
                label="Other"
                on={bankIsOther}
                onPress={() => onChange({ bankName: bankIsOther ? draft.bankName : OTHER })}
                theme={theme}
              />
            </View>
            {bankIsOther ? (
              <TextField
                value={draft.bankName === OTHER ? '' : draft.bankName}
                onChangeText={(v) => onChange({ bankName: v === '' ? OTHER : v })}
                placeholder="Type bank name"
                autoCapitalize="words"
              />
            ) : null}
          </>
        ) : null}
      </Field>

      {/* VAT bill — tri-state, matching the reference's Yes / No / N/A select. */}
      <Field label="VAT bill">
        <View style={styles.row8}>
          {VAT_OPTIONS.map((o) => (
            <Segment
              key={o.id}
              label={o.label}
              on={draft.vatBill === o.value}
              onPress={() => onChange({ vatBill: o.value })}
              theme={theme}
            />
          ))}
        </View>
        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          {draft.vatBill === true
            ? '13% input VAT is added on top and stays recoverable.'
            : draft.vatBill === false
              ? 'The supplier issued a bill, but not a VAT one.'
              : 'No bill on file — nothing recoverable.'}
        </Text>
      </Field>

      {/* Line items */}
      <View style={styles.group}>
        <View style={styles.lineHeader}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>Line items</Text>
          <Pressable onPress={addLine} hitSlop={8} style={styles.addLineBtn}>
            <Icon name="plus" size={13} color={theme.link} />
            <Text style={[styles.addLineText, { color: theme.link }]}>Add line</Text>
          </Pressable>
        </View>

        {lines.map((l, i) => (
          <LineCard
            key={l.key}
            line={l}
            index={i}
            canRemove={lines.length > 1}
            onPatch={patchLine}
            onRemove={removeLine}
            theme={theme}
          />
        ))}
      </View>

      {/* Discount */}
      <Field label="Discount · NPR">
        <AmountInput value={draft.discountAmt} onChangeText={(v) => onChange({ discountAmt: v })} placeholder="0" theme={theme} />
      </Field>

      {/* Taxable override — only means anything on a VAT bill. */}
      {draft.vatBill === true ? (
        <Field label="Taxable amount · NPR">
          <AmountInput
            value={draft.taxableAmt}
            onChangeText={(v) => onChange({ taxableAmt: v })}
            placeholder={String(totals.net)}
            theme={theme}
          />
          <Text style={[styles.hint, { color: theme.textSecondary }]}>
            Leave blank to charge VAT on the whole net amount. Set it when the bill splits taxable from non-taxable lines.
          </Text>
        </Field>
      ) : null}

      {/* Status */}
      <Field label="Status">
        <View style={styles.row8}>
          {STATUS_OPTIONS.map((id) => {
            const s = STATUS[id];
            const on = draft.status === id;
            return (
              <Pressable
                key={id}
                onPress={() => onChange({ status: id })}
                style={[styles.statusButton, { backgroundColor: on ? s.bg : theme.surface, borderColor: on ? s.dot : theme.border }]}
              >
                <Text style={[styles.statusLabel, { color: on ? s.fg : theme.textPrimary }]}>{s.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Field>

      {/* Totals */}
      <View style={[styles.totalsCard, { backgroundColor: theme.surfaceRaised, borderColor: theme.border }]}>
        <TotalRow label="Subtotal" value={totals.subtotal} theme={theme} />
        {totals.discount > 0 ? <TotalRow label="Discount" value={-totals.discount} theme={theme} /> : null}
        <TotalRow label="Net amount" value={totals.net} theme={theme} />
        {draft.vatBill === true && totals.taxable !== totals.net ? (
          <TotalRow label="Taxable" value={totals.taxable} theme={theme} />
        ) : null}
        {draft.vatBill === true ? <TotalRow label="VAT · 13%" value={totals.vat} theme={theme} /> : null}
        <View style={[styles.grandRow, { borderTopColor: theme.border }]}>
          <Text style={[styles.grandLabel, { color: theme.textPrimary }]}>Grand total</Text>
          <Money npr={totals.grandTotal} size={16} align="right" />
        </View>
      </View>

      <Pressable
        onPress={onSave}
        disabled={!ready}
        style={[styles.saveButton, { backgroundColor: ready ? theme.accent : theme.draftWash }]}
      >
        <Text style={[styles.saveLabel, tabularNums, { color: ready ? theme.accentText : theme.draftWashText }]}>
          {ready
            ? `${editing ? 'Save changes' : 'Post'} · रु ${Math.round(totals.grandTotal).toLocaleString('en-IN')}`
            : 'Add a party and a line item'}
        </Text>
      </Pressable>

      {editing && onDelete ? <Button label="Delete purchase" variant="dangerOutline" onPress={onDelete} /> : null}
    </BottomSheet>
  );
}

/**
 * One particular. Memoised on the line itself, so typing in one row doesn't
 * re-render every other row's `TextInput` underneath the keyboard.
 */
const LineCard = memo(function LineCard({
  line,
  index,
  canRemove,
  onPatch,
  onRemove,
  theme,
}: {
  line: PurchaseDraftLine;
  index: number;
  canRemove: boolean;
  onPatch: (index: number, patch: Partial<PurchaseDraftLine>) => void;
  onRemove: (index: number) => void;
  theme: Theme;
}) {
  const unitIsOther = line.unit !== '' && !PURCHASE_UNITS.includes(line.unit as (typeof PURCHASE_UNITS)[number]);

  return (
    <View style={[styles.lineCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.lineTopRow}>
        <TextInput
          value={line.particulars}
          onChangeText={(v) => onPatch(index, { particulars: v })}
          placeholder="Particulars"
          placeholderTextColor={theme.textSecondary}
          style={[styles.lineParticulars, { color: theme.textPrimary }]}
        />
        {canRemove ? (
          <Pressable onPress={() => onRemove(index)} hitSlop={10}>
            <Icon name="x" size={15} color={theme.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.lineNumRow}>
        <NumCell label="Qty" value={line.quantity} onChangeText={(v) => onPatch(index, { quantity: v })} theme={theme} />
        <NumCell label="Rate" value={line.rate} onChangeText={(v) => onPatch(index, { rate: v })} theme={theme} />
        {/* Independently editable: a lump-sum line has no qty × rate behind it. */}
        <NumCell label="Amount" value={line.amount} onChangeText={(v) => onPatch(index, { amount: v })} theme={theme} emphasis />
      </View>

      <View style={styles.wrapRowTight}>
        {PURCHASE_UNITS.map((u) => {
          const on = line.unit === u;
          return (
            <Pressable
              key={u}
              onPress={() => onPatch(index, { unit: u })}
              style={[
                styles.unitChip,
                {
                  backgroundColor: on ? theme.selectedSurface : 'transparent',
                  borderColor: on ? theme.selectedBorder : theme.border,
                },
              ]}
            >
              <Text style={[styles.unitText, { color: on ? theme.selectedText : theme.textSecondary }]}>{u}</Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => onPatch(index, { unit: unitIsOther ? line.unit : OTHER })}
          style={[
            styles.unitChip,
            {
              backgroundColor: unitIsOther ? theme.selectedSurface : 'transparent',
              borderColor: unitIsOther ? theme.selectedBorder : theme.border,
            },
          ]}
        >
          <Text style={[styles.unitText, { color: unitIsOther ? theme.selectedText : theme.textSecondary }]}>other</Text>
        </Pressable>
      </View>

      {unitIsOther ? (
        <TextInput
          value={line.unit === OTHER ? '' : line.unit}
          onChangeText={(v) => onPatch(index, { unit: v === '' ? OTHER : v })}
          placeholder="Type a unit"
          placeholderTextColor={theme.textSecondary}
          style={[styles.otherUnitInput, { color: theme.textPrimary, borderColor: theme.border }]}
        />
      ) : null}
    </View>
  );
});

function NumCell({
  label,
  value,
  onChangeText,
  theme,
  emphasis = false,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  theme: Theme;
  emphasis?: boolean;
}) {
  return (
    <View style={styles.numCell}>
      <Text style={[styles.numLabel, { color: theme.textSecondary }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="0"
        keyboardType="decimal-pad"
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.numInput,
          tabularNums,
          { color: theme.textPrimary, borderColor: theme.border, fontWeight: emphasis ? '700' : '500' },
        ]}
      />
    </View>
  );
}

function AmountInput({
  value,
  onChangeText,
  placeholder,
  theme,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  theme: Theme;
}) {
  return (
    <View style={[styles.amountRow, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      <Text style={[styles.rupeeSign, { color: theme.textSecondary }]}>रु</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType="decimal-pad"
        placeholderTextColor={theme.textSecondary}
        style={[styles.discountInput, { color: theme.textPrimary }]}
      />
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.group}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
      {children}
    </View>
  );
}

function Chip({ label, on, onPress, theme }: { label: string; on: boolean; onPress: () => void; theme: Theme }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: on ? theme.selectedSurface : theme.surface, borderColor: on ? theme.selectedBorder : theme.border },
      ]}
    >
      <Text style={[styles.chipLabel, { color: on ? theme.selectedText : theme.textPrimary }]}>{label}</Text>
    </Pressable>
  );
}

function Pill({ label, on, onPress, theme }: { label: string; on: boolean; onPress: () => void; theme: Theme }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.pill, { backgroundColor: on ? theme.accentWash : theme.surface, borderColor: on ? theme.accent : theme.border }]}
    >
      <Text style={[styles.pillLabel, { color: on ? theme.accentWashText : theme.textPrimary }]}>{label}</Text>
    </Pressable>
  );
}

function Segment({ label, on, onPress, theme }: { label: string; on: boolean; onPress: () => void; theme: Theme }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.segment,
        { backgroundColor: on ? theme.selectedSurface : theme.surface, borderColor: on ? theme.selectedBorder : theme.border },
      ]}
    >
      <Text style={[styles.segmentLabel, { color: on ? theme.selectedText : theme.textPrimary }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function TotalRow({ label, value, theme }: { label: string; value: number; theme: Theme }) {
  return (
    <View style={styles.totalRow}>
      <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[styles.totalValue, tabularNums, { color: theme.textPrimary }]}>
        {value < 0 ? '−' : ''}रु {Math.abs(Math.round(value)).toLocaleString('en-IN')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  label: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.11 * 10, textTransform: 'uppercase' },
  hint: { fontSize: 11.5, lineHeight: 11.5 * 1.4 },
  chipRow: { gap: 7, paddingVertical: 1 },
  chip: { height: 40, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipLabel: { fontFamily: fontFamily.semibold, fontSize: 13 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  wrapRowTight: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  row8: { flexDirection: 'row', gap: 8 },
  pill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  pillLabel: { fontFamily: fontFamily.semibold, fontSize: 12.5 },
  segment: { flex: 1, height: 44, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segmentLabel: { fontFamily: fontFamily.semibold, fontSize: 13 },
  lineHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addLineBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addLineText: { fontFamily: fontFamily.semibold, fontSize: 12.5 },
  lineCard: { borderRadius: 14, borderWidth: 1, padding: 12, gap: 10 },
  lineTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lineParticulars: { flex: 1, fontSize: 14.5, fontWeight: '600', padding: 0 },
  lineNumRow: { flexDirection: 'row', gap: 8 },
  numCell: { flex: 1, gap: 4 },
  numLabel: { fontFamily: fontFamily.mono, fontSize: 9, letterSpacing: 0.1 * 9, textTransform: 'uppercase' },
  numInput: { height: 42, borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, fontSize: 14, textAlign: 'center' },
  unitChip: { paddingHorizontal: 8, height: 26, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  unitText: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  otherUnitInput: { height: 38, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, fontSize: 13 },
  methodButton: { flex: 1, height: 50, borderRadius: 13, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  methodLabel: { fontFamily: fontFamily.semibold, fontSize: 13.5 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, paddingHorizontal: 16, borderRadius: radii.lg - 2, borderWidth: 1 },
  rupeeSign: { fontFamily: fontFamily.mono, fontSize: 14 },
  discountInput: { flex: 1, fontSize: 18, fontWeight: '600', padding: 0 },
  statusButton: { flex: 1, height: 44, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  statusLabel: { fontFamily: fontFamily.semibold, fontSize: 13 },
  totalsCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  totalLabel: { fontFamily: fontFamily.mono, fontSize: 10.5, letterSpacing: 0.08 * 10.5, textTransform: 'uppercase' },
  totalValue: { fontSize: 13.5, fontWeight: '600' },
  grandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1.5, paddingTop: 10, marginTop: 2 },
  grandLabel: { fontFamily: fontFamily.semibold, fontSize: 14 },
  saveButton: { height: 54, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  saveLabel: { fontSize: 15.5, fontWeight: '600' },
});
