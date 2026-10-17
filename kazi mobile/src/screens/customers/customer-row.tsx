import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeInUp, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { AVATAR_TINTS } from '@/data/customers/mock';
import type { Customer } from '@/data/customers/types';
import { gbp, hasOverdue, initials, owed } from '@/data/customers/utils';

const REVEAL = 96;

export interface CustomerRowProps {
  customer: Customer;
  index: number;
  isOpen: boolean;
  onSwipeOpen: () => void;
  onSwipeClose: () => void;
  onPress: () => void;
  /** Omitted for view-only users — swipe-to-delete is then disabled. */
  onDelete?: () => void;
}

export function CustomerRow({ customer, index, isOpen, onSwipeOpen, onSwipeClose, onPress, onDelete }: CustomerRowProps) {
  const theme = useTheme();
  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);

  const pan = Gesture.Pan()
    .enabled(!!onDelete)
    .activeOffsetX([-10, 10])
    .onStart(() => {
      startX.value = translateX.value;
    })
    .onUpdate((e) => {
      translateX.value = Math.max(-REVEAL, Math.min(0, startX.value + e.translationX));
    })
    .onEnd(() => {
      const open = translateX.value < -REVEAL / 2;
      translateX.value = withTiming(open ? -REVEAL : 0, { duration: 200 });
      if (open) runOnJS(onSwipeOpen)();
      else runOnJS(onSwipeClose)();
    });

  useEffect(() => {
    translateX.value = withTiming(isOpen ? -REVEAL : 0, { duration: 200 });
  }, [isOpen, translateX]);

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));

  const balance = owed(customer);
  const tint = AVATAR_TINTS[index % AVATAR_TINTS.length];
  // The web table's Contact / Email columns, collapsed into one line and
  // em-dashed where the row has neither — same as its empty cells.
  const sub = [customer.contact, customer.email].filter(Boolean).join(' · ') || '—';

  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 30).duration(220)} style={[styles.wrap, { backgroundColor: onDelete ? theme.danger : theme.surface }]}>
      {onDelete ? (
        <Pressable onPress={onDelete} style={styles.deleteZone}>
          <Icon name="trash-2" size={19} color={theme.dangerText} />
          <Text style={[styles.deleteLabel, { color: theme.dangerText }]}>Delete</Text>
        </Pressable>
      ) : null}

      <GestureDetector gesture={pan}>
        <Animated.View style={cardStyle}>
          <Pressable
            onPress={isOpen ? onSwipeClose : onPress}
            style={[styles.card, { backgroundColor: theme.surface, boxShadow: theme.shadows.card }]}
          >
            <Avatar initials={initials(customer.name)} tint={tint} size="md" shape="tile" />
            <View style={styles.textWrap}>
              <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>
                {customer.name}
              </Text>
              <Text style={[styles.sub, tabularNums, { color: theme.textSecondary }]} numberOfLines={1}>
                {sub}
              </Text>
            </View>
            <View style={styles.rightCol}>
              <Text style={[styles.city, tabularNums, { color: theme.textPrimary }]}>{customer.city}</Text>
              <Text style={[styles.balance, tabularNums, { color: balance ? (hasOverdue(customer) ? theme.dangerWashText : theme.warningWashText) : theme.textSecondary }]}>
                {balance ? `${gbp(balance)} owed` : 'settled'}
              </Text>
            </View>
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 20, overflow: 'hidden' },
  deleteZone: { position: 'absolute', top: 0, bottom: 0, right: 0, width: REVEAL, alignItems: 'center', justifyContent: 'center', gap: 6, flexDirection: 'row', paddingRight: 4 },
  deleteLabel: { fontSize: 13.5, fontWeight: '600' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 20, padding: 14 },
  textWrap: { flex: 1, gap: 3, minWidth: 0 },
  name: { fontFamily: fontFamily.semibold, fontSize: 15.5, letterSpacing: -0.01 * 15.5 },
  sub: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  rightCol: { alignItems: 'flex-end', gap: 5, flexShrink: 0 },
  city: { fontSize: 14, fontWeight: '600' },
  balance: { fontFamily: fontFamily.mono, fontSize: 10.5 },
});
