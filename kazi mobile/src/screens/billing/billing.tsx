import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { useAuth } from '@/auth/auth-context';
import { useToast } from '@/components/toast/toast-provider';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { HeaderAccount } from '@/components/ui/header-account';
import { Icon } from '@/components/ui/icon';
import { PermissionNotice } from '@/components/ui/permission-notice';
import { CollapsedSection } from '@/components/ui/collapsed-section';
import { isBlocked, ScreenGate } from '@/components/ui/screen-gate';
import { useModulePresentation } from '@/components/tab-bar/use-own-tab';
import { useBackHandler } from '@/lib/use-back-handler';
import { useScrollTop } from '@/lib/use-scroll-top';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ViewSwap } from '@/components/ui/view-swap';
import { TextField } from '@/components/ui/text-field';
import { toCSV } from '@/lib/export/csv';
import { challanDocData, invoiceDocData, quotationDocData } from '@/lib/pdf/doc-data';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import {
  useAddChallan,
  useAddInvoice,
  useAddPayment,
  useAddQuotation,
  useChallans,
  useInvoices,
  useOpenChallans,
  useQuotations,
  useRemoveOpenChallan,
  useRestoreChallans,
  useRestoreInvoices,
  useRestoreQuotations,
  useUpdateChallan,
  useUpdateInvoice,
  useUpdateQuotation,
} from '@/data/billing/hooks';
import { CLIENTS, RATES, SYM } from '@/data/billing/mock';
import type {
  BillingFilter,
  BillingView,
  Challan,
  ChallanStatus,
  DocType,
  Invoice,
  InvoiceLine,
  InvoiceStatusFull,
  OpenChallan,
  Payment,
  Quotation,
  QuotationStatus,
} from '@/data/billing/types';
import { allocateDocNumber } from '@/data/billing/doc-numbers';
import { appliesVAT, balance, clientNameOf, money, n0, npr, nprOf, paid, statusFull, total, vat } from '@/data/billing/utils';
import { useMoneySignature } from '@/lib/money';

import { ChallansSheet } from './challans-sheet';
import { DocList } from './doc-list';
import { DocSheet, draftFromDoc, emptyDocDraft, type DocDraft } from './doc-sheet';
import { DocTypeSwitch } from './doc-type-switch';
import { DocViewer } from './doc-viewer';
import { InvoiceSheet, draftFromInvoice, draftFromQuotation, emptyInvoiceDraft, type InvoiceDraft } from './invoice-sheet';
import { InvoiceRow } from './invoice-row';
import { PaySheet, type PayDraft } from './pay-sheet';
import { Summary } from './summary';

const SHOW_FX = true;

function emptyPayDraft(invoice: Invoice): PayDraft {
  return { amount: '', cur: invoice.cur, method: invoice.cur === 'NPR' ? 'cash' : 'bank', acct: 'nic', ref: '' };
}

export interface BillingProps {
  /** Deep link (item 15): an invoice id or ref (e.g. `INV-1043`) to open on mount. */
  focus?: string;
  /** With `focus`, also open the edit sheet for that invoice. */
  autoEdit?: boolean;
}

/**
 * Outermost first — `ViewSwap` reads the direction of travel from this. An
 * invoice and a challan/quotation are both one level down from the list.
 */
const BILLING_VIEW_ORDER = ['list', 'detail', 'doc'] as const;

export function Billing({ focus, autoEdit }: BillingProps = {}) {
  const theme = useTheme();
  // Money is formatted by plain functions (`@/lib/money`), so this is what
  // re-renders the screen when the currency preference or the rate changes.
  useMoneySignature();
  const toast = useToast();
  const { profile, can } = useAuth();
  const canEdit = can('billing');
  // A tab for this position means this screen is a root destination, so the
  // header's back chevron would have nothing to go back to.
  const { showBack, bottomInset } = useModulePresentation('billing');
  const createdBy = profile?.name ?? 'You';

  const invoicesQuery = useInvoices();
  const { data: invoices } = invoicesQuery;
  const openChallansQuery = useOpenChallans();
  const { data: openChallans } = openChallansQuery;
  const challansQuery = useChallans();
  const { data: challans } = challansQuery;
  const quotationsQuery = useQuotations();
  const { data: quotations } = quotationsQuery;
  const addInvoice = useAddInvoice();
  const updateInvoice = useUpdateInvoice();
  const addPayment = useAddPayment();
  const restoreInvoices = useRestoreInvoices();
  const removeOpenChallan = useRemoveOpenChallan();
  const addChallan = useAddChallan();
  const updateChallan = useUpdateChallan();
  const restoreChallans = useRestoreChallans();
  const addQuotation = useAddQuotation();
  const updateQuotation = useUpdateQuotation();
  const restoreQuotations = useRestoreQuotations();

  const [docType, setDocType] = useState<DocType>('invoice');
  const scrollRef = useScrollTop(docType);
  const [view, setView] = useState<BillingView>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<BillingFilter>('all');
  const [sheet, setSheet] = useState<'challans' | 'pay' | null>(null);
  const [payDraft, setPayDraft] = useState<PayDraft | null>(null);
  const [docStatusFilter, setDocStatusFilter] = useState('all');
  const [openDoc, setOpenDoc] = useState<{ kind: 'challan' | 'quotation'; id: string } | null>(null);
  const [docSheet, setDocSheet] = useState<'challan' | 'quotation' | null>(null);
  const [docEditId, setDocEditId] = useState<string | null>(null);
  const [docDraft, setDocDraft] = useState<DocDraft>(emptyDocDraft('challan'));
  const [invoiceSheetOpen, setInvoiceSheetOpen] = useState(false);
  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceDraft>(emptyInvoiceDraft());
  const [convertQuoteId, setConvertQuoteId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [focusHandled, setFocusHandled] = useState(false);

  // Detail, document viewer and the invoice/challan/quotation switch are all
  // views inside this one route, so system back has to unwind them itself —
  // outermost layer first, mirroring the order they are rendered in below.
  useBackHandler(() => {
    if (view === 'detail') {
      setView('list');
      setSelectedId(null);
      setSheet(null);
      return true;
    }
    if (openDoc) {
      setOpenDoc(null);
      return true;
    }
    if (docType !== 'invoice') {
      setDocType('invoice');
      return true;
    }
    return false;
  });

  // Deep link (item 15): open (and optionally edit) a specific invoice as soon
  // as the invoices arrive. Applied during render — one shot, latched by
  // `focusHandled` — so the deep-linked document is what the screen first draws
  // rather than the list flashing past on the way to it.
  if (!focusHandled && focus && invoices) {
    const key = String(focus).toLowerCase();
    const match = invoices.find((v) => v.id.toLowerCase() === key || v.ref.toLowerCase() === key);
    if (match) {
      setFocusHandled(true);
      setDocType('invoice');
      setView('detail');
      setSelectedId(match.id);
      if (autoEdit && can('billing')) {
        setConvertQuoteId(null);
        setInvoiceDraft(draftFromInvoice(match));
        setInvoiceSheetOpen(true);
      }
    }
  }

  if (isBlocked(invoicesQuery, openChallansQuery, challansQuery, quotationsQuery) || !invoices || !openChallans || !challans || !quotations) return (
      <ScreenGate
        queries={[invoicesQuery, openChallansQuery, challansQuery, quotationsQuery]}
        header={<ScreenHeader title="Billing" showBack={showBack} rightSlot={<HeaderAccount />} />}
      />
    );

  const docCounts: Record<DocType, number> = { invoice: invoices.length, challan: challans.length, quotation: quotations.length };
  const activeDoc =
    openDoc?.kind === 'challan'
      ? (challans.find((c) => c.id === openDoc.id) ?? null)
      : openDoc?.kind === 'quotation'
        ? (quotations.find((q) => q.id === openDoc.id) ?? null)
        : null;

  const openNewDoc = (kind: 'challan' | 'quotation') => {
    setDocEditId(null);
    setDocDraft(emptyDocDraft(kind));
    setDocSheet(kind);
  };

  /** Edit an existing challan/quotation — the same form, including its status. */
  const openEditDoc = (doc: Challan | Quotation, kind: 'challan' | 'quotation') => {
    setDocEditId(doc.id);
    setDocDraft(draftFromDoc(doc));
    setDocSheet(kind);
  };

  const handleSaveDoc = async () => {
    if (!docSheet) return;
    const toNum = (s: string) => parseFloat(s.replace(/[^0-9.]/g, '')) || 0;
    const lines = docDraft.lines
      .filter((l) => l.desc.trim() || l.qty || l.rate)
      .map((l) => ({ desc: l.desc.trim(), qty: toNum(l.qty), unit: l.unit, rate: toNum(l.rate) }));
    if (!docDraft.clientName.trim() || lines.length === 0) {
      toast.show({ message: 'Add a client and at least one line item', tone: 'bad' });
      return;
    }
    const base = {
      date: docDraft.date,
      clientName: docDraft.clientName.trim(),
      clientPAN: docDraft.clientPAN.trim(),
      clientPhone: docDraft.clientPhone.trim(),
      clientAddress: docDraft.clientAddress.trim(),
      lines,
      discountMode: docDraft.discountMode,
      discountPct: toNum(docDraft.discountPct),
      discountFlatAmt: toNum(docDraft.discountFlatAmt),
      note: docDraft.note.trim(),
      createdBy,
    };

    // Editing an existing document: patch it in place, status included.
    if (docEditId) {
      if (docSheet === 'challan') {
        const before = challans;
        const current = challans.find((c) => c.id === docEditId);
        const label = current?.number ?? 'Challan';
        updateChallan.mutate(
          {
            id: docEditId,
            updates: {
              ...base,
              status: docDraft.status as ChallanStatus,
              vehicleNo: docDraft.vehicleNo.trim(),
              driverName: docDraft.driverName.trim(),
              routeFrom: docDraft.routeFrom.trim(),
              routeTo: docDraft.routeTo.trim(),
            },
          },
          {
            onSuccess: () =>
              toast.show({
                message: `${label} updated`,
                tone: 'ok',
                action: { label: 'Undo', onPress: () => restoreChallans.mutate(before) },
              }),
            onError: () => toast.show({ message: `${label} wasn’t saved — nothing was written`, tone: 'bad' }),
          },
        );
        setDocSheet(null);
        setDocEditId(null);
      } else {
        const before = quotations;
        const current = quotations.find((q) => q.id === docEditId);
        const label = current?.number ?? 'Quotation';
        updateQuotation.mutate(
          {
            id: docEditId,
            updates: {
              ...base,
              status: docDraft.status as QuotationStatus,
              currency: docDraft.currency,
              validUntil: docDraft.validUntil,
              terms: docDraft.terms.trim(),
            },
          },
          {
            onSuccess: () =>
              toast.show({
                message: `${label} updated`,
                tone: 'ok',
                action: { label: 'Undo', onPress: () => restoreQuotations.mutate(before) },
              }),
            onError: () => toast.show({ message: `${label} wasn’t saved — nothing was written`, tone: 'bad' }),
          },
        );
        setDocSheet(null);
        setDocEditId(null);
      }
      return;
    }

    // The number is drawn from Postgres before the write, so it is the next one
    // in the live series rather than max+1 over whatever this screen loaded.
    let allocated;
    try {
      allocated = await allocateDocNumber(
        docSheet,
        docDraft.date,
        docSheet === 'challan' ? challans.map((c) => c.number) : quotations.map((q) => q.number),
      );
    } catch {
      toast.show({ message: `Couldn’t draw a ${docSheet} number — nothing was created`, tone: 'bad' });
      return;
    }
    const { number, fiscalYear } = allocated;

    if (docSheet === 'challan') {
      const before = challans;
      const challan: Challan = {
        ...base,
        id: `ch${Date.now()}`,
        number,
        status: docDraft.status as ChallanStatus,
        fiscalYear,
        vehicleNo: docDraft.vehicleNo.trim(),
        driverName: docDraft.driverName.trim(),
        routeFrom: docDraft.routeFrom.trim(),
        routeTo: docDraft.routeTo.trim(),
        relatedInvoice: '',
      };
      addChallan.mutate(challan, {
        onSuccess: () =>
          toast.show({ message: `${number} created`, tone: 'ok', action: { label: 'Undo', onPress: () => restoreChallans.mutate(before) } }),
        onError: () => toast.show({ message: `${number} wasn’t created — nothing was written`, tone: 'bad' }),
      });
      setDocSheet(null);
    } else {
      const before = quotations;
      const quotation: Quotation = {
        ...base,
        id: `qt${Date.now()}`,
        number,
        fiscalYear,
        status: docDraft.status as QuotationStatus,
        currency: docDraft.currency,
        validUntil: docDraft.validUntil,
        terms: docDraft.terms.trim(),
        relatedInvoice: '',
      };
      addQuotation.mutate(quotation, {
        onSuccess: () =>
          toast.show({ message: `${number} created`, tone: 'ok', action: { label: 'Undo', onPress: () => restoreQuotations.mutate(before) } }),
        onError: () => toast.show({ message: `${number} wasn’t created — nothing was written`, tone: 'bad' }),
      });
      setDocSheet(null);
    }
  };

  const editingDoc = docEditId
    ? (challans.find((c) => c.id === docEditId) ?? quotations.find((q) => q.id === docEditId) ?? null)
    : null;
  const docSheetNode = (
    <DocSheet
      visible={docSheet !== null}
      kind={docSheet ?? 'challan'}
      draft={docDraft}
      editing={docEditId !== null}
      nextNumber={editingDoc ? editingDoc.number : ''}
      onClose={() => {
        setDocSheet(null);
        setDocEditId(null);
      }}
      onChange={(patch) => setDocDraft((d) => ({ ...d, ...patch }))}
      onSave={handleSaveDoc}
    />
  );

  const selected = invoices.find((v) => v.id === selectedId) ?? null;
  const live = invoices.filter((v) => !v.cancelled);
  const outstandingNpr = live.reduce((n, v) => n + nprOf(v, balance(v)), 0);
  const openList = live.filter((v) => balance(v) > 0.5);

  const expo: Partial<Record<string, number>> = {};
  openList.forEach((v) => {
    if (v.cur !== 'NPR') expo[v.cur] = (expo[v.cur] ?? 0) + balance(v);
  });
  const fxExposure = Object.keys(expo).length
    ? `${Object.entries(expo)
        .map(([cur, amt]) => `${SYM[cur as Invoice['cur']]}${n0(amt ?? 0)}`)
        .join(' · ')} unconverted`
    : 'All balances in NPR';

  const collected = invoices.reduce((n, v) => n + v.payments.reduce((m, p) => m + (p.cur === 'NPR' ? p.amt : p.amt * p.rate), 0), 0);
  // VAT across the live (non-cancelled) invoices, in NPR: the headline is what
  // has been invoiced, and the collected figure allocates each invoice’s VAT in
  // proportion to how much of it has actually been paid.
  const vatInvoices = live.filter((v) => appliesVAT(v));
  const vatNpr = vatInvoices.reduce((n, v) => n + nprOf(v, vat(v)), 0);
  const vatCollectedNpr = vatInvoices.reduce((n, v) => {
    const t = total(v);
    return n + nprOf(v, vat(v) * (t > 0 ? Math.min(1, paid(v) / t) : 0));
  }, 0);

  // The book only ever uses three: every invoice is a Draft, part-paid, or
  // settled. `statusFull` can still derive Sent/Overdue/Cancelled for an odd
  // record — those keep their pill and stay reachable under All.
  const FULL_STATUSES: InvoiceStatusFull[] = ['Draft', 'Partial', 'Paid'];
  const filters: { id: BillingFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: live.length },
    ...FULL_STATUSES.map((s) => ({ id: s as BillingFilter, label: s as string, count: invoices.filter((v) => statusFull(v) === s).length })),
  ];
  const q = query.trim().toLowerCase();
  const matching = invoices
    .filter((v) => filter === 'all' || statusFull(v) === filter)
    .filter(
      (v) =>
        !q ||
        clientNameOf(v).toLowerCase().includes(q) ||
        v.ref.toLowerCase().includes(q) ||
        v.so.toLowerCase().includes(q) ||
        statusFull(v).toLowerCase().includes(q),
    );
  // Cancelled invoices stay on the books (IRD) but out of the working list —
  // they collapse into their own section at the bottom, as on the website.
  const shown = matching.filter((v) => !v.cancelled);
  const cancelledShown = matching.filter((v) => v.cancelled);

  const handleExportCsv = async () => {
    const csv = toCSV(matching, [
      { header: 'Invoice', value: (v) => v.ref },
      { header: 'Client', value: (v) => clientNameOf(v) },
      { header: 'Issued', value: (v) => v.issuedISO ?? v.issued },
      { header: 'Due', value: (v) => v.dueISO ?? v.due },
      { header: 'Status', value: (v) => statusFull(v) },
      { header: 'Currency', value: (v) => v.cur },
      { header: 'Total', value: (v) => Math.round(total(v)) },
      { header: 'Paid', value: (v) => Math.round(paid(v)) },
      { header: 'Balance', value: (v) => Math.round(balance(v)) },
      { header: 'Total NPR', value: (v) => Math.round(nprOf(v, total(v))) },
    ]);
    await Clipboard.setStringAsync(csv);
    toast.show({ message: `${matching.length} invoice${matching.length === 1 ? '' : 's'} copied as CSV`, tone: 'ok' });
  };

  const openDetail = (id: string) => {
    setView('detail');
    setSelectedId(id);
    setSheet(null);
  };
  const backToList = () => {
    setView('list');
    setSelectedId(null);
    setSheet(null);
  };

  const flash = (message: string, before?: Invoice[]) => {
    toast.show({ message, tone: 'ok', action: before ? { label: 'Undo', onPress: () => restoreInvoices.mutate(before) } : undefined });
  };

  const handleRaise = async (challan: OpenChallan) => {
    const clientLabel = challan.clientName?.trim() || CLIENTS[challan.client]?.name || 'the client';
    const issuedISO = new Date().toISOString().slice(0, 10);
    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + (challan.cur === 'NPR' ? 0 : 30));
    const dueISO = dueAt.toISOString().slice(0, 10);
    let allocated;
    try {
      allocated = await allocateDocNumber('invoice', issuedISO, invoices.map((v) => v.ref));
    } catch {
      toast.show({ message: 'Couldn’t draw an invoice number — nothing was created', tone: 'bad' });
      return;
    }
    const invoice: Invoice = {
      // Local id only: the refetch that follows the write replaces this row with
      // the real one. The drawn number is already unique, so it stands in.
      id: `n-${allocated.number}`,
      ref: allocated.number,
      fiscalYear: allocated.fiscalYear,
      client: challan.client,
      clientName: clientLabel,
      cur: challan.cur,
      rate: RATES[challan.cur],
      export: challan.cur !== 'NPR',
      // Spelled out rather than left to default: the writer only computes the
      // five stored totals when it is given every input they depend on, and a
      // live invoice row with zero totals is one the website reads as worth nil.
      applyVAT: challan.cur === 'NPR',
      discountMode: 'pct',
      discountPct: 0,
      discountFlatAmt: 0,
      explicitStatus: 'Sent',
      so: challan.so,
      issuedISO,
      dueISO,
      issued: shortDate(issuedISO),
      due: shortDate(dueISO),
      dueDays: daysUntil(dueISO),
      terms: challan.cur === 'NPR' ? 'cash on delivery' : '30 days',
      cancelled: false,
      challans: [{ no: challan.no, meta: `${challan.date} · ${n0(challan.pcs)} pcs` }],
      lines: [{ desc: challan.desc, challan: challan.no, qty: challan.pcs, rate: challan.rate }],
      relatedChallan: challan.no,
      payments: [],
    };
    addInvoice.mutate(invoice, {
      onSuccess: () => {
        // `removeOpenChallan` only drops it from the local list — the link back is
        // what keeps a billed challan out of the open list after the next refetch.
        updateChallan.mutate({ id: challan.id, updates: { relatedInvoice: invoice.ref } });
        flash(`${invoice.ref} raised for ${clientLabel} off ${challan.no}`);
      },
      onError: () => toast.show({ message: `${invoice.ref} wasn’t created — nothing was written`, tone: 'bad' }),
    });
    removeOpenChallan.mutate(challan.id);
    setSheet(null);
  };

  const openPay = () => {
    if (!selected) return;
    setPayDraft(emptyPayDraft(selected));
    setSheet('pay');
  };

  const handleSavePayment = () => {
    if (!selected || !payDraft) return;
    const amt = parseFloat(payDraft.amount.replace(/[^0-9.]/g, ''));
    if (!amt) {
      toast.show({ message: 'Enter an amount to record', tone: 'bad' });
      return;
    }
    const rate = payDraft.cur === 'NPR' ? 1 : RATES[payDraft.cur];
    const creditFx = payDraft.cur === selected.cur ? amt : payDraft.cur === 'NPR' ? amt / selected.rate : (amt * rate) / selected.rate;
    // Payment ceiling (item 14): a payment can't exceed what's still owed.
    if (creditFx > balance(selected) + 0.5) {
      toast.show({ message: `That's more than the ${money(selected.cur, balance(selected))} outstanding`, tone: 'bad' });
      return;
    }
    const prefix = payDraft.method === 'cash' ? 'CRV-01' : payDraft.method === 'bank' ? 'BRV-02' : 'CN-00';
    const totalExtra = invoices.reduce((n, v) => n + v.payments.filter((p) => p.ref.startsWith(prefix.slice(0, 3))).length, 0);
    const ref = payDraft.ref.trim() || `${prefix}${32 + totalExtra}`;
    const payment: Payment = { cur: payDraft.cur, amt, rate, method: payDraft.method, acct: payDraft.method === 'bank' ? payDraft.acct : null, ref, date: '23 Aug' };

    const before = invoices;
    addPayment.mutate({ invoiceId: selected.id, payment });
    setSheet(null);
    setPayDraft(null);

    const after = total(selected) - (paid(selected) + creditFx);
    flash(`${ref} · ${money(payDraft.cur, amt)} recorded${after < 0.5 ? ' · invoice collected in full' : ''}`, before);
  };

  // ---- Invoice create / edit / cancel (item 14) ----
  const shortDate = (iso: string) => {
    const [, m, d] = iso.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]}`;
  };
  const daysUntil = (iso: string) => Math.round((new Date(iso).getTime() - Date.now()) / 86400000);

  const openNewInvoice = () => {
    setConvertQuoteId(null);
    setInvoiceDraft(emptyInvoiceDraft());
    setInvoiceSheetOpen(true);
  };

  const openEditInvoice = (v: Invoice) => {
    setConvertQuoteId(null);
    setInvoiceDraft(draftFromInvoice(v));
    setInvoiceSheetOpen(true);
  };

  // Convert a quotation → new invoice (item 15): open the editor prefilled; the
  // quotation is marked Accepted + linked once the invoice is actually created.
  const handleConvertQuotation = (quote: Quotation) => {
    setOpenDoc(null);
    setConvertQuoteId(quote.id);
    setInvoiceDraft(draftFromQuotation(quote));
    setInvoiceSheetOpen(true);
  };

  const closeInvoiceSheet = () => {
    setInvoiceSheetOpen(false);
    setConvertQuoteId(null);
  };

  const handleSaveInvoice = async () => {
    const d = invoiceDraft;
    const toN = (s: string) => parseFloat(s.replace(/[^0-9.]/g, '')) || 0;
    const lines: InvoiceLine[] = d.lines
      .filter((l) => l.desc.trim() || l.qty || l.rate)
      .map((l) => ({ desc: l.desc.trim(), challan: '', qty: toN(l.qty), rate: toN(l.rate), unit: l.unit }));
    const nprRate = d.cur === 'GBP' ? RATES.GBP : 1;
    const sub = lines.reduce((n, l) => n + l.qty * l.rate, 0);
    const disc = d.discountMode === 'amount' ? Math.min(sub, toN(d.discountFlatAmt)) : sub * (Math.min(100, toN(d.discountPct)) / 100);
    const taxableV = sub - disc;
    const grand = taxableV + (d.applyVAT ? taxableV * 0.13 : 0);
    if (!d.clientName.trim() || lines.length === 0) {
      toast.show({ message: 'Add a client and at least one line item', tone: 'bad' });
      return;
    }
    if (grand * nprRate > 50000 && !d.clientPAN.trim()) {
      toast.show({ message: 'Client PAN is required for invoices over NPR 50,000', tone: 'bad' });
      return;
    }

    const common = {
      cur: d.cur as Invoice['cur'],
      rate: nprRate,
      export: false,
      applyVAT: d.applyVAT,
      so: d.so.trim(),
      issued: shortDate(d.issuedISO),
      due: shortDate(d.dueISO),
      dueDays: daysUntil(d.dueISO),
      issuedISO: d.issuedISO,
      dueISO: d.dueISO,
      terms: d.paymentTerms.trim(),
      paymentTerms: d.paymentTerms.trim(),
      lines,
      clientName: d.clientName.trim(),
      clientPAN: d.clientPAN.trim(),
      clientPhone: d.clientPhone.trim(),
      clientAddress: d.clientAddress.trim(),
      discountMode: d.discountMode,
      discountPct: toN(d.discountPct),
      discountFlatAmt: toN(d.discountFlatAmt),
      paymentType: d.paymentType,
      bankName: d.paymentType === 'Bank' ? d.bankName : undefined,
      note: d.note.trim(),
    };

    // The picker only offers Draft/Sent, so anything else is the invoice's real
    // status — carry it, and write `status` only when the user moved the picker.
    const picked = d.status === 'Draft' || d.status === 'Sent' ? d.status : undefined;

    const before = invoices;
    if (d.id) {
      const ref = invoices.find((v) => v.id === d.id)?.ref ?? 'Invoice';
      const updates: Partial<Invoice> =
        picked && d.status !== d.statusAtOpen ? { ...common, explicitStatus: picked } : common;
      updateInvoice.mutate(
        { id: d.id, updates },
        {
          onSuccess: () => flash(`${ref} updated`, before),
          onError: () => toast.show({ message: `${ref} wasn’t saved — nothing was written`, tone: 'bad' }),
        },
      );
      closeInvoiceSheet();
    } else {
      let allocated;
      try {
        allocated = await allocateDocNumber('invoice', d.issuedISO, invoices.map((v) => v.ref));
      } catch {
        toast.show({ message: 'Couldn’t draw an invoice number — nothing was created', tone: 'bad' });
        return;
      }
      const ref = allocated.number;
      const fromQuote = convertQuoteId ? quotations.find((qt) => qt.id === convertQuoteId) : undefined;
      const invoice: Invoice = {
        id: `n${Date.now()}`,
        ref,
        fiscalYear: allocated.fiscalYear,
        client: 'thamel',
        cancelled: false,
        challans: [],
        payments: [],
        ...common,
        explicitStatus: picked ?? 'Draft',
        relatedQuotation: fromQuote?.number,
      };
      addInvoice.mutate(invoice, {
        onSuccess: () => {
          // Only once the invoice is really filed: a quotation must not be marked
          // Accepted and linked to an invoice that was never written.
          if (fromQuote) {
            updateQuotation.mutate({ id: fromQuote.id, updates: { status: 'Accepted', relatedInvoice: ref } });
          }
          flash(fromQuote ? `${ref} created from ${fromQuote.number}` : `${ref} created for ${common.clientName}`, before);
        },
        onError: () => toast.show({ message: `${ref} wasn’t created — nothing was written`, tone: 'bad' }),
      });
      closeInvoiceSheet();
    }
  };

  const handleCancelInvoice = (v: Invoice) => {
    const before = invoices;
    updateInvoice.mutate({ id: v.id, updates: { cancelled: true, cancelNote: v.cancelNote ?? `Cancelled ${shortDate(new Date().toISOString().slice(0, 10))} — record retained for IRD.` } });
    flash(`${v.ref} cancelled`, before);
  };

  // Tapping an invoice opens the document itself — the same sheet the website
  // prints — with its actions pinned under it.
  if (view === 'detail' && selected) {
    const paySheet = (
      <>
        <PaySheet
          visible={sheet === 'pay'}
          invoice={selected}
          draft={payDraft ?? emptyPayDraft(selected)}
          onClose={() => {
            setSheet(null);
            setPayDraft(null);
          }}
          onChange={(patch) => setPayDraft((d) => (d ? { ...d, ...patch } : d))}
          onSave={handleSavePayment}
        />
        <InvoiceSheet
          visible={invoiceSheetOpen}
          draft={invoiceDraft}
          nextNumber={invoiceDraft.id ? (invoices.find((v) => v.id === invoiceDraft.id)?.ref ?? '') : ''}
          onClose={closeInvoiceSheet}
          onChange={(patch) => setInvoiceDraft((d) => ({ ...d, ...patch }))}
          onSave={handleSaveInvoice}
          onCancelInvoice={
            canEdit && !selected.cancelled && paid(selected) < 0.5
              ? () => {
                  closeInvoiceSheet();
                  handleCancelInvoice(selected);
                }
              : undefined
          }
        />
      </>
    );

    const payLabel = selected.cancelled
      ? 'Invoice cancelled'
      : balance(selected) < 0.5
        ? 'Collected in full'
        : 'Add payment';
    const payDisabled = selected.cancelled || balance(selected) < 0.5;

    return (
      <ViewSwap viewKey="detail" order={BILLING_VIEW_ORDER} style={styles.flex}>
        <DocViewer
          data={invoiceDocData(selected)}
          docType="invoice"
          title={selected.ref}
          subtitle={`${clientNameOf(selected)} · ${statusFull(selected)}`}
          onBack={backToList}
          actions={
            <>
              <Button label={payLabel} onPress={openPay} disabled={payDisabled} style={styles.actionPrimary} />
              {canEdit ? (
                <Button label="Edit" variant="secondary" onPress={() => openEditInvoice(selected)} style={styles.actionSecondary} />
              ) : null}
            </>
          }
        />
        {paySheet}
      </ViewSwap>
    );
  }

  if (openDoc && activeDoc) {
    const isQuote = openDoc.kind === 'quotation';
    const quote = isQuote ? (activeDoc as Quotation) : null;
    const canConvert = !!quote && canEdit && !quote.relatedInvoice && quote.status !== 'Cancelled' && quote.status !== 'Rejected';
    return (
      <ViewSwap viewKey="doc" order={BILLING_VIEW_ORDER} style={styles.flex}>
        <DocViewer
          data={isQuote ? quotationDocData(activeDoc as Quotation) : challanDocData(activeDoc as Challan)}
          docType={isQuote ? 'quotation' : 'challan'}
          title={activeDoc.number}
          subtitle={`${activeDoc.clientName} · ${activeDoc.status}`}
          onBack={() => setOpenDoc(null)}
          actions={
            <>
              {canConvert ? (
                <Button
                  label="Convert to invoice"
                  onPress={() => handleConvertQuotation(activeDoc as Quotation)}
                  style={styles.actionPrimary}
                />
              ) : null}
              {canEdit ? (
                <Button
                  label="Edit"
                  variant="secondary"
                  onPress={() => openEditDoc(activeDoc, openDoc.kind)}
                  style={canConvert ? styles.actionSecondary : styles.actionPrimary}
                />
              ) : null}
            </>
          }
        />
        {docSheetNode}
      </ViewSwap>
    );
  }

  return (
    <ViewSwap viewKey="list" order={BILLING_VIEW_ORDER} style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="Billing"
        subtitle={`Booked FX · £1 = ${SYM.NPR}${RATES.GBP.toLocaleString()}`}
        showBack={showBack}
        rightSlot={
          <View style={styles.headerRight}>
            {docType === 'invoice' ? (
              <Pressable
                onPress={handleExportCsv}
                style={[styles.pdfIconButton, { borderColor: theme.border, backgroundColor: theme.surface }]}
              >
                <Icon name="download" size={15} color={theme.textPrimary} />
              </Pressable>
            ) : null}
            <HeaderAccount />
          </View>
        }
      />
      <ScrollView ref={scrollRef} contentContainerStyle={[styles.content, { paddingBottom: 100 + bottomInset }]}>
        <DocTypeSwitch
          active={docType}
          counts={docCounts}
          onChange={(t) => {
            setDocType(t);
            setDocStatusFilter('all');
          }}
        />

        {docType !== 'invoice' ? (
          <>
            {!canEdit ? <PermissionNotice section="billing" /> : null}
            <DocList
              kind={docType === 'challan' ? 'challan' : 'quotation'}
              docs={docType === 'challan' ? challans : quotations}
              statusFilter={docStatusFilter}
              onStatusFilter={setDocStatusFilter}
              onOpen={(d) => setOpenDoc({ kind: docType === 'challan' ? 'challan' : 'quotation', id: d.id })}
            />
          </>
        ) : (
        <>
        <Summary
          outstandingTotal={npr(outstandingNpr)}
          openCount={openList.length}
          fxExposure={fxExposure}
          collectedMonth={npr(collected)}
          collectedPct={Math.min(100, (collected / (collected + outstandingNpr || 1)) * 100)}
          collectedMeta={`${((collected / (collected + outstandingNpr || 1)) * 100).toFixed(0)}% of billed`}
          vatTotal={npr(vatNpr)}
          vatPct={Math.min(100, (vatCollectedNpr / (vatNpr || 1)) * 100)}
          vatMeta={vatInvoices.length ? `${npr(vatCollectedNpr)} collected` : 'no VAT invoices'}
        />

        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder="Search client, number, SO or status"
          compact
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {filters.map((f) => {
            const on = filter === f.id;
            return (
              <Pressable
                key={f.id}
                onPress={() => setFilter(f.id)}
                style={[styles.chip, { backgroundColor: on ? theme.selectedSurface : theme.surface, borderColor: on ? theme.selectedBorder : theme.border }]}
              >
                <Text style={[styles.chipLabel, { color: on ? theme.selectedText : theme.textPrimary }]}>{f.label}</Text>
                <Text style={[styles.chipCount, { color: on ? theme.selectedTextMuted : theme.textSecondary }]}>{f.count}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {openChallans.length > 0 ? (
          <Pressable onPress={() => setSheet('challans')} style={[styles.challanBanner, { backgroundColor: theme.accentWash, borderColor: theme.scheme === 'light' ? '#C7E7D6' : theme.border }]}>
            <Icon name="file-text" size={18} color={theme.accentWashText} />
            <Text style={[styles.challanBannerText, { color: theme.accentWashText }]}>
              {openChallans.length} {openChallans.length === 1 ? 'challan' : 'challans'} delivered, not yet invoiced
            </Text>
            <Icon name="chevron-right" size={15} color={theme.accentWashText} />
          </Pressable>
        ) : null}

        {shown.length === 0 && cancelledShown.length === 0 ? (
          <EmptyState
            icon="file-text"
            title={q ? 'No invoices match' : 'Nothing in this status'}
            message={q ? `No invoice matches "${query.trim()}".` : `Tap "All" to see every one of the ${live.length} invoices raised this quarter.`}
          />
        ) : (
          shown.map((v, i) => <InvoiceRow key={v.id} invoice={v} index={i} showFx={SHOW_FX} onPress={() => openDetail(v.id)} />)
        )}

        <CollapsedSection label="Cancelled invoices" count={cancelledShown.length}>
          {cancelledShown.map((v, i) => (
            <InvoiceRow key={v.id} invoice={v} index={i} showFx={SHOW_FX} onPress={() => openDetail(v.id)} />
          ))}
        </CollapsedSection>
        </>
        )}
      </ScrollView>

      <ChallansSheet visible={sheet === 'challans'} challans={openChallans} onClose={() => setSheet(null)} onRaise={handleRaise} />

      {canEdit ? (
        <Pressable
          onPress={() => (docType === 'invoice' ? openNewInvoice() : openNewDoc(docType === 'challan' ? 'challan' : 'quotation'))}
          style={[
            styles.fab,
            {
              bottom: 24 + bottomInset,
              backgroundColor: theme.accent,
              boxShadow: theme.scheme === 'light' ? '0 12px 26px -12px rgba(20,122,87,0.95)' : undefined,
            },
          ]}
        >
          <Icon name="plus" size={18} color={theme.accentText} />
          <Text style={[styles.fabLabel, { color: theme.accentText }]}>
            {docType === 'invoice' ? 'New invoice' : docType === 'challan' ? 'New challan' : 'New quotation'}
          </Text>
        </Pressable>
      ) : null}

      {docSheetNode}

      <InvoiceSheet
        visible={invoiceSheetOpen}
        draft={invoiceDraft}
        nextNumber={invoiceDraft.id ? (invoices.find((v) => v.id === invoiceDraft.id)?.ref ?? '') : ''}
        onClose={() => setInvoiceSheetOpen(false)}
        onChange={(patch) => setInvoiceDraft((d) => ({ ...d, ...patch }))}
        onSave={handleSaveInvoice}
      />
    </ViewSwap>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingTop: 4, paddingBottom: 100, gap: 12 },
  actionBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14, borderTopWidth: StyleSheet.hairlineWidth },
  actionPrimary: { flex: 1.5, height: 50 },
  actionSecondary: { flex: 1, height: 50 },
  pdfIconButton: { height: 34, width: 34, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chipsRow: { gap: 7, paddingTop: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1 },
  chipLabel: { fontWeight: '600', fontSize: 12.5 },
  chipCount: { fontSize: 10.5, opacity: 0.85 },
  challanBanner: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 16, borderWidth: 1, padding: 14 },
  challanBannerText: { flex: 1, fontSize: 13.5, lineHeight: 13.5 * 1.4 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    height: 52,
    paddingLeft: 17,
    paddingRight: 20,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  fabLabel: { fontFamily: fontFamily.semibold, fontSize: 14.5 },
});
