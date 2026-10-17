import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-context';
import type { SectionId } from '@/auth/permissions';
import { tabLayoutFor } from '@/auth/tab-layout';

import { useHideTabBar, useInTabs } from './tab-bar-visibility';

/**
 * Is this module one of the signed-in person's bottom-bar buttons?
 *
 * Production, Billing, Marketing and Chat are tabs for some positions and
 * More-hub screens for the rest, so their headers can't decide statically
 * whether a back chevron belongs. When the module is your tab it is a root
 * destination and the chevron is noise; when you arrived from More or a
 * dashboard quick link, it is the way out.
 */
export function useIsOwnTab(section: SectionId): boolean {
  const { profile, role } = useAuth();
  return tabLayoutFor(profile?.positionId, role).some((slot) => slot.section === section);
}

export interface ModulePresentation {
  /** A root destination for this person: no chevron, bar stays. */
  isOwnTab: boolean;
  /** Pass straight to `ScreenHeader`. */
  showBack: boolean;
  /**
   * Extra bottom padding a pushed presentation needs. These screens live in
   * `(tabs)`, so their scene normally stops above the bar and anything pinned
   * to the bottom can sit at a flat offset. With the bar folded away the scene
   * runs to the edge of the display, and that offset would put a FAB or an
   * action bar under the gesture area.
   */
  bottomInset: number;
}

/**
 * The two presentations a dual-nature module has to support, resolved once.
 *
 * Decided by *where this copy of the screen is being drawn*, not by whose tab
 * the module is. A module reached from More or a dashboard link is opened as a
 * pushed route (`/module/<name>`, see `app/(app)/module/`) and behaves like
 * every other pushed screen: full page, bottom bar folded away rather than
 * offering to jump somewhere else mid-task, chevron back to where you came
 * from. The same component mounted as a tab scene is a root destination and
 * keeps the bar and drops the chevron.
 *
 * This used to key off `useIsOwnTab` alone, which answered the wrong question:
 * for whoever had Production in their bar, More's Production card jumped to the
 * tab — no push, no animation, no way back — while for everyone else the same
 * card opened a proper page.
 */
export function useModulePresentation(section: SectionId): ModulePresentation {
  // Both hooks run unconditionally — `&&` on the calls themselves would make
  // the second one conditional.
  const inTabs = useInTabs();
  const isOwnTab = useIsOwnTab(section) && inTabs;
  const insets = useSafeAreaInsets();

  useHideTabBar(!isOwnTab);

  return { isOwnTab, showBack: !isOwnTab, bottomInset: isOwnTab ? 0 : insets.bottom };
}
