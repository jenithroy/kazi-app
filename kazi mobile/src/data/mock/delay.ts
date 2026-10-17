/**
 * Every mock-api module awaits this before resolving, so loading states,
 * spinners and skeletons in the UI are exercised the same way real network
 * calls would trigger them. Kept short — this stands in for latency, not a
 * feature to tune.
 */
export function simulateLatency(ms = 500): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
