import { Pressable, StyleSheet, Text, View } from 'react-native';

import { holdersOf, chipLetters } from '@/data/roles/rules';
import type { Position, RoleGroup, StaffPerson } from '@/data/roles/types';
import { fontFamily } from '@/theme';
import { useTheme } from '@/theme/theme-provider';

interface Props {
  groups: RoleGroup[];
  active: StaffPerson[];
  mineId: string | null;
  selectedId: string | null;
  onPick: (id: string) => void;
  directoryVisible: boolean;
}

/**
 * The roles, grouped by where their people are (UK, Nepal), each as a chip with its two-letter mark, its name and how many hold it.
 * Your own role is tagged. A phone has no room for the website's side rail, so the chips wrap across the screen instead.
 */
export function RolePicker({ groups, active, mineId, selectedId, onPick, directoryVisible }: Props) {
  const theme = useTheme();

  return (
    <View style={styles.wrap}>
      {groups.map((group) => (
        <View key={group.key} style={styles.group}>
          {groups.length > 1 || group.key !== 'all' ? (
            <Text style={[styles.groupLabel, { color: theme.textSecondary }]}>{group.label}</Text>
          ) : null}
          <View style={styles.chips}>
            {group.roles.map((role) => (
              <RoleChip
                key={role.id}
                role={role}
                count={directoryVisible ? holdersOf(active, role.id).length : null}
                mine={role.id === mineId}
                selected={role.id === selectedId}
                onPick={onPick}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function RoleChip({ role, count, mine, selected, onPick }: { role: Position; count: number | null; mine: boolean; selected: boolean; onPick: (id: string) => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => onPick(role.id)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${role.label}${count != null ? `, ${count} ${count === 1 ? 'person' : 'people'}` : ''}${mine ? ', your role' : ''}`}
      style={[
        styles.chip,
        selected
          ? { backgroundColor: theme.selectedSurface, borderColor: theme.selectedBorder }
          : { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <View style={[styles.mark, { backgroundColor: selected ? theme.selectedBadge : theme.accentWash }]}>
        <Text style={[styles.markText, { color: selected ? theme.selectedBadgeText : theme.accentWashText }]}>{chipLetters(role.label)}</Text>
      </View>
      <Text style={[styles.label, { color: selected ? theme.selectedText : theme.textPrimary }]} numberOfLines={1}>
        {role.label}
      </Text>
      {count != null ? (
        <Text style={[styles.count, { color: selected ? theme.selectedTextMuted : theme.textSecondary }]}>{count}</Text>
      ) : null}
      {mine ? (
        <View style={[styles.you, { backgroundColor: theme.accentWash }]}>
          <Text style={[styles.youText, { color: theme.accentWashText }]}>You</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  group: { gap: 8 },
  groupLabel: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.12 * 10, textTransform: 'uppercase' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, borderWidth: 1, paddingVertical: 6, paddingLeft: 6, paddingRight: 12, maxWidth: '100%' },
  mark: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  markText: { fontFamily: fontFamily.semibold, fontSize: 10.5 },
  label: { fontFamily: fontFamily.medium, fontSize: 13.5, flexShrink: 1 },
  count: { fontFamily: fontFamily.mono, fontSize: 11 },
  you: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  youText: { fontFamily: fontFamily.semibold, fontSize: 10.5 },
});
