import { useEffect, useState } from 'react';
import { setReasonAsker } from '../lib/api.js';
import { humanize } from '../lib/format.js';
import { ReasonDialog } from './Modal.jsx';

/** "POST /society/memberships/:id/approve" → "Memberships · approve" (ids dropped). */
export function describeAction(method, path) {
  const parts = String(path || '')
    .split('?')[0]
    .split('/')
    .filter((p) => p && p !== 'society' && !/^[a-f0-9]{24}$/i.test(p));
  const verb = { POST: 'create', PATCH: 'update', PUT: 'update', DELETE: 'delete' }[String(method).toUpperCase()] || 'change';
  if (!parts.length) return humanize(verb);
  const [first, ...rest] = parts;
  return `${humanize(first)} · ${rest.length ? rest.map(humanize).join(' ').toLowerCase() : verb}`;
}

/** Mounted once: the API client awaits this dialog before any change inside a managed society. */
export function ReasonPromptHost() {
  const [pending, setPending] = useState(null);
  useEffect(() => {
    setReasonAsker((ctx) => new Promise((resolve) => setPending({ ctx, resolve })));
    return () => setReasonAsker(null);
  }, []);
  const finish = (value) => {
    pending?.resolve(value);
    setPending(null);
  };
  const ctx = pending?.ctx;
  return (
    <ReasonDialog
      open={Boolean(pending)}
      onClose={() => finish(null)}
      onSubmit={(r) => finish(r)}
      title="Reason for this change"
      tone="primary"
      confirmLabel="Continue"
      placeholder="e.g. Society admin asked for help by phone on 27 Oct"
      message={
        <>
          You are acting as the <b>platform owner</b> in <b>{ctx?.society?.name || 'this society'}</b> ({describeAction(ctx?.method, ctx?.path)}). The reason is saved in the audit log with the change.
        </>
      }
    />
  );
}
