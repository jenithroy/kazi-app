import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { useAuth } from '@/auth/auth-context';
import { useToast } from '@/components/toast/toast-provider';
import { tintFromSeed } from '@/components/ui/avatar';
import { HeaderAccount } from '@/components/ui/header-account';
import { Icon } from '@/components/ui/icon';
import { PermissionNotice } from '@/components/ui/permission-notice';
import { RiseIn } from '@/components/ui/rise-in';
import { isBlocked, ScreenGate } from '@/components/ui/screen-gate';
import { useBackHandler } from '@/lib/use-back-handler';
import { useScrollTop } from '@/lib/use-scroll-top';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import {
  useAddEmployee,
  useApprovals,
  useApproveMonth,
  useDeleteEmployee,
  useEmployees,
  usePayMonths,
  usePositions,
  useRestoreEmployees,
  useUpdateEmployee,
} from '@/data/employees-hr/hooks';
import { useTeamRoster } from '@/data/attendance/hooks';
import { DEFAULT_SCHEDULE, DEFAULT_WORKING_DAYS } from '@/data/attendance/live-shared';
import { shareSalarySlipPdf } from '@/lib/pdf/salarySlip';
import { salarySlipTotals, type SalarySlipData } from '@/lib/pdf/salary-slip-template';
import { toCSV } from '@/lib/export/csv';
import { attendancePrefill } from '@/data/employees-hr/attendance-sync';
import { BANKS, DEPTS } from '@/data/employees-hr/mock';
import { currentPayMonth, npr, num, pay, toISODate } from '@/data/employees-hr/utils';
import type { Employee, EmployeeDraft, EmployeeView, MonthKey, SheetMode } from '@/data/employees-hr/types';
import { useMoneySignature } from '@/lib/money';

import { DirectoryView } from './directory-view';
import { EmployeeSheet } from './employee-sheet';
import { PayrollView, type RunPillState } from './payroll-view';
import type { RecordRowModel } from './record-row';
import { SalarySlip } from './salary-slip';
import { TabsHeader } from './tabs-header';

function blankDraft(): EmployeeDraft {
  return {
    id: null,
    name: '',
    positionId: '',
    dept: DEPTS[1],
    email: '',
    phone: '',
    joinDate: new Date().toISOString().slice(0, 10),
    pan: '',
    address: '',
    location: 'nepal',
    reportsTo: null,
    productionWorker: false,
    scheduleStart: DEFAULT_SCHEDULE.start,
    scheduleEnd: DEFAULT_SCHEDULE.end,
    scheduleWorkingDays: DEFAULT_WORKING_DAYS,
    scheduleOverrides: {},
    bank: BANKS[0],
    acct: '',
    branch: '',
    basic: '',
    active: true,
  };
}
function draftFrom(p: Employee): EmployeeDraft {
  return {
    id: p.id,
    name: p.name,
    positionId: p.positionId,
    dept: p.dept,
    email: p.email,
    phone: p.phone,
    joinDate: toISODate(p.joined),
    pan: p.pan,
    address: p.address,
    location: p.location,
    reportsTo: p.reportsTo ?? null,
    productionWorker: p.productionWorker,
    scheduleStart: p.schedule?.start ?? '',
    scheduleEnd: p.schedule?.end ?? '',
    scheduleWorkingDays: p.schedule?.workingDays.length ? p.schedule.workingDays : DEFAULT_WORKING_DAYS,
    scheduleOverrides: p.schedule?.dayOverrides ?? {},
    bank: p.bank,
    acct: p.acct,
    branch: p.branch,
    basic: num(p.basic),
    active: p.active,
  };
}

/**
 * Which fields the draft has moved off the record it was opened on. Drives the
 * unsaved-changes bar and the close guard, the way AdminPanel's `changeCount`
 * does on the web.
 */
function changedFields(draft: EmployeeDraft, baseline: EmployeeDraft): (keyof EmployeeDraft)[] {
  return (Object.keys(draft) as (keyof EmployeeDraft)[]).filter((k) => {
    if (k === 'id') return false;
    const a = draft[k];
    const b = baseline[k];
    // `scheduleWorkingDays` / `scheduleOverrides` are an array and an object —
    // identity would report every draft as dirty the moment one is rebuilt.
    if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a) !== JSON.stringify(b);
    return a !== b;
  });
}

export function EmployeesHR() {
  const theme = useTheme();
  // Money is formatted by plain functions (`@/lib/money`), so this is what
  // re-renders the screen when the currency preference or the rate changes.
  useMoneySignature();
  const toast = useToast();
  const { can, canViewPayroll } = useAuth();
  const canEdit = can('employees-hr');

  const employeesQuery = useEmployees();
  const { data: employeeRows } = employeesQuery;
  const addEmployee = useAddEmployee();
  const updateEmployee = useUpdateEmployee();
  const deleteEmployee = useDeleteEmployee();
  const restoreEmployees = useRestoreEmployees();
  const approvalsQuery = useApprovals();
  const { data: approvals } = approvalsQuery;
  const payMonthsQuery = usePayMonths();
  const { data: payMonths } = payMonthsQuery;
  const approveMonth = useApproveMonth();
  const { data: positions } = usePositions();
  const { data: attendanceTeam } = useTeamRoster();

  const [view, setView] = useState<EmployeeView>('directory');
  const scrollRef = useScrollTop(view);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  // Null until a period is picked — the default is whatever the latest stored
  // payroll run turns out to be, which isn't known until the read lands.
  const [monthKey, setMonthKey] = useState<MonthKey | null>(null);
  const [sheet, setSheet] = useState<SheetMode>(null);
  const [draft, setDraft] = useState<EmployeeDraft>(blankDraft());
  // What the sheet was opened on — `draft` is compared against it to decide
  // whether the sheet may be dismissed.
  const [baseline, setBaseline] = useState<EmployeeDraft>(blankDraft());
  const [slipId, setSlipId] = useState<number | null>(null);
  const [sharingSlip, setSharingSlip] = useState(false);

  // Directory / Payroll is this route's own tab strip; back returns to the
  // directory before it gives the screen up.
  useBackHandler(() => {
    if (view !== 'directory') {
      setView('directory');
      return true;
    }
    return false;
  });

  if (isBlocked(employeesQuery, approvalsQuery) || !employeeRows || !approvals) return (
      <ScreenGate
        queries={[employeesQuery, approvalsQuery]}
        header={<ScreenHeader title="Employees" rightSlot={<HeaderAccount />} />}
      />
    );

  // `people` has no absent / late / OT columns, so these are derived from the
  // month's roll call on every read instead of being persisted — that is what
  // puts the real cut days into `pay()`'s deduction.
  const employees = employeeRows.map((p) => {
    const pre = attendancePrefill(attendanceTeam ?? [], p);
    return pre ? { ...p, ...pre } : p;
  });

  // The periods the live `payroll` table actually holds, newest first. With none
  // filed yet there is still a screen to draw, so it falls back to this calendar
  // month — the run then shows what the roll call implies and nothing more.
  const months = payMonths?.length ? payMonths : [currentPayMonth()];
  const latest = months[0];
  const month = months.find((m) => m.key === monthKey) ?? latest;
  const approved = !!approvals[month.key];
  const runOpen = month.open && !approved;

  const active = employees.filter((e) => e.active);
  const netTotal = active.reduce((n, p) => n + pay(p, latest).net, 0);

  const q = query.trim().toLowerCase();
  const matches = (p: Employee) => !q || `${p.name} ${p.role} ${p.code} ${p.dept}`.toLowerCase().includes(q);
  const inFilter = (p: Employee) => filter === 'all' || (filter === 'active' && p.active) || (filter === 'inactive' && !p.active) || filter === p.dept;
  const list = employees.filter((p) => matches(p) && inFilter(p));

  const rosterDepts = [...new Set(employees.map((p) => p.dept).filter(Boolean))].sort();
  const filterDefs = [{ id: 'all', label: 'All' }, { id: 'active', label: 'Active' }, { id: 'inactive', label: 'Inactive' }].concat(
    rosterDepts.map((d) => ({ id: d, label: d })),
  );
  const filters = filterDefs.map((f) => ({
    id: f.id,
    label: f.label,
    count: employees.filter((p) => matches(p) && (f.id === 'all' || (f.id === 'active' && p.active) || (f.id === 'inactive' && !p.active) || f.id === p.dept)).length,
  }));

  // Someone who has left still belongs on a closed period's run, not the open one.
  const recPeople = employees.filter((p) => p.active || month.key !== latest.key);
  const runRows = recPeople.map((p) => ({ p, r: pay(p, month) }));
  const runGross = runRows.reduce((a, x) => a + x.r.gross, 0);
  const runDed = runRows.reduce((a, x) => a + x.r.ded, 0);
  const employerSsf = runRows.reduce((a, x) => a + Math.round((x.p.basic + x.p.allow) * 0.2), 0);
  const recordIsPaid = month.open ? approved : true;
  const runPillState: RunPillState = month.open ? (approved ? 'approved' : 'draft') : 'paid';

  const slipPerson = slipId ? employees.find((p) => p.id === slipId) : null;
  const slipPay = slipPerson ? pay(slipPerson, month) : null;

  const openAdd = () => {
    if (!canEdit) return;
    const fresh = blankDraft();
    setDraft(fresh);
    setBaseline(fresh);
    setSheet('add');
  };
  const openEdit = (id: number) => {
    if (!canEdit) return;
    const p = employees.find((e) => e.id === id);
    if (!p) return;
    const opened = draftFrom(p);
    setDraft(opened);
    setBaseline(opened);
    setSheet('edit');
  };
  const closeSheet = () => setSheet(null);
  const discardDraft = () => {
    setDraft(baseline);
    setSheet(null);
  };

  const changes = changedFields(draft, baseline);

  const handleSave = () => {
    if (!draft.name.trim() || !canEdit) return;
    const parsedBasic = parseInt(draft.basic.replace(/[^0-9]/g, ''), 10);
    const basic = Number.isFinite(parsedBasic) ? parsedBasic : 0;
    const position = positions?.find((p) => p.id === draft.positionId);
    // `role` is the position's label — derived, never a typed-in job title.
    const shared = {
      name: draft.name.trim(),
      positionId: draft.positionId,
      role: position?.label ?? '',
      dept: draft.dept,
      email: draft.email.trim(),
      phone: draft.phone.trim(),
      address: draft.address.trim(),
      pan: draft.pan.trim(),
      location: draft.location,
      productionWorker: draft.productionWorker,
      reportsTo: draft.reportsTo ?? undefined,
      schedule: {
        start: draft.scheduleStart.trim(),
        end: draft.scheduleEnd.trim(),
        workingDays: draft.scheduleWorkingDays,
        dayOverrides: draft.scheduleOverrides,
      },
      joined: draft.joinDate.trim(),
      bank: draft.bank,
      acct: draft.acct,
      branch: draft.branch,
      basic,
      active: draft.active,
    };

    const who = draft.name.trim();
    if (draft.id) {
      const updates: Partial<Employee> = { ...shared };
      // A NULL and a 0 basic salary both read back as "0", so an untouched field
      // must not persist one over the other.
      if (!changes.includes('basic')) delete updates.basic;
      updateEmployee.mutate(
        { id: draft.id, updates },
        {
          onSuccess: () => toast.show({ message: `${who} · record updated`, tone: 'ok' }),
          onError: () => toast.show({ message: `${who} · could not be saved`, tone: 'bad' }),
        },
      );
    } else {
      const maxCode = employees.reduce((a, p) => Math.max(a, parseInt(p.code.slice(3), 10)), 0);
      const parts = draft.name.trim().split(/\s+/);
      const initials = (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
      addEmployee.mutate(
        {
          ...shared,
          // Placeholder id for the optimistic row only — the insert ignores it,
          // and the refetch on settle replaces the row with the real one.
          id: employees.reduce((a, p) => Math.max(a, p.id), 0) + 1,
          code: `KZ-${String(maxCode + 4).padStart(4, '0')}`,
          role: shared.role || `${draft.dept} staff`,
          allow: Math.round(basic * 0.1),
          otH: 0,
          otR: 160,
          bonus: 900,
          adv: 0,
          absent: 0,
          late: 0,
          tax: 0,
          avatarInitials: initials,
          avatarTint: tintFromSeed(initials),
        },
        {
          onSuccess: () => toast.show({ message: `${who} added to the directory`, tone: 'ok' }),
          onError: () => toast.show({ message: `${who} · could not be added`, tone: 'bad' }),
        },
      );
    }
    setBaseline(draft);
    setSheet(null);
  };

  const approveRun = () => {
    if (!canEdit) return;
    const slipsCount = runRows.length;
    approveMonth.mutate(month.key);
    toast.show({ message: `${month.label.split(' ')[0]} run approved · ${slipsCount} slips generated`, tone: 'ok' });
  };
  const exportBankFile = async () => {
    const csv = toCSV(runRows, [
      { header: 'Employee', value: ({ p }) => p.name },
      { header: 'Code', value: ({ p }) => p.code },
      { header: 'Bank', value: ({ p }) => p.bank },
      { header: 'Branch', value: ({ p }) => p.branch },
      { header: 'Account', value: ({ p }) => p.acct },
      { header: 'Net NPR', value: ({ r }) => Math.round(r.net) },
    ]);
    await Clipboard.setStringAsync(csv);
    toast.show({ message: `Transfer file copied as CSV · ${runRows.length} credits`, tone: 'ok' });
  };

  const showDirectory = view === 'directory' || !canViewPayroll;

  const openSlip = (id: number) => setSlipId(id);
  const closeSlip = () => setSlipId(null);

  // Real salary-slip PDF (item 28) — expo-print → expo-sharing. The same HTML
  // the viewer is showing, so the file cannot disagree with the preview.
  const shareSlip = async () => {
    if (!slipData) return;
    const who = slipPerson?.name.split(' ')[0] ?? '';
    setSharingSlip(true);
    try {
      const shared = await shareSalarySlipPdf(slipData);
      toast.show({
        message: shared ? `${who}'s slip ready to share` : 'Slip generated — sharing unavailable on this device',
        tone: 'ok',
      });
    } catch {
      toast.show({ message: 'Could not generate the salary slip', tone: 'bad' });
    } finally {
      setSharingSlip(false);
    }
  };

  const handleDeleteEmployee = () => {
    if (!draft.id || !canEdit) return;
    const p = employees.find((e) => e.id === draft.id);
    const before = employeeRows;
    deleteEmployee.mutate(draft.id);
    setSheet(null);
    toast.show({
      message: `${p?.name ?? 'Employee'} marked inactive · login revoked`,
      tone: 'ok',
      action: { label: 'Undo', onPress: () => restoreEmployees.mutate(before) },
    });
  };

  /**
   * The slip's figures, mapped onto the web ERP's own row set so the printed
   * sheet is the same document (see `salary-slip-template.ts`). Mobile keeps
   * grade allowance and the festival bonus apart; the reference has one
   * "Allowances" row, so they are summed. The SSF employee contribution rides
   * in "Other Payment", which is the reference's provident-fund slot — no
   * figure is dropped, and the totals come out identical to `pay()`.
   */
  let slipData: SalarySlipData | null = null;
  if (slipPerson && slipPay) {
    const rate = slipPerson.basic > 0 && slipPerson.tax > 0
      ? Math.round((slipPerson.tax / slipPerson.basic) * 1000) / 10
      : 1;
    slipData = {
      fileName: `payslip-${slipPerson.code}-${month.label.replace(' ', '').toLowerCase()}.pdf`,
      empId: slipPerson.code,
      empName: slipPerson.name,
      designation: slipPerson.role,
      // The reference's short form, e.g. `Aug-26`.
      monthYear: month.label.replace(' 20', '-'),
      basicSalary: slipPerson.basic,
      allowances: slipPerson.allow + slipPerson.bonus,
      otSalary: slipPay.ot,
      receivableDue: 0,
      advance: slipPerson.adv,
      taxRatePct: rate,
      incomeTax: slipPerson.tax,
      leaveDayDeduction: slipPay.cut,
      otherPayment: slipPay.ssf,
    };
  }
  const slipMeta = slipData
    ? `${month.period} · ${(month.open ? approved : true) ? `paid ${month.payDate}` : 'pending approval'} · net ${npr(salarySlipTotals(slipData).netSalary)}`
    : '';

  const records: RecordRowModel[] = runRows.map((x) => ({
    id: x.p.id,
    name: x.p.name,
    initials: x.p.avatarInitials,
    tint: x.p.avatarTint,
    paidDays: `${month.days - x.r.absent}/${month.days} days`,
    dedLabel: x.r.ded > 0 ? `− ${npr(x.r.ded)}` : 'no deductions',
    hasDeduction: x.r.ded > 0,
    net: npr(x.r.net),
    state: recordIsPaid ? 'Paid' : 'Pending',
    isPaid: recordIsPaid,
  }));

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScreenHeader title="Employees" subtitle={`${employees.length} on roll · Balaju plant`} rightSlot={<HeaderAccount />} />
      <TabsHeader view={view} onChange={setView} showPayroll={canViewPayroll} />

      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        <PermissionNotice section="employees-hr" />
        {/* Directory and Payroll are alternatives in the same frame — they
            rise in place rather than travelling. */}
        <RiseIn viewKey={showDirectory ? 'directory' : 'payroll'}>
          {showDirectory ? (
            <DirectoryView
              activeCount={active.length}
              netPayrollTotal={npr(netTotal)}
              rollNote={`${employees.length - active.length} inactive · avg net ${npr(Math.round(netTotal / Math.max(active.length, 1)))}`}
              runStatusNote={`${latest.label.split(' ')[0]} run ${approvals[latest.key] ? 'approved' : 'open'}`}
              query={query}
              onQueryChange={setQuery}
              filters={filters}
              activeFilter={filter}
              onFilterChange={setFilter}
              people={list.map((p) => ({ id: p.id, name: p.name, role: p.role, code: p.code, initials: p.avatarInitials, tint: p.avatarTint, active: p.active }))}
              onOpenPerson={openEdit}
            />
          ) : (
            <PayrollView
              months={months.map((m) => ({ key: m.key, label: m.label, state: m.open ? (approvals[m.key] ? 'approved' : 'draft') : 'paid' }))}
              activeMonth={month.key}
              onMonthChange={setMonthKey}
              runTitle={`Payroll run · ${month.label}`}
              runPillState={runPillState}
              runGross={npr(runGross)}
              runDeductions={`− ${npr(runDed)}`}
              runNet={npr(runGross - runDed)}
              runMeta={`${runRows.length} staff · ${month.days} working days · pay date ${month.payDate}`}
              runOpen={runOpen}
              approveLabel={`Approve run · generate ${runRows.length} slips`}
              onApprove={approveRun}
              onExportBankFile={exportBankFile}
              recordCount={`${runRows.length} · ${month.label}`}
              records={records}
              onOpenSlip={openSlip}
              employerNote={`${npr(employerSsf)} payable to SSF for ${month.label} · deposit by the 15th of the following month`}
            />
          )}
        </RiseIn>
      </ScrollView>

      {showDirectory && canEdit ? (
        <Pressable
          onPress={openAdd}
          style={[styles.fab, { backgroundColor: theme.accent, boxShadow: theme.scheme === 'light' ? '0 12px 26px -12px rgba(20,122,87,0.95)' : undefined }]}
        >
          <Icon name="plus" size={18} color={theme.accentText} />
          <Text style={[styles.fabLabel, { color: theme.accentText }]}>Add employee</Text>
        </Pressable>
      ) : null}

      <EmployeeSheet
        visible={sheet !== null}
        mode={sheet}
        draft={draft}
        onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        onClose={closeSheet}
        onSave={handleSave}
        sheetMeta={sheet === 'edit' ? `${draft.dept} · joined ${employees.find((p) => p.id === draft.id)?.joined ?? ''}` : 'New record · Balaju plant'}
        saveHint={sheet === 'edit' ? 'Changes apply from the next run' : 'Added to the current month'}
        saveCode={sheet === 'edit' ? (employees.find((p) => p.id === draft.id)?.code ?? '') : 'KZ-next'}
        positions={positions ?? []}
        managers={employees.filter((p) => p.id !== draft.id).map((p) => ({ id: p.id, name: p.name, role: p.role }))}
        dirty={changes.length > 0}
        changeCount={changes.length}
        onDiscard={discardDraft}
        onViewSlip={() => draft.id && openSlip(draft.id)}
        onDelete={sheet === 'edit' ? handleDeleteEmployee : undefined}
      />

      <SalarySlip
        visible={slipId !== null}
        slip={slipData}
        meta={slipMeta}
        busy={sharingSlip}
        onClose={closeSlip}
        onShare={shareSlip}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingTop: 4, paddingBottom: 110, gap: 16 },
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
