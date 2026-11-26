/** Finding a scanned barcode: your saved foods, then the food index, then the online databases. */

import type { Food } from '../foods';
import type { LookupResult } from '../lookup';
import type { IndexDoc } from './client';
import { toFood } from './toFood';

/** Small packages carry an 8-digit UPC-E code; the databases list the 12-digit UPC-A form. */
export function fullBarcode(code: string, type?: string): string {
  const parts = /^([01])(\d{6})(\d)$/.exec(code);
  if (type !== 'upc_e' || !parts) return code;
  const [, system, d, check] = parts;
  const last = d[5];
  let body: string;
  if (last <= '2') body = d.slice(0, 2) + last + '0000' + d.slice(2, 5);
  else if (last === '3') body = d.slice(0, 3) + '00000' + d.slice(3, 5);
  else if (last === '4') body = d.slice(0, 4) + '00000' + d[4];
  else body = d.slice(0, 5) + '0000' + last;
  return system + body + check;
}

export type Scanned = LookupResult & { saved?: boolean };

export async function findScanned(
  code: string,
  sources: {
    saved: (code: string) => Food | undefined;
    index: ((code: string) => Promise<IndexDoc | null>) | null;
    online: (code: string) => Promise<LookupResult>;
  },
): Promise<Scanned> {
  const mine = sources.saved(code);
  if (mine) return { ok: true, food: mine, saved: true };
  if (sources.index) {
    try {
      const doc = await sources.index(code);
      // Remember it under the code that was scanned, so the next scan finds it on the phone
      if (doc) return { ok: true, food: { ...toFood(doc), barcode: code } };
    } catch {
      // The online databases below still work when the food index can't be reached
    }
  }
  return sources.online(code);
}
