import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { ALL_SECTIONS, FINANCE_TABS, type FinanceTabId, type SectionId } from '@/auth/permissions';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';

const SECTION_LABEL: Record<SectionId, string> = {
  dashboard: 'Dashboard',
  tasks: 'Tasks',
  inventory: 'Inventory',
  library: 'Product library',
  finance: 'Finance',
  sales: 'Sales',
  'order-management': 'Orders',
  customers: 'Customers',
  billing: 'Billing',
  purchases: 'Purchases',
  production: 'Production',
  accounting: 'Accounting',
  'budget-requirements': 'Budget & Requirements',
  'employees-hr': 'Employees & HR',
  attendance: 'Attendance',
  marketing: 'Marketing',
  messenger: 'Chat',
  'admin-panel': 'Admin Panel',
  changelog: 'Changelog',
  'bug-report': 'Bug Report',
  usage: 'Usage & Activity',
};

const FINANCE_LABEL: Record<FinanceTabId, string> = {
  expenses: 'Expenses',
  payroll: 'Payroll',
  purchases: 'Purchases',
  'vat-bills': 'VAT bills',
  journal: 'Journal',
  ledger: 'Ledger',
  pnl: 'P&L',
  'balance-sheet': 'Balance sheet',
  bank: 'Bank',
  'order-pnl': 'Order P&L',
  kpi: 'KPI',
  'day-book': 'Day Book',
};

function Chips({ items, muted }: { items: string[]; muted?: boolean }) {
  const theme = useTheme();
  if (items.length === 0) {
    return <Text style={[styles.empty, { color: theme.textSecondary }]}>None</Text>;
  }
  return (
    <View style={styles.chips}>
      {items.map((label) => (
        <View
          key={label}
          style={[
            styles.chip,
            {
              borderColor: theme.border,
              backgroundColor: muted ? 'transparent' : theme.draftWash,
            },
          ]}
        >
          <Text style={[styles.chipText, { color: muted ? theme.textSecondary : theme.textPrimary }]}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

export function AccessSummary() {
  const theme = useTheme();
  const { canView, can, financeTab, profile } = useAuth();

  const visible = useMemo(
    () => ALL_SECTIONS.filter((s) => canView(s)).map((s) => SECTION_LABEL[s]),
    [canView],
  );
  const editable = useMemo(
    () => ALL_SECTIONS.filter((s) => can(s)).map((s) => SECTION_LABEL[s]),
    [can],
  );
  const financeTabs = useMemo(
    () => (canView('finance') ? FINANCE_TABS.filter((t) => financeTab(t)).map((t) => FINANCE_LABEL[t]) : []),
    [canView, financeTab],
  );

  const hasOverrides = profile?.permissions && Object.keys(profile.permissions).length > 0;

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, boxShadow: theme.shadows.raised, borderColor: theme.border }]}>
      <View style={styles.headRow}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Your access</Text>
        <Text style={[styles.count, { color: theme.textSecondary }]}>
          {visible.length} of {ALL_SECTIONS.length}
        </Text>
      </View>

      <View style={styles.group}>
        <Text style={[styles.groupLabel, { color: theme.textSecondary }]}>Can open</Text>
        <Chips items={visible} />
      </View>

      <View style={styles.group}>
        <Text style={[styles.groupLabel, { color: theme.textSecondary }]}>Can edit</Text>
        <Chips items={editable} muted />
      </View>

      {canView('finance') ? (
        <View style={styles.group}>
          <Text style={[styles.groupLabel, { color: theme.textSecondary }]}>Finance tabs</Text>
          <Chips items={financeTabs} muted />
        </View>
      ) : null}

      <Text style={[styles.footnote, { color: theme.textSecondary }]}>
        {hasOverrides
          ? 'Some access is set individually on your profile by an administrator.'
          : 'Access follows your role. An administrator can adjust it per person.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 14 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: fontFamily.semibold, fontSize: 15 },
  count: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.12 * 10,
    textTransform: 'uppercase',
  },
  group: { gap: 8 },
  groupLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.12 * 10,
    textTransform: 'uppercase',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  chipText: { fontFamily: fontFamily.semibold, fontSize: 11.5 },
  empty: { fontFamily: fontFamily.medium, fontSize: 12.5 },
  footnote: { fontSize: 11.5, lineHeight: 11.5 * 1.5 },
});
