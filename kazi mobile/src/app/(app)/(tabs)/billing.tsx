import { useLocalSearchParams } from 'expo-router';

import { Billing } from '@/screens/billing/billing';

export default function BillingRoute() {
  // Deep link (item 15): /billing?focus=INV-1043&autoEdit=1 — from the Finance ledger.
  const { focus, autoEdit } = useLocalSearchParams<{ focus?: string; autoEdit?: string }>();
  return <Billing focus={focus} autoEdit={autoEdit === '1' || autoEdit === 'true'} />;
}
