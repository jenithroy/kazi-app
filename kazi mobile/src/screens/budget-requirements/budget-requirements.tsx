import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { canApprove } from '@/auth/permissions';
import { useToast } from '@/components/toast/toast-provider';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { PermissionNotice } from '@/components/ui/permission-notice';
import { isBlocked, ScreenGate } from '@/components/ui/screen-gate';
import { useBackHandler } from '@/lib/use-back-handler';
import { useScrollTop } from '@/lib/use-scroll-top';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ViewSwap } from '@/components/ui/view-swap';
import { toGBP } from '@/lib/currency';
import { useCurrency } from '@/lib/currency-context';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import {
  useAddBudgetRequest,
  useAddRequirement,
  useBudgetRequests,
  useRequirements,
  useRestoreBudgetRequests,
  useRestoreRequirements,
  useUpdateBudgetRequest,
  useUpdateRequirement,
} from '@/data/budget-requirements/hooks';
import { CAP, REVIEW_STATUS, STATUS, seedRequirements } from '@/data/budget-requirements/mock';
import { gbp, money, short } from '@/data/budget-requirements/utils';
import { useMoneySignature } from '@/lib/money';
import type {
  BudgetRequest,
  BudgetRequestDraft,
  BudgetTab,
  Requirement,
  RequirementDraft,
  RequirementsFilter,
  RequirementsView,
  RequestStatus,
  ReviewStatus,
} from '@/data/budget-requirements/types';

import { AddSheet } from './add-sheet';
import { BudgetTabs } from './budget-tabs';
import { DetailView } from './detail-view';
import { ListSummary } from './list-summary';
import { RequestDetailView } from './request-detail-view';
import { RequestGroup } from './request-group';
import { RequestSheet } from './request-sheet';
import { RequirementGroup } from './requirement-group';
import { ReviewFilters } from './review-filters';

function emptyDraft(): RequirementDraft {
  return { cat: 'Raw Materials', item: '', quantity: '', amount: '', amountGBP: '', autoSide: null, priority: 'Medium', by: 'This week', note: '', quote: false };
}

function emptyRequestDraft(): BudgetRequestDraft {
  return { title: '', category: 'Equipment', amountGBP: '', urgency: 'Medium', justification: '' };
}

/**
 * Outermost first — `ViewSwap` reads the direction of travel from this. The two
 * detail views are only ever reached from the list and left back to it, never
 * one to the other, so their relative order does not come into play.
 */
const BUDGET_VIEW_ORDER = ['list', 'requirement', 'request'] as const;

export function BudgetRequirements() {
  const theme = useTheme();
  // Money is formatted by plain functions (`@/lib/money`), so this is what
  // re-renders the screen when the currency preference or the rate changes.
  useMoneySignature();
  // The NPR/GBP twin a request is filed with is booked at the rate of the day.
  const { rate } = useCurrency();
  const toast = useToast();
  const { profile, can } = useAuth();

  const requirementsQuery = useRequirements();
  const { data: requirements } = requirementsQuery;
  const requestsQuery = useBudgetRequests();
  const { data: requests } = requestsQuery;
  const addRequirement = useAddRequirement();
  const updateRequirement = useUpdateRequirement();
  const restoreRequirements = useRestoreRequirements();
  const addBudgetRequest = useAddBudgetRequest();
  const updateBudgetRequest = useUpdateBudgetRequest();
  const restoreBudgetRequests = useRestoreBudgetRequests();

  const canRaise = can('budget-requirements');
  const isAdmin = canApprove(profile);
  // The live `requested_by` / `reviewed_by` columns hold real names — anything
  // invented here is written straight into the web ERP's rows.
  const me = profile?.name?.trim() ?? '';
  const myTeam = profile?.jobRole?.trim() ?? '';

  const [tab, setTab] = useState<BudgetTab>('requests');
  const [filter, setFilter] = useState<RequirementsFilter>('all');
  const [reqStatus, setReqStatus] = useState<'all' | ReviewStatus>('all');
  const [reqUrgency, setReqUrgency] = useState<string>('all');
  const [view, setView] = useState<RequirementsView>('list');
  const scrollRef = useScrollTop(`${view}:${tab}`);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedReqId, setSelectedReqId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [draft, setDraft] = useState<RequirementDraft>(emptyDraft());
  const [reqDraft, setReqDraft] = useState<BudgetRequestDraft>(emptyRequestDraft());

  // Detail first, then the Requests/Requirements switch — the two views this
  // route holds beyond its list.
  useBackHandler(() => {
    if (view === 'detail') {
      setView('list');
      setSelectedId(null);
      setSelectedReqId(null);
      return true;
    }
    if (tab !== 'requests') {
      setTab('requests');
      return true;
    }
    return false;
  });

  if (isBlocked(requirementsQuery, requestsQuery) || !requirements || !requests) return (
      <ScreenGate
        queries={[requirementsQuery, requestsQuery]}
        header={<ScreenHeader title="Budget & Requirements" />}
      />
    );

  const pendingReqs = requirements.filter((r) => r.status === 'pending');
  const pendingRequests = requests.filter((r) => r.status === 'Pending');
  const pendingByTab: Record<BudgetTab, number> = { requests: pendingRequests.length, requirements: pendingReqs.length };

  const flash = (message: string, undo: () => void) => {
    toast.show({ message, tone: 'ok', action: { label: 'Undo', onPress: undo } });
  };

  const openDetail = (id: string) => {
    setSelectedId(id);
    setView('detail');
  };
  const openRequestDetail = (id: string) => {
    setSelectedReqId(id);
    setView('detail');
  };
  const backToList = () => {
    setView('list');
    setSelectedId(null);
    setSelectedReqId(null);
  };

  // ---- Requirements tab ----
  const selected = requirements.find((r) => r.id === selectedId) ?? null;

  let rows = requirements;
  if (filter === 'pending') rows = rows.filter((r) => r.status === 'pending');
  if (filter === 'high') rows = rows.filter((r) => r.priority === 'High');
  if (filter === 'mine') rows = rows.filter((r) => !!me && r.who === me);

  const approvedTotal = requirements.filter((r) => r.status === 'approved').reduce((n, r) => n + r.amount, 0);
  const pendingTotal = pendingReqs.reduce((n, r) => n + r.amount, 0);
  const pct = (n: number) => Math.min(100, Math.round((n / CAP) * 100));

  const buckets: { key: string; title: string; rows: Requirement[] }[] = [
    { key: 'pending', title: isAdmin ? 'Awaiting your decision' : 'Waiting for approval', rows: rows.filter((r) => r.status === 'pending') },
    { key: 'decided', title: 'Decided', rows: rows.filter((r) => r.status !== 'pending') },
  ].filter((b) => b.rows.length);

  const filters: { id: RequirementsFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: requirements.length },
    { id: 'pending', label: 'Pending', count: pendingReqs.length },
    { id: 'high', label: 'High', count: requirements.filter((r) => r.priority === 'High').length },
    { id: 'mine', label: 'Mine', count: requirements.filter((r) => !!me && r.who === me).length },
  ];

  const decide = (item: Requirement, status: RequestStatus) => {
    const before = requirements;
    updateRequirement.mutate({ id: item.id, updates: { status, decidedBy: me || undefined } });
    backToList();
    flash(`${item.ref} ${STATUS[status].label.toLowerCase()} · ${money(item.amount)}`, () => restoreRequirements.mutate(before));
  };

  const openAdd = () => {
    setDraft(emptyDraft());
    setAddOpen(true);
  };

  const handleSubmit = () => {
    const amount = parseInt(draft.amount.replace(/[^0-9]/g, ''), 10);
    if (!amount) {
      toast.show({ message: 'Add an estimated amount to submit', tone: 'bad' });
      return;
    }
    const gbpTyped = parseFloat(draft.amountGBP.replace(/[^0-9.]/g, ''));
    const amountGBP = gbpTyped > 0 ? Math.round(gbpTyped) : Math.round(toGBP(amount, rate));
    const before = requirements;
    const n = 185 + (requirements.length - seedRequirements.length);
    const entry: Requirement = {
      id: `n${Date.now()}`,
      ref: `REQ-0${n}`,
      item: draft.item.trim() || 'Unspecified requirement',
      cat: draft.cat,
      quantity: draft.quantity.trim() || '—',
      amount,
      amountGBP,
      priority: draft.priority,
      status: 'pending',
      who: me || 'You',
      init: profile?.initials || '—',
      team: myTeam || 'Staff',
      date: '23 Aug',
      by: draft.by,
      quote: draft.quote ? 'IMG · just now' : 'Not attached',
      note: draft.note.trim() || 'No context given.',
    };
    addRequirement.mutate(entry);
    setAddOpen(false);
    flash(`${entry.ref} sent for approval`, () => restoreRequirements.mutate(before));
  };

  // ---- Budget Requests tab ----
  const selectedRequest = requests.find((r) => r.id === selectedReqId) ?? null;

  const requestRows = requests
    .filter((r) => reqStatus === 'all' || r.status === reqStatus)
    .filter((r) => reqUrgency === 'all' || r.urgency === reqUrgency);
  const requestBuckets: { key: string; title: string; rows: BudgetRequest[] }[] = [
    { key: 'pending', title: isAdmin ? 'Awaiting your decision' : 'Waiting for a UK director', rows: requestRows.filter((r) => r.status === 'Pending') },
    { key: 'decided', title: 'Decided', rows: requestRows.filter((r) => r.status !== 'Pending') },
  ].filter((b) => b.rows.length);
  const requestStatusOptions = [
    { id: 'all', label: 'All', count: requests.length },
    ...(['Pending', 'Approved', 'Rejected'] as ReviewStatus[]).map((s) => ({ id: s, label: s, count: requests.filter((r) => r.status === s).length })),
  ];
  const approvedGBP = requests.filter((r) => r.status === 'Approved').reduce((n, r) => n + r.amountGBP, 0);
  const pendingGBP = pendingRequests.reduce((n, r) => n + r.amountGBP, 0);

  const openRequest = () => {
    setReqDraft(emptyRequestDraft());
    setRequestOpen(true);
  };

  const handleSubmitRequest = () => {
    const amountGBP = parseFloat(reqDraft.amountGBP.replace(/[^0-9.]/g, '')) || 0;
    if (amountGBP <= 0 || reqDraft.justification.trim().length < 12) {
      toast.show({ message: 'Add an amount and a justification', tone: 'bad' });
      return;
    }
    const before = requests;
    const nextNum = 43 + requests.filter((r) => r.id.startsWith('n')).length;
    const entry: BudgetRequest = {
      id: `n${Date.now()}`,
      ref: `BR-00${nextNum}`,
      title: reqDraft.title.trim() || 'Untitled request',
      category: reqDraft.category,
      amountGBP,
      amountNPR: Math.round(amountGBP * rate),
      urgency: reqDraft.urgency,
      status: 'Pending',
      justification: reqDraft.justification.trim(),
      requestedBy: profile?.name ?? 'You',
      requestedByRole: profile?.jobRole ?? 'Staff',
      date: '23 Aug',
    };
    addBudgetRequest.mutate(entry);
    setRequestOpen(false);
    flash(`${entry.ref} sent to the UK directors`, () => restoreBudgetRequests.mutate(before));
  };

  const decideRequest = (item: BudgetRequest, status: ReviewStatus) => {
    const before = requests;
    updateBudgetRequest.mutate({ id: item.id, updates: { status, reviewedBy: profile?.name ?? 'UK director' } });
    backToList();
    flash(`${item.ref} ${REVIEW_STATUS[status].label.toLowerCase()} · ${gbp(item.amountGBP)}`, () => restoreBudgetRequests.mutate(before));
  };

  // ---- Detail views ----
  if (view === 'detail' && tab === 'requirements' && selected) {
    return (
      <ViewSwap viewKey="requirement" order={BUDGET_VIEW_ORDER} style={[styles.flex, { backgroundColor: theme.background }]}>
        <ScreenHeader title={selected.item} subtitle={`${selected.ref} · ${selected.cat}`} onBack={backToList} />
        <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
          <DetailView
            item={selected}
            canDecide={selected.status === 'pending' && isAdmin}
            awaitingAdmin={selected.status === 'pending' && !isAdmin}
            onApprove={() => decide(selected, 'approved')}
            onDecline={() => decide(selected, 'declined')}
          />
        </ScrollView>
      </ViewSwap>
    );
  }

  if (view === 'detail' && tab === 'requests' && selectedRequest) {
    return (
      <ViewSwap viewKey="request" order={BUDGET_VIEW_ORDER} style={[styles.flex, { backgroundColor: theme.background }]}>
        <ScreenHeader title={selectedRequest.title} subtitle={`${selectedRequest.ref} · ${selectedRequest.category}`} onBack={backToList} />
        <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
          <RequestDetailView
            item={selectedRequest}
            canDecide={selectedRequest.status === 'Pending' && isAdmin}
            awaitingReviewer={selectedRequest.status === 'Pending' && !isAdmin}
            onApprove={() => decideRequest(selectedRequest, 'Approved')}
            onReject={() => decideRequest(selectedRequest, 'Rejected')}
          />
        </ScrollView>
      </ViewSwap>
    );
  }

  return (
    <ViewSwap viewKey="list" order={BUDGET_VIEW_ORDER} style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="Budget & Requirements"
        subtitle={`${pendingRequests.length + pendingReqs.length} awaiting a decision`}
      />

      <View style={styles.tabsWrap}>
        <BudgetTabs
          active={tab}
          pending={pendingByTab}
          onChange={(t) => {
            setTab(t);
            backToList();
          }}
        />
      </View>

      {tab === 'requirements' ? (
        <>
          <ListSummary
            approvedTotal={short(approvedTotal)}
            pendingTotal={short(pendingTotal)}
            capLeft={short(Math.max(0, CAP - approvedTotal))}
            capPct={pct(approvedTotal)}
            pendPct={pct(pendingTotal)}
            capLine={`${pct(approvedTotal)}% committed`}
            capOf={`cap ${short(CAP)}`}
            isAdmin={isAdmin}
            queueTitle={pendingReqs.length === 1 ? '1 request needs your decision' : `${pendingReqs.length} requests need your decision`}
            queueSub={pendingReqs.length ? `${short(pendingTotal)} · oldest ${pendingReqs[pendingReqs.length - 1].ref}` : 'queue clear'}
            onShowPending={() => setFilter('pending')}
            filters={filters}
            activeFilter={filter}
            onFilterChange={setFilter}
          />

          <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
            <PermissionNotice section="budget-requirements" message="View only — you can’t raise or decide requests." />
            {rows.length === 0 ? (
              <EmptyState icon="file-text" title="Nothing waiting here" message={`Clear the filter to see all ${requirements.length} requests raised this month.`} />
            ) : (
              buckets.map((b) => (
                <RequirementGroup key={b.key} title={b.title} total={short(b.rows.reduce((n, r) => n + r.amount, 0))} rows={b.rows} isAdmin={isAdmin} onOpen={openDetail} />
              ))
            )}
          </ScrollView>

          {canRaise ? (
            <Pressable
              onPress={openAdd}
              style={[styles.fab, { backgroundColor: theme.accent, boxShadow: theme.scheme === 'light' ? '0 12px 26px -12px rgba(20,122,87,0.95)' : undefined }]}
            >
              <Icon name="plus" size={18} color={theme.accentText} />
              <Text style={[styles.fabLabel, { color: theme.accentText }]}>New requirement</Text>
            </Pressable>
          ) : null}
        </>
      ) : (
        <>
          <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
            <PermissionNotice section="budget-requirements" message="View only — you can’t raise or decide requests." />

            <View style={[styles.requestStat, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.requestStatCell}>
                <Text style={[styles.requestStatValue, { color: theme.textPrimary }]}>{gbp(pendingGBP)}</Text>
                <Text style={[styles.requestStatLabel, { color: theme.textSecondary }]}>Pending · {pendingRequests.length}</Text>
              </View>
              <View style={[styles.requestStatDivider, { backgroundColor: theme.border }]} />
              <View style={styles.requestStatCell}>
                <Text style={[styles.requestStatValue, { color: theme.textPrimary }]}>{gbp(approvedGBP)}</Text>
                <Text style={[styles.requestStatLabel, { color: theme.textSecondary }]}>Approved this month</Text>
              </View>
            </View>

            <ReviewFilters
              status={reqStatus}
              urgency={reqUrgency}
              statusOptions={requestStatusOptions}
              onStatus={(id) => setReqStatus(id as 'all' | ReviewStatus)}
              onUrgency={setReqUrgency}
            />

            {requestBuckets.length === 0 ? (
              <EmptyState icon="file-text" title="No requests here" message="Clear the filters to see every budget request." />
            ) : (
              requestBuckets.map((b) => (
                <RequestGroup
                  key={b.key}
                  title={b.title}
                  total={gbp(b.rows.reduce((n, r) => n + r.amountGBP, 0))}
                  rows={b.rows}
                  isReviewer={isAdmin}
                  onOpen={openRequestDetail}
                />
              ))
            )}
          </ScrollView>

          {canRaise ? (
            <Pressable
              onPress={openRequest}
              style={[styles.fab, { backgroundColor: theme.accent, boxShadow: theme.scheme === 'light' ? '0 12px 26px -12px rgba(20,122,87,0.95)' : undefined }]}
            >
              <Icon name="plus" size={18} color={theme.accentText} />
              <Text style={[styles.fabLabel, { color: theme.accentText }]}>New request</Text>
            </Pressable>
          ) : null}
        </>
      )}

      <AddSheet
        visible={addOpen}
        draft={draft}
        who={`Raised as ${me || 'You'}${myTeam ? ` · ${myTeam}` : ''}`}
        onClose={() => setAddOpen(false)}
        onChange={(p) => setDraft((d) => ({ ...d, ...p }))}
        onSubmit={handleSubmit}
      />

      <RequestSheet
        visible={requestOpen}
        draft={reqDraft}
        who={`Raised as ${profile?.name ?? 'You'}${profile?.jobRole ? ` · ${profile.jobRole}` : ''}`}
        onClose={() => setRequestOpen(false)}
        onChange={(p) => setReqDraft((d) => ({ ...d, ...p }))}
        onSubmit={handleSubmitRequest}
      />
    </ViewSwap>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabsWrap: { paddingHorizontal: 20, paddingBottom: 12 },
  content: { padding: 20, paddingTop: 4, paddingBottom: 110, gap: 16 },
  requestStat: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, padding: 16 },
  requestStatCell: { flex: 1, gap: 4 },
  requestStatDivider: { width: 1, alignSelf: 'stretch', marginHorizontal: 14 },
  requestStatValue: { fontFamily: fontFamily.semibold, fontSize: 20, letterSpacing: -0.02 * 20 },
  requestStatLabel: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.08 * 10, textTransform: 'uppercase' },
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
