import { Redirect } from 'expo-router';

/**
 * The screen moved to `/production` when the files were renamed to match what
 * the floor calls it. Notification rows already in Postgres carry
 * `/order-management` in their `deepLink`, and those rows are permanent — so
 * the old path stays routable and forwards.
 *
 * Only the *route* moved. The permission section is still `order-management`,
 * because that string is `sections.id` in Postgres and the key RLS gates the
 * `orders` read on.
 */
export default function OrderManagementRedirect() {
  return <Redirect href="/production" />;
}
