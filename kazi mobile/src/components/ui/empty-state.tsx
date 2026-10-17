import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { useTheme } from '@/theme/theme-provider';
import { fontFamily, radii } from '@/theme';

import { Icon, type IconName } from './icon';

export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  message: string;
}

export function EmptyState({ icon = 'check', title, message }: EmptyStateProps) {
  const theme = useTheme();

  return (
    <Animated.View
      entering={FadeInUp.duration(240)}
      style={[styles.card, { backgroundColor: theme.surface, boxShadow: theme.shadows.card }]}
    >
      <View style={[styles.iconWrap, { backgroundColor: theme.accentWash }]}>
        <Icon name={icon} size={20} color={theme.accentWashText} />
      </View>
      <Text style={[styles.title, { color: theme.textPrimary }]}>{title}</Text>
      <Text style={[styles.message, { color: theme.textSecondary }]}>{message}</Text>
    </Animated.View>
  );
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
});
