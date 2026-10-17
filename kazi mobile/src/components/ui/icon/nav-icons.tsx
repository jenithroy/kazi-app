import Svg, { Circle, Path, Rect } from 'react-native-svg';

// Ported 1:1 from the design's bottom tab bar (Kazi Dashboard.dc.html).
// These are the only hand-authored icons — everything else uses Feather
// from @expo/vector-icons via components/ui/icon/index.tsx.

export interface NavIconProps {
  size?: number;
  color: string;
}

export function DashboardIcon({ size = 22, color }: NavIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round">
      <Rect x={3} y={3} width={7.5} height={7.5} rx={2} />
      <Rect x={13.5} y={3} width={7.5} height={7.5} rx={2} />
      <Rect x={3} y={13.5} width={7.5} height={7.5} rx={2} />
      <Rect x={13.5} y={13.5} width={7.5} height={7.5} rx={2} />
    </Svg>
  );
}

export function TasksIcon({ size = 22, color }: NavIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round">
      <Path d="M4 7h9M4 12h9M4 17h6" />
      <Path d="M16.5 16.5l2 2 3.5-4" />
    </Svg>
  );
}

export function InventoryIcon({ size = 22, color }: NavIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3.5 8l8.5-4.5L20.5 8v8L12 20.5 3.5 16z" />
      <Path d="M3.5 8l8.5 4.5L20.5 8M12 12.5v8" />
    </Svg>
  );
}

export function FinanceIcon({ size = 22, color }: NavIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round">
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M12 7.5v9M9.5 10h5M9.5 14h5" />
    </Svg>
  );
}

export function ChatIcon({ size = 22, color }: NavIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20.5 12.2c0 4-3.8 7.2-8.5 7.2a10 10 0 01-2.6-.34L4.2 20.5l1.3-3.6A6.8 6.8 0 013.5 12.2C3.5 8.2 7.3 5 12 5s8.5 3.2 8.5 7.2z" />
    </Svg>
  );
}

export function ProductionIcon({ size = 22, color }: NavIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3.5 20.5V10l5 3.2V10l5 3.2V10l5 3.2V20.5z" />
      <Path d="M18.5 10V3.5h-2.2" />
    </Svg>
  );
}

export function OrdersIcon({ size = 22, color }: NavIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={4} y={4} width={16} height={16} rx={3} />
      <Path d="M4 9.5h16M9.5 9.5V20" />
    </Svg>
  );
}

export function BillingIcon({ size = 22, color }: NavIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5.5 3.5h13v17l-2.2-1.6-2.2 1.6-2.1-1.6-2.2 1.6-2.1-1.6-2.2 1.6z" />
      <Path d="M9 8.5h6M9 12.5h6" />
    </Svg>
  );
}

export function MarketingIcon({ size = 22, color }: NavIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 9.5h3.5L15 5v14l-7.5-4.5H4z" />
      <Path d="M18 9.2a4 4 0 010 5.6" />
    </Svg>
  );
}

export function MoreIcon({ size = 22, color }: NavIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={5.5} cy={12} r={1.4} fill={color} />
      <Circle cx={12} cy={12} r={1.4} fill={color} />
      <Circle cx={18.5} cy={12} r={1.4} fill={color} />
    </Svg>
  );
}
