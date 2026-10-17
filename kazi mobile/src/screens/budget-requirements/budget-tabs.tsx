import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import type { BudgetTab } from '@/data/budget-requirements/types';

export interface BudgetTabsProps {
  active: BudgetTab;
  /** Pending count per tab — shown as a badge. */
  pending: Record<BudgetTab, number>;
  onChange: (tab: BudgetTab) => void;
}

const TABS: { id: BudgetTab; label: string }[] = [
  { id: 'requests', label: 'Budget Requests' },
  { id: 'requirements', label: 'Requirements' },
];

/** Two-tab switcher (reference `Budget.jsx`) with a pending-count badge on each. */
export function BudgetTabs({ active, pending, onChange }: BudgetTabsProps) {
  const theme = useTheme();
  return (
    <View style={[styles.wrap, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      {TABS.map((t) => {
        const on = active === t.id;
        const count = pending[t.id];
        return (
          <Pressable
            key={t.id}
            onPress={() => onChange(t.id)}
            style={[styles.tab, on && { backgroundColor: theme.selectedSurface, borderColor: theme.selectedBorder }]}
          >
            <Text style={[styles.label, { color: on ? theme.selectedText : theme.textPrimary }]}>{t.label}</Text>
            {count > 0 ? (
              <View style={[styles.badge, { backgroundColor: on ? theme.onDark.accent : theme.warning }]}>
                <Text style={[styles.badgeText, tabularNums, { color: on ? theme.accentText : theme.warningText }]}>{count}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 3, padding: 3, borderRadius: 13, borderWidth: 1 },
  tab: { flex: 1, height: 38, borderRadius: 10, borderWidth: 1, borderColor: 'transparent', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  label: { fontFamily: fontFamily.semibold, fontSize: 13 },
  badge: { minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: fontFamily.mono, fontSize: 10.5, fontWeight: '700' },
});
