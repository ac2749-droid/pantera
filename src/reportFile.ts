/** Saving a report as a PDF through the share sheet: print it, email it, or keep it in Drive. */
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { makePdf, PdfLine, toBytes } from './pdf';

export async function shareReportPdf(name: string, lines: PdfLine[], paper: 'a4' | 'letter'): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const file = new File(Paths.cache, `${name}.pdf`);
    if (file.exists) file.delete();
    file.create();
    file.write(toBytes(makePdf(lines, paper)));
    if (!(await Sharing.isAvailableAsync())) return { ok: false, reason: 'Sharing isn’t available on this device.' };
    await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: 'Save or print your report', UTI: 'com.adobe.pdf' });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Couldn’t create the report.' };
  }
}
