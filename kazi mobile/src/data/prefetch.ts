/**
 * Warm a module's reads the moment a link is *touched*, not when it opens.
 *
 * A press and the screen it leads to are separated by a real amount of time —
 * the finger lifting, then a ~220ms push or an instant tab switch — and until
 * now the app spent all of it idle and only asked Postgres for anything once
 * the destination had mounted. Every module therefore opened on its spinner,
 * and the wait for the network began *after* the wait for the animation
 * instead of underneath it.
 *
 * Starting the read on `onPressIn` moves it under the animation. A read that
 * takes less than the transition now finishes before the screen is even
 * looked at, and a slower one has a head start of however long the person's
 * finger was down plus the push. Nothing here changes what is fetched or how
 * the screens read it: these are the same query keys and the same functions
 * the module's own hooks use, so the mount finds the cache already populated
 * (or the very same request already in flight) and never fires a second one.
 *
 * `prefetchQuery` is deliberately fire-and-forget. It resolves nothing the
 * caller needs, it respects `staleTime` so a warm module costs no request at
 * all, and a rejection is swallowed — the destination's own gate is what
 * tells someone a read failed, and a failed *prefetch* has no screen to
 * report on yet.
 */

import { queryClient } from './client';

import * as adminPanelApi from './admin-panel/api';
import { adminPanelKeys } from './admin-panel/keys';
import * as attendanceApi from './attendance/api';
import { attendanceKeys } from './attendance/keys';
import * as billingApi from './billing/api';
import { billingKeys } from './billing/keys';
import * as budgetApi from './budget-requirements/api';
import { budgetRequirementsKeys } from './budget-requirements/keys';
import * as chatApi from './chat/api';
import { chatKeys } from './chat/keys';
import * as customersApi from './customers/api';
import { customersKeys } from './customers/keys';
import * as employeesApi from './employees-hr/api';
import { employeesKeys } from './employees-hr/keys';
import * as financeApi from './finance/api';
import { financeKeys } from './finance/keys';
import * as inventoryApi from './inventory/api';
import { inventoryKeys } from './inventory/keys';
import * as marketingApi from './marketing/api';
import { marketingKeys } from './marketing/keys';
import * as purchasesApi from './purchases/api';
import { purchasesKeys } from './purchases/keys';
import * as salesApi from './sales/api';
import { salesKeys } from './sales/keys';
import * as tasksApi from './tasks/api';
import { tasksKeys } from './tasks/keys';

interface Warm {
  queryKey: readonly unknown[];
  queryFn: () => Promise<unknown>;
}

/**
 * What to warm per route, keyed by the paths in `constants.ts` and the bottom
 * bar.
 *
 * Only what the screen needs to draw its *first* frame belongs here. Billing
 * reads four collections and Finance ten, but a hub opens on one tab, and
 * firing all ten in parallel off a touch that might never become a tap would
 * spend someone's data to fill panes they have not asked for. The rest arrive
 * the moment the screen mounts, exactly as before.
 *
 * Two omissions are on purpose. Attendance's clock status sets `staleTime: 0`
 * because it is time-sensitive and must never be served from cache, so warming
 * it would be a wasted request; only the team roster is warmed. And no route
 * warms anything a *mutation* owns.
 */
const WARM: Record<string, Warm[]> = {
  '/sales': [{ queryKey: salesKeys.list(), queryFn: salesApi.fetchOrders }],
  // Production reads the same orders collection Sales does.
  '/production': [{ queryKey: salesKeys.list(), queryFn: salesApi.fetchOrders }],
  '/order-management': [{ queryKey: salesKeys.list(), queryFn: salesApi.fetchOrders }],
  '/customers': [{ queryKey: customersKeys.list(), queryFn: customersApi.fetchCustomers }],
  '/inventory': [{ queryKey: inventoryKeys.stock(), queryFn: inventoryApi.fetchStock }],
  '/billing': [{ queryKey: billingKeys.invoices(), queryFn: billingApi.fetchInvoices }],
  '/finance': [{ queryKey: financeKeys.expenses(), queryFn: financeApi.fetchExpenses }],
  '/accounting': [{ queryKey: financeKeys.journal(), queryFn: financeApi.fetchJournalEntries }],
  '/purchases': [{ queryKey: purchasesKeys.list(), queryFn: purchasesApi.fetchEntries }],
  '/tasks': [{ queryKey: tasksKeys.list(), queryFn: tasksApi.fetchTasks }],
  '/marketing': [{ queryKey: marketingKeys.list(), queryFn: marketingApi.fetchEntries }],
  '/employees-hr': [{ queryKey: employeesKeys.list(), queryFn: employeesApi.fetchEmployees }],
  '/attendance': [{ queryKey: attendanceKeys.team(), queryFn: attendanceApi.fetchTeam }],
  '/admin-panel': [{ queryKey: adminPanelKeys.matrix(), queryFn: adminPanelApi.fetchAdminMatrix }],
  '/budget-requirements': [
    { queryKey: budgetRequirementsKeys.list(), queryFn: budgetApi.fetchRequirements },
    { queryKey: budgetRequirementsKeys.requests(), queryFn: budgetApi.fetchBudgetRequests },
  ],
  // Chat gates on all four together, so warming one buys nothing.
  '/chat': [
    { queryKey: chatKeys.threads(), queryFn: chatApi.fetchThreads },
    { queryKey: chatKeys.messages(), queryFn: chatApi.fetchMessages },
    { queryKey: chatKeys.unread(), queryFn: chatApi.fetchUnread },
    { queryKey: chatKeys.directory(), queryFn: chatApi.fetchDirectory },
  ],
};

/**
 * Start the reads for `path`, if we know any. Safe to call repeatedly — React
 * Query dedupes an in-flight request and skips a fresh one — and safe to call
 * for a path with nothing registered, which is most of them.
 */
export function prefetchRoute(path: string): void {
  // `/module/production` and `/production` are the pushed and tab copies of one
  // screen (see `constants.ts`), and they read exactly the same rows — so the
  // table above is keyed by the plain path and the prefix is dropped here
  // rather than every entry being written twice.
  const warm = WARM[path.startsWith('/module/') ? path.slice('/module'.length) : path];
  if (!warm) return;
  for (const { queryKey, queryFn } of warm) {
    void queryClient.prefetchQuery({ queryKey, queryFn }).catch(() => {});
  }
}

/** Bottom-bar route names (`state.routes[i].name`) to the paths above. */
const TAB_PATHS: Record<string, string> = {
  chat: '/chat',
  tasks: '/tasks',
  inventory: '/inventory',
  finance: '/finance',
  production: '/production',
  billing: '/billing',
  marketing: '/marketing',
};

/** As `prefetchRoute`, for a tab button. `index` and `more` read nothing of their own. */
export function prefetchTab(routeName: string): void {
  const path = TAB_PATHS[routeName];
  if (path) prefetchRoute(path);
}
