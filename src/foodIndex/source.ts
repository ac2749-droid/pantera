/**
 * Which food search the app uses: a server when one is configured (used for development), otherwise the
 * database inside the app, which is set up on first start.
 */

import type { ClientConfig } from './client';
import { foodIndex } from './config';
import { openLocalEngine } from './localDb';

let opening: Promise<ClientConfig> | undefined;
let opened: ClientConfig | undefined;

/** The food search if it can be used right away, `undefined` while it still has to be set up. */
export function readyFoodIndex(): ClientConfig | undefined {
  return foodIndex ?? opened;
}

/** `null` if the database can't be set up (usually no free space). Asking again tries again. */
export async function loadFoodIndex(): Promise<ClientConfig | null> {
  if (foodIndex) return foodIndex;
  opening ??= openLocalEngine().then((engine) => (opened = { engine }));
  try {
    return await opening;
  } catch (e) {
    opening = undefined;
    console.warn('Food database unavailable', e);
    return null;
  }
}
