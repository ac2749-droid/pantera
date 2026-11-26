/** Where the food search server is. Without both values the app works as it did before it existed. */

import type { ClientConfig } from './client';

const TIMEOUT_MS = 2500;

export function indexConfig(url: string | undefined, key: string | undefined): ClientConfig | null {
  const address = url?.trim();
  const searchKey = key?.trim();
  return address && searchKey ? { url: address, key: searchKey, timeoutMs: TIMEOUT_MS } : null;
}

// Expo replaces these exact expressions when it bundles the app. Only the search-only key belongs here.
export const foodIndex = indexConfig(process.env.EXPO_PUBLIC_FOOD_INDEX_URL, process.env.EXPO_PUBLIC_FOOD_INDEX_KEY);
