import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { DateField } from '@/components/ui/date-field';
import { Icon } from '@/components/ui/icon';
import { TextField } from '@/components/ui/text-field';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, radii, tabularNums } from '@/theme';
import { CLIENTS, DOC_UNITS, PAN_REQUIRED_ABOVE_NPR, RATES } from '@/data/billing/mock';
import type { DiscountMode, DocCurrency, Invoice, InvoiceStatusFull, Quotation } from '@/data/billing/types';
import { calcTotals, clientNameOf, money, n0, statusFull } from '@/data/billing/utils';

export interface InvoiceDraftLine {
  desc: string;
  qty: string;
  unit: string;
  rate: string;
}

export interface InvoiceDraft {
  id: string | null;
  clientName: string;
  clientPAN: string;
  clientPhone: string;
  clientAddress: string;
  cur: DocCurrency;
  so: string;
  lines: InvoiceDraftLine[];
  applyVAT: boolean;
  discountMode: DiscountMode;
  discountPct: string;
  discountFlatAmt: string;
  issuedISO: string;
  dueISO: string;
  paymentTerms: string;
  paymentType: 'Cash' | 'Bank' | 'Credit';
  bankName: string;
  /**
   * The document's real status, not just the two the picker offers — a Paid or
   * Cancelled invoice has to survive an edit that never touches the picker.
   */
  status: InvoiceStatusFull;
  /** What `status` was when the sheet opened; a save only writes it if these differ. */
  statusAtOpen: InvoiceStatusFull;
  note: string;
}

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export function emptyInvoiceLine(): InvoiceDraftLine {
  return { desc: '', qty: '', unit: 'Pcs', rate: '' };
}

export function emptyInvoiceDraft(): InvoiceDraft {
  return {
    id: null,
    clientName: '',
    clientPAN: '',
    clientPhone: '',
    clientAddress: '',
    cur: 'NPR',
    so: '',
    lines: [emptyInvoiceLine(), emptyInvoiceLine()],
    applyVAT: true,
    discountMode: 'pct',
    discountPct: '',
    discountFlatAmt: '',
    issuedISO: today(),
    dueISO: plusDays(30),
    paymentTerms: 'Net 30',
    paymentType: 'Cash',
    bankName: 'Nabil Bank',
    status: 'Draft',
    statusAtOpen: 'Draft',
    note: '',
  };
}

const toNum = (s: string) => parseFloat(s.replace(/[^0-9.]/g, '')) || 0;
const BANKS = ['Nabil Bank', 'Sanima Bank', 'NIC Asia', 'Global IME'];

/** Prefill the editor from a saved invoice (Edit + deep-link autoEdit). */
export function draftFromInvoice(v: Invoice): InvoiceDraft {
  const real = statusFull(v);
  return {
    id: v.id,
    clientName: clientNameOf(v),
    clientPAN: v.clientPAN ?? '',
    clientPhone: v.clientPhone ?? '',
    clientAddress: v.clientAddress ?? '',
    cur: v.cur === 'GBP' ? 'GBP' : 'NPR',
    so: v.so,
    lines: v.lines.length
      ? v.lines.map((l) => ({ desc: l.desc, qty: String(l.qty), unit: l.unit ?? 'Pcs', rate: String(l.rate) }))
      : [emptyInvoiceLine(), emptyInvoiceLine()],
    applyVAT: v.applyVAT ?? !v.export,
    discountMode: v.discountMode ?? 'pct',
    discountPct: v.discountPct ? String(v.discountPct) : '',
    discountFlatAmt: v.discountFlatAmt ? String(v.discountFlatAmt) : '',
    issuedISO: v.issuedISO ?? today(),
    dueISO: v.dueISO ?? today(),
    paymentTerms: v.paymentTerms ?? v.terms,
    paymentType: v.paymentType ?? 'Cash',
    bankName: v.bankName ?? 'Nabil Bank',
    status: real,
    statusAtOpen: real,
    note: v.note ?? '',
  };
}

/**
 * Convert a quotation into a new-invoice draft (item 15). GBP quotations are
 * converted to NPR at the billing module's booked `RATES.GBP`; VAT is switched
 * on (a quotation carries none) and terms reset to Net 30.
 */
export function draftFromQuotation(q: Quotation): InvoiceDraft {
  const toNPR = q.currency === 'GBP';
  const conv = (n: number) => (toNPR ? Math.round(n * RATES.GBP) : n);
  return {
    ...emptyInvoiceDraft(),
    clientName: q.clientName,
    clientPAN: q.clientPAN,
    clientPhone: q.clientPhone,
    clientAddress: q.clientAddress,
    cur: 'NPR',
    lines: q.lines.map((l) => ({ desc: l.desc, qty: String(l.qty), unit: l.unit || 'Pcs', rate: String(conv(l.rate)) })),
    applyVAT: true,
    discountMode: q.discountMode,
    discountPct: q.discountPct ? String(q.discountPct) : '',
    discountFlatAmt: q.discountFlatAmt ? String(conv(q.discountFlatAmt)) : '',
    paymentTerms: 'Net 30',
    paymentType: 'Bank',
    status: 'Sent',
    note: q.note ? `Converted from ${q.number}. ${q.note}` : `Converted from ${q.number}.`,
  };
}

export interface InvoiceSheetProps {
  visible: boolean;
  draft: InvoiceDraft;
  nextNumber: string;
  onClose: () => void;
  onChange: (patch: Partial<InvoiceDraft>) => void;
  onSave: () => void;
  /** Offered while editing an invoice nothing has been paid against. */
  onCancelInvoice?: () => void;
}

export function InvoiceSheet({ visible, draft, nextNumber, onClose, onChange, onSave, onCancelInvoice }: InvoiceSheetProps) {
  const theme = useTheme();

  const editing = draft.id !== null;
  const cur = draft.cur;
  const nprRate = cur === 'GBP' ? RATES.GBP : 1;

  const totals = calcTotals(
    draft.lines.map((l) => ({ desc: l.desc, unit: l.unit, qty: toNum(l.qty), rate: toNum(l.rate) })),
    draft.applyVAT,
    draft.discountMode,
    toNum(draft.discountPct),
    toNum(draft.discountFlatAmt),
  );
  const nprTotal = totals.total * nprRate;
  const panRequired = nprTotal > PAN_REQUIRED_ABOVE_NPR;
  const panMissing = panRequired && draft.clientPAN.trim().length === 0;
  const ready = draft.clientName.trim().length > 0 && totals.subtotal > 0 && !panMissing;

  const patchLine = (i: number, patch: Partial<InvoiceDraftLine>) =>
    onChange({ lines: draft.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) });
  const addLine = () => onChange({ lines: [...draft.lines, emptyInvoiceLine()] });
  const removeLine = (i: number) => onChange({ lines: draft.lines.filter((_, idx) => idx !== i) });

  return (
    <BottomSheet visible={visible} onClose={onClose} title={editing ? 'Edit invoice' : 'New invoice'} maxHeight={780}>
      <Text style={[styles.numberHint, { color: theme.textSecondary }]}>
        {editing ? `Editing ${nextNumber}` : 'The invoice number is assigned when you save'}
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

      <View style={styles.group}>
        <TextField label="Client PAN / VAT" value={draft.clientPAN} onChangeText={(v) => onChange({ clientPAN: v })} placeholder="Registration no." compact />
        {panRequired ? (
          <Text style={[styles.panNote, { color: panMissing ? theme.dangerWashText : theme.textSecondary }]}>
            {panMissing
              ? `PAN required — invoice total ${n0(nprTotal)} NPR is over the ${n0(PAN_REQUIRED_ABOVE_NPR)} IRD threshold`
              : 'PAN on file — IRD threshold met'}
          </Text>
        ) : null}
      </View>
      <TextField label="Client phone" value={draft.clientPhone} onChangeText={(v) => onChange({ clientPhone: v })} placeholder="Phone" compact />
      <TextField label="Client address" value={draft.clientAddress} onChangeText={(v) => onChange({ clientAddress: v })} placeholder="Billing address" compact />
      <TextField label="Sales order" value={draft.so} onChangeText={(v) => onChange({ so: v })} placeholder="SO-0000" compact />

      {/* Currency */}
      <View style={styles.group}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Currency</Text>
        <View style={styles.segRow}>
          {(['NPR', 'GBP'] as DocCurrency[]).map((c) => {
            const on = draft.cur === c;
            return (
              <Pressable
                key={c}
                onPress={() => onChange({ cur: c })}
                style={[styles.segButton, { backgroundColor: on ? theme.selectedSurface : theme.surface, borderColor: on ? theme.selectedBorder : theme.border }]}
              >
                <Text style={[styles.segLabel, { color: on ? theme.selectedText : theme.textPrimary }]}>{c}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Dates */}
      <View style={styles.dateRowWrap}>
        <DateField
          label="Issued"
          value={draft.issuedISO}
          onChange={(iso) => onChange({ issuedISO: iso })}
          pickerTitle="Issue date"
          compact
          style={styles.dateCol}
        />
        <DateField
          label="Due"
          value={draft.dueISO}
          onChange={(iso) => onChange({ dueISO: iso })}
          pickerTitle="Due date"
          compact
          style={styles.dateCol}
        />
      </View>

      <TextField label="Payment terms" value={draft.paymentTerms} onChangeText={(v) => onChange({ paymentTerms: v })} placeholder="Net 30" compact />

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

      {/* VAT toggle */}
      <Pressable
        onPress={() => onChange({ applyVAT: !draft.applyVAT })}
        style={[styles.billRow, { backgroundColor: draft.applyVAT ? theme.accentWash : theme.surfaceRaised, borderColor: draft.applyVAT ? theme.accent : theme.border }]}
      >
        <View style={[styles.billIcon, { backgroundColor: theme.accentWash }]}>
          <Icon name="percent" size={17} color={theme.accentWashText} />
        </View>
        <View style={styles.billTextWrap}>
          <Text style={[styles.billTitle, { color: theme.textPrimary }]}>{draft.applyVAT ? 'VAT · 13% applied' : 'No VAT (zero-rated / export)'}</Text>
          <Text style={[styles.billHint, { color: theme.textSecondary }]}>Tap to {draft.applyVAT ? 'zero-rate this invoice' : 'charge 13% VAT'}</Text>
        </View>
      </Pressable>

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

      {/* Payment type */}
      <View style={styles.group}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Payment routes to</Text>
        <View style={styles.segRow}>
          {(['Cash', 'Bank', 'Credit'] as const).map((p) => {
            const on = draft.paymentType === p;
            return (
              <Pressable
                key={p}
                onPress={() => onChange({ paymentType: p })}
                style={[styles.segButton, { backgroundColor: on ? theme.selectedSurface : theme.surface, borderColor: on ? theme.selectedBorder : theme.border }]}
              >
                <Text style={[styles.segLabel, { color: on ? theme.selectedText : theme.textPrimary }]}>{p}</Text>
              </Pressable>
            );
          })}
        </View>
        {draft.paymentType === 'Bank' ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {BANKS.map((b) => {
              const on = draft.bankName === b;
              return (
                <Pressable
                  key={b}
                  onPress={() => onChange({ bankName: b })}
                  style={[styles.chip, { backgroundColor: on ? theme.accentWash : theme.surface, borderColor: on ? theme.accent : theme.border }]}
                >
                  <Text style={[styles.chipLabel, { color: on ? theme.accentWashText : theme.textPrimary }]}>{b}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
      </View>

      {/* Status */}
      <View style={styles.group}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Status</Text>
        <View style={styles.segRow}>
          {(['Draft', 'Sent'] as const).map((s) => {
            const on = draft.status === s;
            return (
              <Pressable
                key={s}
                onPress={() => onChange({ status: s })}
                style={[styles.segButton, { backgroundColor: on ? theme.accentWash : theme.surface, borderColor: on ? theme.accent : theme.border }]}
              >
                <Text style={[styles.segLabel, { color: on ? theme.accentWashText : theme.textPrimary }]}>{s}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          {draft.status === 'Draft' || draft.status === 'Sent'
            ? 'Partial / Paid / Overdue are set automatically from payments and the due date.'
            : `Currently ${draft.status} — set from payments and the due date. Saving leaves it as it is.`}
        </Text>
      </View>

      {/* Note */}
      <View style={styles.group}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Notes</Text>
        <TextInput
          value={draft.note}
          onChangeText={(v) => onChange({ note: v })}
          multiline
          placeholder="Bank details, remarks…"
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
        {draft.applyVAT ? <TotalRow label="VAT · 13%" value={money(cur, totals.vatAmt)} theme={theme} /> : null}
        <View style={[styles.grandRow, { borderTopColor: theme.border }]}>
          <Text style={[styles.grandLabel, { color: theme.textPrimary }]}>Grand total</Text>
          <Text style={[styles.grandValue, tabularNums, { color: theme.textPrimary }]}>{money(cur, totals.total)}</Text>
        </View>
        {cur === 'GBP' ? <Text style={[styles.vatNote, { color: theme.textSecondary }]}>≈ {n0(nprTotal)} NPR at {RATES.GBP}</Text> : null}
      </View>

      <Pressable onPress={onSave} disabled={!ready} style={[styles.saveButton, { backgroundColor: ready ? theme.accent : theme.draftWash }]}>
        <Text style={[styles.saveLabel, tabularNums, { color: ready ? theme.accentText : theme.draftWashText }]}>
          {panMissing
            ? 'Add the client PAN to continue'
            : ready
              ? `${editing ? 'Save changes' : 'Create invoice'} · ${money(cur, totals.total)}`
              : 'Add a client and a line item'}
        </Text>
      </Pressable>

      {editing && onCancelInvoice ? (
        <Pressable onPress={onCancelInvoice} style={[styles.cancelButton, { borderColor: theme.danger }]}>
          <Text style={[styles.cancelLabel, { color: theme.dangerWashText }]}>Cancel this invoice</Text>
        </Pressable>
      ) : null}

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
  panNote: { fontSize: 11, lineHeight: 11 * 1.4 },
  segRow: { flexDirection: 'row', gap: 8 },
  segButton: { flex: 1, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  segLabel: { fontFamily: fontFamily.semibold, fontSize: 13 },
  segRowSmall: { flexDirection: 'row', gap: 6 },
  segChip: { width: 44, height: 28, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  segChipText: { fontFamily: fontFamily.mono, fontSize: 11 },
  dateRowWrap: { flexDirection: 'row', gap: 10 },
  dateCol: { flex: 1, gap: 8 },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 50, paddingHorizontal: 14, borderRadius: radii.lg - 2, borderWidth: 1 },
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
  billRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1.5, padding: 14 },
  billIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  billTextWrap: { flex: 1, gap: 2, minWidth: 0 },
  billTitle: { fontSize: 13.5, fontWeight: '600' },
  billHint: { fontSize: 11, lineHeight: 11 * 1.4 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, paddingHorizontal: 16, borderRadius: radii.lg - 2, borderWidth: 1 },
  rupeeSign: { fontFamily: fontFamily.mono, fontSize: 14 },
  discountInput: { flex: 1, fontSize: 18, fontWeight: '600', padding: 0 },
  hint: { fontSize: 11, lineHeight: 11 * 1.4 },
  multiline: { minHeight: 64, borderWidth: 1, borderRadius: radii.md, padding: 12, fontSize: 13, textAlignVertical: 'top' },
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
  cancelButton: { height: 48, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cancelLabel: { fontSize: 14.5, fontWeight: '600' },
});
