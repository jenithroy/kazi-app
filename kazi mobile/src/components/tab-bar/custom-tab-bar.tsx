import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { BottomTabBarProps } from 'expo-router/js-tabs';

import { useAuth } from '@/auth/auth-context';
import { tabLayoutFor } from '@/auth/tab-layout';
import { prefetchTab } from '@/data/prefetch';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, radii } from '@/theme';
import { duration, easeOut } from '@/theme/motion';
import {
  BillingIcon,
  ChatIcon,
  DashboardIcon,
  FinanceIcon,
  InventoryIcon,
  MarketingIcon,
  MoreIcon,
  ProductionIcon,
  TasksIcon,
  type NavIconProps,
} from '@/components/ui/icon';

import { useTabBarHidden } from './tab-bar-visibility';

// Rendered via `Tabs`' `tabBar` prop, which replaces React Navigation's
// default bar entirely (unlike `layout`, which wraps the whole navigator
// output — content AND the default bar — and left both stacked on screen).
//
// The navigator declares every screen that could be somebody's tab; this bar
// decides which of them that person actually sees, and in what order, from
// `tabLayoutFor(positionId)`. A screen with no button is still reachable (from
// More or a dashboard card) — it just isn't one of your five.

export type CustomTabBarProps = BottomTabBarProps;

const TAB_ICONS: Record<string, (props: NavIconProps) => React.JSX.Element> = {
  index: DashboardIcon,
  chat: ChatIcon,
  tasks: TasksIcon,
  inventory: InventoryIcon,
  finance: FinanceIcon,
  production: ProductionIcon,
  billing: BillingIcon,
  marketing: MarketingIcon,
  more: MoreIcon,
};

const TAB_LABELS: Record<string, string> = {
  index: 'Dashboard',
  chat: 'Chat',
  tasks: 'Tasks',
  inventory: 'Inventory',
  finance: 'Finance',
  production: 'Production',
  billing: 'Billing',
  marketing: 'Marketing',
  more: 'More',
};

interface TabCellProps {
  focused: boolean;
  label: string;
  Icon: (props: NavIconProps) => React.JSX.Element;
  onPress: () => void;
  onPressIn?: () => void;
}

/**
 * One button in the bar.
 *
 * The selected pill used to appear and vanish between frames, which made the
 * bar the one part of the app that still snapped after everything around it
 * had been given motion. It now grows in behind the icon, and the whole cell
 * dips under the finger so a press is acknowledged before the screen behind it
 * has begun to change.
 *
 * The pill is a separate absolutely-positioned layer rather than an animated
 * `backgroundColor`: opacity and transform run on the UI thread without
 * touching the JS one, and a tab bar is exactly where a dropped frame shows.
 */
function TabCell({ focused, label, Icon, onPress, onPressIn }: TabCellProps) {
  const theme = useTheme();
  const selected = useSharedValue(focused ? 1 : 0);
  const pressed = useSharedValue(0);

  useEffect(() => {
    selected.value = withTiming(focused ? 1 : 0, { duration: duration.fast, easing: easeOut });
  }, [focused, selected]);

  const pillStyle = useAnimatedStyle(() => ({
    opacity: selected.value,
    transform: [{ scale: 0.86 + 0.14 * selected.value }],
  }));

  const contentStyle = useAnimatedStyle(() => ({
    // A press dips the cell; selection lifts the icon a hair out of the pill.
    transform: [{ scale: 1 - 0.06 * pressed.value }, { translateY: -1 * selected.value }],
  }));

  const color = focused ? theme.accentWashText : theme.textSecondary;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        pressed.value = withTiming(1, { duration: duration.fast, easing: easeOut });
        onPressIn?.();
      }}
      onPressOut={() => {
        pressed.value = withTiming(0, { duration: duration.fast, easing: easeOut });
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      style={styles.cell}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.pill, { backgroundColor: theme.accentWash }, pillStyle]}
      />
      <Animated.View style={[styles.cellContent, contentStyle]}>
        <Icon size={22} color={color} />
        <Text style={[styles.label, { color, fontFamily: focused ? fontFamily.semibold : fontFamily.medium }]}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export function CustomTabBar({ state, navigation, insets }: CustomTabBarProps) {
  const theme = useTheme();
  const { canView, profile, role } = useAuth();
  const hidden = useTabBarHidden();

  const activeName = state.routes[state.index]?.name;

  // The layout names the slots; `canView` decides which survive; the navigator
  // supplies the route key to navigate to. A slot whose screen isn't declared
  // (or isn't permitted) simply drops out, and the bar closes up around it.
  const slots = tabLayoutFor(profile?.positionId, role)
    .filter((slot) => canView(slot.section))
    .map((slot) => ({ ...slot, route: state.routes.find((r) => r.name === slot.name) }))
    .filter((slot): slot is typeof slot & { route: NonNullable<typeof slot.route> } => !!slot.route);

  // An open chat thread asks for the whole screen — its composer would
  // otherwise sit on top of a second bottom row.
  if (hidden) return null;

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
          paddingBottom: insets.bottom + 10,
        },
      ]}
    >
      {slots.map(({ name, route }) => {
        const isFocused = name === activeName;
        const IconComponent = TAB_ICONS[name] ?? MoreIcon;
        const label = TAB_LABELS[name] ?? name;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <TabCell
            key={route.key}
            focused={isFocused}
            label={label}
            Icon={IconComponent}
            onPress={onPress}
            // Warms the tab's reads while the finger is still down. Skipped for
            // the tab you are already on, which has nothing to arrive at.
            onPressIn={isFocused ? undefined : () => prefetchTab(name)}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cell: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radii.md,
    justifyContent: 'center',
  },
  // Fills the cell behind the icon and label; only its opacity and scale move.
  pill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radii.md,
  },
  cellContent: {
    alignItems: 'center',
    gap: 6,
  },
  label: {
    fontSize: 10.5,
  },
});
