import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';

import { Icon, type IconName } from './icon';

export type CollapsedSectionTone = 'danger' | 'muted';

export interface CollapsedSectionProps {
  /** e.g. "Cancelled invoices" — the count is appended as a pill. */
  label: string;
  count: number;
  /** `danger` for records that died; `muted` for work that finished. */
  tone?: CollapsedSectionTone;
  icon?: IconName;
  children: ReactNode;
}

/**
 * Records that are closed but not deleted — a cancelled invoice the IRD still
 * wants, a delivered order — don't belong in the working list, but they can't
 * just vanish either. Same treatment as the website: a collapsed block at the
 * bottom that opens on tap, dimmed to read as an archive.
 */
export function CollapsedSection({ label, count, tone = 'danger', icon, children }: CollapsedSectionProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  if (count === 0) return null;

  const palette =
    tone === 'danger'
      ? {
          fg: theme.dangerWashText,
          pill: theme.dangerWash,
          border: theme.scheme === 'light' ? '#E3C9BE' : theme.border,
          icon: icon ?? ('x-circle' as IconName),
        }
      : {
          fg: theme.textSecondary,
          pill: theme.draftWash,
          border: theme.border,
          icon: icon ?? ('check-circle' as IconName),
        };

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={({ pressed }) => [
          styles.header,
          { backgroundColor: theme.surface, borderColor: palette.border, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Icon name={palette.icon} size={16} color={palette.fg} />
        <Text style={[styles.title, { color: palette.fg }]}>{label}</Text>
        <View style={[styles.count, { backgroundColor: palette.pill }]}>
          <Text style={[styles.countText, { color: palette.fg }]}>{count}</Text>
        </View>
        <View style={styles.flex1} />
        <Text style={[styles.toggle, { color: theme.textSecondary }]}>{open ? 'Hide' : 'Show'}</Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={15} color={theme.textSecondary} />
      </Pressable>

      {open ? (
        <Animated.View entering={FadeIn.duration(160)} style={styles.rows}>
          {children}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, paddingTop: 4 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  title: { fontFamily: fontFamily.semibold, fontSize: 13.5 },
  count: { minWidth: 22, paddingHorizontal: 6, height: 20, borderRadius: 99, alignItems: 'center', justifyContent: 'center' },
  countText: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  flex1: { flex: 1 },
  toggle: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  // Closed records read as an archive, not as live work.
  rows: { gap: 12, opacity: 0.62 },
});
