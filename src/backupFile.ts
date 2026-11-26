/** Saving a backup to a file (via the share sheet: Google Drive, Files, email…) and opening one to restore. */
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { asSnapshot, readSnapshot, Snapshot } from './backup';
import { today } from './util';

export async function exportBackupFile(): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const snap = await readSnapshot();
    const file = new File(Paths.cache, `Pantera-backup-${today()}.json`);
    if (file.exists) file.delete();
    file.create();
    file.write(JSON.stringify(snap));
    if (!(await Sharing.isAvailableAsync())) return { ok: false, reason: 'Sharing isn’t available on this device.' };
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save your Pantera backup', UTI: 'public.json' });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Couldn’t create the backup.' };
  }
}

export async function pickBackupFile(): Promise<{ ok: true; snap: Snapshot } | { ok: false; reason: string } | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.length) return null;
  try {
    const text = await new File(res.assets[0].uri).text();
    const snap = asSnapshot(JSON.parse(text));
    return snap ? { ok: true, snap } : { ok: false, reason: 'That file isn’t a Pantera backup.' };
  } catch {
    return { ok: false, reason: 'Couldn’t read that file. Pick the Pantera-backup .json file you saved.' };
  }
}
