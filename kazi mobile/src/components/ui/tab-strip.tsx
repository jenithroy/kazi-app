import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';

export interface TabDef<T extends string> {
  id: T;
  label: string;
  /** Optional count badge (e.g. unpaid expenses, VAT bills). */
  count?: number;
}

export interface TabStripProps<T extends string> {
  tabs: TabDef<T>[];
  active: T;
  onChange: (id: T) => void;
}

/**
 * The horizontal pill tab strip used by every multi-tab hub screen — Finance
 * and Inventory both mirror a wide reference page whose tabs cannot fit across
 * a phone, so the strip scrolls instead of wrapping or collapsing.
 */
export function TabStrip<T extends string>({ tabs, active, onChange }: TabStripProps<T>) {
  const theme = useTheme();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip} contentContainerStyle={styles.row}>
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <Pressable
            key={t.id}
            onPress={() => onChange(t.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.tab, { backgroundColor: on ? theme.selectedSurface : theme.surface, borderColor: on ? theme.selectedBorder : theme.border }]}
          >
            <Text style={[styles.label, { color: on ? theme.selectedText : theme.textPrimary }]}>{t.label}</Text>
            {typeof t.count === 'number' && t.count > 0 ? (
              <View style={[styles.badge, { backgroundColor: on ? theme.selectedBadge : theme.draftWash }]}>
                <Text style={[styles.badgeText, tabularNums, { color: on ? theme.selectedBadgeText : theme.textSecondary }]}>{t.count}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Without this the strip is a flex sibling of the tab body's ScrollView and gets
  // squeezed, clipping the bottom of the pills — size it to its content instead.
  strip: { flexGrow: 0, flexShrink: 0 },
  row: { alignItems: 'center', gap: 7, paddingHorizontal: 20, paddingBottom: 12 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1 },
  label: { fontFamily: fontFamily.semibold, fontSize: 12.5 },
  badge: { minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: fontFamily.mono, fontSize: 10 },
});
