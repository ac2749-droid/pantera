/** The food search as a screen sees it: what it says about the text being typed. */

import { useCallback, useEffect, useRef, useState } from 'react';

import { searchIndex } from './client';
import type { ClientConfig } from './client';
import { createSearcher } from './searcher';
import type { ServerState } from './sections';
import { loadFoodIndex, readyFoodIndex } from './source';

// The database on the phone answers quickly, so it needs less of a typing pause than a server
const LOCAL_DELAY_MS = 90;
const OFF: ServerState = { status: 'off' };

export function useFoodSearch(query: string, enabled: boolean) {
  // undefined while the database is being set up, null if it can't be
  const [config, setConfig] = useState<ClientConfig | null | undefined>(readyFoodIndex);
  const [server, setServer] = useState<ServerState>({ status: 'idle' });
  const searcher = useRef<ReturnType<typeof createSearcher> | null>(null);

  useEffect(() => {
    if (config !== undefined) return;
    let mounted = true;
    loadFoodIndex().then((loaded) => {
      if (mounted) setConfig(loaded);
    });
    return () => {
      mounted = false;
    };
  }, [config]);

  useEffect(() => {
    if (!config) return;
    const mine = createSearcher({
      search: (text, signal) => searchIndex(config, text, 20, signal),
      onState: setServer,
      delayMs: config.engine ? LOCAL_DELAY_MS : undefined,
    });
    searcher.current = mine;
    return () => {
      mine.dispose();
      searcher.current = null;
    };
  }, [config]);

  useEffect(() => {
    searcher.current?.setQuery(enabled ? query : '');
  }, [query, enabled, config]);

  const hold = useCallback((on: boolean) => searcher.current?.hold(on), []);
  return {
    server: config ? server : OFF,
    /** The database is on this phone, rather than a server. */
    local: !!config?.engine,
    preparing: config === undefined,
    unavailable: config === null,
    hold,
  };
}
