import { useEffect, useId, useState } from 'react';
import { api } from '../lib/api.js';
import { useAction } from '../lib/hooks.js';
import { formatINR } from '../lib/format.js';
import { EXAMPLE_PRICE_PAISE, formatPercent, parseRate, pricingExample, pricingPayload } from '../lib/pricing.js';
import { Button, Card, Icon } from './ui.jsx';
import { Field, Input } from './Form.jsx';
import { useToast } from './Toast.jsx';

/** ₹1,000 for whole rupees, ₹122.50 otherwise. */
const rupees = (paise) => formatINR(paise, { whole: paise % 100 === 0 });
const asInput = (n) => String(Number(n ?? 0));

/** The worked example for ₹1,000 at the given rates (null rates = invalid input → shown as unavailable). */
export function PricingExample({ commissionPercent, memberDiscountPercent }) {
  if (commissionPercent === null || memberDiscountPercent === null) {
    return (
      <p className="text-[11px] text-brand-muted" data-testid="pricing-example">
        Enter valid rates to see the example.
      </p>
    );
  }
  const x = pricingExample(EXAMPLE_PRICE_PAISE, commissionPercent, memberDiscountPercent);
  const steps = [
    ['Vendor price', rupees(x.vendorPricePaise), 'text-gray-800'],
    ['Members see', rupees(x.memberPricePaise), 'text-gray-800'],
    x.discountPaise > 0 ? ['With discount', `−${rupees(x.discountPaise)} → ${rupees(x.payableWithDiscountPaise)}`, 'text-rose-500'] : ['With discount', 'No discount offered', 'text-gray-400'],
    ['NIVASA keeps', rupees(x.nivasaKeepsPaise), 'text-emerald-600'],
    ['Vendor gets', rupees(x.vendorGetsPaise), 'text-gray-800'],
  ];
  const sentence = `Vendor price ${rupees(x.vendorPricePaise)} → members see ${rupees(x.memberPricePaise)} · ${x.discountPaise > 0 ? `with discount −${rupees(x.discountPaise)} → ${rupees(x.payableWithDiscountPaise)}` : 'no discount offered'} · NIVASA keeps ${rupees(x.nivasaKeepsPaise)} · vendor gets ${rupees(x.vendorGetsPaise)}`;
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4" data-testid="pricing-example">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Example · a {rupees(EXAMPLE_PRICE_PAISE)} service{x.discountPaise > 0 ? ', member applies the discount' : ''}</p>
      <ol className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        {steps.map(([k, v, tone], i) => (
          <li key={k} className={i === 2 ? 'col-span-2 min-w-0' : 'min-w-0'}>
            <p className="text-[10px] font-semibold text-gray-400">{k}</p>
            <p className={`mt-0.5 break-words text-sm font-bold ${tone}`}>{v}</p>
          </li>
        ))}
      </ol>
      <p className="mt-3 border-t border-gray-100 pt-3 text-[11px] leading-relaxed text-gray-600" data-testid="pricing-example-text">
        {sentence}
      </p>
    </div>
  );
}

/**
 * This vendor's NIVASA rates (PATCH /platform/vendors/:id/pricing, perm vendors.manage). Commission is ADDED ON TOP of
 * the vendor's prices; the member discount is a share OF the commission. View-only users see the rates and example.
 */
export function VendorPricingCard({ vendorId, pricing, canEdit, onSaved, className = '' }) {
  const toast = useToast();
  const ids = { c: useId(), d: useId() };
  const saved = { commissionPercent: Number(pricing?.commissionPercent ?? 0), memberDiscountPercent: Number(pricing?.memberDiscountPercent ?? 0) };
  const [v, setV] = useState({ commissionPercent: asInput(saved.commissionPercent), memberDiscountPercent: asInput(saved.memberDiscountPercent) });
  const [errors, setErrors] = useState({});
  useEffect(() => {
    setV({ commissionPercent: asInput(saved.commissionPercent), memberDiscountPercent: asInput(saved.memberDiscountPercent) });
    setErrors({});
  }, [saved.commissionPercent, saved.memberDiscountPercent]);

  const [save, busy] = useAction((body) => api.patch(`/platform/vendors/${vendorId}/pricing`, body), {
    toast,
    success: (r) => `Rates saved: ${formatPercent(r.pricing.commissionPercent)} commission · ${formatPercent(r.pricing.memberDiscountPercent)} member discount`,
    onDone: onSaved,
  });
  const live = { commissionPercent: parseRate(v.commissionPercent), memberDiscountPercent: parseRate(v.memberDiscountPercent) };
  const dirty = live.commissionPercent !== saved.commissionPercent || live.memberDiscountPercent !== saved.memberDiscountPercent;
  const set = (k) => (e) => (setV((x) => ({ ...x, [k]: e.target.value })), setErrors((x) => ({ ...x, [k]: undefined })));
  const submit = (e) => {
    e.preventDefault();
    if (!canEdit) return;
    const { errors: errs, body } = pricingPayload(v, saved);
    setErrors(errs);
    if (body && Object.keys(body).length) save(body);
  };

  return (
    <Card className={className} title="Pricing" actions={!canEdit && <span className="text-[11px] text-brand-muted">View only</span>}>
      <form onSubmit={submit} noValidate className="space-y-4" data-testid="vendor-pricing">
        <p className="text-xs leading-relaxed text-gray-600">
          NIVASA’s commission is <b>added on top</b> of this vendor’s prices, so the vendor always gets their own price. Members can tap <b>Apply discount</b> when booking to get a share of the commission back. Changes apply at once to all of this vendor’s services; existing bookings keep their prices.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="NIVASA commission (%)" htmlFor={ids.c} error={errors.commissionPercent} hint="0 to 100, up to 2 decimals — e.g. 20 adds ₹200 to a ₹1,000 service">
            <Input id={ids.c} name="commissionPercent" value={v.commissionPercent} onChange={set('commissionPercent')} readOnly={!canEdit} invalid={Boolean(errors.commissionPercent)} inputMode="decimal" maxLength={6} placeholder="20" suffix="%" data-testid="pricing-commission" />
          </Field>
          <Field label="Member discount (% of commission)" htmlFor={ids.d} error={errors.memberDiscountPercent} hint="0 to 100 — e.g. 50 gives members half the commission back; 0 = no discount">
            <Input id={ids.d} name="memberDiscountPercent" value={v.memberDiscountPercent} onChange={set('memberDiscountPercent')} readOnly={!canEdit} invalid={Boolean(errors.memberDiscountPercent)} inputMode="decimal" maxLength={6} placeholder="50" suffix="%" data-testid="pricing-discount" />
          </Field>
        </div>
        <PricingExample commissionPercent={live.commissionPercent} memberDiscountPercent={live.memberDiscountPercent} />
        {canEdit ? (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            {dirty && (
              <Button variant="ghost" size="sm" onClick={() => (setV({ commissionPercent: asInput(saved.commissionPercent), memberDiscountPercent: asInput(saved.memberDiscountPercent) }), setErrors({}))} disabled={busy}>
                Undo changes
              </Button>
            )}
            <Button type="submit" icon="fa-regular fa-floppy-disk" loading={busy} disabledReason={!dirty ? 'No changes to save' : null} data-testid="pricing-save">
              Save rates
            </Button>
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-[11px] text-brand-muted">
            <Icon name="fa-solid fa-lock" className="text-[10px]" /> Changing rates needs the “Vendors · manage” permission.
          </p>
        )}
      </form>
    </Card>
  );
}
