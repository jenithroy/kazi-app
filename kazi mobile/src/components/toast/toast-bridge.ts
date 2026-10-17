/**
 * A module-level handle on the toast, for code that isn't a React component.
 *
 * `ToastProvider` sits inside `QueryClientProvider`, so the query client — which
 * is built once at module scope — can never reach the toast through context.
 * It reaches it through here instead: the provider registers its `show` on
 * mount, and `showToast` is a no-op until it does. Same singleton pattern as
 * `data/notifications/actor.ts` and `data/chat/identity.ts`.
 */

export type ToastBridgeTone = 'ok' | 'warn' | 'bad';

export interface ToastBridgeOptions {
  message: string;
  tone?: ToastBridgeTone;
  durationMs?: number;
}

let handler: ((options: ToastBridgeOptions) => void) | null = null;

export function setToastHandler(fn: ((options: ToastBridgeOptions) => void) | null): void {
  handler = fn;
}

/** Show a toast from outside the tree. Silently does nothing before the provider mounts. */
export function showToast(options: ToastBridgeOptions): void {
  handler?.(options);
}
