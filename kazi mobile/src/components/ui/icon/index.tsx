import { Feather } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

export type IconName = ComponentProps<typeof Feather>['name'];

export interface IconProps {
  name: IconName;
  size?: number;
  color: string;
}

/** Generic utility/module icon — Feather's thin-stroke set reads consistently with the design's hand-drawn nav icons. */
export function Icon({ name, size = 20, color }: IconProps) {
  return <Feather name={name} size={size} color={color} />;
}

export {
  BillingIcon,
  ChatIcon,
  DashboardIcon,
  FinanceIcon,
  InventoryIcon,
  MarketingIcon,
  MoreIcon,
  OrdersIcon,
  ProductionIcon,
  TasksIcon,
  type NavIconProps,
} from './nav-icons';
