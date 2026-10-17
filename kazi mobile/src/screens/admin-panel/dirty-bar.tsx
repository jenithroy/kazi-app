import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, radii } from '@/theme';

export interface DirtyBarProps {
  count: number;
  roleLabel: string;
  peopleCount: number;
  onDiscard: () => void;
  onReview: () => void;
}

/**
 * Nothing on the matrix is written as it is tapped: edits collect in a draft
 * and this bar appears until the whole batch goes up together, so a half-made
 * change is never live and there is a single "put it back" rather than the
 * hope that you remember what you touched.
 *
 * A persistent floating bar, not a toast — it sits where the toast would, since
 * the two are never meant to be read at once.
 */
export function DirtyBar({ count, roleLabel, peopleCount, onDiscard, onReview }: DirtyBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Animated.View
      entering={FadeInDown.duration(200)}
      exiting={FadeOutDown.duration(180)}
      style={[styles.wrap, { bottom: insets.bottom + 16 }]}
    >
      <View style={[styles.bar, { backgroundColor: theme.surfaceInverted, boxShadow: theme.shadows.floating }]}>
        <View style={styles.textWrap}>
          <Text style={[styles.title, { color: theme.onDark.text }]} numberOfLines={1}>
            {count === 1 ? '1 unsaved change' : `${count} unsaved changes`}
          </Text>
          <Text style={[styles.meta, { color: theme.onDark.textMuted }]} numberOfLines={1}>
            {roleLabel} · {peopleCount} {peopleCount === 1 ? 'person' : 'people'} affected
          </Text>
        </View>
        <Pressable
          onPress={onDiscard}
          style={[styles.discard, { borderColor: theme.onDark.textMuted }]}
        >
          <Text style={[styles.discardLabel, { color: theme.onDark.text }]}>Discard</Text>
        </Pressable>
        <Button label="Review" variant="primary" size="small" onPress={onReview} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 14,
    right: 14,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radii.xl - 4,
    padding: 12,
    paddingLeft: 16,
  },
  textWrap: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  title: {
    fontFamily: fontFamily.semibold,
    fontSize: 14,
  },
  meta: {
    fontFamily: fontFamily.mono,
    fontSize: 10.5,
  },
  discard: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discardLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 13.5,
  },
});
