import { useLocalSearchParams } from 'expo-router';

import { Billing } from '@/screens/billing/billing';

/**
 * Billing as a pushed page — see `module/production.tsx`.
 *
 * Carries the same `focus` / `autoEdit` params as the tab route, so a link into
 * a specific invoice works whichever of the two a caller reaches for.
 */
export default function BillingModuleRoute() {
  const { focus, autoEdit } = useLocalSearchParams<{ focus?: string; autoEdit?: string }>();
  return <Billing focus={focus} autoEdit={autoEdit === '1' || autoEdit === 'true'} />;
}
