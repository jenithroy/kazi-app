import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, tintFromSeed, type AvatarTint } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { ErrorState } from '@/components/ui/error-state';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import { initialsOf } from '@/data/tasks/mock';
import { useCustomers } from '@/data/customers/hooks';

export interface CustomerPickerProps {
  /** Display name of the current customer; `''` for none. */
  value: string;
  onChange: (name: string) => void;
}

/**
 * Picks a real customer out of the live Customers list. Tasks store the
 * customer's **name** (matching the reference ERP), so the chosen value is the
 * name string, not an id.
 */
export function CustomerPicker({ value, onChange }: CustomerPickerProps) {
  const theme = useTheme();
  const { data: customers, isLoading, isError, error, refetch, isFetching } = useCustomers();

  if (isLoading) {
    return (
      <View style={styles.pending}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  // A denied/failed read looks identical to an empty list once the rows are
  // gone — picking "No customer" because the list failed to load would
  // quietly clear a real one.
  if (isError) {
    return <ErrorState error={error} onRetry={refetch} retrying={isFetching} />;
  }

  const known = customers ?? [];
  const orphaned = value && !known.some((c) => c.name === value);

  return (
    <View style={styles.list}>
      <Row
        initials="—"
        name="No customer"
        detail="This task isn't tied to a customer"
        selected={value === ''}
        onPress={() => onChange('')}
        muted
      />
      {orphaned ? <Row initials="?" name={value} detail="Not in the customer list" selected onPress={() => onChange(value)} /> : null}
      {known.map((c) => (
        <Row
          key={c.id}
          initials={initialsOf(c.name)}
          name={c.name}
          detail={c.contact}
          tint={tintFromSeed(c.name)}
          selected={value === c.name}
          onPress={() => onChange(c.name)}
        />
      ))}
      {known.length === 0 ? (
        <Text style={[styles.empty, { color: theme.textSecondary }]}>No customers to pick from yet.</Text>
      ) : null}
    </View>
  );
}

function Row({
  initials,
  name,
  detail,
  tint,
  selected,
  onPress,
  muted = false,
}: {
  initials: string;
  name: string;
  detail: string;
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
        {detail ? (
          <Text style={[styles.detail, { color: theme.textSecondary }]} numberOfLines={1}>
            {detail}
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
  detail: { fontSize: 11.5 },
  empty: { fontSize: 12.5, lineHeight: 18 },
});
