import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';

export interface ActionRowProps {
  icon: IconName;
  label: string;
  /** Secondary line — e.g. "Only you will see this". */
  detail?: string;
  onPress: () => void;
  /** Clay text + wash tile, for destructive rows. */
  destructive?: boolean;
}

/** The one row shape shared by all three chat sheets, so message and thread actions read identically. */
export function ActionRow({ icon, label, detail, onPress, destructive = false }: ActionRowProps) {
  const theme = useTheme();
  // `dangerWashText` (not `dangerText`) — on a surface, the filled-button
  // foreground would be near-invisible.
  const tint = destructive ? theme.dangerWashText : theme.textPrimary;
  const tile = destructive ? theme.dangerWash : theme.surface;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed ? { backgroundColor: theme.background } : null]}>
      <View style={[styles.tile, { backgroundColor: tile, borderColor: destructive ? 'transparent' : theme.border }]}>
        <Icon name={icon} size={17} color={tint} />
      </View>
      <View style={styles.textWrap}>
        <Text style={[styles.label, { color: tint }]} numberOfLines={1}>
          {label}
        </Text>
        {detail ? (
          <Text style={[styles.detail, { color: theme.textSecondary }]} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 9,
    paddingHorizontal: 6,
    marginHorizontal: -6,
    borderRadius: 14,
  },
  tile: {
    width: 38,
    height: 38,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textWrap: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  label: {
    fontFamily: fontFamily.semibold,
    fontSize: 15,
  },
  detail: {
    fontFamily: fontFamily.mono,
    fontSize: 10.5,
  },
});
