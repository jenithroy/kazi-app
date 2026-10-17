import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import type { Person, PersonId, Thread } from '@/data/chat/types';
import { personFor, threadInitials, threadTint } from '@/data/chat/utils';

import { ActionRow } from './action-row';
import { PeoplePicker } from './people-picker';

export interface GroupSheetProps {
  /** The group being edited; null closes the sheet. */
  thread: Thread | null;
  people: Person[];
  /** False when this position has no "manage groups" grant — the sheet then reads as a members list. */
  canManage: boolean;
  busy: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (name: string, memberIds: PersonId[]) => void;
  /** Thread-level actions, offered when the sheet is opened as "group info" from the header. */
  muted?: boolean;
  onToggleMute?: () => void;
  onLeave?: () => void;
}

/**
 * Rename a group and change who is in it.
 *
 * Read-only for a position without the grant, rather than hidden: knowing who
 * else is in a conversation you are already in is not a privilege, and a
 * members list somebody cannot edit is still the thing they came here for.
 *
 * Remounted per open by the caller (`key`), so the draft starts from the
 * group as it currently stands without an effect resetting it.
 */
export function GroupSheet({
  thread,
  people,
  canManage,
  busy,
  error,
  onClose,
  onSave,
  muted = false,
  onToggleMute,
  onLeave,
}: GroupSheetProps) {
  const theme = useTheme();
  const [name, setName] = useState(thread?.name ?? '');
  const [members, setMembers] = useState<PersonId[]>(thread?.memberIds ?? []);

  const toggle = (id: PersonId) => setMembers((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const trimmed = name.trim();
  const changed = trimmed !== (thread?.name ?? '') || members.length !== (thread?.memberIds.length ?? 0)
    || members.some((id) => !thread?.memberIds.includes(id));
  const valid = trimmed.length > 0 && members.length >= 2;

  const owner = thread?.ownerId ? personFor(thread.ownerId) : null;
  const leaving = (thread?.memberIds ?? []).filter((id) => !members.includes(id));
  // Presence, not roster: how many of them have an open punch right now.
  const onShift = (thread?.memberIds ?? []).filter((id) => personFor(id).online).length;
  const started = thread?.createdAt
    ? new Date(thread.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  return (
    <BottomSheet visible={!!thread} onClose={onClose} title="Group info" maxHeight={700}>
      {thread ? (
        <>
          <View style={[styles.identity, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Avatar initials={threadInitials(thread)} tint={threadTint(thread)} size="lg" />
            <View style={styles.identityText}>
              <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>
                {thread.name}
              </Text>
              <Text style={[styles.meta, { color: theme.textSecondary }]} numberOfLines={1}>
                {thread.memberIds.length + 1} members · {onShift} on shift
              </Text>
              {owner || started ? (
                <Text style={[styles.meta, { color: theme.textSecondary }]} numberOfLines={1}>
                  {[owner ? `Started by ${owner.name}` : null, started].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
            </View>
          </View>

          {canManage ? (
            <TextField label="Group name" value={name} onChangeText={setName} placeholder="e.g. Line 4 leads" autoCapitalize="sentences" />
          ) : null}

          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
            {canManage ? `Members · ${members.length + 1} including you` : `Members · ${thread.memberIds.length + 1}`}
          </Text>

          <PeoplePicker
            people={canManage ? people : people.filter((p) => thread.memberIds.includes(p.id))}
            mode="check"
            picked={canManage ? members : thread.memberIds}
            onPress={(id) => canManage && toggle(id)}
            // Without the grant every row is inert; this is a list, not a form.
            locked={canManage ? [] : thread.memberIds}
            emptyNote="Nobody else is in this group"
          />

          {canManage && leaving.length > 0 ? (
            <Text style={[styles.warning, { color: theme.warningWashText }]}>
              {leaving.map((id) => personFor(id).name).join(', ')} will be removed. They keep the messages they have
              already seen, and adding them back restores the conversation.
            </Text>
          ) : null}

          {error ? <Text style={[styles.error, { color: theme.dangerWashText }]}>{error}</Text> : null}

          {canManage ? (
            <View style={styles.footer}>
              <Button
                label={busy ? 'Saving…' : 'Save group'}
                variant="primary"
                fullWidth
                disabled={!valid || !changed}
                loading={busy}
                onPress={() => onSave(trimmed, members)}
              />
              {!valid ? (
                <Text style={[styles.hint, { color: theme.textSecondary }]}>
                  A group needs a name and at least two other people.
                </Text>
              ) : null}
            </View>
          ) : null}

          {onToggleMute || onLeave ? (
            <View style={styles.actions}>
              {onToggleMute ? (
                <ActionRow
                  icon={muted ? 'bell' : 'bell-off'}
                  label={muted ? 'Unmute this group' : 'Mute this group'}
                  detail={muted ? 'Notifications come back on' : 'No notifications from this group'}
                  onPress={onToggleMute}
                />
              ) : null}
              {onLeave ? (
                <ActionRow
                  icon="log-out"
                  label="Leave this group"
                  detail="You stop receiving its messages"
                  destructive
                  onPress={onLeave}
                />
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 13,
  },
  identityText: { flex: 1, gap: 3, minWidth: 0 },
  name: { fontFamily: fontFamily.semibold, fontSize: 16, letterSpacing: -0.01 * 16 },
  meta: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.08 * 10,
    textTransform: 'uppercase',
  },
  sectionLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.12 * 10,
    textTransform: 'uppercase',
    marginBottom: -8,
  },
  warning: { fontFamily: fontFamily.mono, fontSize: 10.5, lineHeight: 10.5 * 1.6 },
  error: { fontFamily: fontFamily.mono, fontSize: 11, lineHeight: 11 * 1.5 },
  hint: { fontFamily: fontFamily.mono, fontSize: 10.5, textAlign: 'center' },
  footer: { gap: 8 },
  actions: { gap: 2 },
});
