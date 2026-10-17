import { StyleSheet, View } from 'react-native';

export interface ThresholdBarProps {
  /** 0-1, how full the bar is. */
  ratio: number;
  /** 0-1, position of the reorder-point tick mark. */
  markRatio: number;
  color: string;
  trackColor: string;
  tickColor: string;
  height?: number;
}

/** Fill + a tick mark at the reorder point — used on inventory rows and the item detail header. */
export function ThresholdBar({ ratio, markRatio, color, trackColor, tickColor, height = 5 }: ThresholdBarProps) {
  return (
    <View style={[styles.track, { height, backgroundColor: trackColor }]}>
      <View style={[styles.fill, { width: `${Math.min(Math.max(ratio, 0), 1) * 100}%`, backgroundColor: color }]} />
      <View style={[styles.tick, { left: `${Math.min(Math.max(markRatio, 0), 1) * 100}%`, backgroundColor: tickColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    borderRadius: 99,
    overflow: 'hidden',
    position: 'relative',
  },
  fill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: 99,
  },
  tick: {
    position: 'absolute',
    top: -2,
    bottom: -2,
    width: 1.5,
    opacity: 0.4,
  },
});
