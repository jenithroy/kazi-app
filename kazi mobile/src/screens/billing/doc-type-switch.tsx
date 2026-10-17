import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import type { DocType } from '@/data/billing/types';

export interface DocTypeSwitchProps {
  active: DocType;
  counts: Record<DocType, number>;
  onChange: (type: DocType) => void;
}

const ITEMS: { id: DocType; label: string }[] = [
  { id: 'invoice', label: 'Invoices' },
  { id: 'challan', label: 'Challans' },
  { id: 'quotation', label: 'Quotations' },
];

/** Segmented switch between the three billing document types (reference `DOC_TYPES` tab row). */
export function DocTypeSwitch({ active, counts, onChange }: DocTypeSwitchProps) {
  const theme = useTheme();

  return (
    <View style={[styles.wrap, { backgroundColor: theme.draftWash }]}>
      {ITEMS.map((it) => {
        const on = it.id === active;
        return (
          <Pressable
            key={it.id}
            onPress={() => onChange(it.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.seg, on && { backgroundColor: theme.surface, boxShadow: theme.shadows.card }]}
          >
            <Text style={[styles.label, { color: on ? theme.textPrimary : theme.textSecondary }]}>{it.label}</Text>
            <Text style={[styles.count, tabularNums, { color: theme.textSecondary }]}>{counts[it.id]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', borderRadius: 14, padding: 4, gap: 4 },
  seg: { flex: 1, height: 40, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  label: { fontFamily: fontFamily.semibold, fontSize: 12.5 },
  count: { fontFamily: fontFamily.mono, fontSize: 10 },
});
