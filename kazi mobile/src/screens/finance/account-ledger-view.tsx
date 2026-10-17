import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Money } from '@/components/ui/money';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums, type Theme } from '@/theme';
import type { AccountLedger, AccountSummary, LedgerRow } from '@/data/finance/ledger';
import type { AccountType } from '@/data/finance/types';
import { money, moneyDigits, useMoneySignature } from '@/lib/money';
import { useCalendarPreference } from '@/lib/calendar-preference';
import { dateText } from '@/lib/date-display';

export interface AccountLedgerViewProps {
  ledgers: AccountLedger[];
  summaries: AccountSummary[];
  canEdit: boolean;
  /** Account pills — `'all'` plus one id per Cash/Bank ledger. */
  filters: { id: string; label: string; count: number }[];
  activeFilter: string;
  onFilterChange: (id: string) => void;
  /** Tap the opening-balance chip on a Cash/Bank card. */
  onEditOpening: (accountName: string, current: number) => void;
  /** Tap a movement row — edits it, or jumps to the source screen. */
  onOpenRow: (accountName: string, row: LedgerRow) => void;
}

const npr = (n: number) => money(n, { grouping: 'en-IN' });

/** Table columns print the amount bare — the currency is on the account card above them. */
const num = (n: number) => moneyDigits(n, 'en-IN');

/** `05 Sep 26` — the row's meta line also carries the reference, so it stays short. */
const shortDate = (iso: string) => dateText(iso, { bsStyle: 'numeric' });

function typeColor(theme: Theme, type: AccountType, balance: number): string {
  if (type === 'Asset' || type === 'Expense') return balance >= 0 ? theme.textPrimary : theme.dangerWashText;
  return balance >= 0 ? theme.accentWashText : theme.dangerWashText;
}

export function AccountLedgerView({
  ledgers,
  summaries,
  canEdit,
  filters,
  activeFilter,
  onFilterChange,
  onEditOpening,
  onOpenRow,
}: AccountLedgerViewProps) {
  const theme = useTheme();
  // These figures come from plain formatters, so the view subscribes to the currency itself.
  useMoneySignature();
  // `shortDate` reads the calendar preference too.
  useCalendarPreference();

  const shown = activeFilter === 'all' ? ledgers : ledgers.filter((l) => l.account === activeFilter);
  const otherAccounts = summaries.filter((s) => !ledgers.some((l) => l.account === s.name) && (s.count > 0 || s.balance !== 0));

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
        {filters.map((f) => {
          const on = activeFilter === f.id;
          return (
            <Pressable
              key={f.id}
              onPress={() => onFilterChange(f.id)}
              style={[styles.chip, { backgroundColor: on ? theme.selectedSurface : theme.surface, borderColor: on ? theme.selectedBorder : theme.border }]}
            >
              <Text style={[styles.chipLabel, { color: on ? theme.selectedText : theme.textPrimary }]} numberOfLines={1}>
                {f.label}
              </Text>
              <Text style={[styles.chipCount, tabularNums, { color: on ? theme.selectedTextMuted : theme.textSecondary }]}>{f.count}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {shown.map((l) => (
        <View key={l.account} style={[styles.card, { backgroundColor: theme.surface, boxShadow: theme.shadows.card }]}>
          <View style={styles.cardHead}>
            <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>{l.account}</Text>
            <Money npr={l.closing} size={16} align="right" />
          </View>
          <Pressable
            onPress={canEdit ? () => onEditOpening(l.account, l.opening) : undefined}
            style={[styles.openingChip, { backgroundColor: theme.draftWash }]}
          >
            <Text style={[styles.openingText, tabularNums, { color: theme.textSecondary }]}>
              Opening {npr(l.opening)}
              {canEdit ? ' · edit' : ''}
            </Text>
          </Pressable>

          <View style={[styles.tableHead, { borderBottomColor: theme.border }]}>
            <Text style={[styles.thParticulars, { color: theme.textSecondary }]}>Particulars</Text>
            <Text style={[styles.thNum, { color: theme.textSecondary }]}>Dr</Text>
            <Text style={[styles.thNum, { color: theme.textSecondary }]}>Cr</Text>
            <Text style={[styles.thNum, { color: theme.textSecondary }]}>Balance</Text>
          </View>

          {l.rows.length === 0 ? (
            <Text style={[styles.emptyRow, { color: theme.textSecondary }]}>No movements yet</Text>
          ) : (
            l.rows.map((r, i) => (
              <Pressable
                key={i}
                onPress={canEdit ? () => onOpenRow(l.account, r) : undefined}
                style={[styles.tr, { borderBottomColor: theme.background }]}
              >
                <View style={styles.tdParticulars}>
                  <Text style={[styles.rowTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                    {r.particulars}
                  </Text>
                  <Text style={[styles.rowRef, tabularNums, { color: theme.textSecondary }]} numberOfLines={1}>
                    {r.date ? shortDate(r.date) : '—'}
                    {r.ref ? ` · ${r.ref}` : ''}
                  </Text>
                </View>
                <Text style={[styles.tdNum, tabularNums, { color: r.dr ? theme.accentWashText : theme.textSecondary }]}>
                  {r.dr ? num(r.dr) : '—'}
                </Text>
                <Text style={[styles.tdNum, tabularNums, { color: r.cr ? theme.dangerWashText : theme.textSecondary }]}>
                  {r.cr ? num(r.cr) : '—'}
                </Text>
                <Text style={[styles.tdNum, tabularNums, { color: theme.textPrimary, fontWeight: '600' }]}>
                  {num(r.balance)}
                </Text>
              </Pressable>
            ))
          )}
        </View>
      ))}

      {otherAccounts.length > 0 ? (
        <>
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Other accounts</Text>
          <View style={styles.grid}>
            {otherAccounts.map((s) => (
              <View key={s.id} style={[styles.gridCard, { backgroundColor: theme.surface, boxShadow: theme.shadows.card }]}>
                <View style={styles.gridHead}>
                  <Text style={[styles.gridName, { color: theme.textPrimary }]} numberOfLines={1}>
                    {s.name}
                  </Text>
                  <View style={[styles.typePill, { backgroundColor: theme.draftWash }]}>
                    <Text style={[styles.typePillText, { color: theme.textSecondary }]}>{s.type}</Text>
                  </View>
                </View>
                <Text style={[styles.gridBalance, tabularNums, { color: typeColor(theme, s.type, s.balance) }]}>
                  {npr(s.balance)}
                </Text>
                <Text style={[styles.gridMeta, tabularNums, { color: theme.textSecondary }]}>
                  Dr {num(s.dr)} · Cr {num(s.cr)} · {s.count} {s.count === 1 ? 'entry' : 'entries'}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  chipsRow: { gap: 7, paddingBottom: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1 },
  chipLabel: { fontFamily: fontFamily.semibold, fontSize: 12.5, maxWidth: 150 },
  chipCount: { fontFamily: fontFamily.mono, fontSize: 10.5, opacity: 0.85 },
  card: { borderRadius: 18, padding: 15, gap: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  cardTitle: { fontFamily: fontFamily.semibold, fontSize: 15 },
  openingChip: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  openingText: { fontFamily: fontFamily.mono, fontSize: 10 },
  tableHead: { flexDirection: 'row', borderBottomWidth: 1, paddingBottom: 6, marginTop: 2 },
  thParticulars: { flex: 1, fontFamily: fontFamily.mono, fontSize: 9, letterSpacing: 0.1 * 9, textTransform: 'uppercase' },
  thNum: { width: 64, textAlign: 'right', fontFamily: fontFamily.mono, fontSize: 9, letterSpacing: 0.1 * 9, textTransform: 'uppercase' },
  emptyRow: { fontSize: 12, paddingVertical: 8 },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1 },
  tdParticulars: { flex: 1, gap: 2, minWidth: 0, paddingRight: 6 },
  rowTitle: { fontSize: 12.5, fontWeight: '600' },
  rowRef: { fontFamily: fontFamily.mono, fontSize: 9.5 },
  tdNum: { width: 64, textAlign: 'right', fontSize: 11, fontFamily: fontFamily.mono },
  sectionLabel: { fontFamily: fontFamily.mono, fontSize: 10.5, letterSpacing: 0.12 * 10.5, textTransform: 'uppercase', paddingHorizontal: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridCard: { width: '47%', flexGrow: 1, borderRadius: 16, padding: 13, gap: 6 },
  gridHead: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'space-between' },
  gridName: { flex: 1, fontSize: 12.5, fontWeight: '600' },
  typePill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  typePillText: { fontFamily: fontFamily.mono, fontSize: 8.5, textTransform: 'uppercase' },
  gridBalance: { fontSize: 15, fontWeight: '600' },
  gridMeta: { fontFamily: fontFamily.mono, fontSize: 9 },
});
