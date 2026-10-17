import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { prefetchRoute } from '@/data/prefetch';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import type { ModuleEntry } from '@/constants';

export function ModuleCard({ module }: { module: ModuleEntry }) {
  const theme = useTheme();

  return (
    <Link href={module.route as never} asChild>
      <Pressable
        // The module's first read starts here rather than on mount, so it runs
        // underneath the push instead of after it.
        onPressIn={() => prefetchRoute(module.route)}
        style={StyleSheet.flatten([styles.card, { backgroundColor: theme.surface, boxShadow: theme.shadows.card }])}
      >
        <View style={[styles.iconWrap, { backgroundColor: theme.accentWash }]}>
          <Icon name={module.icon} size={20} color={theme.accentWashText} />
        </View>
        <Text style={[styles.label, { color: theme.textPrimary }]} numberOfLines={1}>
          {module.label}
        </Text>
        <Text style={[styles.blurb, { color: theme.textSecondary }]} numberOfLines={2}>
          {module.blurb}
        </Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '47%',
    flexGrow: 1,
    borderRadius: 18,
    padding: 15,
    gap: 9,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: fontFamily.semibold,
    fontSize: 14.5,
  },
  blurb: {
    fontSize: 12,
    lineHeight: 12 * 1.4,
  },
});
