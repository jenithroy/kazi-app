import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, radii } from '@/theme';
import { GROUP_CAPABILITIES, type GroupCapability } from '@/data/admin-panel/types';

export interface ChatGroupsCardProps {
  valueFor: (capability: GroupCapability) => boolean;
  isChanged: (capability: GroupCapability) => boolean;
  onToggle: (capability: GroupCapability, value: boolean) => void;
  locked: boolean;
  isSuperAdmin: boolean;
}

/**
 * Who may start and reshape group conversations.
 *
 * Two switches rather than the three-way picker the pages use: there is no
 * "view" of a group separate from being in one, so the only question is
 * whether the role may do the thing. Reading a group you belong to is covered
 * by the Messenger page grant above.
 *
 * Always visible, even for a role with Messenger switched off — a permission
 * that vanishes when its prerequisite is off is a permission nobody can find
 * again. It simply has no effect until Messenger is granted.
 */
export function ChatGroupsCard({ valueFor, isChanged, onToggle, locked, isSuperAdmin }: ChatGroupsCardProps) {
  const theme = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.head}>
        <Icon name="users" size={15} color={theme.textSecondary} />
        <Text style={[styles.title, { color: theme.textPrimary }]}>Chat groups</Text>
        <Text style={[styles.note, { color: theme.textSecondary }]}>
          {isSuperAdmin ? 'both, always' : `${GROUP_CAPABILITIES.filter((c) => valueFor(c.key)).length} of 2`}
        </Text>
      </View>

      {GROUP_CAPABILITIES.map((capability) => {
        const on = valueFor(capability.key);
        const changed = isChanged(capability.key);
        return (
          <View
            key={capability.key}
            style={[
              styles.row,
              { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
              changed ? { backgroundColor: theme.accentWash } : null,
            ]}
          >
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>{capability.label}</Text>
              <Text style={[styles.rowHint, { color: theme.textSecondary }]}>{capability.hint}</Text>
            </View>
            <View style={locked ? styles.disabled : null} pointerEvents={locked ? 'none' : 'auto'}>
              <Switch value={on} onValueChange={() => onToggle(capability.key, !on)} />
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
