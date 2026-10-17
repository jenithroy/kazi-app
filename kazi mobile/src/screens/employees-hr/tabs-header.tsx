import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import type { EmployeeView } from '@/data/employees-hr/types';

export interface TabsHeaderProps {
  view: EmployeeView;
  onChange: (v: EmployeeView) => void;
  /** Payroll is salary data — only shown to profiles holding the `payroll` permission. */
  showPayroll: boolean;
}

const TABS: { id: EmployeeView; label: string; admin?: boolean }[] = [
  { id: 'directory', label: 'Directory' },
  { id: 'payroll', label: 'Payroll', admin: true },
];

export function TabsHeader({ view, onChange, showPayroll }: TabsHeaderProps) {
  const theme = useTheme();

  // Without Payroll there is only Directory left, and a one-tab switcher is
  // just a label taking up a row — drop it entirely.
  if (!showPayroll) return null;

  return (
    <View style={styles.outer}>
      <View style={[styles.segmented, { backgroundColor: theme.draftWash }]}>
        {TABS.map((t) => {
          const on = view === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => onChange(t.id)}
              style={[styles.segmentButton, t.admin && styles.payrollButton, { backgroundColor: on ? theme.segmentSurface : 'transparent', borderColor: on ? theme.segmentBorder : 'transparent', boxShadow: on ? theme.shadows.card : undefined }]}
            >
              <Text style={[styles.segmentLabel, { color: on ? theme.segmentText : theme.textSecondary }]}>{t.label}</Text>
              {t.admin ? <Text style={[styles.adminBadge, { color: on ? theme.segmentText : theme.textSecondary }]}>ADMIN</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { paddingHorizontal: 20, paddingBottom: 12 },
  segmented: { flexDirection: 'row', padding: 4, borderRadius: 14, gap: 4 },
  segmentButton: { flex: 1, height: 38, borderRadius: 11, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  payrollButton: { flexDirection: 'row', gap: 7 },
  segmentLabel: { fontFamily: fontFamily.semibold, fontSize: 13.5 },
  adminBadge: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.08 * 10, opacity: 0.7 },
});
