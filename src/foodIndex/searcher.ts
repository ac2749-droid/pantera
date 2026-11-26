/**
 * Sends a search after a short typing pause. Only the newest answer is shown, and never while a finger
 * is on the list, so a row can't move out from under a tap. While a longer or shorter form of the same
 * text is being searched, the last answer travels along so the list doesn't blink.
 */

import type { SearchResult } from './client';
import type { Answer, ServerState } from './sections';

export function createSearcher(options: {
  search: (query: string, signal: AbortSignal) => Promise<SearchResult>;
  onState: (state: ServerState) => void;
  delayMs?: number;
  releaseMs?: number;
}) {
  const { search, onState, delayMs = 250, releaseMs = 150 } = options;
  let text: string | null = null;
  let typing: ReturnType<typeof setTimeout> | undefined;
  let release: ReturnType<typeof setTimeout> | undefined;
  let running: AbortController | undefined;
  let held = false;
  let pending: ServerState | undefined; // an answer waiting for the finger to lift
  let disposed = false;
  let shown: Answer | undefined;

  const cancel = () => {
    clearTimeout(typing);
    running?.abort();
    running = undefined;
    pending = undefined;
  };

  const deliver = (state: ServerState) => {
    shown = state.status === 'ready' ? { query: state.query, result: state.result } : undefined;
    onState(state);
  };

  const answer = (state: ServerState) => {
    if (held || release !== undefined) pending = state;
    else deliver(state);
  };

  const run = async (query: string) => {
    const mine = new AbortController();
    running = mine;
    let state: ServerState;
    try {
      state = { status: 'ready', query, result: await search(query, mine.signal) };
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
      state = { status: 'offline', query };
    }
    if (!disposed && running === mine) answer(state);
  };

  return {
    setQuery(query: string): void {
      const next = query.trim();
      if (disposed || next === text) return;
      text = next;
      cancel();
      if (!next) return deliver({ status: 'idle' });
      const related = shown && (next.startsWith(shown.query) || shown.query.startsWith(next));
      onState(related ? { status: 'waiting', query: next, previous: shown } : { status: 'waiting', query: next });
      typing = setTimeout(() => run(next), delayMs);
    },
    hold(on: boolean): void {
      if (disposed) return;
      held = on;
      clearTimeout(release);
      release = undefined;
      if (on) return;
      // A moment's grace so the tap that just ended opens the row that was under the finger
      release = setTimeout(() => {
        release = undefined;
        const state = pending;
        pending = undefined;
        if (state) deliver(state);
      }, releaseMs);
    },
    dispose(): void {
      disposed = true;
      cancel();
      clearTimeout(release);
    },
  };
}
