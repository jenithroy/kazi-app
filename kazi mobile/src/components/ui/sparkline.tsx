import Svg, { Polyline } from 'react-native-svg';

export interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  color: string;
}

/** Context, not data: no axes, no labels — per the style guide's KPI card rule. */
export function Sparkline({ values, width = 58, height = 24, color }: SparklineProps) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);

  const points = values
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none">
      <Polyline points={points} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
