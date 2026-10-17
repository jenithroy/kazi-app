import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { datePair } from '@/lib/date-display';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, radii, tabularNums } from '@/theme';

import { setCalendarPreference, useCalendarPreference } from '@/lib/calendar-preference';
import { Icon } from './icon';
import { NepaliDatePicker } from './nepali-date-picker';

export interface DateFieldProps {
  label?: string;
  /** The stored value: an AD ISO string, `YYYY-MM-DD`. */
  value: string;
  onChange: (adISO: string) => void;
  /** Sheet title on the picker, e.g. "Purchase date". */
  pickerTitle?: string;
  /** Compact variant for two fields sitting side by side. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * A date row plus the ⇄ switch that flips between Bikram Sambat and
 * Gregorian — the reference puts that toggle on the field itself rather than
 * burying it in the picker, and it doubles as a readout of the date in the
 * calendar you are *not* entering in.
 */
export function DateField({ label, value, onChange, pickerTitle, compact = false, style }: DateFieldProps) {
  const theme = useTheme();
  const preferred = useCalendarPreference();
  const [open, setOpen] = useState(false);

  const { primary, secondary, secondarySuffix } = datePair(value, preferred, {
    bsStyle: compact ? 'numeric' : 'long',
  });

  return (
    <View style={[styles.group, style]}>
      {label ? <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text> : null}

      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label ?? 'Date'}: ${primary}`}
        style={[
          styles.row,
          compact && styles.rowCompact,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <Text style={[styles.value, tabularNums, { color: theme.textPrimary, fontSize: compact ? 13 : 14 }]} numberOfLines={1}>
          {primary}
        </Text>
        <Icon name="calendar" size={16} color={theme.textSecondary} />
      </Pressable>

      <Pressable
        onPress={() => setCalendarPreference(preferred === 'bs' ? 'ad' : 'bs')}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={`Switch to ${preferred === 'bs' ? 'English' : 'Nepali'} calendar`}
        style={[styles.switch, { backgroundColor: theme.accentWash, borderColor: theme.accent }]}
      >
        <Icon name="repeat" size={11} color={theme.accentWashText} />
        <Text style={[styles.switchText, tabularNums, { color: theme.accentWashText }]} numberOfLines={1}>
          {`${secondary} ${secondarySuffix}`}
        </Text>
      </Pressable>

      <NepaliDatePicker
        visible={open}
        onClose={() => setOpen(false)}
        value={value}
        onChange={onChange}
        title={pickerTitle ?? label ?? 'Pick a date'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  label: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.11 * 10, textTransform: 'uppercase' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    height: 52,
    paddingHorizontal: 16,
    borderRadius: radii.lg - 2,
    borderWidth: 1,
  },
  rowCompact: { height: 50, paddingHorizontal: 14 },
  value: { flexShrink: 1, fontWeight: '600' },
  switch: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 26,
    maxWidth: '100%',
    paddingHorizontal: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  switchText: { flexShrink: 1, fontFamily: fontFamily.mono, fontSize: 10.5 },
});
