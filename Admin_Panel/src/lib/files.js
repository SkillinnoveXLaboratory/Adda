import { api, saveBlob } from './api.js';

const safe = (s) => String(s || 'file').replace(/[^\w.-]+/g, '_');

/** Receipt PDF via authenticated fetch → Blob (never a token in a URL). */
export async function downloadReceipt(receipt) {
  const id = receipt?._id || receipt;
  const { blob, filename } = await api.blob(`/society/receipts/${id}/pdf`);
  saveBlob(blob, filename || `${safe(receipt?.receiptNumber || `receipt-${id}`)}.pdf`);
}

/** Report download (pdf | xlsx). */
export async function downloadReport(type, params, format) {
  const { blob, filename } = await api.blob(`/society/reports/${type}`, { ...params, format });
  saveBlob(blob, filename || `${type}-${new Date().toISOString().slice(0, 10)}.${format}`);
}

/** Random idempotency key for money-moving requests (one per modal open). */
export const newIdempotencyKey = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
