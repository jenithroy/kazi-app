import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import { VALUE_TIER_LABEL } from '@/data/leads/format';
import type { LeadValue } from '@/data/leads/types';

const POPOVER_WIDTH = 240;
const SCREEN_MARGIN = 12;

/**
 * The tier chip beside a lead's name. Renders nothing until the bot has
 * actually scored the conversation — no chip reads as "not yet assessed",
 * never as "low value".
 *
 * High reads on the danger token, not because anything is wrong, but because
 * `danger` is this theme's one warm/urgent color — the same reason the web
 * version reaches for 🔥 rather than its ordinary accent green.
 */
export function ValueBadge({ value }: { value: LeadValue }) {
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const chipRef = useRef<View | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number; height: number } | null>(null);

  if (!value.tier) return null;

  const tone =
    value.tier === 'high'
      ? { bg: theme.dangerWash, text: theme.dangerWashText, icon: 'zap' as const }
      : value.tier === 'medium'
        ? { bg: theme.warningWash, text: theme.warningWashText, icon: 'trending-up' as const }
        : { bg: theme.draftWash, text: theme.draftWashText, icon: 'minus' as const };

  const open = anchor !== null;

  const togglePopover = () => {
    if (open) {
      setAnchor(null);
      return;
    }
    chipRef.current?.measureInWindow((x, y, _width, height) => setAnchor({ x, y, height }));
  };

  return (
    <>
      <Pressable
        ref={chipRef}
        onPress={togglePopover}
        hitSlop={6}
        style={[styles.chip, { backgroundColor: tone.bg }]}
        accessibilityRole="button"
        accessibilityLabel={`${VALUE_TIER_LABEL[value.tier]} — why this lead is ranked here`}
      >
        <Icon name={tone.icon} size={10} color={tone.text} />
        <Text style={[styles.label, { color: tone.text }]}>{VALUE_TIER_LABEL[value.tier]}</Text>
      </Pressable>

      {/*
       * A plain absolutely-positioned popover only ever escapes as far as its
       * own row: RN stacks siblings by paint order at each level of the tree,
       * so the next row down in the leads list paints over this one regardless
       * of the popover's own zIndex/elevation — those only reorder siblings
       * within the same parent. A transparent Modal renders in its own native
       * layer above the whole list instead, anchored to the chip's measured
       * on-screen position.
       */}
      <Modal visible={open} transparent animationType="none" statusBarTranslucent onRequestClose={() => setAnchor(null)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setAnchor(null)}>
          {anchor ? (
            <Animated.View
              entering={FadeIn.duration(140)}
              style={[
                styles.pop,
                {
                  top: anchor.y + anchor.height + 6,
                  left: Math.min(anchor.x, windowWidth - POPOVER_WIDTH - SCREEN_MARGIN),
                  backgroundColor: theme.surfaceRaised,
                  borderColor: theme.border,
                  boxShadow: theme.shadows.card,
                },
              ]}
            >
              <Text style={[styles.popScore, { color: theme.textPrimary }]}>
                {VALUE_TIER_LABEL[value.tier]}
                {Number.isFinite(value.score) ? ` · ${value.score}/100` : ''}
              </Text>
              {value.reasons.length > 0 ? (
                value.reasons.map((reason, i) => (
                  <Text key={i} style={[styles.reason, { color: theme.textSecondary }]}>
                    · {reason}
                  </Text>
                ))
              ) : (
                <Text style={[styles.reason, { color: theme.textSecondary }]}>No detail yet.</Text>
              )}
            </Animated.View>
          ) : null}
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 20,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  label: { fontFamily: fontFamily.semibold, fontSize: 10.5 },
  pop: {
    position: 'absolute',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
    width: POPOVER_WIDTH,
  },
  popScore: { fontFamily: fontFamily.semibold, fontSize: 12 },
  reason: { fontSize: 11.5, lineHeight: 11.5 * 1.4 },
});
