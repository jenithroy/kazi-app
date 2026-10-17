import { Production } from '@/screens/production/production';

/**
 * Production as a pushed page.
 *
 * The tab route at `(tabs)/production.tsx` renders the same screen for whoever
 * has it in their bottom bar. This copy is what More and the dashboard link to,
 * so opening a module is always a push with a back chevron — see
 * `app/(app)/_layout.tsx` for why the duplicate route exists.
 */
export default function ProductionModuleRoute() {
  return <Production />;
}
