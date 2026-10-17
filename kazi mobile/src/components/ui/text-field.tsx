import { useState, type RefObject } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { fontFamily, radii } from '@/theme';

export interface TextFieldProps {
  label?: string;
  /** Rendered at the end of the label row, e.g. Login's "Forgot password?" link. */
  labelRight?: React.ReactNode;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  rightAccessory?: React.ReactNode;
  /** 46px / mono font, for secondary fields like a reference code — matches the design's smaller reference input. */
  compact?: boolean;
  /** Hands the underlying input back, so a caller can focus it — e.g. a blocked submit sending you to the field it is waiting on. */
  inputRef?: RefObject<TextInput | null>;
}

/** 52px height / 16px value size (so iOS never zooms on focus), focus ring = accent at ~22% opacity. */
export function TextField({
  label,
  labelRight,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  keyboardType = 'default',
  autoCapitalize = 'none',
  rightAccessory,
  compact = false,
  inputRef,
}: TextFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const [reveal, setReveal] = useState(false);

  const showToggle = secureTextEntry;

  return (
    <View style={styles.group}>
      {label ? (
        labelRight ? (
          <View style={styles.labelRow}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
            {labelRight}
          </View>
        ) : (
          <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
        )
      ) : null}
      <View style={styles.inputWrap}>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.textSecondary}
          secureTextEntry={secureTextEntry && !reveal}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          textAlignVertical="center"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[
            styles.input,
            compact && styles.inputCompact,
            {
              backgroundColor: theme.surface,
              color: compact ? theme.textSecondary : theme.textPrimary,
              fontFamily: compact ? fontFamily.mono : fontFamily.regular,
              borderColor: focused ? theme.accent : theme.border,
              boxShadow: focused ? `0 0 0 3px ${theme.scheme === 'light' ? 'rgba(95,210,160,0.22)' : 'rgba(111,221,169,0.18)'}` : undefined,
              paddingRight: showToggle ? 56 : 16,
            },
          ]}
        />
        {showToggle ? (
          <Pressable onPress={() => setReveal((r) => !r)} style={styles.toggle} hitSlop={8}>
            <Text style={[styles.toggleLabel, { color: theme.textSecondary }]}>{reveal ? 'HIDE' : 'SHOW'}</Text>
          </Pressable>
        ) : (
          rightAccessory
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: 7,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  label: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.14 * 10,
    textTransform: 'uppercase',
  },
  inputWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    height: 52,
    paddingLeft: 16,
    borderRadius: radii.md,
    borderWidth: 1,
    fontSize: 16,
    fontFamily: fontFamily.regular,
  },
  inputCompact: {
    height: 46,
    fontSize: 14,
  },
  toggle: {
    position: 'absolute',
    right: 6,
    height: 40,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.08 * 10,
  },
});
