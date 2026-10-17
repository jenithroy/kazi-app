import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';

import { HeaderAccount } from './header-account';
import { Icon } from './icon';

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  /** Overrides the default `router.back()` — e.g. a detail view stepping back to its own list instead of exiting the module. */
  onBack?: () => void;
  /**
   * Trailing controls. A root header falls back to the standard bell + avatar
   * when none is given; a back header shows nothing, because the chevron is
   * the only affordance that belongs on a pushed screen.
   */
  rightSlot?: React.ReactNode;
}

/**
 * Used by every module screen (the design's headers aren't native-header
 * shapes, so native headers stay off throughout).
 *
 * Two shapes, chosen by whether there is a back chevron:
 *
 * - **Root** — you are at a module's front door, so the title is the page's
 *   own name and carries it at full size, with no rule under it and no gap
 *   held open on the left. There used to be an empty bordered box standing in
 *   for the missing chevron, which read as a dead button.
 * - **Back** — a pushed screen or a detail view: chevron, smaller title, and a
 *   hairline separating it from the content it belongs to.
 *
 * Back falls through to the dashboard when there is nothing to pop. Some
 * modules — Production, Billing, Marketing, Chat — are tab routes for the
 * positions that live in them, and navigating to a tab switches rather than
 * pushes, so anyone arriving from More or a dashboard quick link has no stack
 * entry behind them. Without the fallback that chevron would be dead.
 */
export function ScreenHeader({ title, subtitle, showBack = true, onBack, rightSlot }: ScreenHeaderProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.row,
        {
          paddingTop: insets.top + 12,
          backgroundColor: theme.background,
          borderBottomColor: theme.border,
          borderBottomWidth: showBack ? StyleSheet.hairlineWidth : 0,
        },
      ]}
    >
      {showBack ? (
        <Pressable
          onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.navigate('/')))}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={[styles.backButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <Icon name="chevron-left" size={18} color={theme.textPrimary} />
        </Pressable>
      ) : null}
      <View style={styles.titleWrap}>
        <Text style={[styles.title, { color: theme.textPrimary, fontSize: showBack ? 18 : 26 }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: theme.textSecondary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {rightSlot ?? (showBack ? null : <HeaderAccount />)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  title: {
    fontFamily: fontFamily.semibold,
    letterSpacing: -0.02 * 20,
  },
  subtitle: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.12 * 10,
    textTransform: 'uppercase',
  },
});
