import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';

export type StatusKind = 'on-track' | 'at-risk' | 'blocked' | 'draft' | 'shipped';

const LABELS: Record<StatusKind, string> = {
  'on-track': 'On track',
  'at-risk': 'At risk',
  blocked: 'Blocked',
  draft: 'Draft',
  shipped: 'Shipped',
};

export interface StatusPillProps {
  status: StatusKind;
  label?: string;
}

/** Five semantic states, one hue each. Status is always paired with a word — never color alone. */
export function StatusPill({ status, label }: StatusPillProps) {
  const theme = useTheme();

  const palette: Record<StatusKind, { bg: string; text: string; dot: string }> = {
    'on-track': { bg: theme.accentWash, text: theme.accentWashText, dot: theme.scheme === 'light' ? '#22A97A' : theme.accent },
    'at-risk': { bg: theme.warningWash, text: theme.warningWashText, dot: theme.warningWashText },
    blocked: { bg: theme.dangerWash, text: theme.dangerWashText, dot: theme.scheme === 'light' ? theme.danger : theme.dangerWashText },
    draft: { bg: theme.draftWash, text: theme.draftWashText, dot: theme.draftDot },
    shipped: { bg: theme.surfaceInverted, text: theme.onDark.avatarText, dot: theme.onDark.accent },
  };

  const { bg, text, dot } = palette[status];

  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <View style={[styles.dot, { backgroundColor: dot }]} />
      <Text style={[styles.label, { color: text }]}>{label ?? LABELS[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  label: {
    fontFamily: fontFamily.semibold,
    fontSize: 12,
  },
});
