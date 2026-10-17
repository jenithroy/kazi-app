import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';

export default function NotFoundScreen() {
  const theme = useTheme();

  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>This screen doesn&apos;t exist.</Text>
        <Link href="/" style={[styles.link, { color: theme.link }]}>
          Go back home
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 20,
  },
  title: {
    fontFamily: fontFamily.semibold,
    fontSize: 18,
  },
  link: {
    fontFamily: fontFamily.semibold,
    fontSize: 15,
  },
});
