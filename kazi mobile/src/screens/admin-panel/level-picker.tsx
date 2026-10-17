import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import { LEVELS, type AccessLevel } from '@/data/admin-panel/types';

export interface LevelPickerProps {
  value: AccessLevel;
  onChange: (level: AccessLevel) => void;
  disabled?: boolean;
}

const WIDTHS: Record<AccessLevel, number> = { none: 46, view: 46, edit: 46 };

/**
 * The three-way access selector, one per page row.
 *
 * A segmented control rather than the old switch-plus-chip pair: the previous
 * screen needed two taps in the right order to reach "view", and there was no
 * way to see at a glance which of three states a row was in.
 */
export function LevelPicker({ value, onChange, disabled = false }: LevelPickerProps) {
  const theme = useTheme();

  return (
    <View
      style={[styles.wrap, { backgroundColor: theme.surfaceRaised, borderColor: theme.border, opacity: disabled ? 0.45 : 1 }]}
      accessibilityRole="radiogroup"
    >
      {LEVELS.map((l) => {
        const on = l.key === value;
        const palette = on
          ? l.key === 'edit'
            ? { bg: theme.accent, fg: theme.accentText }
            : l.key === 'view'
              ? { bg: theme.selectedSurface, fg: theme.selectedText }
              : { bg: theme.surface, fg: theme.textSecondary }
          : { bg: 'transparent', fg: theme.textSecondary };

        return (
          <Pressable
            key={l.key}
            disabled={disabled}
            onPress={() => !on && onChange(l.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, disabled }}
            accessibilityLabel={`${l.label} — ${l.hint}`}
            style={[styles.segment, { width: WIDTHS[l.key], backgroundColor: palette.bg }]}
          >
            <Text style={[styles.label, { color: palette.fg, fontFamily: on ? fontFamily.semibold : fontFamily.regular }]}>
              {l.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    borderRadius: 999,
    borderWidth: 1,
    padding: 2,
  },
  segment: {
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11.5,
  },
});
