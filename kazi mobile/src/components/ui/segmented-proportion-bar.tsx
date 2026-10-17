import { StyleSheet, View } from 'react-native';

export interface Segment {
  weight: number;
  color: string;
}

export interface SegmentedProportionBarProps {
  segments: Segment[];
  height?: number;
  gap?: number;
}

/** "Pipeline as one bar" — proportions first, counts second, per the style guide's dashboard rule. */
export function SegmentedProportionBar({ segments, height = 12, gap = 3 }: SegmentedProportionBarProps) {
  return (
    <View style={[styles.row, { height, gap }]}>
      {segments.map((s, i) => (
        <View key={i} style={{ flex: Math.max(s.weight, 0.001), borderRadius: 999, backgroundColor: s.color }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
});
