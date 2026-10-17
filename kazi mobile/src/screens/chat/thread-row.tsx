import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import type { Message, Thread } from '@/data/chat/types';
import { listTime, previewOf, threadInitials, threadOnline, threadRole, threadTint, threadTitle } from '@/data/chat/utils';

export interface ThreadRowProps {
  thread: Thread;
  last?: Message;
  unread: number;
  index: number;
  onPress: () => void;
  /** Opens the thread actions sheet — mark read/unread, pin, mute, delete. */
  onLongPress: () => void;
}

export function ThreadRow({ thread, last, unread, index, onPress, onLongPress }: ThreadRowProps) {
  const theme = useTheme();
  const stamp = thread.previewTime ?? (last ? listTime(last.at) : thread.createdAt ? listTime(thread.createdAt) : '');

  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 30).duration(220)}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={280}
        style={({ pressed }) => [styles.row, { backgroundColor: pressed ? theme.surfaceRaised : theme.surface, boxShadow: theme.shadows.card }]}
      >
        <View style={styles.avatarWrap}>
          <Avatar initials={threadInitials(thread)} tint={threadTint(thread)} size="lg" />
          <View
            style={[
              styles.presenceDot,
              { backgroundColor: threadOnline(thread) ? theme.accent : theme.draftDot, borderColor: theme.surface },
            ]}
          />
        </View>

        <View style={styles.textWrap}>
          <View style={styles.nameRow}>
            {thread.pinned ? <Icon name="bookmark" size={11} color={theme.accentDeep} /> : null}
            <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>
              {threadTitle(thread)}
            </Text>
            {thread.muted ? <Icon name="bell-off" size={11} color={theme.textSecondary} /> : null}
            <Text style={[styles.role, { color: theme.textSecondary }]} numberOfLines={1}>
              {threadRole(thread)}
            </Text>
          </View>
          <Text
            style={[
              styles.preview,
              { color: unread ? theme.textPrimary : theme.textSecondary, fontFamily: unread ? fontFamily.semibold : fontFamily.regular },
            ]}
            numberOfLines={1}
          >
            {previewOf(thread, last)}
          </Text>
        </View>

        <View style={styles.metaWrap}>
          <Text style={[styles.time, { color: theme.textSecondary }]} numberOfLines={1}>
            {stamp}
          </Text>
          {unread > 0 ? (
            <View style={[styles.badge, { backgroundColor: thread.muted ? theme.draftWash : theme.accent }]}>
              <Text style={[styles.badgeLabel, { color: thread.muted ? theme.draftWashText : theme.accentText }]}>{unread}</Text>
            </View>
          ) : (
            <View style={styles.badgeSpacer} />
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    padding: 14,
  },
  avatarWrap: {
    flexShrink: 0,
  },
  presenceDot: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 13,
    height: 13,
    borderRadius: 99,
    borderWidth: 2.5,
  },
  textWrap: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    fontFamily: fontFamily.semibold,
    fontSize: 15,
    flexShrink: 1,
  },
  role: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.1 * 10,
    textTransform: 'uppercase',
    flexShrink: 0,
  },
  preview: {
    fontSize: 13.5,
  },
  metaWrap: {
    alignItems: 'flex-end',
    gap: 6,
    flexShrink: 0,
  },
  time: {
    fontFamily: fontFamily.mono,
    fontSize: 10.5,
  },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 99,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
  },
  badgeSpacer: {
    height: 20,
  },
});
