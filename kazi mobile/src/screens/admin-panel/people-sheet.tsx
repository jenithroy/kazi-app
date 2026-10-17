import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar, tintFromSeed } from '@/components/ui/avatar';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, radii } from '@/theme';
import type { PersonRow, RoleRow } from '@/data/admin-panel/types';
import { initialsOf } from '@/data/admin-panel/utils';

export interface PeopleSheetProps {
  visible: boolean;
  onClose: () => void;
  role: RoleRow;
  holders: PersonRow[];
  candidates: PersonRow[];
  roleLabel: (positionId: string | null) => string;
  /** Moving people between roles needs edit access to Employees & HR, not to Admin. */
  canManage: boolean;
  busyPersonId: string | null;
  onAdd: (person: PersonRow) => void;
  onRemove: (person: PersonRow) => void;
}

/** Who holds this role, and who could — written as you go, one tap per person, no draft. */
export function PeopleSheet({
  visible,
  onClose,
  role,
  holders,
  candidates,
  roleLabel,
  canManage,
  busyPersonId,
  onAdd,
  onRemove,
}: PeopleSheetProps) {
  const theme = useTheme();
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const matches = q
    ? candidates.filter((p) => `${p.name} ${p.email} ${p.department}`.toLowerCase().includes(q))
    : candidates;

  return (
    <BottomSheet visible={visible} onClose={onClose} title={role.label}>
      <View style={styles.block}>
        <View style={styles.blockHead}>
          <Text style={[styles.blockTitle, { color: theme.textPrimary }]}>In this role</Text>
          <Text style={[styles.blockCount, { color: theme.textSecondary }]}>{holders.length}</Text>
        </View>
        {holders.length === 0 ? (
          <Text style={[styles.empty, { color: theme.textSecondary }]}>
            Nobody yet — add someone below.
          </Text>
        ) : (
          <View style={[styles.list, { backgroundColor: theme.surface }]}>
            {holders.map((p, i) => (
              <PersonLine
                key={p.id}
                person={p}
                sub={p.department || p.email || '—'}
                first={i === 0}
                action={canManage ? 'remove' : null}
                busy={busyPersonId === p.id}
                onPress={() => onRemove(p)}
              />
            ))}
          </View>
        )}
      </View>

      <View style={styles.block}>
        <View style={styles.blockHead}>
          <Text style={[styles.blockTitle, { color: theme.textPrimary }]}>Add someone</Text>
        </View>

        {!canManage ? (
          <Text style={[styles.empty, { color: theme.textSecondary }]}>
            Moving people between roles needs edit access to Employees &amp; HR.
          </Text>
        ) : (
          <>
            <View style={[styles.searchRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Icon name="search" size={14} color={theme.textSecondary} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search people"
                placeholderTextColor={theme.textSecondary}
                style={[styles.searchInput, { color: theme.textPrimary, fontFamily: fontFamily.regular }]}
              />
            </View>
            {matches.length === 0 ? (
              <Text style={[styles.empty, { color: theme.textSecondary }]}>
                {candidates.length === 0
                  ? 'No other people are visible to you — that needs access to Employees & HR.'
                  : 'Nobody else matches.'}
              </Text>
            ) : (
              <View style={[styles.list, { backgroundColor: theme.surface }]}>
                {matches.slice(0, 50).map((p, i) => (
                  <PersonLine
                    key={p.id}
                    person={p}
                    sub={roleLabel(p.positionId) || 'no role'}
                    first={i === 0}
                    action="add"
                    busy={busyPersonId === p.id}
                    onPress={() => onAdd(p)}
                  />
                ))}
              </View>
            )}
          </>
        )}
      </View>
    </BottomSheet>
  );
}

function PersonLine({
  person,
  sub,
  first,
  action,
  busy,
  onPress,
}: {
  person: PersonRow;
  sub: string;
  first: boolean;
  action: 'add' | 'remove' | null;
  busy: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.person,
        first ? null : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
      ]}
    >
      <Avatar initials={initialsOf(person.name)} size="sm" tint={tintFromSeed(person.id)} />
      <View style={styles.personText}>
        <Text style={[styles.personName, { color: theme.textPrimary }]} numberOfLines={1}>
          {person.name}
        </Text>
        <Text style={[styles.personSub, { color: theme.textSecondary }]} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      {action ? (
        <Pressable
          disabled={busy}
          onPress={onPress}
          style={[
            styles.action,
            {
              backgroundColor: action === 'add' ? theme.accentWash : theme.surfaceRaised,
              borderColor: action === 'add' ? theme.accentWash : theme.border,
              opacity: busy ? 0.5 : 1,
            },
          ]}
        >
          <Text
            style={[styles.actionLabel, { color: action === 'add' ? theme.accentWashText : theme.textSecondary }]}
          >
            {busy ? '…' : action === 'add' ? 'Add' : 'Remove'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 9 },
  blockHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  blockTitle: { fontFamily: fontFamily.semibold, fontSize: 14 },
  blockCount: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  empty: { fontFamily: fontFamily.mono, fontSize: 10.5, lineHeight: 10.5 * 1.6 },
  list: { borderRadius: radii.lg, overflow: 'hidden' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    height: 42,
    paddingHorizontal: 12,
    borderRadius: 13,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12 },
  personText: { flex: 1, gap: 2, minWidth: 0 },
  personName: { fontFamily: fontFamily.semibold, fontSize: 13.5 },
  personSub: { fontFamily: fontFamily.mono, fontSize: 10 },
  action: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { fontFamily: fontFamily.semibold, fontSize: 12 },
});
