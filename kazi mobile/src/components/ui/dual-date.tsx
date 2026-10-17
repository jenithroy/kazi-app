import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { useCalendarPreference } from '@/lib/calendar-preference';
import { datePair } from '@/lib/date-display';
import { type BSFormat } from '@/lib/nepaliDate';
import { useTheme } from '@/theme/theme-provider';
import { tabularNums } from '@/theme';

export interface DualDateProps {
  /** The canonical stored date: an AD ISO string, `YYYY-MM-DD`. */
  iso: string;
  /** BS rendering style, whichever line BS lands on. Default `long` (`10 Bhadra 2083`). */
  bsStyle?: BSFormat;
  /** Hide the muted second line, leaving only the chosen calendar. */
  secondary?: boolean;
  /** ` · ` separator on one line instead of stacked. */
  inline?: boolean;
  /** Primary font size; secondary scales to ~0.78 of it. Default 13. */
  size?: number;
  hero?: boolean;
  align?: 'left' | 'right';
  style?: StyleProp<ViewStyle>;
  primaryStyle?: StyleProp<TextStyle>;
}

/**
 * Canonical date display: the calendar chosen in Settings › Date entry leads,
 * with the other one muted alongside — the reference app renders dates this way
 * across Billing, Finance, Attendance and the Dashboard. Set it to Gregorian and
 * every one of these flips to `26 Aug 2026` with the B.S. date underneath.
 */
export function DualDate({
  iso,
  bsStyle = 'long',
  secondary = true,
  inline = false,
  size = 13,
  hero = false,
  align = 'left',
  style,
  primaryStyle,
}: DualDateProps) {
  const theme = useTheme();
  const primaryColor = hero ? theme.onHero.text : theme.textPrimary;
  const secondaryColor = hero ? theme.onHero.textMuted : theme.textSecondary;

  const calendar = useCalendarPreference();
  const { primary: primaryText, secondary: secondaryText } = datePair(iso, calendar, { bsStyle });

  if (inline) {
    return (
      <Text style={[tabularNums, { color: primaryColor, fontSize: size, fontWeight: '600' }, primaryStyle, style as StyleProp<TextStyle>]}>
        {primaryText}
        {secondary ? <Text style={{ color: secondaryColor, fontWeight: '400' }}>{`  ·  ${secondaryText}`}</Text> : null}
      </Text>
    );
  }

  return (
    <View style={[{ alignItems: align === 'right' ? 'flex-end' : 'flex-start' }, style]}>
      <Text style={[styles.primary, tabularNums, { color: primaryColor, fontSize: size }, primaryStyle]} numberOfLines={1}>
        {primaryText}
      </Text>
      {secondary ? (
        <Text style={[styles.secondary, tabularNums, { color: secondaryColor, fontSize: Math.round(size * 0.78) }]} numberOfLines={1}>
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
