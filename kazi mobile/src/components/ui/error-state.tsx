import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { DataReadError } from '@/lib/supabase/read';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, radii } from '@/theme';

import { Button } from './button';
import { Icon, type IconName } from './icon';

export interface ErrorStateProps {
  /** The query's `error`. A {@link DataReadError} already carries a usable message. */
  error?: unknown;
  /** Overrides the message derived from `error`. */
  message?: string;
  /** Wire this to the query's `refetch` to show a Try again button. */
  onRetry?: () => void;
  /** True while the retry is in flight. */
  retrying?: boolean;
  icon?: IconName;
  title?: string;
}

/**
 * Shown when a read failed — the counterpart to `EmptyState`, and deliberately
 * distinct from it. "Nothing here yet" and "we could not find out" are
 * different facts, and the app used to conflate them by falling back to seed
 * data on failure. Never render this for an empty-but-successful result.
 */
export function ErrorState({
  error,
  message,
  onRetry,
  retrying = false,
  icon = 'alert-triangle',
  title = "Couldn't load this",
}: ErrorStateProps) {
  const theme = useTheme();
  const detail = message ?? describe(error);

  return (
    <Animated.View
      entering={FadeInUp.duration(240)}
      style={[styles.card, { backgroundColor: theme.surface, boxShadow: theme.shadows.card }]}
    >
      <View style={[styles.iconWrap, { backgroundColor: theme.dangerWash }]}>
        <Icon name={icon} size={20} color={theme.dangerWashText} />
      </View>
      <Text style={[styles.title, { color: theme.textPrimary }]}>{title}</Text>
      <Text style={[styles.message, { color: theme.textSecondary }]}>{detail}</Text>
      {onRetry ? (
        <Button
          label="Try again"
          variant="secondary"
          size="small"
          onPress={onRetry}
          loading={retrying}
          style={styles.retry}
        />
      ) : null}
    </Animated.View>
  );
}

/** A message fit for the screen, whatever the query threw. */
export function describe(error: unknown): string {
  if (error instanceof DataReadError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong loading this data.';
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    paddingVertical: 26,
    paddingHorizontal: 18,
    alignItems: 'center',
    gap: 8,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radii.md + 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fontFamily.semibold,
    fontSize: 15,
  },
  message: {
    fontSize: 13,
    textAlign: 'center',
  },
  retry: {
    marginTop: 6,
  },
});
