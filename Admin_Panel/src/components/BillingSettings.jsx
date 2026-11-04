import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAction } from '../lib/hooks.js';
import { paiseToRupeesInput, rupeesToPaise } from '../lib/format.js';
import { amountRule, intRange, runRules } from '../lib/validation.js';
import { Alert, Button } from './ui.jsx';
import { Field, Input, Toggle } from './Form.jsx';
import { useToast } from './Toast.jsx';

/** PATCH /society/billing-settings — every field is sent so nothing is reset by the API. */
export function BillingSettingsForm({ billing, canEdit, reason, onSaved }) {
  const toast = useToast();
  const [v, setV] = useState({});
  const [errors, setErrors] = useState({});
  useEffect(() => {
    setV({
      defaultAmount: paiseToRupeesInput(billing?.defaultAmountPaise ?? 0),
      dueDayOfMonth: String(billing?.dueDayOfMonth ?? 10),
      lateFee: paiseToRupeesInput(billing?.lateFeePaise ?? 0),
      autoGenerate: Boolean(billing?.autoGenerate),
      generateOnDay: String(billing?.generateOnDay ?? 1),
      invoicePrefix: billing?.invoicePrefix || 'INV',
    });
  }, [billing]);
  const [save, busy] = useAction(
    () =>
      api.patch('/society/billing-settings', {
        defaultAmountPaise: rupeesToPaise(v.defaultAmount || '0'),
        dueDayOfMonth: Number(v.dueDayOfMonth),
        lateFeePaise: rupeesToPaise(v.lateFee || '0'),
        autoGenerate: v.autoGenerate,
        generateOnDay: Number(v.generateOnDay),
        invoicePrefix: v.invoicePrefix.trim().toUpperCase(),
      }),
    { toast, success: 'Billing settings saved', onDone: (b) => onSaved?.(b) },
  );
  const submit = (e) => {
    e?.preventDefault();
    const errs = runRules(v, {
      defaultAmount: [amountRule('Enter an amount in rupees', { allowZero: true })],
      lateFee: [amountRule('Enter an amount in rupees', { allowZero: true })],
      dueDayOfMonth: [intRange(1, 28, 'Choose a day from 1 to 28')],
      generateOnDay: [intRange(1, 28, 'Choose a day from 1 to 28')],
      invoicePrefix: [[(x) => /^[A-Za-z0-9-]{1,10}$/.test(String(x || '').trim()), 'Up to 10 letters, digits or dashes']],
    });
    setErrors(errs);
    if (!Object.keys(errs).length) save();
  };
  const set = (k) => (e) => (setV({ ...v, [k]: e.target.value }), setErrors((x) => ({ ...x, [k]: undefined })));
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {!canEdit && <Alert tone="info">{reason}</Alert>}
      <fieldset disabled={!canEdit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Default monthly amount" error={errors.defaultAmount} hint="Used when no charge heads apply">
            <Input name="defaultAmount" prefix="₹" inputMode="decimal" value={v.defaultAmount ?? ''} onChange={set('defaultAmount')} invalid={Boolean(errors.defaultAmount)} />
          </Field>
          <Field label="Due day of month" error={errors.dueDayOfMonth}>
            <Input name="dueDayOfMonth" inputMode="numeric" value={v.dueDayOfMonth ?? ''} onChange={set('dueDayOfMonth')} invalid={Boolean(errors.dueDayOfMonth)} />
          </Field>
          <Field label="Late fee" error={errors.lateFee} hint="Added once an invoice is overdue">
            <Input name="lateFee" prefix="₹" inputMode="decimal" value={v.lateFee ?? ''} onChange={set('lateFee')} invalid={Boolean(errors.lateFee)} />
          </Field>
          <Field label="Invoice prefix" error={errors.invoicePrefix} hint="e.g. GM → GM/202610/0001">
            <Input name="invoicePrefix" value={v.invoicePrefix ?? ''} maxLength={10} onChange={set('invoicePrefix')} invalid={Boolean(errors.invoicePrefix)} className="uppercase" />
          </Field>
        </div>
        <div className="rounded-xl border border-gray-100 p-4">
          <Toggle label="Generate bills automatically" description="On the chosen day each month, bills are raised for every active flat." checked={v.autoGenerate} onChange={(x) => setV({ ...v, autoGenerate: x })} />
          {v.autoGenerate && (
            <Field label="Generate on day" error={errors.generateOnDay} className="mt-3 sm:w-1/3">
              <Input name="generateOnDay" inputMode="numeric" value={v.generateOnDay ?? ''} onChange={set('generateOnDay')} invalid={Boolean(errors.generateOnDay)} />
            </Field>
          )}
        </div>
        {canEdit && (
          <div className="flex justify-end">
            <Button type="submit" loading={busy} icon="fa-regular fa-floppy-disk">
              Save billing settings
            </Button>
          </div>
        )}
      </fieldset>
    </form>
  );
}
