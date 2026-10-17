import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { useToast } from '@/components/toast/toast-provider';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { PermissionNotice } from '@/components/ui/permission-notice';
import { isBlocked, ScreenGate } from '@/components/ui/screen-gate';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useScrollTop } from '@/lib/use-scroll-top';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import {
  useAddBugReport,
  useBugReports,
  useRestoreBugReports,
  useUpdateBugStatus,
} from '@/data/bug-reports/hooks';
import { isRelayConfigured } from '@/data/bug-reports/api';
import { NEXT_STATUS, SEVERITY_META } from '@/data/bug-reports/mock';
import type { BugReportDraft, SeverityFilter, StatusFilter } from '@/data/bug-reports/types';

import { DetailSheet } from './detail-sheet';
import { FilterBar } from './filter-bar';
import { ReportRow } from './report-row';
import { ReportSheet } from './report-sheet';

const EMPTY_DRAFT: BugReportDraft = { title: '', area: 'Other', severity: 'medium', steps: '', screenshot: false };

export function BugReports() {
  const theme = useTheme();
  const scrollRef = useScrollTop();
  const toast = useToast();
  const { can, profile } = useAuth();
  const canEdit = can('bug-report');

  const reportsQuery = useBugReports();
  const { data: reports } = reportsQuery;
  const addReport = useAddBugReport();
  const updateStatus = useUpdateBugStatus();
  const restoreReports = useRestoreBugReports();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [draft, setDraft] = useState<BugReportDraft | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (isBlocked(reportsQuery) || !reports) return <ScreenGate queries={[reportsQuery]} header={<ScreenHeader title="Bug Report" />} />;

  const selected = reports.find((r) => r.id === selectedId) ?? null;

  let rows = reports;
  if (statusFilter !== 'all') rows = rows.filter((r) => r.status === statusFilter);
  if (severityFilter !== 'all') rows = rows.filter((r) => r.severity === severityFilter);
  rows = rows
    .slice()
    .sort((a, b) => SEVERITY_META[b.severity].order - SEVERITY_META[a.severity].order || b.createdAt.localeCompare(a.createdAt));

  const openCount = reports.filter((r) => r.status === 'open' || r.status === 'in-progress').length;
  const relayOn = isRelayConfigured();

  const patchDraft = (patch: Partial<BugReportDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const handleSubmit = () => {
    if (!draft) return;
    addReport.mutate(
      { draft, reportedBy: profile?.name ?? 'You' },
      {
        onSuccess: (created) =>
          toast.show({ message: relayOn ? `${created.ref} sent to Discord` : `${created.ref} saved on this phone`, tone: 'ok' }),
        onError: (err) => toast.show({ message: err instanceof Error ? err.message : 'Report not sent', tone: 'bad' }),
      },
    );
    setDraft(null);
  };

  const changeStatus = (advance: boolean) => {
    if (!selected) return;
    const nextStatus = advance ? NEXT_STATUS[selected.status] : 'open';
    if (!nextStatus) return;
    const before = reports;
    updateStatus.mutate({ id: selected.id, status: nextStatus });
    toast.show({
      message: `${selected.ref} → ${nextStatus === 'in-progress' ? 'in progress' : nextStatus}`,
      tone: 'ok',
      action: { label: 'Undo', onPress: () => restoreReports.mutate(before) },
    });
  };

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScreenHeader title="Bug Report" subtitle={`${openCount} open · ${reports.length} total`} />

      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        {!canEdit ? <PermissionNotice section="bug-report" message="View only — you can’t file or update reports here." /> : null}

        {/* There is no bug-report table in the ERP database — Discord is the shared copy. */}
        <View style={[styles.notice, { backgroundColor: theme.draftWash, borderColor: theme.border }]}>
          <Icon name="info" size={14} color={theme.textSecondary} />
          <Text style={[styles.noticeText, { color: theme.textSecondary }]}>
            {relayOn
              ? 'Sent to the team’s Discord channel, and kept here on this phone so you can see what you reported.'
              : 'Not connected yet — reports stay on this phone and nobody else can see them.'}
          </Text>
        </View>

        <FilterBar
          reports={reports}
          status={statusFilter}
          severity={severityFilter}
          onStatusChange={setStatusFilter}
          onSeverityChange={setSeverityFilter}
        />

        {rows.length === 0 ? (
          <EmptyState
            icon="check-circle"
            title={reports.length === 0 ? 'No reports yet' : 'Nothing here'}
            message={
              reports.length === 0
                ? 'Hit something odd? Tap + to report it.'
                : 'No reports match these filters.'
            }
          />
        ) : (
          rows.map((r, i) => <ReportRow key={r.id} report={r} index={i} onPress={() => setSelectedId(r.id)} />)
        )}
      </ScrollView>

      {canEdit ? (
        <Pressable
          onPress={() => setDraft({ ...EMPTY_DRAFT })}
          style={[styles.fab, { backgroundColor: theme.accent, boxShadow: theme.scheme === 'light' ? '0 12px 26px -12px rgba(20,122,87,0.95)' : undefined }]}
        >
          <Icon name="plus" size={24} color={theme.accentText} />
        </Pressable>
      ) : null}

      <ReportSheet visible={!!draft} draft={draft} onClose={() => setDraft(null)} onChange={patchDraft} onSubmit={handleSubmit} />

      <DetailSheet
        report={selected}
        canEdit={canEdit}
        onClose={() => setSelectedId(null)}
        onAdvance={() => changeStatus(true)}
        onReopen={() => changeStatus(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingTop: 4, paddingBottom: 100, gap: 12 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  noticeText: { flex: 1, fontFamily: fontFamily.medium, fontSize: 12, lineHeight: 12 * 1.4 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
