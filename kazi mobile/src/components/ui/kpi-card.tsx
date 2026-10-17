import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { fontFamily, radii, tabularNums } from '@/theme';

import { Sparkline } from './sparkline';

export type DeltaArrow = 'up' | 'down' | 'flat';
// The design colors a delta chip by whether the change is good/bad for that
// specific metric, not by arrow direction — e.g. attendance falling is
// "warning" amber, but "below reorder" rising is "bad" clay. Direction and
// tone are independent inputs.
export type DeltaTone = 'good' | 'warning' | 'bad' | 'neutral';

export interface KpiDelta {
  /** Omit for an arrow-less info chip (e.g. "Oldest 2h") — same chip styling, no glyph. */
  arrow?: DeltaArrow;
  tone: DeltaTone;
  text: string;
}

export interface KpiCardProps {
  label: string;
  value: string;
  delta?: KpiDelta;
  context?: string;
  sparkline?: number[];
  inverted?: boolean;
}

const ARROW_GLYPH: Record<DeltaArrow, string> = { up: '▲', down: '▼', flat: '■' };

/** Value first, trend second, context last — per the style guide's KPI card rule. One inverted card max per screen. */
export function KpiCard({ label, value, delta, context, sparkline, inverted = false }: KpiCardProps) {
  const theme = useTheme();

  const surfaceText = inverted ? theme.onHero.text : theme.textPrimary;
  const labelColor = inverted ? theme.onHero.textMuted : theme.textSecondary;

  const tonePalette: Record<DeltaTone, { bg: string; text: string }> = {
    good: { bg: inverted ? theme.onHero.accentWash : theme.accentWash, text: inverted ? theme.onHero.accentWashText : theme.accentWashText },
    warning: { bg: inverted ? theme.onHero.warningWash : theme.warningWash, text: inverted ? theme.onHero.warningWashText : theme.warningWashText },
    bad: { bg: inverted ? theme.onHero.dangerWash : theme.dangerWash, text: inverted ? theme.onHero.dangerWashText : theme.dangerWashText },
    neutral: { bg: inverted ? theme.onHero.track : theme.draftWash, text: inverted ? theme.onHero.textMuted : theme.draftWashText },
  };

  const deltaPalette = delta ? tonePalette[delta.tone] : null;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: inverted ? theme.surfaceHero : theme.surface,
          borderWidth: theme.scheme === 'dark' ? 1 : 0,
          borderColor: theme.border,
          boxShadow: theme.shadows.card,
        },
      ]}
    >
      <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
      <View style={styles.valueRow}>
        <Text style={[styles.value, tabularNums, { color: surfaceText }]} numberOfLines={1}>
          {value}
        </Text>
        {sparkline && sparkline.length > 1 ? (
          <Sparkline
            values={sparkline}
            width={58}
            height={24}
            color={inverted ? theme.onHero.accent : theme.accent}
          />
        ) : null}
      </View>
      {delta && deltaPalette ? (
        <View style={styles.deltaRow}>
          <View style={[styles.deltaChip, { backgroundColor: deltaPalette.bg }]}>
            {delta.arrow ? (
              <Text style={[styles.deltaArrow, { color: deltaPalette.text }]}>{ARROW_GLYPH[delta.arrow]}</Text>
            ) : null}
            <Text style={[styles.deltaText, tabularNums, { color: deltaPalette.text }]}>{delta.text}</Text>
          </View>
          {context ? <Text style={[styles.context, { color: labelColor }]}>{context}</Text> : null}
        </View>
      ) : context ? (
        <Text style={[styles.context, { color: labelColor }]}>{context}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    padding: 15,
    gap: 9,
  },
  label: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.12 * 10,
    textTransform: 'uppercase',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
  },
  value: {
    fontFamily: fontFamily.semibold,
    fontSize: 28,
    letterSpacing: -0.02 * 28,
  },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  deltaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 21,
    paddingHorizontal: 7,
    borderRadius: 8,
  },
  deltaArrow: {
    fontSize: 9,
  },
  deltaText: {
    fontFamily: fontFamily.semibold,
    fontSize: 11.5,
  },
  context: {
    fontSize: 11.5,
  },
});
