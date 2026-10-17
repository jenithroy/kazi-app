import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Card } from '@/components/ui/card';
import { useScrollTop } from '@/lib/use-scroll-top';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';

export interface DashboardCardProps {
  title: string;
  /** Mono end-of-header figure, e.g. "12 total". */
  meta?: string;
  /** When set, the whole card is a button and a chevron is shown. */
  onPress?: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Shared shell for every dashboard card: header row + tap-through affordance. */
export function DashboardCard({ title, meta, onPress, children, style }: DashboardCardProps) {
  const theme = useTheme();

  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}>
      {({ pressed }) => (
        <Card elevation="raised" style={[styles.card, pressed && onPress ? styles.pressed : null, style]}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: theme.textPrimary }]}>{title}</Text>
            <View style={styles.headerEnd}>
              {meta ? (
                <Text style={[styles.meta, tabularNums, { color: theme.textSecondary }]}>{meta}</Text>
              ) : null}
              {onPress ? <Icon name="chevron-right" size={16} color={theme.textSecondary} /> : null}
            </View>
          </View>
          {children}
        </Card>
      )}
    </Pressable>
  );
}

export interface DashboardScrollProps {
  isRefetching: boolean;
  onRefresh: () => void;
  /** Show a centered spinner instead of the content (first load, nothing cached yet). */
  loading?: boolean;
  children: ReactNode;
}

/** Shared scroll container + pull-to-refresh + first-load spinner for every variant. */
export function DashboardScroll({ isRefetching, onRefresh, loading, children }: DashboardScrollProps) {
  const theme = useTheme();
  const scrollRef = useScrollTop();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={theme.accent} />
      }
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 16,
  },
  card: {
    padding: 18,
    gap: 14,
  },
  pressed: {
    opacity: 0.92,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    flex: 1,
    fontFamily: fontFamily.semibold,
    fontSize: 15,
  },
  headerEnd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  meta: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
  },
});
