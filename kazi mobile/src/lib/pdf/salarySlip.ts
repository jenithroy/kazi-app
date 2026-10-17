/**
 * Salary-slip PDF — renders the same HTML the on-screen viewer shows
 * (`salary-slip-template.ts`, a port of the web ERP's print output) to a real
 * file with `expo-print`, then hands it to the OS share sheet.
 *
 * `expo-print` names its output with a random temp filename, so the file is
 * renamed first: that name is what the share sheet and the recipient see.
 */
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Directory, File, Paths } from 'expo-file-system';

import { buildSalarySlipHtml, type SalarySlipData } from './salary-slip-template';

function slipsDir(): Directory {
  const dir = new Directory(Paths.cache, 'salary-slips');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Renders the slip as a PDF named after the employee and month. */
export async function generateSalarySlipPdf(s: SalarySlipData): Promise<File> {
  const { uri } = await Print.printToFileAsync({ html: buildSalarySlipHtml(s) });
  const printed = new File(uri);
  try {
    const named = new File(slipsDir(), s.fileName);
    if (named.exists) named.delete();
    await printed.move(named);
    return named;
  } catch {
    // Renaming is a nicety — never lose the document over it.
    return printed;
  }
}

/** Generate + open the OS share sheet. Returns false if sharing is unavailable. */
export async function shareSalarySlipPdf(s: SalarySlipData): Promise<boolean> {
  const file = await generateSalarySlipPdf(s);
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: file.name,
  });
  return true;
}
