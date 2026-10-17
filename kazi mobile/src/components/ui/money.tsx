import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { useCurrency } from '@/lib/currency-context';
import { useTheme } from '@/theme/theme-provider';
import { tabularNums } from '@/theme';

export interface MoneyProps {
  /** The amount, always passed in NPR — conversion to the user's preferred currency happens here. */
  npr: number;
  /** Compact "रु 41.2L" / "£20.6k" rendering for KPI tiles and chart labels. */
  compact?: boolean;
  /** Hide the muted secondary-currency line (e.g. inside a dense table cell). */
  secondary?: boolean;
  /** ` · ` separator on one line instead of stacked — for tight rows. */
  inline?: boolean;
  /** Primary-amount font size. Secondary scales to ~0.72 of it. Default 15. */
  size?: number;
  /** On the screen's hero card, use the hero foreground palette. */
  hero?: boolean;
  align?: 'left' | 'right';
  style?: StyleProp<ViewStyle>;
  primaryStyle?: StyleProp<TextStyle>;
}

/**
 * Canonical money display: the amount in the user's preferred currency with
 * the other currency shown muted beneath (the reference app does this on
 * every money value in Finance, Billing, Purchases, Budget, Employees and
 * the Dashboard). Toggle the preference from More › Currency.
 */
export function Money({
  npr,
  compact = false,
  secondary = true,
  inline = false,
  size = 15,
  hero = false,
  align = 'left',
  style,
  primaryStyle,
}: MoneyProps) {
  const theme = useTheme();
  const { parts } = useCurrency();
  const { primary, secondary: secondaryText } = parts(npr, { compact });

  const primaryColor = hero ? theme.onHero.text : theme.textPrimary;
  const secondaryColor = hero ? theme.onHero.textMuted : theme.textSecondary;
  const alignItems = align === 'right' ? 'flex-end' : 'flex-start';

  if (inline) {
    return (
      <Text style={[tabularNums, { color: primaryColor, fontSize: size, fontWeight: '600' }, primaryStyle, style as StyleProp<TextStyle>]}>
        {primary}
        {secondary ? <Text style={{ color: secondaryColor, fontWeight: '400' }}>{`  ·  ${secondaryText}`}</Text> : null}
      </Text>
    );
  }

  return (
    <View style={[{ alignItems }, style]}>
      <Text style={[styles.primary, tabularNums, { color: primaryColor, fontSize: size }, primaryStyle]} numberOfLines={1}>
        {primary}
      </Text>
      {secondary ? (
        <Text style={[styles.secondary, tabularNums, { color: secondaryColor, fontSize: Math.round(size * 0.72) }]} numberOfLines={1}>
          {secondaryText}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  primary: { fontWeight: '600' },
  secondary: { fontWeight: '400', marginTop: 1 },
});
