import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { useToast } from '@/components/toast/toast-provider';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { PermissionNotice } from '@/components/ui/permission-notice';
import { CollapsedSection } from '@/components/ui/collapsed-section';
import { isBlocked, ScreenGate } from '@/components/ui/screen-gate';
import { useModulePresentation } from '@/components/tab-bar/use-own-tab';
import { useBackHandler } from '@/lib/use-back-handler';
import { useScrollTop } from '@/lib/use-scroll-top';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Button } from '@/components/ui/button';
import { StatusPill, type StatusKind } from '@/components/ui/status-pill';
import { useTheme } from '@/theme/theme-provider';
import * as haptics from '@/lib/haptics';
import { fontFamily } from '@/theme';
import {
  useAddOrder,
  useAddOrderNote,
  useDeleteOrder,
  useOrders,
  useSetOrderEmbellishments,
  useSetOrderStage,
  useSetOrderStatus,
  useUpdateOrder,
} from '@/data/sales/hooks';
import { STAGES, STAGE_IDS, nextOrderRef, shipDays, shipLabel, stageById } from '@/data/sales/mock';
import type { Embellishment, Order, OrderDraft, OrderStatus, OrdersFilter, StageId } from '@/data/sales/types';
import { groupOf, isOpen, priorityOf } from '@/data/sales/utils';
import { useMoneySignature } from '@/lib/money';

import { OrderDetail } from './order-detail';
import { OrderListRow } from './order-list-row';
import { OrderSheet } from './order-sheet';
import { PipelineSummary } from './pipeline-summary';
import { StageChips } from './stage-chips';

const toNum = (s: string) => parseInt(s.replace(/[^0-9]/g, ''), 10) || 0;
const today = () => new Date().toISOString().slice(0, 10);

const STATUS_PILL: Record<OrderStatus, { kind: StatusKind; label: string }> = {
  active: { kind: 'on-track', label: 'Active' },
  'on-hold': { kind: 'at-risk', label: 'On Hold' },
  completed: { kind: 'shipped', label: 'Completed' },
  cancelled: { kind: 'blocked', label: 'Cancelled' },
};

function draftFrom(order: Order): OrderDraft {
  return {
    id: order.id,
    ref: order.ref,
    orderDate: order.orderDate,
    deliveryDate: order.deliveryDate,
    customer: order.customer,
    product: order.product,
    fabricType: order.fabricType,
    colorway: order.colorway,
    sampleName: order.sampleName,
    qty: String(order.qty),
    pricePerPc: String(order.pricePerPc),
    fabricGramsUsed: order.fabricGramsUsed ? String(order.fabricGramsUsed) : '',
    fabricCostPerPc: order.fabricCostPerPc ? String(order.fabricCostPerPc) : '',
    invoiceRef: order.invoiceRef,
    assignedTo: order.assignedTo,
    stage: order.stage,
    status: order.status,
  };
}

function emptyDraft(): OrderDraft {
  return {
    id: null, ref: '', orderDate: today(), deliveryDate: '', customer: '', product: '',
    fabricType: 'Terry Cotton', colorway: '', sampleName: '', qty: '', pricePerPc: '',
    fabricGramsUsed: '', fabricCostPerPc: '', invoiceRef: '', assignedTo: '',
    stage: 'received', status: 'active',
  };
}

/**
 * The production pipeline: every order, filtered by the stage it sits at,
 * with a full-screen detail per order.
 *
 * The stage chain, the statuses, the edit form and the move/hold/delete
 * actions all mirror the reference web app's `Production.jsx` — that page, not
 * the unreachable `OrderManagement.jsx`, is the one the business actually uses,
 * and it owns the ten-stage model, so the route is named after it. The
 * *permission* stays `order-management`: that is `sections.id` in Postgres and
 * the key RLS gates the `orders` read on, and renaming a screen is no reason
 * to go rewriting the grants behind it.
 */
export function Production() {
  const theme = useTheme();
  // Money is formatted by plain functions (`@/lib/money`), so this is what
  // re-renders the screen when the currency preference or the rate changes.
  useMoneySignature();
  const toast = useToast();
  const { can } = useAuth();
  const canEdit = can('order-management');
  const { showBack, bottomInset } = useModulePresentation('order-management');

  const ordersQuery = useOrders();
  const { data: orders } = ordersQuery;
  const addOrder = useAddOrder();
  const updateOrder = useUpdateOrder();
  const setStage = useSetOrderStage();
  const setEmbellishments = useSetOrderEmbellishments();
  const addNote = useAddOrderNote();
  const setStatus = useSetOrderStatus();
  const deleteOrder = useDeleteOrder();

  const [filter, setFilter] = useState<OrdersFilter>('all');
  const [sheetMode, setSheetMode] = useState<'new' | 'edit' | null>(null);
  const [draft, setDraft] = useState<OrderDraft | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Keyed on the open order: the detail body sits at the same place in the
  // tree as the list, so React hands it the same ScrollView — and with it the
  // offset the list was left at.
  const scrollRef = useScrollTop(selectedId ?? 'list');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // The order detail is a view inside this route, not a route of its own, so
  // system back has to be told to close it. The sheets are `Modal`s and take
  // their own back press before it ever reaches here.
  useBackHandler(() => {
    if (confirmDelete) {
      setConfirmDelete(false);
      return true;
    }
    if (selectedId) {
      setSelectedId(null);
      return true;
    }
    return false;
  });

  if (isBlocked(ordersQuery) || !orders) return <ScreenGate queries={[ordersQuery]} header={<ScreenHeader title="Production" showBack={showBack} />} />;

  const selected = orders.find((o) => o.id === selectedId) ?? null;
  const openCount = orders.filter(isOpen).length;

  const patchDraft = (patch: Partial<OrderDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const openOrder = (id: string) => {
    setConfirmDelete(false);
    setSelectedId(id);
  };

  const openNew = () => {
    setDraft(emptyDraft());
    setSheetMode('new');
  };
  const openEdit = (order: Order) => {
    setDraft(draftFrom(order));
    setSheetMode('edit');
  };
  const closeSheet = () => {
    setSheetMode(null);
    setDraft(null);
  };

  const handleSave = () => {
    if (!draft) return;
    const qty = toNum(draft.qty);
    const pricePerPc = toNum(draft.pricePerPc);
    const shared = {
      customer: draft.customer.trim(),
      product: draft.product.trim(),
      qty,
      pricePerPc,
      value: qty * pricePerPc,
      orderDate: draft.orderDate.trim(),
      deliveryDate: draft.deliveryDate.trim(),
      ship: shipLabel(draft.deliveryDate.trim()),
      shipDays: shipDays(draft.deliveryDate.trim()),
      fabricType: draft.fabricType.trim(),
      colorway: draft.colorway.trim(),
      fabricGramsUsed: toNum(draft.fabricGramsUsed),
      fabricCostPerPc: toNum(draft.fabricCostPerPc),
      invoiceRef: draft.invoiceRef.trim(),
      sampleName: draft.sampleName.trim(),
      assignedTo: draft.assignedTo.trim() || 'Unassigned',
      stage: draft.stage,
      status: draft.status,
    };

    const complain = (err: unknown) =>
      toast.show({ message: err instanceof Error ? err.message : 'That change could not be saved.', tone: 'bad' });

    if (draft.id) {
      const ref = draft.ref;
      updateOrder.mutate(
        { id: draft.id, updates: shared },
        { onSuccess: () => toast.show({ message: `${ref} updated`, tone: 'ok' }), onError: complain },
      );
    } else {
      const ref = nextOrderRef(orders);
      const order: Order = {
        ...shared,
        id: `o${Date.now()}`,
        ref,
        embellishments: [],
        stageHistory: [{ stage: draft.stage, at: new Date().toISOString() }],
        notes: [],
      };
      // Stays on the list: the optimistic row carries a placeholder id, and the
      // refetch that follows replaces it with the real one.
      addOrder.mutate(order, {
        onSuccess: () => toast.show({ message: `${ref} created`, tone: 'ok' }),
        onError: complain,
      });
    }
    closeSheet();
  };

  /**
   * Advancing onto Delivered also completes the order (reference `advanceStage`).
   *
   * Undo is a real inverse write, not a cache rewind — `restoreOrders` never
   * touches Postgres, so a snapshot-based undo would revert on screen and then
   * snap back on the next refetch.
   */
  const moveOrder = (order: Order, dir: -1 | 1) => {
    const idx = STAGE_IDS.indexOf(order.stage);
    const next = STAGE_IDS[idx + dir] as StageId | undefined;
    if (!next) return;
    const from = order.stage;
    setStage.mutate({ id: order.id, stage: next, reverted: dir === -1 });
    toast.show({
      message: dir === 1 ? `${order.ref} → ${stageById(next).label}` : `${order.ref} back to ${stageById(next).label}`,
      tone: 'ok',
      action: {
        label: 'Undo',
        onPress: () => setStage.mutate({ id: order.id, stage: from, reverted: dir === 1 }),
      },
    });
  };

  const changeStatus = (order: Order, status: OrderStatus, message: string) => {
    const from = order.status;
    setStatus.mutate({ id: order.id, status });
    toast.show({
      message,
      tone: status === 'cancelled' ? 'bad' : 'ok',
      action: { label: 'Undo', onPress: () => setStatus.mutate({ id: order.id, status: from }) },
    });
  };

  // No Undo here, unlike the other mutations: `restoreOrders` only rewinds the
  // local cache, and the row is already gone from Postgres. Offering the button
  // would be a lie. The detail screen asks for confirmation instead.
  const handleDelete = (order: Order) => {
    haptics.committed();
    deleteOrder.mutate(order.id);
    setConfirmDelete(false);
    setSelectedId(null);
    toast.show({ message: `${order.ref} deleted`, tone: 'bad' });
  };

  const addOrderNote = (order: Order, body: string) => {
    addNote.mutate({
      id: order.id,
      note: { id: `n${Date.now()}`, body, at: new Date().toISOString(), who: 'You' },
    });
  };

  // ---- Detail ------------------------------------------------------------

  if (selected) {
    const pill = STATUS_PILL[selected.status];
    return (
      <View style={[styles.flex, { backgroundColor: theme.background }]}>
        <ScreenHeader
          title={selected.customer}
          subtitle={`${selected.ref} · ${selected.product}`}
          onBack={() => {
            setConfirmDelete(false);
            setSelectedId(null);
          }}
          rightSlot={<StatusPill status={pill.kind} label={pill.label} />}
        />
        <ScrollView ref={scrollRef} contentContainerStyle={[styles.detailContent, { paddingBottom: 120 + bottomInset }]}>
          <PermissionNotice section="order-management" />
          <OrderDetail
            order={selected}
            canEdit={canEdit}
            onAdvance={() => moveOrder(selected, 1)}
            onReverse={() => moveOrder(selected, -1)}
            onHold={() => changeStatus(selected, 'on-hold', `${selected.ref} on hold`)}
            onResume={() => changeStatus(selected, 'active', `${selected.ref} resumed`)}
            onEmbellishments={(next: Embellishment[]) =>
              setEmbellishments.mutate({ id: selected.id, embellishments: next })
            }
            onAddNote={(body) => addOrderNote(selected, body)}
          />
        </ScrollView>

        {/* Two buttons, always reachable. Moving the order lives up in the
            "Now at" card; this bar is only for acting on the record. */}
        {canEdit ? (
          <View
            style={[
              styles.footerBar,
              {
                paddingBottom: 14 + bottomInset,
                backgroundColor: theme.surface,
                borderTopColor: theme.border,
              },
            ]}
          >
            {confirmDelete ? (
              <>
                <Button label="Keep it" variant="secondary" onPress={() => setConfirmDelete(false)} style={styles.flex1} />
                <Button label="Delete for good" variant="danger" onPress={() => handleDelete(selected)} style={styles.flex1} />
              </>
            ) : (
              <>
                <Button label="Edit order" variant="secondary" onPress={() => openEdit(selected)} style={styles.flex1} />
                <Button label="Delete" variant="dangerOutline" onPress={() => setConfirmDelete(true)} style={styles.flex1} />
              </>
            )}
          </View>
        ) : null}

        <OrderSheet visible={!!sheetMode} mode={sheetMode} draft={draft} onClose={closeSheet} onChange={patchDraft} onSave={handleSave} />
      </View>
    );
  }

  // ---- List --------------------------------------------------------------

  // Chip counts include closed orders, so a chip's number always equals what
  // the working list and the two sections under it add up to.
  const filters: { id: OrdersFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: orders.length },
    ...STAGES.map((s) => ({
      id: s.id as OrdersFilter,
      label: s.short,
      count: orders.filter((o) => o.stage === s.id).length,
    })),
  ];

  const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2 } as const;

  // Most urgent first, then furthest along — the order a floor lead reads in.
  const matching = orders
    .filter((o) => filter === 'all' || o.stage === filter)
    .sort(
      (a, b) =>
        PRIORITY_RANK[priorityOf(a)] - PRIORITY_RANK[priorityOf(b)] ||
        STAGE_IDS.indexOf(b.stage) - STAGE_IDS.indexOf(a.stage),
    );

  // Finished and cancelled orders stay on the books but out of the working
  // list — they collapse into their own sections at the bottom, the same way
  // Billing treats cancelled invoices.
  const visible = matching.filter((o) => groupOf(o) === 'open');
  const completed = matching.filter((o) => groupOf(o) === 'completed');
  const cancelled = matching.filter((o) => groupOf(o) === 'cancelled');

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="Production"
        subtitle={`${openCount} order${openCount === 1 ? '' : 's'} in the pipeline`}
        showBack={showBack}
      />

      <ScrollView ref={scrollRef} contentContainerStyle={[styles.content, { paddingBottom: 110 + bottomInset }]}>
        <PermissionNotice section="order-management" />
        <PipelineSummary orders={orders} />
        <StageChips filters={filters} active={filter} onChange={setFilter} />
        {visible.length === 0 && completed.length === 0 && cancelled.length === 0 ? (
          <EmptyState icon="inbox" title="Nothing here" message="No orders sitting at this stage right now." />
        ) : (
          visible.map((o, i) => <OrderListRow key={o.id} order={o} index={i} onPress={() => openOrder(o.id)} />)
        )}

        <CollapsedSection label="Completed orders" count={completed.length} tone="muted">
          {completed.map((o, i) => (
            <OrderListRow key={o.id} order={o} index={i} onPress={() => openOrder(o.id)} />
          ))}
        </CollapsedSection>

        <CollapsedSection label="Cancelled orders" count={cancelled.length}>
          {cancelled.map((o, i) => (
            <OrderListRow key={o.id} order={o} index={i} onPress={() => openOrder(o.id)} />
          ))}
        </CollapsedSection>
      </ScrollView>

      {canEdit ? (
        <Pressable
          onPress={openNew}
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
          <Text style={[styles.fabLabel, { color: theme.accentText }]}>New order</Text>
        </Pressable>
      ) : null}

      <OrderSheet visible={!!sheetMode} mode={sheetMode} draft={draft} onClose={closeSheet} onChange={patchDraft} onSave={handleSave} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flex1: { flex: 1 },
  content: { padding: 20, paddingTop: 12, paddingBottom: 110, gap: 12 },
  // Clears the sticky footer so the last card isn't trapped underneath it.
  detailContent: { padding: 20, paddingTop: 12, paddingBottom: 120, gap: 12 },
  footerBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
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
