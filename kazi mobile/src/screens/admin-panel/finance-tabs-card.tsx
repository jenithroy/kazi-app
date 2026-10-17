import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, radii } from '@/theme';
import type { AccessLevel, FinanceTabRow } from '@/data/admin-panel/types';

import { LevelPicker } from './level-picker';

export interface FinanceTabsCardProps {
  tabs: FinanceTabRow[];
  levelFor: (tabId: string) => AccessLevel;
  isChanged: (tabId: string) => boolean;
  onLevel: (tabId: string, level: AccessLevel) => void;
  locked: boolean;
}

/** The tabs inside Finance, gated one by one — collapsed by default, since most roles never reach them. */
export function FinanceTabsCard({ tabs, levelFor, isChanged, onLevel, locked }: FinanceTabsCardProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  const granted = tabs.filter((t) => levelFor(t.id) !== 'none').length;

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={({ pressed }) => [styles.head, { opacity: pressed ? 0.85 : 1 }]}
      >
        <Icon name="pie-chart" size={15} color={theme.textSecondary} />
        <Text style={[styles.title, { color: theme.textPrimary }]}>Finance tabs</Text>
        <Text style={[styles.note, { color: theme.textSecondary }]}>
          {granted} of {tabs.length} granted
        </Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textSecondary} />
      </Pressable>

      {open ? (
        <Animated.View entering={FadeIn.duration(160)}>
          {tabs.map((t) => {
            const changed = isChanged(t.id);
            return (
              <View
                key={t.id}
                style={[
                  styles.row,
                  { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
                  changed ? { backgroundColor: theme.accentWash } : null,
                ]}
              >
                <Text style={[styles.rowLabel, { color: theme.textPrimary }]} numberOfLines={1}>
                  {t.label}
                </Text>
                <LevelPicker value={levelFor(t.id)} onChange={(lv) => onLevel(t.id, lv)} disabled={locked} />
              </View>
            );
          })}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.lg, borderWidth: 1, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 14, paddingHorizontal: 14 },
  title: { flex: 1, fontFamily: fontFamily.semibold, fontSize: 14 },
  note: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 14 },
  rowLabel: { flex: 1, fontFamily: fontFamily.regular, fontSize: 14, minWidth: 0 },
});
