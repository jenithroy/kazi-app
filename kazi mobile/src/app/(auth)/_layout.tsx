import { Stack } from 'expo-router';

import { useTheme } from '@/theme/theme-provider';

export default function AuthLayout() {
  const theme = useTheme();
  // Fade, not a push: sign-in screens are alternatives to one another rather
  // than a trail you drill into and back out of.
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.background },
        animation: 'fade',
      }}
    />
  );
}
