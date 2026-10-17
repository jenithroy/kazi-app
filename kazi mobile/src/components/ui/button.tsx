import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { fontFamily, radii } from '@/theme';

import { Spinner } from './spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerOutline' | 'invertedSheet';
export type ButtonSize = 'default' | 'small';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** 48px min height per the style guide ("gloved thumbs, dusty screens"); loading swaps the label for a spinner in place, without resizing. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'default',
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
}: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;
  const height = size === 'default' ? 48 : 38;
  const borderRadius = size === 'default' ? radii.md : radii.sm;
  const fontSize = size === 'default' ? 15 : 13;

  const palette = {
    primary: {
      background: theme.accent,
      text: theme.accentText,
      border: undefined as string | undefined,
      boxShadow: theme.scheme === 'light' ? '0 6px 16px -10px rgba(20,122,87,0.9)' : undefined,
    },
    secondary: {
      background: theme.surface,
      text: theme.textPrimary,
      border: theme.scheme === 'light' ? '#CFD8D2' : theme.border,
    },
    ghost: {
      background: 'transparent',
      text: theme.accentDeep,
      border: undefined,
    },
    danger: {
      background: theme.danger,
      text: theme.dangerText,
      border: undefined,
      boxShadow: theme.scheme === 'light' ? '0 6px 16px -10px rgba(192,96,60,0.9)' : undefined,
    },
    // Reject/void-style actions use this, never filled `danger` — the style
    // guide is explicit that destructive intent should never be the loudest
    // thing on screen.
    dangerOutline: {
      background: theme.surface,
      text: theme.dangerWashText,
      border: theme.scheme === 'light' ? '#E3C9BE' : theme.border,
    },
    invertedSheet: {
      background: theme.surfaceInverted,
      text: theme.onDark.text,
      border: undefined,
    },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      onPress={isDisabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        {
          height,
          borderRadius,
          backgroundColor: palette.background,
          borderWidth: palette.border ? 1 : 0,
          borderColor: palette.border,
          boxShadow: !isDisabled ? (palette as { boxShadow?: string }).boxShadow : undefined,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          width: fullWidth ? '100%' : undefined,
        },
        style,
      ]}
    >
      {loading ? (
        <Spinner size={size === 'default' ? 17 : 14} color={palette.text} trackColor="rgba(255,255,255,0.3)" />
      ) : (
        <View style={styles.content}>
          <Text style={[styles.label, { color: palette.text, fontSize }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    flexDirection: 'row',
    gap: 10,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontFamily: fontFamily.semibold,
  },
});
