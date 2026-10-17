import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';

/** Stays fixed while the form content below it swaps states — matches the design's single-frame recovery flow. */
export function LogoBlock() {
  const theme = useTheme();

  return (
    <View style={styles.wrap}>
      <View style={[styles.mark, { backgroundColor: theme.surfaceInverted }]}>
        <View style={[styles.markDot, { backgroundColor: theme.onDark.accent }]} />
      </View>
      <View style={styles.textWrap}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Kazi</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Secure portal for Nepal and UK operations teams
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: 16,
    paddingBottom: 38,
  },
  mark: {
    width: 60,
    height: 60,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markDot: {
    width: 20,
    height: 20,
    borderRadius: 7,
  },
  textWrap: {
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontFamily: fontFamily.semibold,
    fontSize: 32,
    letterSpacing: -0.03 * 32,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 14 * 1.45,
    textAlign: 'center',
    maxWidth: 230,
  },
});
