import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, radii } from '@/theme';
import type { NotificationCategoryRow } from '@/data/admin-panel/types';

export interface NotificationsCardProps {
  categories: NotificationCategoryRow[];
  valueFor: (categoryId: string) => boolean;
  isChanged: (categoryId: string) => boolean;
  onToggle: (categoryId: string, value: boolean) => void;
  locked: boolean;
}

/**
 * Which broadcast-style notifications this role receives — "new order",
 * "invoice created", and the like. Never touches the personal notifications
 * everyone always gets (a task assigned to you, a message in a thread you're
 * in) — those aren't a role setting, they're "you're the one it's about."
 */
export function NotificationsCard({ categories, valueFor, isChanged, onToggle, locked }: NotificationsCardProps) {
  const theme = useTheme();
  const onCount = categories.filter((c) => valueFor(c.id)).length;

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.head}>
        <Icon name="bell" size={15} color={theme.textSecondary} />
        <Text style={[styles.title, { color: theme.textPrimary }]}>Notifications</Text>
        <Text style={[styles.note, { color: theme.textSecondary }]}>
          {onCount} of {categories.length} on
        </Text>
      </View>

      {categories.map((category) => {
        const on = valueFor(category.id);
        const changed = isChanged(category.id);
        return (
          <View
            key={category.id}
            style={[
              styles.row,
              { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
              changed ? { backgroundColor: theme.accentWash } : null,
            ]}
          >
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>{category.label}</Text>
              <Text style={[styles.rowHint, { color: theme.textSecondary }]}>{category.hint}</Text>
            </View>
            <View style={locked ? styles.disabled : null} pointerEvents={locked ? 'none' : 'auto'}>
              <Switch value={on} onValueChange={() => onToggle(category.id, !on)} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.lg, borderWidth: 1, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 14, paddingHorizontal: 14 },
  title: { flex: 1, fontFamily: fontFamily.semibold, fontSize: 14 },
  note: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  rowText: { flex: 1, gap: 3, minWidth: 0 },
  rowLabel: { fontFamily: fontFamily.regular, fontSize: 14 },
  rowHint: { fontFamily: fontFamily.mono, fontSize: 10, lineHeight: 10 * 1.6 },
  disabled: { opacity: 0.45 },
});
