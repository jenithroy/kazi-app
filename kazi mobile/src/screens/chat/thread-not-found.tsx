import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';

export interface ThreadNotFoundProps {
  reference: string;
  onBack: () => void;
  onCompose: () => void;
}

/** Not an error state — a deleted thread is routine, so it gets a plain sentence and two exits rather than an error tone. */
export function ThreadNotFound({ reference, onBack, onCompose }: ThreadNotFoundProps) {
  const theme = useTheme();

  return (
    <View style={styles.wrap}>
      <View style={[styles.iconTile, { backgroundColor: theme.dangerWash }]}>
        <Icon name="message-circle" size={24} color={theme.dangerWashText} />
      </View>
      <Text style={[styles.title, { color: theme.textPrimary }]}>Thread not found</Text>
      <Text style={[styles.body, { color: theme.textSecondary }]}>
        This conversation was deleted or you were removed from it. Nothing was lost on the other side.
      </Text>
      <Text style={[styles.ref, { color: theme.textSecondary }]}>{reference}</Text>

      <View style={styles.actions}>
        <Button label="Back to messages" variant="primary" fullWidth onPress={onBack} />
        <Button label="Start a new message" variant="secondary" fullWidth onPress={onCompose} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 34,
    paddingBottom: 60,
  },
  iconTile: {
    width: 56,
    height: 56,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fontFamily.semibold,
    fontSize: 18,
    letterSpacing: -0.015 * 18,
  },
  body: {
    fontSize: 13.5,
    lineHeight: 13.5 * 1.55,
    textAlign: 'center',
    maxWidth: 260,
  },
  ref: {
    fontFamily: fontFamily.mono,
    fontSize: 10.5,
  },
  actions: {
    gap: 10,
    width: '100%',
    paddingTop: 6,
  },
});
