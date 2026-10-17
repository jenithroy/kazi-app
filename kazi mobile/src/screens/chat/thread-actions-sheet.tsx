import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import type { Thread } from '@/data/chat/types';
import { threadInitials, threadMemberNames, threadRole, threadStatus, threadTint, threadTitle } from '@/data/chat/utils';

import { ActionRow } from './action-row';

export interface ThreadActionsSheetProps {
  /** The long-pressed thread; null closes the sheet. */
  thread: Thread | null;
  unread: number;
  onClose: () => void;
  onOpen: () => void;
  /** Hidden when the sheet is opened from inside the thread it describes. */
  showOpen?: boolean;
  onSetRead: (read: boolean) => void;
  onTogglePin: () => void;
  onToggleMute: () => void;
  onDelete: () => void;
  /** Groups only. Absent on the thread list, where the sheet is a shortcut rather than a settings screen. */
  onGroupSettings?: () => void;
  /** Whether this position may rename the group and change its membership; the row is offered either way. */
  canManageGroup?: boolean;
}

export function ThreadActionsSheet({
  thread,
  unread,
  onClose,
  onOpen,
  showOpen = true,
  onSetRead,
  onTogglePin,
  onToggleMute,
  onDelete,
  onGroupSettings,
  canManageGroup = false,
}: ThreadActionsSheetProps) {
  const theme = useTheme();

  return (
    <BottomSheet visible={!!thread} onClose={onClose} title={thread ? threadTitle(thread) : 'Conversation'} maxHeight={600}>
      {thread ? (
        <>
          <View style={[styles.identity, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Avatar initials={threadInitials(thread)} tint={threadTint(thread)} size="lg" />
            <View style={styles.identityText}>
              <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>
                {threadTitle(thread)}
              </Text>
              <Text style={[styles.role, { color: theme.textSecondary }]} numberOfLines={1}>
                {threadRole(thread)} · {threadStatus(thread)}
              </Text>
              {thread.kind === 'group' ? (
                <Text style={[styles.members, { color: theme.textSecondary }]} numberOfLines={2}>
                  {threadMemberNames(thread)}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.actions}>
            {showOpen ? <ActionRow icon="message-circle" label="Open conversation" onPress={onOpen} /> : null}
            {thread.kind === 'group' && onGroupSettings ? (
              <ActionRow
                icon="users"
                label={canManageGroup ? 'Group info & settings' : 'Group info'}
                detail={canManageGroup ? 'Rename it, add or remove people' : `${thread.memberIds.length + 1} members`}
                onPress={onGroupSettings}
              />
            ) : null}
            {unread > 0 ? (
              <ActionRow icon="check-circle" label="Mark as read" detail={`${unread} unread`} onPress={() => onSetRead(true)} />
            ) : (
              <ActionRow icon="mail" label="Mark as unread" detail="Keeps it flagged on the list" onPress={() => onSetRead(false)} />
            )}
            <ActionRow
              icon={thread.pinned ? 'arrow-down-circle' : 'arrow-up-circle'}
              label={thread.pinned ? 'Unpin conversation' : 'Pin to top'}
              onPress={onTogglePin}
            />
            <ActionRow
              icon={thread.muted ? 'bell' : 'bell-off'}
              label={thread.muted ? 'Unmute notifications' : 'Mute notifications'}
              detail={thread.muted ? 'Currently muted' : 'You will still see unread counts'}
              onPress={onToggleMute}
            />
            <ActionRow
              icon="trash-2"
              label={thread.kind === 'group' ? 'Leave group' : 'Delete conversation'}
              detail="Removes it from your list — everyone else keeps the messages"
              destructive
              onPress={onDelete}
            />
          </View>
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
  identityText: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  name: {
    fontFamily: fontFamily.semibold,
    fontSize: 16,
    letterSpacing: -0.01 * 16,
  },
  role: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.08 * 10,
    textTransform: 'uppercase',
  },
  members: {
    fontSize: 12.5,
    lineHeight: 12.5 * 1.4,
  },
  actions: {
    gap: 2,
  },
});
