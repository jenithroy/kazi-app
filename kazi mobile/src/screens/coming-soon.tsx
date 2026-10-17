import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/ui/empty-state';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useTheme } from '@/theme/theme-provider';

export interface ComingSoonProps {
  title: string;
  showBack?: boolean;
}

/** Placeholder body for routes not yet built out — swapped for the real screen in its phase. */
export function ComingSoon({ title, showBack = true }: ComingSoonProps) {
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScreenHeader title={title} showBack={showBack} />
      <View style={styles.body}>
        <EmptyState icon="clock" title="Coming soon" message={`${title} is being built out in a later phase.`} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  body: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
  },
});
