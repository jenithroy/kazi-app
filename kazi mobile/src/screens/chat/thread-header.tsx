import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import type { Thread } from '@/data/chat/types';
import { threadInitials, threadOnline, threadRole, threadStatus, threadTint, threadTitle } from '@/data/chat/utils';

export interface ThreadHeaderProps {
  /** Null for a missing thread, which has no identity left to show. */
  thread: Thread | null;
  onBack: () => void;
  /** Opens the thread's own actions sheet — mark unread, pin, mute, delete. */
  onOptions?: () => void;
  /** Opens contact info (a dm) or group info. The identity is inert without it. */
  onIdentity?: () => void;
}

/** A person-identity layout (avatar + name + presence inline), not a title/subtitle stack — doesn't fit `ScreenHeader`'s shape, so it's bespoke. */
export function ThreadHeader({ thread, onBack, onOptions, onIdentity }: ThreadHeaderProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.row, { paddingTop: insets.top + 10, borderBottomColor: theme.border, backgroundColor: theme.surfaceRaised }]}>
      <Pressable onPress={onBack} hitSlop={8} style={[styles.iconButton, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Icon name="chevron-left" size={18} color={theme.textPrimary} />
      </Pressable>

      {thread ? (
        // The whole identity is the target, the way it is in every messenger —
        // the name, the avatar and the presence line are one thing to tap.
        <Pressable
          onPress={onIdentity}
          disabled={!onIdentity}
          accessibilityLabel={`About ${threadTitle(thread)}`}
          style={({ pressed }) => [styles.identity, pressed && onIdentity ? { opacity: 0.65 } : null]}
        >
          <Avatar initials={threadInitials(thread)} tint={threadTint(thread)} size="md" />
          <View style={styles.textWrap}>
            <View style={styles.nameRow}>
              <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>
                {threadTitle(thread)}
              </Text>
              {thread.muted ? <Icon name="bell-off" size={12} color={theme.textSecondary} /> : null}
            </View>
            <View style={styles.statusRow}>
              <View style={[styles.dot, { backgroundColor: threadOnline(thread) ? theme.accent : theme.draftDot }]} />
              <Text style={[styles.status, { color: theme.textSecondary }]} numberOfLines={1}>
                {thread.kind === 'group' ? threadStatus(thread) : `${threadRole(thread)} · ${threadStatus(thread)}`}
              </Text>
            </View>
          </View>
          {onIdentity ? <Icon name="chevron-right" size={15} color={theme.textSecondary} /> : null}
        </Pressable>
      ) : (
        <Text style={[styles.fallbackTitle, { color: theme.textPrimary }]}>Thread</Text>
      )}

      {onOptions && thread ? (
        <Pressable onPress={onOptions} hitSlop={8} style={[styles.iconButton, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Icon name="more-vertical" size={18} color={theme.textPrimary} />
        </Pressable>
      ) : null}
    </View>
  );
}

export interface SelectionHeaderProps {
  count: number;
  /** Delete is offered only when every selected message is your own. */
  canDelete: boolean;
  onCancel: () => void;
  onCopy: () => void;
  onDelete: () => void;
}

/** Replaces `ThreadHeader` while messages are selected, so the actions sit where the identity was. */
export function SelectionHeader({ count, canDelete, onCancel, onCopy, onDelete }: SelectionHeaderProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.row, { paddingTop: insets.top + 10, borderBottomColor: theme.border, backgroundColor: theme.surfaceRaised }]}>
      <Pressable onPress={onCancel} hitSlop={8} style={[styles.iconButton, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Icon name="x" size={18} color={theme.textPrimary} />
      </Pressable>

      <Text style={[styles.selectionCount, { color: theme.textPrimary }]}>
        {count} selected
      </Text>

      <Pressable
        onPress={onCopy}
        disabled={count === 0}
        hitSlop={8}
        style={[styles.iconButton, { backgroundColor: theme.surface, borderColor: theme.border, opacity: count === 0 ? 0.4 : 1 }]}
      >
        <Icon name="copy" size={17} color={theme.textPrimary} />
      </Pressable>
      <Pressable
        onPress={onDelete}
        disabled={!canDelete || count === 0}
        hitSlop={8}
        style={[styles.iconButton, { backgroundColor: theme.dangerWash, borderColor: 'transparent', opacity: canDelete && count > 0 ? 1 : 0.4 }]}
      >
        <Icon name="trash-2" size={17} color={theme.dangerWashText} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  identity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    minWidth: 0,
  },
  textWrap: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  name: {
    fontFamily: fontFamily.semibold,
    fontSize: 16,
    letterSpacing: -0.01 * 16,
    flexShrink: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 99,
    flexShrink: 0,
  },
  status: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.1 * 10,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  fallbackTitle: {
    flex: 1,
    fontFamily: fontFamily.semibold,
    fontSize: 16,
  },
  selectionCount: {
    flex: 1,
    fontFamily: fontFamily.semibold,
    fontSize: 16,
    letterSpacing: -0.01 * 16,
  },
});
