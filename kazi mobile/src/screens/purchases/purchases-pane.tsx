import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { useToast } from '@/components/toast/toast-provider';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import { useAdjustStock, useStock } from '@/data/inventory/hooks';
import { useAddEntry, useDeleteEntry, useEntries, useRestoreEntries, useUpdateEntry } from '@/data/purchases/hooks';
import { buildEntry, draftFromEntry, emptyDraft } from '@/data/purchases/utils';
import type { PurchaseDraft, PurchaseEntry, PurchaseFilter } from '@/data/purchases/types';
import { useDateText } from '@/lib/date-display';

import { AddSheet } from './add-sheet';
import { EntryGroup } from './entry-group';
import { ListSummary } from './list-summary';

export interface PurchasesPaneProps {
  showSummary?: boolean;
  showFab?: boolean;
  /** Bumping this from a parent opens the "add purchase" sheet. */
  addNonce?: number;
  /**
   * Prefills the search box — Finance's Ledger tab sends a purchase row here
   * by its `EXP…` id, the way the reference's `goToLedgerSource` does.
   * `searchNonce` must change for a repeat of the same term to take.
   */
  searchSeed?: string;
  searchNonce?: number;
  /**
   * Whether the pane supplies its own 20px side gutter. Finance's Purchases
   * tab renders it inside a ScrollView that is already padded, so it passes
   * `false` — otherwise the list sits inset twice as far as every other tab.
   */
  inset?: boolean;
}

export function PurchasesPane({
  showSummary = true,
  showFab = true,
  addNonce = 0,
  searchSeed = '',
  searchNonce = 0,
  inset = true,
}: PurchasesPaneProps) {
  const theme = useTheme();
  const dateText = useDateText();
  const toast = useToast();
  const { profile, can } = useAuth();
  const canEdit = can('purchases');
  const loggedBy = profile?.name ?? 'You';

  const { data: entries } = useEntries();
  const { data: stock } = useStock();
  const addEntry = useAddEntry();
  const updateEntry = useUpdateEntry();
  const deleteEntry = useDeleteEntry();
  const restoreEntries = useRestoreEntries();
  const adjustStock = useAdjustStock();

  const [filter, setFilter] = useState<PurchaseFilter>('all');
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<PurchaseDraft>(emptyDraft());

  // Each bump of the nonce is the header's "+" being pressed — open a blank
  // draft. Handled during render so the sheet opens on the same frame.
  const [handledNonce, setHandledNonce] = useState(addNonce);
  if (handledNonce !== addNonce) {
    setHandledNonce(addNonce);
    if (addNonce > 0) {
      setDraft(emptyDraft());
      setSheetOpen(true);
    }
  }

  const [handledSearchNonce, setHandledSearchNonce] = useState(searchNonce);
  if (handledSearchNonce !== searchNonce) {
    setHandledSearchNonce(searchNonce);
    if (searchNonce > 0) setSearch(searchSeed);
  }

  const list = useMemo(() => entries ?? [], [entries]);

  /** The parties already on file, most-used first — the sheet's quick picks. */
  const parties = useMemo(() => {
    const counts = new Map<string, number>();
    list.forEach((e) => {
      const name = e.party.trim();
      if (name && name !== 'Unnamed party') counts.set(name, (counts.get(name) ?? 0) + 1);
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name]) => name);
  }, [list]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((e) => {
      if (filter === 'unpaid' && e.status === 'paid') return false;
      if (filter === 'cash' && e.paymentType !== 'Cash') return false;
      if (filter === 'bank' && e.paymentType !== 'Bank') return false;
      if (q && !`${e.party} ${e.category} ${e.expenseId}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [list, filter, search]);

  const monthTotal = list.reduce((n, e) => n + e.amountNPR, 0);
  const unpaidTotal = list.filter((e) => e.status !== 'paid').reduce((n, e) => n + e.amountNPR, 0);
  const cashTotal = list.filter((e) => e.paymentType === 'Cash').reduce((n, e) => n + e.amountNPR, 0);

  const filters: { id: PurchaseFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: list.length },
    { id: 'unpaid', label: 'Unpaid', count: list.filter((e) => e.status !== 'paid').length },
    { id: 'cash', label: 'Cash', count: list.filter((e) => e.paymentType === 'Cash').length },
    { id: 'bank', label: 'Bank', count: list.filter((e) => e.paymentType === 'Bank').length },
  ];

  // One bucket per purchase date, newest day first.
  const buckets: { key: string; title: string; entries: PurchaseEntry[] }[] = [];
  filtered.forEach((e) => {
    let b = buckets.find((x) => x.key === e.date);
    if (!b) {
      b = { key: e.date, title: dateText(e.date), entries: [] };
      buckets.push(b);
    }
    b.entries.push(e);
  });
  buckets.sort((a, b) => (a.key < b.key ? 1 : -1));

  const openAdd = () => {
    setDraft(emptyDraft());
    setSheetOpen(true);
  };

  /** Tapping a row goes straight into the editor — the reference edits in place too. */
  const openEdit = (id: string) => {
    const entry = list.find((e) => e.id === id);
    if (!entry) return;
    setDraft(draftFromEntry(entry));
    setSheetOpen(true);
  };

  const runStockIn = (entry: PurchaseEntry) => {
    if (!stock) return;
    const matched: string[] = [];
    entry.items.forEach((line) => {
      const hit = stock.find((s) => s.name.toLowerCase() === line.particulars.trim().toLowerCase());
      if (hit) {
        adjustStock.mutate({ name: hit.name, delta: line.quantity });
        matched.push(hit.name);
      }
    });
    if (matched.length) toast.show({ message: `Stocked in: ${matched.join(', ')}`, tone: 'ok' });
  };

  const handleSave = () => {
    const editing = draft.id !== null;
    const before = list;
    const entry = buildEntry(draft, list, loggedBy);
    if (entry.items.length === 0 || !draft.party.trim()) {
      toast.show({ message: 'Add a party and at least one line item', tone: 'bad' });
      return;
    }
    const callbacks = {
      onSuccess: () =>
        toast.show({
          message: `${entry.expenseId} · ${entry.party} ${editing ? 'updated' : 'recorded'}`,
          tone: 'ok' as const,
          action: { label: 'Undo', onPress: () => restoreEntries.mutate(before) },
        }),
      onError: () =>
        toast.show({ message: `${entry.expenseId} wasn’t saved — nothing was written`, tone: 'bad' as const }),
    };
    if (editing) updateEntry.mutate({ id: entry.id, updates: entry }, callbacks);
    else addEntry.mutate(entry, callbacks);
    setSheetOpen(false);
    if (!editing) runStockIn(entry);
  };

  const removeEntry = (entry: PurchaseEntry) => {
    const before = list;
    deleteEntry.mutate(entry.id, {
      onSuccess: () =>
        toast.show({
          message: `${entry.expenseId} deleted`,
          tone: 'ok',
          action: { label: 'Undo', onPress: () => restoreEntries.mutate(before) },
        }),
      onError: () => toast.show({ message: `${entry.expenseId} wasn’t deleted`, tone: 'bad' }),
    });
  };

  return (
    <View style={styles.wrap}>
      <ListSummary
        monthTotal={monthTotal}
        unpaidTotal={unpaidTotal}
        cashShare={`${monthTotal ? Math.round((cashTotal / monthTotal) * 100) : 0}%`}
        filters={filters}
        activeFilter={filter}
        onFilterChange={setFilter}
        search={search}
        onSearchChange={setSearch}
        showSummary={showSummary}
        inset={inset}
      />

      <View style={[styles.list, inset && styles.listInset]}>
        {buckets.length === 0 ? (
          <EmptyState icon="shopping-bag" title="No purchases here" message={`Clear the filter to see all ${list.length} entries.`} />
        ) : (
          buckets.map((b) => (
            <EntryGroup
              key={b.key}
              title={b.title}
              total={b.entries.reduce((n, e) => n + e.amountNPR, 0)}
              hasUnpaid={b.entries.some((e) => e.status !== 'paid')}
              entries={b.entries}
              onOpen={openEdit}
            />
          ))
        )}
      </View>

      {showFab && canEdit ? (
        <Pressable
          onPress={openAdd}
          style={[styles.fab, { backgroundColor: theme.accent, boxShadow: theme.scheme === 'light' ? '0 12px 26px -12px rgba(20,122,87,0.95)' : undefined }]}
        >
          <Icon name="plus" size={18} color={theme.accentText} />
          <Text style={[styles.fabLabel, { color: theme.accentText }]}>Add purchase</Text>
        </Pressable>
      ) : null}

      <AddSheet
        visible={sheetOpen}
        draft={draft}
        onClose={() => setSheetOpen(false)}
        onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        onSave={handleSave}
        parties={parties}
        onDelete={
          draft.id
            ? () => {
                const entry = list.find((e) => e.id === draft.id);
                if (entry) {
                  setSheetOpen(false);
                  removeEntry(entry);
                }
              }
            : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  list: { paddingTop: 4, gap: 16 },
  listInset: { paddingHorizontal: 20 },
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
