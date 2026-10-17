import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { ThresholdBar } from '@/components/ui/threshold-bar';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { stockLevel, stockRatio } from '@/data/inventory/utils';
import type { StockItem } from '@/data/inventory/types';

export interface StockRowProps {
  item: StockItem;
  index: number;
  onPress: () => void;
}

export function StockRow({ item, index, onPress }: StockRowProps) {
  const theme = useTheme();
  const level = stockLevel(item);
  const isLow = level === 'low';
  const barColor = level === 'low' ? theme.danger : level === 'near' ? theme.warning : theme.accent;
  const accentBar = level === 'low' ? theme.danger : level === 'near' ? theme.warning : theme.surface;

  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index, 8) * 25).duration(200)}>
      <Pressable
        onPress={onPress}
        style={[
          styles.row,
          { backgroundColor: theme.surface, boxShadow: theme.shadows.card, borderLeftColor: accentBar },
        ]}
      >
        <View style={[styles.swatch, { backgroundColor: item.swatch }]}>
          <Text style={[styles.swatchLabel, { color: item.swatchFg }]}>{item.swatchLabel}</Text>
        </View>
        <View style={styles.textWrap}>
          <View style={styles.topLine}>
            <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>
              {item.name}
            </Text>
            {isLow ? (
              <View style={[styles.lowChip, { backgroundColor: theme.dangerWash }]}>
                <View style={[styles.lowDot, { backgroundColor: theme.danger }]} />
                <Text style={[styles.lowText, { color: theme.dangerWashText }]}>Reorder</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.qtyLine}>
            <Text style={[styles.qty, tabularNums, { color: isLow ? theme.dangerWashText : theme.textPrimary }]}>
              {item.qty.toLocaleString()}
            </Text>
            <Text style={[styles.qtyMeta, { color: theme.textSecondary }]}>
              {item.unit} · reorder at {item.threshold.toLocaleString()}
            </Text>
          </View>
          <ThresholdBar
            ratio={Math.min(stockRatio(item), 1)}
            // `stockRatio` scales to twice the reorder level, so the tick sits at
            // the halfway mark. No reorder level, no line to draw.
            markRatio={item.threshold > 0 ? 0.5 : 0}
            color={barColor}
            trackColor={theme.draftWash}
            tickColor={theme.textPrimary}
          />
          <Text style={[styles.rowMeta, tabularNums, { color: theme.textSecondary }]} numberOfLines={1}>
            {[item.sku, item.location].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 13,
    borderRadius: 20,
    padding: 14,
    borderLeftWidth: 4,
  },
  swatch: {
    width: 56,
    height: 56,
    borderRadius: 15,
    flexShrink: 0,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    padding: 5,
  },
  swatchLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 8.5,
    letterSpacing: 0.06 * 8.5,
  },
  textWrap: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  topLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  name: {
    flex: 1,
    fontFamily: fontFamily.semibold,
    fontSize: 15.5,
    letterSpacing: -0.01 * 15.5,
  },
  lowChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 24,
    paddingHorizontal: 9,
    borderRadius: 999,
  },
  lowDot: {
    width: 6,
    height: 6,
    borderRadius: 99,
  },
  lowText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  qtyLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 7,
  },
  qty: {
    fontFamily: fontFamily.semibold,
    fontSize: 19,
    letterSpacing: -0.015 * 19,
  },
  qtyMeta: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
  },
  rowMeta: {
    fontFamily: fontFamily.mono,
    fontSize: 10.5,
  },
});
