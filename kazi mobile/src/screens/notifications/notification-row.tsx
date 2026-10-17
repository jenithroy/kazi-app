import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { SectionId } from '@/auth/permissions';
import { Icon, type IconName } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import * as haptics from '@/lib/haptics';
import { fontFamily } from '@/theme';
import { formatRelativeTime } from '@/utils/format-date';
import type { NotificationRecord } from '@/data/notifications/types';

const SECTION_ICON: Record<SectionId, IconName> = {
  dashboard: 'grid',
  tasks: 'check-square',
  inventory: 'box',
  library: 'layers',
  finance: 'dollar-sign',
  sales: 'trending-up',
  'order-management': 'grid',
  customers: 'users',
  billing: 'file-text',
  purchases: 'shopping-cart',
  production: 'tool',
  accounting: 'book-open',
  'budget-requirements': 'briefcase',
  'employees-hr': 'clipboard',
  attendance: 'clock',
  marketing: 'send',
  messenger: 'message-circle',
  'admin-panel': 'shield',
  changelog: 'list',
  'bug-report': 'alert-triangle',
  usage: 'activity',
};

export function NotificationRow({
  record,
  onPress,
}: {
  record: NotificationRecord;
  onPress: (r: NotificationRecord) => void;
}) {
  const theme = useTheme();
  const [showWhy, setShowWhy] = useState(false);

  const tone =
    record.type === 'action' ? theme.danger : record.type === 'mention' ? theme.accent : theme.textSecondary;

  return (
    <Pressable
      onPress={() => onPress(record)}
      onLongPress={() => {
        haptics.pressed();
        setShowWhy((v) => !v);
      }}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: record.read ? theme.surface : theme.accentWash,
          borderColor: theme.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: theme.surfaceRaised, borderColor: theme.border }]}>
        <Icon name={SECTION_ICON[record.section] ?? 'bell'} size={16} color={tone} />
      </View>
      <View style={styles.body}>
        <View style={styles.titleLine}>
          <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={1}>
            {record.title}
          </Text>
          {record.read ? null : <View style={[styles.dot, { backgroundColor: theme.accent }]} />}
        </View>
        <Text style={[styles.text, { color: theme.textSecondary }]} numberOfLines={2}>
          {record.body}
        </Text>
        <Text style={[styles.meta, { color: theme.textSecondary }]}>
          {formatRelativeTime(new Date(record.createdAtISO))}
          {record.type !== 'info' ? ` · ${record.type === 'action' ? 'Needs you' : 'Mention'}` : ''}
          {record.targetRef ? ` · ${record.targetRef}` : ''}
        </Text>
        {showWhy ? (
          <Text style={[styles.why, { color: theme.textSecondary, borderTopColor: theme.border }]}>
            {record.matchedRule || 'You are a recipient for this update.'}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
    padding: 13,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 3, minWidth: 0 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  title: { flex: 1, fontFamily: fontFamily.semibold, fontSize: 13.5 },
  dot: { width: 7, height: 7, borderRadius: 999 },
  text: { fontSize: 12.5, lineHeight: 12.5 * 1.4 },
  meta: {
    fontFamily: fontFamily.mono,
    fontSize: 9.5,
    letterSpacing: 0.1 * 9.5,
    textTransform: 'uppercase',
    marginTop: 1,
  },
  why: {
    fontSize: 11.5,
    fontStyle: 'italic',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 5,
    marginTop: 3,
  },
});
