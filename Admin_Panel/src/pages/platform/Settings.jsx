import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useAction, useQuery } from '../../lib/hooks.js';
import { isEmail, isIndianMobile, normalizePhone, parsePercent } from '../../lib/validation.js';
import { Alert, Badge, Button, Card, PageHeader, PageSkeleton, QueryState } from '../../components/ui.jsx';
import { Field, Input, Toggle } from '../../components/Form.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useAuth } from '../../lib/auth.jsx';

const META = {
  'listings.requireApproval': { label: 'Independent listings need approval', description: 'Vendor property and service listings, and marketplace listings not linked to a society, wait for platform moderation before they are visible.' },
  'support.email': { label: 'Support email', description: 'Shown to users who need help.', validate: (v) => (!v || isEmail(v) ? null : 'Enter a valid email address'), placeholder: 'support@example.com' },
  'ads.dayOptions': { label: 'Boost (ad) durations', description: 'Day options vendors can choose when boosting a post — 1 to 6 numbers from 1 to 30, separated by commas.', validate: (v) => {
      const days = String(v || '').split(',').map((d) => d.trim());
      const ok = days.length >= 1 && days.length <= 6 && days.every((d) => /^\d{1,2}$/.test(d) && +d >= 1 && +d <= 30) && new Set(days.map(Number)).size === days.length;
      return ok ? null : 'Use 1–6 different numbers from 1 to 30, separated by commas, e.g. 3,7,15,30';
    }, placeholder: '3,7,15,30' },
  'services.commissionPercent': {
    label: 'Platform commission on vendor services (%)',
    description: 'Deducted from the vendor’s price on every paid service booking. Applies to services published or edited after the change — existing services keep the rate they were published with. 0 to 50, up to 2 decimals.',
    numeric: true,
    suffix: '%',
    validate: (v) => (parsePercent(v) === null ? 'Enter a number from 0 to 50 with up to 2 decimals, e.g. 10 or 12.5' : null),
    normalize: (v) => parsePercent(v),
    placeholder: '10',
  },
  'support.phone': { label: 'Support phone', description: 'Shown to users who need help (10-digit Indian mobile).', validate: (v) => (!v || isIndianMobile(v) ? null : 'Enter a valid 10-digit mobile number'), normalize: normalizePhone, placeholder: '98765 43210' },
};

/** One setting. `readOnly` (Settings · view only): values shown in read-only inputs, no Save. */
function SettingRow({ item, onSaved, readOnly = false }) {
  const toast = useToast();
  const meta = META[item.key] || { label: item.key };
  const [value, setValue] = useState(item.value);
  const [error, setError] = useState(null);
  useEffect(() => setValue(item.value), [item.value]);
  const [save, busy] = useAction((v) => api.put(`/platform/settings/${encodeURIComponent(item.key)}`, { value: v }), { toast, success: `${meta.label} saved`, onDone: onSaved });
  if (item.type === 'boolean') {
    return (
      <div className="py-4">
        <Toggle
          label={meta.label}
          description={meta.description}
          checked={Boolean(value)}
          disabled={busy || readOnly}
          onChange={async (x) => {
            setValue(x);
            if (!(await save(x))) setValue(item.value);
          }}
        />
      </div>
    );
  }
  const dirty = meta.numeric ? parsePercent(value) !== Number(item.value ?? 0) : String(value ?? '') !== String(item.value ?? '');
  return (
    <form
      className="flex flex-col gap-3 py-4 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        if (readOnly) return;
        const problem = meta.validate?.(String(value ?? '').trim());
        if (problem) return setError(problem);
        save(meta.normalize ? meta.normalize(value) : String(value || '').trim());
      }}
    >
      {meta.numeric ? (
        <Field label={meta.label} hint={meta.description} error={error} className="flex-1">
          <div className="flex items-center gap-3">
            <Input name={item.key} value={value ?? ''} readOnly={readOnly} onChange={(e) => (setValue(e.target.value), setError(null))} invalid={Boolean(error)} placeholder={meta.placeholder} maxLength={6} inputMode="decimal" suffix={meta.suffix} className="w-full sm:w-[200px]" data-testid={`setting-${item.key}`} />
            {!readOnly && (
              <Button type="submit" loading={busy} disabledReason={!dirty ? 'No changes to save' : null}>
                Save
              </Button>
            )}
          </div>
        </Field>
      ) : (
        <>
          <Field label={meta.label} hint={meta.description} error={error} className="flex-1">
            <Input name={item.key} value={value ?? ''} readOnly={readOnly} onChange={(e) => (setValue(e.target.value), setError(null))} invalid={Boolean(error)} placeholder={meta.placeholder} maxLength={500} data-testid={`setting-${item.key}`} />
          </Field>
          {!readOnly && (
            <Button type="submit" loading={busy} disabledReason={!dirty ? 'No changes to save' : null} className="sm:mb-[22px]">
              Save
            </Button>
          )}
        </>
      )}
    </form>
  );
}

export default function Settings() {
  const { canManage } = useAuth();
  const readOnly = !canManage('settings');
  const q = useQuery(() => api.get('/platform/settings'), []);
  const config = useQuery(() => api.get('/public/config', undefined, { auth: false }), []);
  const c = config.data;
  return (
    <QueryState query={q} skeleton={<PageSkeleton rows={5} />}>
      {(data) => (
        <div>
          <PageHeader title="Settings" subtitle={readOnly ? 'Platform-wide configuration · view only' : 'Platform-wide configuration'} />
          <div className="grid grid-cols-12 gap-6">
            <Card className="col-span-12 xl:col-span-8" title="Platform settings">
              <div className="divide-y divide-gray-100">
                {data.items.map((it) => (
                  <SettingRow key={it.key} item={it} onSaved={q.reload} readOnly={readOnly} />
                ))}
              </div>
            </Card>
            <Card className="col-span-12 self-start xl:col-span-4" title="Server capabilities">
              {c ? (
                <ul className="space-y-3 text-xs">
                  {[
                    ['Environment', c.environment],
                    ['SMS OTP sign-in', c.otp?.available ? (c.otp.testMode ? 'Test mode' : c.otp.provider || 'Available') : 'Unavailable'],
                    ['Resident password sign-in', c.passwordLogin?.available ? 'On' : 'Off'],
                    ['Online payments', c.payments?.gatewayConfigured ? `Configured (${c.payments.provider})` : 'Not configured'],
                    ['Uploads', `${c.uploads?.maxMb} MB · ${c.uploads?.types?.map((t) => t.split('/')[1]).join(', ')}`],
                  ].map(([k, v]) => (
                    <li key={k} className="flex items-center justify-between gap-3">
                      <span className="text-gray-500">{k}</span>
                      <Badge tone={/unavailable|not configured|off|test/i.test(String(v)) ? 'warning' : 'success'}>{v}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-brand-muted">{config.error ? config.error.message : 'Loading…'}</p>
              )}
              <Alert tone="info" className="mt-4">
                These are read from the server’s environment and change only when the server is reconfigured.
              </Alert>
            </Card>
          </div>
        </div>
      )}
    </QueryState>
  );
}
