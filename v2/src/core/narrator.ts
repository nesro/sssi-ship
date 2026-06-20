import type { CoreState } from './types';

/** Clears the active narrator popup, resuming tick advancement. */
export function resolveNarrator(state: CoreState): void {
  state.pendingNarrator = null;
}
