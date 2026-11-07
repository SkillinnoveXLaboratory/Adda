import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useAction, useDebounced, usePaged, useQuery } from '../../lib/hooks.js';
import { formatDate, formatDateTime, formatINR, formatNumber, formatRelative, humanize, plural, todayIST } from '../../lib/format.js';
import { COUPON_STATUS, couponForm, couponPayload, normalizeCouponCode } from '../../lib/coupons.js';
import { Alert, Badge, Button, cx, EmptyState, ErrorState, Icon, KeyValue, PageHeader, Skeleton, Tabs } from '../../components/ui.jsx';
import { DataTable, Pagination, Toolbar } from '../../components/DataTable.jsx';
import { Field, Input, SearchInput, Textarea, Toggle } from '../../components/Form.jsx';
import { Drawer, Modal } from '../../components/Modal.jsx';
import { SocietyPicker } from '../../components/SocietyPicker.jsx';
import { useToast } from '../../components/Toast.jsx';

const EMPTY = {
  '': ['No coupons yet', 'Create a coupon to give members a flat discount on vendor services. NIVASA pays the discount to the vendor.'],
  active: ['No active coupons', 'Coupons that are on, not expired and not used up show here.'],
  inactive: ['No coupons turned off', undefined],
  expired: ['No expired coupons', undefined],
};

const CouponStatus = ({ status }) => {
  const [tone, label] = COUPON_STATUS[status] || ['neutral', humanize(status)];
  return <Badge tone={tone}>{label}</Badge>;
};

const audienceText = (c) => (c.allMembers ? 'All members' : c.societies.map((s) => s.name || 'Society').join(', '));

/** Create / edit a coupon. The code is fixed once a member used it; max uses can't go below the uses so far. */
function CouponModal({ open, coupon, onClose, onSaved }) {
  const toast = useToast();
  const editing = Boolean(coupon);
  const used = coupon?.usedCount || 0;
  const [v, setV] = useState(couponForm(null));
  const [errors, setErrors] = useState({});
  useEffect(() => {
    if (open) {
      setV(couponForm(coupon));
      setErrors({});
    }
  }, [open, coupon]);
  const set = (k, val) => (setV((x) => ({ ...x, [k]: val })), setErrors((e) => ({ ...e, [k]: undefined })));
  const [save, busy] = useAction((body) => (editing ? api.patch(`/platform/coupons/${coupon._id}`, body) : api.post('/platform/coupons', body)), {
    toast,
    success: (c) => (editing ? `Coupon ${c.code} saved` : `Coupon ${c.code} created`),
    onDone: (c) => (onSaved(c), onClose()),
  });
  const submit = (e) => {
    e?.preventDefault();
    const { errors: errs, body } = couponPayload(v, { editing, usedCount: used });
    setErrors(errs);
    if (body) {
      if (editing && used > 0) delete body.code;
      save(body);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      size="lg"
      icon="fa-solid fa-ticket"
      title={editing ? `Edit coupon ${coupon.code}` : 'New coupon'}
      subtitle="A flat discount members apply when booking a vendor service. NIVASA funds the discount — it is credited to the vendor at settlement."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} data-testid="coupon-save">
            {editing ? 'Save coupon' : 'Create coupon'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4" data-testid="coupon-form">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Code" required error={errors.code} hint={used > 0 ? `Fixed — ${plural(used, 'member')} already used it` : '3–20 letters, numbers or dashes. Members type this in the app.'}>
            <Input name="code" value={v.code} onChange={(e) => set('code', normalizeCouponCode(e.target.value))} invalid={Boolean(errors.code)} disabled={used > 0} placeholder="e.g. DIWALI150" autoComplete="off" spellCheck={false} className="font-mono" maxLength={20} />
          </Field>
          <Field label="Discount" required error={errors.discount} hint="Flat amount off the service price (never more than the price)">
            <Input name="discount" value={v.discount} onChange={(e) => set('discount', e.target.value)} invalid={Boolean(errors.discount)} prefix="₹" inputMode="decimal" placeholder="150" maxLength={12} />
          </Field>
        </div>
        <Field label="Description" error={errors.description} hint="Optional, shown to members with the discount">
          <Textarea name="description" rows={2} maxLength={200} value={v.description} onChange={(e) => set('description', e.target.value)} invalid={Boolean(errors.description)} placeholder="e.g. Festive offer on home services" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Max uses" required error={errors.maxUses} hint={`Different members; each member can use it once.${used ? ` Used so far: ${used}.` : ''}`}>
            <Input name="maxUses" value={v.maxUses} onChange={(e) => set('maxUses', e.target.value.replace(/[^\d]/g, ''))} invalid={Boolean(errors.maxUses)} inputMode="numeric" maxLength={6} />
          </Field>
          <Field label="Last day (optional)" error={errors.expiresOn} hint="Valid through the end of this day, India time. Leave empty for no expiry.">
            <div className="flex items-center gap-2">
              <Input name="expiresOn" type="date" value={v.expiresOn} min={editing ? undefined : todayIST()} onChange={(e) => set('expiresOn', e.target.value)} invalid={Boolean(errors.expiresOn)} className="min-w-0 flex-1" />
              {v.expiresOn && (
                <Button size="xs" variant="ghost" onClick={() => set('expiresOn', '')} aria-label="Remove the expiry date">
                  Clear
                </Button>
              )}
            </div>
          </Field>
        </div>
        <fieldset>
          <legend className="form-label">Who can use it</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup">
            {[
              ['all', 'All members', 'Any member account, in any society or none', 'fa-solid fa-users'],
              ['societies', 'Members of selected societies', 'Only approved members of the societies you choose', 'fa-regular fa-building'],
            ].map(([value, label, help, icon]) => (
              <label key={value} className={cx('flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors', v.audience === value ? 'border-brand bg-brand-light/40' : 'border-gray-200 hover:bg-gray-50')}>
                <input type="radio" name="audience" value={value} checked={v.audience === value} onChange={() => set('audience', value)} className="mt-0.5 accent-[#2563eb]" />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-gray-700">
                    <Icon name={icon} className="mr-1.5 text-[11px] text-gray-400" />
                    {label}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-brand-muted">{help}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {v.audience === 'societies' && (
          <Field label="Societies" required error={errors.societies}>
            <SocietyPicker value={v.societies} onChange={(s) => set('societies', s)} invalid={Boolean(errors.societies)} />
          </Field>
        )}
        <Toggle label="Active" description="Members can apply the coupon only while it is on (and not expired or used up)." checked={v.active} onChange={(x) => set('active', x)} />
      </form>
    </Modal>
  );
}

/** Coupon numbers + every redemption (member, masked mobile, booking). */
function CouponDrawer({ couponId, onClose, onEdit }) {
  const q = useQuery(() => (couponId ? api.get(`/platform/coupons/${couponId}`) : Promise.resolve(null)), [couponId]);
  const c = q.data;
  return (
    <Drawer
      open={Boolean(couponId)}
      onClose={onClose}
      title={c ? c.code : 'Coupon'}
      subtitle={c ? `${formatINR(c.discountPaise)} off · created ${formatDate(c.createdAt)}` : ''}
      footer={
        c && (
          <Button variant="secondary" icon="fa-regular fa-pen-to-square" onClick={() => onEdit(c)}>
            Edit coupon
          </Button>
        )
      }
    >
      {q.loading && !c && (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}
      {q.error && !c && <ErrorState compact error={q.error} onRetry={q.reload} />}
      {c && (
        <div className="space-y-6" data-testid="coupon-detail">
          <section className="grid grid-cols-3 gap-3">
            {[
              ['Discount', formatINR(c.discountPaise)],
              ['Used', `${formatNumber(c.usedCount)} / ${formatNumber(c.maxUses)}`],
              ['Remaining', formatNumber(c.remaining)],
            ].map(([k, val]) => (
              <div key={k} className="min-w-0 rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{k}</p>
                <p className="mt-1 truncate text-base font-bold text-gray-800">{val}</p>
              </div>
            ))}
          </section>
          <section>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <CouponStatus status={c.status} />
              <Badge tone={c.allMembers ? 'info' : 'purple'}>{c.allMembers ? 'All members' : plural(c.societies.length, 'society', 'societies')}</Badge>
            </div>
            <KeyValue
              items={[
                ['Description', c.description],
                ['Who can use it', audienceText(c)],
                ['Last day', c.expiresAt ? formatDate(c.expiresAt) : 'No expiry'],
                ['Discount given so far', formatINR(c.redemptions.reduce((s, r) => s + (r.discountPaise || 0), 0))],
                ['Updated', formatDateTime(c.updatedAt)],
              ]}
            />
          </section>
          <section>
            <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-gray-400">Redemptions ({formatNumber(c.redemptions.length)})</h3>
            {c.redemptions.length === 0 ? (
              <p className="rounded-lg bg-gray-50 px-3 py-2 text-[11px] text-gray-500">No member has used this coupon yet. A cancelled or declined booking gives the use back.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="min-w-full border-separate border-spacing-0" data-testid="coupon-redemptions">
                  <thead>
                    <tr>
                      <th className="th">Member</th>
                      <th className="th">Booking</th>
                      <th className="th text-right">Discount</th>
                      <th className="th">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.redemptions.map((r) => (
                      <tr key={r._id}>
                        <td className="td">
                          <p className="font-semibold text-gray-700">{r.user?.name || 'Member'}</p>
                          <p className="font-mono text-[11px] text-gray-400">{r.user?.phone || '—'}</p>
                        </td>
                        <td className="td">
                          {r.booking ? (
                            <>
                              <p className="max-w-[180px] truncate text-gray-700">{r.booking.offerTitle}</p>
                              <div className="mt-0.5 flex gap-1">
                                <Badge status={r.booking.status} />
                                {r.booking.paid && <Badge tone="success">Paid</Badge>}
                              </div>
                            </>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="td text-right font-semibold text-gray-700">{formatINR(r.discountPaise)}</td>
                        <td className="td whitespace-nowrap" title={formatDateTime(r.at)}>
                          {formatRelative(r.at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}

/** Delete confirmation. A coupon members already used can't be deleted (409 COUPON_IN_USE) — offer "Turn off" instead. */
function DeleteCouponDialog({ coupon, onClose, onDeleted, onTurnOff, turningOff }) {
  const toast = useToast();
  const [blocked, setBlocked] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setBlocked(null), [coupon]);
  const remove = async () => {
    setBusy(true);
    try {
      await api.del(`/platform/coupons/${coupon._id}`);
      toast.success(`Coupon ${coupon.code} deleted`);
      onDeleted();
    } catch (err) {
      if (err?.code === 'COUPON_IN_USE') setBlocked(err.message);
      else toast.error(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  const canTurnOff = blocked && coupon?.active;
  return (
    <Modal
      open={Boolean(coupon)}
      onClose={onClose}
      busy={busy || turningOff}
      size="sm"
      icon={blocked ? 'fa-solid fa-lock' : 'fa-regular fa-trash-can'}
      title={blocked ? `${coupon?.code} can’t be deleted` : `Delete coupon ${coupon?.code || ''}?`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy || turningOff}>
            {blocked ? 'Close' : 'Cancel'}
          </Button>
          {blocked ? (
            canTurnOff && (
              <Button icon="fa-solid fa-power-off" onClick={onTurnOff} loading={turningOff} data-testid="coupon-turn-off-instead">
                Turn off instead
              </Button>
            )
          ) : (
            <Button variant="danger" onClick={remove} loading={busy} data-autofocus data-testid="coupon-delete-confirm">
              Delete coupon
            </Button>
          )}
        </>
      }
    >
      {blocked ? (
        <Alert tone="warning" title="Already used by members">
          {blocked}
          {!coupon?.active && ' It is already turned off.'}
        </Alert>
      ) : (
        <p className="text-xs leading-relaxed text-gray-600">Members can no longer use the code. A coupon that members already used is kept for the records — turn it off instead.</p>
      )}
    </Modal>
  );
}

/** Platform coupons: flat discounts on vendor services, funded by NIVASA. GET/POST/PATCH/DELETE /platform/coupons */
export default function Coupons() {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const list = usePaged((p) => api.get('/platform/coupons', { ...p, status: status || undefined, q: q || undefined }), { status, q });
  const [modal, setModal] = useState(null); // { coupon? }
  const [view, setView] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [toggling, setToggling] = useState(null);
  const toggle = async (c) => {
    if (toggling) return;
    setToggling(c._id);
    try {
      const r = await api.patch(`/platform/coupons/${c._id}`, { active: !c.active });
      toast.success(r.active ? `Coupon ${r.code} turned on` : `Coupon ${r.code} turned off — members can’t apply it`);
      list.reload();
      return r;
    } catch (err) {
      toast.error(err?.message || 'Something went wrong. Please try again.');
      return null;
    } finally {
      setToggling(null);
    }
  };

  const columns = [
    {
      key: 'code',
      header: 'Code',
      render: (c) => (
        <div className="min-w-0 max-w-[220px]">
          <p className="font-mono text-[13px] font-bold tracking-wide text-gray-800">{c.code}</p>
          {c.description && <p className="truncate text-[11px] text-gray-400">{c.description}</p>}
        </div>
      ),
    },
    { key: 'discount', header: 'Discount', align: 'right', render: (c) => <span className="font-semibold text-gray-700">{formatINR(c.discountPaise)}</span> },
    {
      key: 'used',
      header: 'Used / max',
      render: (c) => (
        <div className="min-w-[96px]">
          <p className="whitespace-nowrap font-semibold text-gray-700">
            {formatNumber(c.usedCount)} / {formatNumber(c.maxUses)}
          </p>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
            <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (c.usedCount / Math.max(1, c.maxUses)) * 100)}%` }} />
          </div>
          <p className="mt-0.5 text-[10px] text-gray-400">{formatNumber(c.remaining)} left</p>
        </div>
      ),
    },
    {
      key: 'who',
      header: 'Who',
      render: (c) =>
        c.allMembers ? (
          <Badge tone="info">All members</Badge>
        ) : (
          <span className="block max-w-[220px] truncate" title={audienceText(c)}>
            {audienceText(c)}
          </span>
        ),
    },
    { key: 'expires', header: 'Last day', render: (c) => (c.expiresAt ? <span className="whitespace-nowrap">{formatDate(c.expiresAt)}</span> : <span className="text-gray-300">No expiry</span>) },
    { key: 'status', header: 'Status', render: (c) => <CouponStatus status={c.status} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (c) => (
        <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="presentation">
          <Button size="xs" variant="secondary" icon="fa-regular fa-pen-to-square" onClick={() => setModal({ coupon: c })} aria-label={`Edit ${c.code}`} data-testid="coupon-edit">
            Edit
          </Button>
          <Button size="xs" variant={c.active ? 'secondary' : 'success-outline'} icon="fa-solid fa-power-off" loading={toggling === c._id} onClick={() => toggle(c)} aria-label={`${c.active ? 'Turn off' : 'Turn on'} ${c.code}`} data-testid="coupon-toggle">
            {c.active ? 'Turn off' : 'Turn on'}
          </Button>
          <Button size="xs" variant="danger-outline" icon="fa-regular fa-trash-can" className="!px-2" onClick={() => setRemoving(c)} aria-label={`Delete ${c.code}`} title="Delete" data-testid="coupon-delete" />
        </div>
      ),
    },
  ];
  const [emptyTitle, emptyMessage] = q ? ['No coupons match', 'Try a different code.'] : EMPTY[status];
  return (
    <div>
      <PageHeader
        title="Coupons"
        subtitle="Flat discounts members apply when booking vendor services. NIVASA funds every discount — it is credited to the vendor when the booking is settled."
        actions={
          <Button icon="fa-solid fa-plus" onClick={() => setModal({})} data-testid="coupon-new">
            New coupon
          </Button>
        }
      />
      <Tabs
        className="mb-4"
        tabs={[
          { value: '', label: 'All' },
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' },
          { value: 'expired', label: 'Expired' },
        ]}
        value={status}
        onChange={setStatus}
      />
      <div className="card">
        <Toolbar right={list.data && <span className="text-[11px] text-brand-muted">{plural(list.data.total, 'coupon')}</span>}>
          <SearchInput value={search} onChange={setSearch} placeholder="Search by code…" className="w-full sm:w-72" />
        </Toolbar>
        <DataTable
          testId="coupons-table"
          columns={columns}
          rows={list.data?.items}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          dim={list.reloading}
          onRowClick={(c) => setView(c._id)}
          empty={<EmptyState compact icon="fa-solid fa-ticket" title={emptyTitle} message={emptyMessage} action={!q && status === '' ? <Button icon="fa-solid fa-plus" onClick={() => setModal({})}>New coupon</Button> : undefined} />}
        />
        {list.data && <Pagination page={list.page} pages={list.data.pages} total={list.data.total} limit={list.limit} onPage={list.setPage} />}
      </div>
      <CouponModal open={Boolean(modal)} coupon={modal?.coupon} onClose={() => setModal(null)} onSaved={list.reload} />
      <CouponDrawer couponId={view} onClose={() => setView(null)} onEdit={(c) => (setView(null), setModal({ coupon: c }))} />
      <DeleteCouponDialog
        coupon={removing}
        onClose={() => setRemoving(null)}
        onDeleted={() => (setRemoving(null), list.reload())}
        turningOff={Boolean(toggling)}
        onTurnOff={async () => {
          if (await toggle(removing)) setRemoving(null);
        }}
      />
    </div>
  );
}
