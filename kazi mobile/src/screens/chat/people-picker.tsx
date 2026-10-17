import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import type { Person, PersonId } from '@/data/chat/types';

export interface PeoplePickerProps {
  people: Person[];
  /** `select` shows a chevron and fires on tap; `check` toggles membership. */
  mode: 'select' | 'check';
  picked?: PersonId[];
  onPress: (id: PersonId) => void;
  /** Rows that cannot be turned off — the group's own owner, say. */
  locked?: PersonId[];
  emptyNote?: string;
}

/**
 * The searchable staff list, shared by "new message", "new group" and "edit
 * group" so all three rank, filter and render people identically.
 *
 * Sorted on shift first, then alphabetically: a shop floor question goes to
 * whoever is actually in the building, and that is the ordering that puts
 * them at the top without anyone having to think about it.
 */
export function PeoplePicker({ people, mode, picked = [], onPress, locked = [], emptyNote }: PeoplePickerProps) {
  const theme = useTheme();
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const sorted = [...people].sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((p) => `${p.name} ${p.role} ${p.status} ${p.email ?? ''}`.toLowerCase().includes(q));
  }, [people, query]);

  return (
    <>
      <View style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Icon name="search" size={16} color={theme.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search people"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          style={[styles.searchInput, { color: theme.textPrimary, fontFamily: fontFamily.regular }]}
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Icon name="x" size={14} color={theme.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.list}>
        {visible.map((person) => {
          const selected = picked.includes(person.id);
          const isLocked = locked.includes(person.id);
          return (
            <Pressable
              key={person.id}
              onPress={() => !isLocked && onPress(person.id)}
              disabled={isLocked}
              style={({ pressed }) => [
                styles.person,
                {
                  backgroundColor: selected ? theme.accentWash : pressed ? theme.background : theme.surface,
                  borderColor: selected ? theme.accent : theme.border,
                  opacity: isLocked ? 0.6 : 1,
                },
              ]}
            >
              <Avatar initials={person.initials} tint={person.avatarTint} size="md" online={person.online} />
              <View style={styles.personText}>
                <Text style={[styles.personName, { color: theme.textPrimary }]} numberOfLines={1}>
                  {person.name}
                </Text>
                <Text style={[styles.personRole, { color: theme.textSecondary }]} numberOfLines={1}>
                  {person.status ? `${person.role} · ${person.status}` : person.role}
                </Text>
              </View>
              <Icon
                name={mode === 'select' ? 'chevron-right' : selected ? 'check-circle' : 'circle'}
                size={18}
                color={selected ? theme.accentWashText : theme.textSecondary}
              />
            </Pressable>
          );
        })}

        {visible.length === 0 ? (
          <Text style={[styles.empty, { color: theme.textSecondary }]}>
            {query.trim() ? `No one matches “${query.trim()}”` : (emptyNote ?? 'Nobody to show')}
          </Text>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 46,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  list: {
    gap: 8,
  },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderRadius: 16,
    borderWidth: 1,
    padding: 11,
  },
  personText: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  personName: {
    fontFamily: fontFamily.semibold,
    fontSize: 14.5,
  },
  personRole: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.08 * 10,
    textTransform: 'uppercase',
  },
  empty: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    textAlign: 'center',
    paddingVertical: 20,
  },
});
