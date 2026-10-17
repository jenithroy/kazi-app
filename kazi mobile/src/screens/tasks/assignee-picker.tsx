import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, type AvatarTint } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { ErrorState } from '@/components/ui/error-state';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import { useAssignees } from '@/data/tasks/hooks';

export interface AssigneePickerProps {
  /** Display name of the current assignee; `''` for unassigned. */
  value: string;
  onChange: (name: string) => void;
}

/**
 * Picks a real person out of the live Employee Directory. Tasks store the
 * assignee's **name** (that's what the reference ERP writes), so the chosen
 * value is the name string, not an id.
 */
export function AssigneePicker({ value, onChange }: AssigneePickerProps) {
  const theme = useTheme();
  const { data: people, isLoading, isError, error, refetch, isFetching } = useAssignees();

  if (isLoading) {
    return (
      <View style={styles.pending}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  // An empty picker and an unreachable directory look identical once the rows
  // are gone, and picking "Unassigned" because the list failed to load would
  // quietly clear a real assignee.
  if (isError) {
    return <ErrorState error={error} onRetry={refetch} retrying={isFetching} />;
  }

  // Someone assigned on the web who has since left the directory would otherwise
  // vanish from the picker and be silently reassigned on the next save.
  const known = people ?? [];
  const orphaned = value && !known.some((p) => p.name === value);

  return (
    <View style={styles.list}>
      <Row
        initials="—"
        name="Unassigned"
        role="Nobody has picked this up"
        selected={value === ''}
        onPress={() => onChange('')}
        muted
      />
      {orphaned ? <Row initials="?" name={value} role="Not in the directory" selected onPress={() => onChange(value)} /> : null}
      {known.map((p) => (
        <Row
          key={p.id}
          initials={p.initials}
          name={p.name}
          role={p.role}
          tint={p.tint}
          selected={value === p.name}
          onPress={() => onChange(p.name)}
        />
      ))}
      {known.length === 0 ? (
        <Text style={[styles.empty, { color: theme.textSecondary }]}>
          No active staff in the Employee Directory to assign to.
        </Text>
      ) : null}
    </View>
  );
}

function Row({
  initials,
  name,
  role,
  tint,
  selected,
  onPress,
  muted = false,
}: {
  initials: string;
  name: string;
  role: string;
  tint?: AvatarTint;
  selected: boolean;
  onPress: () => void;
  muted?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.row,
        {
          backgroundColor: selected ? theme.accentWash : theme.surface,
          borderColor: selected ? theme.accent : theme.border,
        },
      ]}
    >
      <Avatar initials={initials} tint={muted ? 'draft' : tint} size="md" />
      <View style={styles.text}>
        <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>
          {name}
        </Text>
        {role ? (
          <Text style={[styles.role, { color: theme.textSecondary }]} numberOfLines={1}>
            {role}
          </Text>
        ) : null}
      </View>
      {selected ? <Icon name="check" size={16} color={theme.accentWashText} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  pending: { paddingVertical: 24, alignItems: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  text: { flex: 1, gap: 2, minWidth: 0 },
  name: { fontFamily: fontFamily.semibold, fontSize: 14 },
  role: { fontSize: 11.5 },
  empty: { fontSize: 12.5, lineHeight: 18 },
});
