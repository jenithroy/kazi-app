import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { useToast } from '@/components/toast/toast-provider';
import { ConfirmSheet } from '@/components/ui/confirm-sheet';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { PermissionNotice } from '@/components/ui/permission-notice';
import { isBlocked, ScreenGate } from '@/components/ui/screen-gate';
import { SearchField } from '@/components/ui/search-field';
import { useBackHandler } from '@/lib/use-back-handler';
import { useScrollTop } from '@/lib/use-scroll-top';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useTheme } from '@/theme/theme-provider';
import * as haptics from '@/lib/haptics';
import { useInvoices } from '@/data/billing/hooks';
import { useAddCustomer, useCustomers, useDeleteCustomer, useRestoreCustomers, useUpdateCustomer } from '@/data/customers/hooks';
import { invoicesForCustomer, ordersForCustomer } from '@/data/customers/joins';
import { blankDraft } from '@/data/customers/mock';
import type { Customer, CustomerDraft } from '@/data/customers/types';
import { useMoneySignature } from '@/lib/money';
import { useOrders } from '@/data/sales/hooks';

import { CustomerRow } from './customer-row';
import { CustomerSheet } from './customer-sheet';

/** The editable half of a record — what the sheet's draft is diffed against. */
function draftOf(c: Customer): CustomerDraft {
  return {
    name: c.name,
    contact: c.contact,
    email: c.email,
    phone: c.phone,
    city: c.city,
    country: c.country,
    address: c.address,
    notes: c.notes,
  };
}

function sameDraft(a: CustomerDraft, b: CustomerDraft): boolean {
  return (Object.keys(a) as (keyof CustomerDraft)[]).every((k) => a[k] === b[k]);
}

export function Customers() {
  const theme = useTheme();
  const scrollRef = useScrollTop();
  // Money is formatted by plain functions (`@/lib/money`), so this is what
  // re-renders the screen when the currency preference or the rate changes.
  useMoneySignature();
  const toast = useToast();
  const { can } = useAuth();
  const canEdit = can('customers');

  const customersQuery = useCustomers();
  const { data: customers } = customersQuery;
  const { data: salesOrders } = useOrders();
  const { data: billingInvoices } = useInvoices();
  const addCustomer = useAddCustomer();
  const updateCustomer = useUpdateCustomer();
  const deleteCustomer = useDeleteCustomer();
  const restoreCustomers = useRestoreCustomers();

  const [query, setQuery] = useState('');
  const [swipeOpenId, setSwipeOpenId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  // The delete confirmation cannot sit on top of the editor's own modal, so
  // opening it closes the sheet — and cancelling puts the sheet back exactly
  // as it was, unsaved edits included.
  const [reopenAfterCancel, setReopenAfterCancel] = useState(false);

  // The sheet is driven by a boolean rather than by `draft === null`, so the
  // draft and the record it was opened on survive the closing animation:
  // nothing to crash on, and the sheet does not change identity on its way out.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<CustomerDraft>({ ...blankDraft });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [opened, setOpened] = useState<Customer | null>(null);

  // The sheet is a `Modal` and takes Android back itself, so this only has to
  // close a swiped-open row.
  useBackHandler(() => {
    if (swipeOpenId) {
      setSwipeOpenId(null);
      return true;
    }
    return false;
  });

  if (isBlocked(customersQuery) || !customers) return <ScreenGate queries={[customersQuery]} header={<ScreenHeader title="Customers" />} />;

  const q = query.trim().toLowerCase();
  let rows = customers;
  if (q) rows = rows.filter((c) => `${c.name} ${c.contact} ${c.email} ${c.city} ${c.country}`.toLowerCase().includes(q));
  // `owed()` reads these, so without the join every row renders "settled" —
  // the live reader deliberately leaves them empty for the screen to fill.
  rows = rows
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({
      ...c,
      orders: salesOrders ? ordersForCustomer(salesOrders, c.name) : [],
      invoices: billingInvoices ? invoicesForCustomer(billingInvoices, c.name) : [],
    }));

  // Falls back to the record the sheet was opened on, so deleting it — or
  // saving and briefly outrunning the refetch — cannot turn an open "Edit
  // customer" sheet into a "New customer" one mid-animation.
  const editing = editingId ? (customers.find((c) => c.id === editingId) ?? opened) : null;
  const pending = customers.find((c) => c.id === pendingId) ?? null;
  const saving = addCustomer.isPending || updateCustomer.isPending;
  // Only meaningful while the sheet is up: a closing sheet must not flash its
  // unsaved-changes bar, and must not re-arm the guard it just let go of.
  const dirty = sheetOpen && !sameDraft(draft, editing ? draftOf(editing) : blankDraft);

  // Item 35 — join the sheet's history to the live Sales + Billing collections
  // by customer name; fall back to the seed arrays when nothing matches.
  let editingWithHistory = editing;
  if (editing) {
    const liveOrders = salesOrders ? ordersForCustomer(salesOrders, editing.name) : [];
    const liveInvoices = billingInvoices ? invoicesForCustomer(billingInvoices, editing.name) : [];
    if (liveOrders.length || liveInvoices.length) {
      editingWithHistory = {
        ...editing,
        orders: liveOrders.length ? liveOrders : editing.orders,
        invoices: liveInvoices.length ? liveInvoices : editing.invoices,
      };
    }
  }

  const flash = (message: string) => toast.show({ message, tone: 'ok' });
  const complain = (err: unknown) =>
    toast.show({ message: err instanceof Error ? err.message : 'That change could not be saved.', tone: 'bad' });

  // Undo is offered only on delete, because that is the only one `restoreCustomers`
  // can actually reverse — it puts the deleted row back at its original id. A
  // saved edit has nothing to roll back to in Postgres.
  const flashDeleted = (message: string, before: Customer[]) => {
    toast.show({ message, tone: 'ok', action: { label: 'Undo', onPress: () => restoreCustomers.mutate(before) } });
  };

  const startAdd = () => {
    if (!canEdit) return;
    setSwipeOpenId(null);
    setDraft({ ...blankDraft });
    setEditingId(null);
    setOpened(null);
    setSheetOpen(true);
  };
  const openCustomer = (c: Customer) => {
    setSwipeOpenId(null);
    setDraft(draftOf(c));
    setEditingId(c.id);
    setOpened(c);
    setSheetOpen(true);
  };
  const closeSheet = () => {
    setSheetOpen(false);
    setReopenAfterCancel(false);
  };
  const discard = () => {
    setDraft(editing ? draftOf(editing) : { ...blankDraft });
    setSheetOpen(false);
  };
  const patchDraft = (patch: Partial<CustomerDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const handleSave = () => {
    const name = draft.name.trim();
    if (!name) return;
    const fields: CustomerDraft = { ...draft, name };
    if (editingId) {
      updateCustomer.mutate(
        { id: editingId, updates: fields },
        { onSuccess: () => flash(`${name} updated`), onError: complain },
      );
    } else {
      addCustomer.mutate(
        { ...fields, id: `n${Date.now()}`, since: 'Added today', orders: [], invoices: [] },
        { onSuccess: () => flash(`${name} added to the book`), onError: complain },
      );
      setQuery('');
    }
    setSheetOpen(false);
  };

  const askDelete = (id: string, fromSheet: boolean) => {
    if (!canEdit) return;
    if (fromSheet) setSheetOpen(false);
    setReopenAfterCancel(fromSheet);
    setPendingId(id);
  };
  const cancelDelete = () => {
    setSwipeOpenId(null);
    setPendingId(null);
    if (reopenAfterCancel) setSheetOpen(true);
    setReopenAfterCancel(false);
  };
  const confirmDelete = () => {
    if (!pending) return;
    haptics.committed();
    const before = customers;
    const name = pending.name;
    deleteCustomer.mutate(pending.id, {
      onSuccess: () => flashDeleted(`${name} deleted`, before),
      onError: complain,
    });
    setPendingId(null);
    setReopenAfterCancel(false);
    setSwipeOpenId(null);
    setSheetOpen(false);
  };

  // Postgres nulls `customer_id` on orders, invoices and payments when the
  // contact goes. Undo puts the contact back at the same id, but those links
  // are not restored, so say so before the tap rather than after it.
  const pendingWarning = pending
    ? `${pending.orders.length} order(s) and ${pending.invoices.length} invoice(s) stay in the ledger, but they stop being linked to this contact — and Undo does not relink them.`
    : '';

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="Customers"
        subtitle={`${customers.length} client${customers.length === 1 ? '' : 's'}`}
        rightSlot={
          canEdit ? (
            <Pressable onPress={startAdd} style={[styles.addButton, { backgroundColor: theme.accent, boxShadow: theme.scheme === 'light' ? '0 6px 16px -10px rgba(20,122,87,0.9)' : undefined }]}>
              <Icon name="plus" size={18} color={theme.accentText} />
            </Pressable>
          ) : undefined
        }
      />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        <PermissionNotice section="customers" />
        <SearchField value={query} onChange={setQuery} placeholder="Name, contact or city" />

        {rows.length === 0 ? (
          <EmptyState
            icon="users"
            title={q ? 'No customer matches' : 'No customers yet'}
            message={
              q
                ? `Nothing matches "${query.trim()}". Try a city, or clear the search.`
                : canEdit
                  ? 'Tap + to add the first one.'
                  : 'The customer book is empty.'
            }
          />
        ) : (
          rows.map((c, i) => (
            <CustomerRow
              key={c.id}
              customer={c}
              index={i}
              isOpen={swipeOpenId === c.id}
              onSwipeOpen={() => setSwipeOpenId(c.id)}
              onSwipeClose={() => setSwipeOpenId(null)}
              onPress={() => openCustomer(c)}
              onDelete={canEdit ? () => askDelete(c.id, false) : undefined}
            />
          ))
        )}
      </ScrollView>

      <CustomerSheet
        visible={sheetOpen}
        draft={draft}
        editing={editingWithHistory}
        dirty={dirty}
        saving={saving}
        canEdit={canEdit}
        onChange={patchDraft}
        onClose={closeSheet}
        onDiscard={discard}
        onSave={handleSave}
        onDelete={() => editingId && askDelete(editingId, true)}
      />

      <ConfirmSheet
        visible={!!pending}
        title={`Delete ${pending?.name ?? ''}?`}
        body={pendingWarning}
        confirmLabel="Delete"
        onCancel={cancelDelete}
        onConfirm={confirmDelete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 20, paddingTop: 12, paddingBottom: 32, gap: 12 },
  addButton: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});
