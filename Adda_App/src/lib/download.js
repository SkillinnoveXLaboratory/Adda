import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { API_BASE, ApiError, session } from './api';

/**
 * Downloads an authenticated file (e.g. a receipt PDF) and opens the system share/save sheet.
 * Uses the current access token; if it has expired, a quick authenticated call refreshes it first.
 */
export async function downloadAndShare(path, filename, warmup) {
  if (warmup) await warmup(); // ensures the access token is fresh (api() refreshes on 401)
  if (Platform.OS === 'web') {
    const res = await fetch(`${API_BASE}${path}`, { headers: session.authHeader() });
    if (!res.ok) throw new ApiError(res.status, 'DOWNLOAD_FAILED', 'Could not download the file.');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return;
  }
  const dir = new Directory(Paths.cache, 'receipts');
  if (!dir.exists) dir.create({ intermediates: true });
  const target = new File(dir, filename);
  if (target.exists) target.delete();
  let file;
  try {
    file = await File.downloadFileAsync(`${API_BASE}${path}`, target, { headers: session.authHeader(), idempotent: true });
  } catch {
    throw new ApiError(0, 'DOWNLOAD_FAILED', 'Could not download the file. Check your connection and try again.');
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: filename, UTI: 'com.adobe.pdf' });
  } else {
    throw new ApiError(0, 'SHARE_UNAVAILABLE', `Saved to ${file.uri}`);
  }
}
