import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useAction, useDebounced, usePaged, useQuery } from '../../lib/hooks.js';
import { formatINR, formatNumber, humanize, paiseToRupeesInput, rupeesToPaise, plural } from '../../lib/format.js';
import { amountRule, intRange, maxLen, req, runRules } from '../../lib/validation.js';
import { noPermissionReason } from '../../lib/roles.js';
import { Alert, Badge, Button, cx, EmptyState, ErrorState, Icon, PageHeader, Skeleton } from '../../components/ui.jsx';
import { DataTable, Pagination, Toolbar } from '../../components/DataTable.jsx';
import { Field, Input, SearchInput, Select, Textarea, Toggle } from '../../components/Form.jsx';
import { Modal } from '../../components/Modal.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useCounts } from '../../layout/Portals.jsx';

/** Mirrors the server's bulk numbering so the preview matches exactly what will be created. */
export function previewFlatNumbers({ buildingName, fromFloor, toFloor, unitsPerFloor, pattern }) {
  const from = Number(fromFloor);
  const to = Number(toFloor);
  const units = Number(unitsPerFloor);
  if (![from, to, units].every(Number.isInteger) || to < from || units < 1) return { total: 0, numbers: [] };
  const prefix = String(buildingName || '')
    .replace(/^(block|tower|wing)\s*/i, '')
    .replace(/\s+/g, '')
    .toUpperCase()
    .slice(0, 6);
  const numbers = [];
  for (let floor = from; floor <= to; floor += 1) {
    for (let u = 1; u <= units; u += 1) {
      const fl = floor === 0 ? 'G' : String(floor);
      numbers.push(pattern.replace('{building}', prefix).replace('{floor}', fl).replace('{unit}', String(u).padStart(2, '0')));
    }
  }
  return { total: numbers.length, numbers };
}

const PATTERNS = [
  ['{building}-{floor}{unit}', 'A-101', 'Building – floor + unit'],
  ['{floor}{unit}', '101', 'Floor + unit'],
  ['{building}{floor}{unit}', 'A101', 'Building + floor + unit'],
];

function BuildingModal({ open, onClose, building, onSaved }) {
  const toast = useToast();
  const [v, setV] = useState({});
  const [errors, setErrors] = useState({});
  useEffect(() => {
    if (open) {
      setV({ name: building?.name || '', floors: building ? String(building.floors ?? 0) : '', description: building?.description || '', active: building ? building.active !== false : true });
      setErrors({});
    }
  }, [open, building]);
  const [save, busy] = useAction(
    () => {
      // Full object on edit: the API resets omitted fields to defaults.
      const body = { name: v.name.trim(), floors: Number(v.floors || 0), description: v.description.trim() || undefined, active: v.active };
      return building ? api.patch(`/society/buildings/${building._id}`, body) : api.post('/society/buildings', body);
    },
    { toast, success: building ? 'Building updated' : 'Building added', onDone: (b) => (onSaved(b), onClose()) },
  );
  const submit = (e) => {
    e?.preventDefault();
    const errs = runRules(v, { name: [req('Enter a building name'), maxLen(80)], floors: [intRange(0, 200, 'Floors must be 0–200')], description: [maxLen(300)] });
    setErrors(errs);
    if (!Object.keys(errs).length) save();
  };
  return (
    <Modal open={open} onClose={onClose} busy={busy} title={building ? 'Edit building' : 'Add building'} icon="fa-regular fa-building" footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={submit} loading={busy}>{building ? 'Save changes' : 'Add building'}</Button></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Name" required error={errors.name} className="sm:col-span-2">
            <Input name="name" value={v.name || ''} onChange={(e) => setV({ ...v, name: e.target.value })} invalid={Boolean(errors.name)} placeholder="e.g. Tower A" />
          </Field>
          <Field label="Floors" error={errors.floors}>
            <Input name="floors" inputMode="numeric" value={v.floors ?? ''} onChange={(e) => setV({ ...v, floors: e.target.value })} invalid={Boolean(errors.floors)} placeholder="e.g. 12" />
          </Field>
        </div>
        <Field label="Description" error={errors.description}>
          <Textarea name="description" rows={2} value={v.description || ''} onChange={(e) => setV({ ...v, description: e.target.value })} />
        </Field>
        <Toggle label="Active" description="Inactive buildings are hidden from residents joining the society." checked={v.active} onChange={(x) => setV({ ...v, active: x })} />
      </form>
    </Modal>
  );
}

function BulkModal({ open, onClose, buildings, defaultBuildingId, onSaved }) {
  const toast = useToast();
  const [v, setV] = useState({});
  const [errors, setErrors] = useState({});
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (open) {
      setV({ buildingId: defaultBuildingId || buildings[0]?._id || '', fromFloor: '1', toFloor: '', unitsPerFloor: '4', pattern: PATTERNS[0][0], areaSqft: '', category: '' });
      setErrors({});
      setResult(null);
    }
    // Reset only when the dialog opens — reloading the buildings list after a save must not wipe the result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const building = buildings.find((b) => b._id === v.buildingId);
  const preview = useMemo(() => previewFlatNumbers({ buildingName: building?.name, ...v }), [building, v]);
  const [save, busy] = useAction(
    () =>
      api.post('/society/flats/bulk', {
        buildingId: v.buildingId,
        fromFloor: Number(v.fromFloor),
        toFloor: Number(v.toFloor),
        unitsPerFloor: Number(v.unitsPerFloor),
        pattern: v.pattern,
        areaSqft: v.areaSqft ? Number(v.areaSqft) : undefined,
        category: v.category.trim() || undefined,
      }),
    { toast, success: (r) => `${r.created} flats created`, onDone: (r) => (setResult(r), onSaved()) },
  );
  const submit = (e) => {
    e?.preventDefault();
    const errs = runRules(v, {
      buildingId: [req('Choose a building')],
      fromFloor: [req('Required'), intRange(-5, 200, '−5 to 200')],
      toFloor: [req('Required'), intRange(-5, 200, '−5 to 200'), [(x, all) => Number(x) >= Number(all.fromFloor), 'Must be ≥ from floor']],
      unitsPerFloor: [req('Required'), intRange(1, 50, '1 to 50')],
      areaSqft: [[(x) => !x || (Number(x) > 0 && Number(x) < 1e6), 'Enter a positive area']],
    });
    if (!errs.toFloor && preview.total > 2000) errs.toFloor = 'At most 2000 flats per batch';
    setErrors(errs);
    if (!Object.keys(errs).length) save();
  };
  const set = (k) => (e) => (setV({ ...v, [k]: e.target.value }), setErrors((x) => ({ ...x, [k]: undefined })));
  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      size="lg"
      title="Bulk flat generator"
      subtitle="Create a whole building’s flats in one go"
      icon="fa-solid fa-wand-magic-sparkles"
      footer={result ? <Button onClick={onClose}>Done</Button> : <><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={submit} loading={busy} disabled={!preview.total} data-testid="bulk-submit">Create {preview.total ? formatNumber(preview.total) : ''} flats</Button></>}
    >
      {result ? (
        <div className="space-y-4" data-testid="bulk-result">
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              ['Requested', result.requested, 'text-gray-800'],
              ['Created', result.created, 'text-emerald-600'],
              ['Already existed', result.skippedExisting, 'text-amber-600'],
            ].map(([k, n, c]) => (
              <div key={k} className="rounded-xl bg-azea-bg p-4">
                <p className={cx('text-2xl font-bold', c)}>{formatNumber(n)}</p>
                <p className="text-[11px] text-gray-500">{k}</p>
              </div>
            ))}
          </div>
          {result.skippedExisting > 0 && <Alert tone="info">Flats whose numbers already existed were skipped — nothing was duplicated.</Alert>}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Building" required error={errors.buildingId}>
              <Select name="buildingId" value={v.buildingId || ''} onChange={set('buildingId')} invalid={Boolean(errors.buildingId)}>
                {buildings.map((b) => (
                  <option key={b._id} value={b._id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Numbering pattern">
              <Select name="pattern" value={v.pattern || ''} onChange={set('pattern')}>
                {PATTERNS.map(([p, ex, label]) => (
                  <option key={p} value={p}>
                    {label} (e.g. {ex})
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field label="From floor" required error={errors.fromFloor} hint="0 = ground">
              <Input name="fromFloor" inputMode="numeric" value={v.fromFloor ?? ''} onChange={set('fromFloor')} invalid={Boolean(errors.fromFloor)} />
            </Field>
            <Field label="To floor" required error={errors.toFloor}>
              <Input name="toFloor" inputMode="numeric" value={v.toFloor ?? ''} onChange={set('toFloor')} invalid={Boolean(errors.toFloor)} placeholder={building?.floors ? String(building.floors) : ''} />
            </Field>
            <Field label="Units / floor" required error={errors.unitsPerFloor}>
              <Input name="unitsPerFloor" inputMode="numeric" value={v.unitsPerFloor ?? ''} onChange={set('unitsPerFloor')} invalid={Boolean(errors.unitsPerFloor)} />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Area (sq ft)" error={errors.areaSqft} hint="Optional — used by per-sq-ft charges">
              <Input name="areaSqft" inputMode="decimal" value={v.areaSqft ?? ''} onChange={set('areaSqft')} invalid={Boolean(errors.areaSqft)} />
            </Field>
            <Field label="Category" hint="Optional — e.g. 2BHK; charge heads can target a category">
              <Input name="category" value={v.category ?? ''} onChange={set('category')} maxLength={40} />
            </Field>
          </div>
          <div className="rounded-xl border border-gray-100 bg-azea-bg p-4" data-testid="bulk-preview">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Live preview</p>
              <span className={cx('text-xs font-bold', preview.total > 2000 ? 'text-rose-500' : 'text-azea-purple')}>{plural(preview.total, 'flat', 'flats')}</span>
            </div>
            {preview.total ? (
              <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                {preview.numbers.slice(0, 60).map((n) => (
                  <span key={n} className="rounded-md bg-white px-2 py-1 font-mono text-[11px] font-semibold text-gray-700 ring-1 ring-gray-100">
                    {n}
                  </span>
                ))}
                {preview.total > 60 && <span className="px-2 py-1 text-[11px] text-gray-400">+{formatNumber(preview.total - 60)} more…</span>}
              </div>
            ) : (
              <p className="text-xs text-azea-muted">Enter the floor range and units per floor to see the flat numbers.</p>
            )}
          </div>
        </form>
      )}
    </Modal>
  );
}

function FlatModal({ open, onClose, flat, buildings, defaultBuildingId, onSaved, readOnly, readOnlyReason }) {
  const toast = useToast();
  const [v, setV] = useState({});
  const [errors, setErrors] = useState({});
  useEffect(() => {
    if (open) {
      setV({
        buildingId: flat?.building?._id || flat?.building || defaultBuildingId || buildings[0]?._id || '',
        number: flat?.number || '',
        floor: flat?.floor ?? '',
        areaSqft: flat?.areaSqft ?? '',
        category: flat?.category || '',
        override: Number.isInteger(flat?.maintenanceAmountPaise),
        amount: paiseToRupeesInput(flat?.maintenanceAmountPaise),
        active: flat ? flat.active !== false : true,
      });
      setErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, flat]);
  const [save, busy] = useAction(
    () => {
      const body = {
        buildingId: v.buildingId,
        number: v.number.trim().toUpperCase(),
        floor: v.floor === '' ? undefined : Number(v.floor),
        areaSqft: v.areaSqft === '' ? undefined : Number(v.areaSqft),
        category: v.category.trim() || undefined,
        active: v.active,
        maintenanceAmountPaise: v.override ? rupeesToPaise(v.amount) : flat ? null : undefined,
      };
      return flat ? api.patch(`/society/flats/${flat._id}`, body) : api.post('/society/flats', body);
    },
    { toast, success: flat ? 'Flat updated' : 'Flat added', onDone: () => (onSaved(), onClose()) },
  );
  const submit = (e) => {
    e?.preventDefault();
    const errs = runRules(v, {
      buildingId: [req('Choose a building')],
      number: [req('Enter the flat number'), maxLen(20)],
      floor: [intRange(-5, 200, 'Floor must be −5 to 200')],
      areaSqft: [[(x) => x === '' || (Number(x) >= 0 && Number(x) < 1e6), 'Enter a valid area']],
      amount: v.override ? [req('Enter the monthly amount'), amountRule()] : [],
    });
    setErrors(errs);
    if (!Object.keys(errs).length) save();
  };
  const set = (k) => (e) => (setV({ ...v, [k]: e.target.value }), setErrors((x) => ({ ...x, [k]: undefined })));
  return (
    <Modal open={open} onClose={onClose} busy={busy} size="lg" title={flat ? `Flat ${flat.number}` : 'Add flat'} subtitle={flat ? flat.building?.name : undefined} icon="fa-solid fa-door-open" footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>{readOnly ? 'Close' : 'Cancel'}</Button>{!readOnly && <Button onClick={submit} loading={busy} data-testid="flat-save">{flat ? 'Save changes' : 'Add flat'}</Button>}</>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {readOnly && <Alert tone="info">{readOnlyReason}</Alert>}
        <fieldset disabled={readOnly} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Building" required error={errors.buildingId}>
              <Select name="buildingId" value={v.buildingId || ''} onChange={set('buildingId')}>
                {buildings.map((b) => (
                  <option key={b._id} value={b._id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Flat number" required error={errors.number}>
              <Input name="number" value={v.number || ''} onChange={set('number')} invalid={Boolean(errors.number)} placeholder="e.g. A-101" className="uppercase" />
            </Field>
            <Field label="Floor" error={errors.floor}>
              <Input name="floor" inputMode="numeric" value={v.floor ?? ''} onChange={set('floor')} invalid={Boolean(errors.floor)} />
            </Field>
            <Field label="Area (sq ft)" error={errors.areaSqft}>
              <Input name="areaSqft" inputMode="decimal" value={v.areaSqft ?? ''} onChange={set('areaSqft')} invalid={Boolean(errors.areaSqft)} />
            </Field>
            <Field label="Category">
              <Input name="category" value={v.category || ''} onChange={set('category')} maxLength={40} placeholder="e.g. 2BHK" />
            </Field>
          </div>
          <div className="rounded-xl border border-gray-100 p-4">
            <Toggle label="Maintenance override" description="Bill this flat a fixed monthly amount instead of the society’s charge heads." checked={v.override} onChange={(x) => setV({ ...v, override: x })} />
            {v.override && (
              <Field label="Monthly amount" error={errors.amount} className="mt-3 sm:w-1/2">
                <Input name="amount" prefix="₹" inputMode="decimal" value={v.amount ?? ''} onChange={set('amount')} invalid={Boolean(errors.amount)} placeholder="0.00" />
              </Field>
            )}
          </div>
          <Toggle label="Active" description="Inactive flats are not billed and cannot be joined." checked={v.active} onChange={(x) => setV({ ...v, active: x })} />
        </fieldset>
        {flat && (
          <div>
            <p className="form-label">Residents</p>
            {flat.residents?.length ? (
              <ul className="divide-y divide-gray-50 rounded-xl border border-gray-100">
                {flat.residents.map((r) => (
                  <li key={r._id} className="flex items-center justify-between px-4 py-2.5 text-xs">
                    <span className="font-semibold text-gray-700">{r.name}</span>
                    <span className="text-gray-400">
                      {r.phone && `+91 ${r.phone} · `}
                      {humanize(r.residentType)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-azea-muted">No approved residents in this flat yet.</p>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}

export default function Structure() {
  const { can, role } = useAuth();
  const { refreshCounts } = useCounts();
  const canManage = can('society.manage');
  const reason = canManage ? null : noPermissionReason(role);
  const buildingsQ = useQuery(() => api.get('/society/buildings'), []);
  const buildings = buildingsQ.data?.items || [];
  const [selected, setSelected] = useState('');
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const flats = usePaged((p) => api.get('/society/flats', p), { buildingId: selected, q }, 50);
  const [modal, setModal] = useState(null); // {type, item}

  const reloadAll = () => {
    buildingsQ.reload();
    flats.reload();
    refreshCounts();
  };
  const current = buildings.find((b) => b._id === selected);

  const columns = [
    { key: 'number', header: 'Flat', render: (f) => <span className="font-semibold text-gray-800">{f.number}</span> },
    { key: 'building', header: 'Building', render: (f) => f.building?.name || '—' },
    { key: 'floor', header: 'Floor', render: (f) => (f.floor === 0 ? 'Ground' : f.floor ?? '—') },
    { key: 'area', header: 'Area', render: (f) => (f.areaSqft ? `${formatNumber(f.areaSqft)} sq ft` : '—') },
    { key: 'category', header: 'Category', render: (f) => f.category || '—' },
    { key: 'maint', header: 'Maintenance', render: (f) => (Number.isInteger(f.maintenanceAmountPaise) ? <span title="Per-flat override">{formatINR(f.maintenanceAmountPaise)} <Badge tone="purple">Override</Badge></span> : <span className="text-gray-400">Charge heads</span>) },
    { key: 'residents', header: 'Residents', className: 'max-w-[220px] truncate', render: (f) => (f.residents?.length ? f.residents.map((r) => r.name).join(', ') : <span className="text-gray-300">—</span>) },
    { key: 'occupancy', header: 'Occupancy', render: (f) => <Badge tone={f.occupancy === 'vacant' ? 'neutral' : f.occupancy === 'rented' ? 'info' : 'success'}>{humanize(f.occupancy)}</Badge> },
    { key: 'active', header: 'Status', render: (f) => <Badge status={f.active === false ? 'inactive' : 'active'} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Buildings & flats"
        subtitle="Your society’s structure — residents join specific flats and bills are raised per flat"
        actions={
          <>
            <Button variant="outline" icon="fa-solid fa-plus" disabledReason={reason || (!buildings.length ? 'Add a building first' : null)} onClick={() => setModal({ type: 'flat' })}>
              Add flat
            </Button>
            <Button variant="outline" icon="fa-solid fa-wand-magic-sparkles" disabledReason={reason || (!buildings.length ? 'Add a building first' : null)} onClick={() => setModal({ type: 'bulk' })} data-testid="open-bulk">
              Bulk generate
            </Button>
            <Button icon="fa-regular fa-building" disabledReason={reason} onClick={() => setModal({ type: 'building' })} data-testid="add-building">
              Add building
            </Button>
          </>
        }
      />
      {!canManage && (
        <Alert tone="info" className="mb-4">
          You can view the society structure. Only society admins can add or edit buildings and flats.
        </Alert>
      )}
      <div className="grid grid-cols-12 gap-6">
        <section className="card col-span-12 self-start lg:col-span-4 xl:col-span-3">
          <div className="flex items-center justify-between px-5 pb-3 pt-5">
            <h2 className="card-title">Buildings</h2>
            <span className="text-[11px] text-azea-muted">{buildings.length}</span>
          </div>
          {buildingsQ.loading && !buildingsQ.data ? (
            <div className="space-y-2 px-5 pb-5">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : buildingsQ.error && !buildingsQ.data ? (
            <ErrorState error={buildingsQ.error} onRetry={buildingsQ.reload} compact />
          ) : (
            <ul className="space-y-1 px-3 pb-3" data-testid="buildings-list">
              <li>
                <button type="button" onClick={() => setSelected('')} className={cx('flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left', !selected ? 'bg-azea-purpleLight text-azea-purple' : 'text-gray-600 hover:bg-gray-50')}>
                  <Icon name="fa-solid fa-layer-group" className="w-5 text-center text-xs" />
                  <span className="flex-1 text-xs font-semibold">All buildings</span>
                  <span className="text-[11px] text-gray-400">{formatNumber(buildings.reduce((s, b) => s + (b.flatCount || 0), 0))}</span>
                </button>
              </li>
              {buildings.map((b) => (
                <li key={b._id} className="group relative">
                  <button type="button" onClick={() => setSelected(b._id)} className={cx('flex w-full items-center gap-3 rounded-lg px-3 py-2.5 pr-10 text-left', selected === b._id ? 'bg-azea-purpleLight text-azea-purple' : 'text-gray-600 hover:bg-gray-50')}>
                    <Icon name="fa-regular fa-building" className="w-5 text-center text-xs" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold">{b.name}</span>
                      <span className="block text-[11px] text-gray-400">
                        {b.floors ? `${b.floors} floors · ` : ''}
                        {formatNumber(b.flatCount)} flats{b.active === false ? ' · inactive' : ''}
                      </span>
                    </span>
                  </button>
                  {canManage && (
                    <button type="button" onClick={() => setModal({ type: 'building', item: b })} className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-gray-400 hover:bg-white hover:text-azea-purple" aria-label={`Edit ${b.name}`} title="Edit building">
                      <Icon name="fa-regular fa-pen-to-square" className="text-[11px]" />
                    </button>
                  )}
                </li>
              ))}
              {!buildings.length && <EmptyState compact icon="fa-regular fa-building" title="No buildings yet" message="Add your first building (tower, wing or block)." action={canManage && <Button size="xs" icon="fa-solid fa-plus" onClick={() => setModal({ type: 'building' })}>Add building</Button>} />}
            </ul>
          )}
        </section>

        <section className="card col-span-12 min-w-0 lg:col-span-8 xl:col-span-9">
          <Toolbar right={flats.data && <span className="text-[11px] text-azea-muted">{plural(flats.data.total, 'flat', 'flats')}</span>}>
            <h2 className="card-title mr-2">{current ? current.name : 'All flats'}</h2>
            <SearchInput value={search} onChange={setSearch} placeholder="Search flat number…" className="w-full sm:w-60" />
          </Toolbar>
          <DataTable
            testId="flats-table"
            columns={columns}
            rows={flats.data?.items}
            loading={flats.loading}
            error={flats.error}
            onRetry={flats.reload}
            dim={flats.reloading}
            onRowClick={(f) => setModal({ type: 'flat', item: f })}
            empty={<EmptyState icon="fa-solid fa-door-open" title={q ? 'No matching flats' : 'No flats yet'} message={q ? `No flat number contains “${q}”.` : 'Use the bulk generator to create every flat of a building at once.'} action={!q && canManage && buildings.length > 0 && <Button icon="fa-solid fa-wand-magic-sparkles" onClick={() => setModal({ type: 'bulk' })}>Bulk generate</Button>} compact />}
          />
          {flats.data && <Pagination page={flats.page} pages={flats.data.pages} total={flats.data.total} limit={flats.limit} onPage={flats.setPage} />}
        </section>
      </div>

      <BuildingModal open={modal?.type === 'building'} building={modal?.item} onClose={() => setModal(null)} onSaved={reloadAll} />
      <BulkModal open={modal?.type === 'bulk'} buildings={buildings} defaultBuildingId={selected} onClose={() => setModal(null)} onSaved={reloadAll} />
      <FlatModal open={modal?.type === 'flat'} flat={modal?.item} buildings={buildings} defaultBuildingId={selected} onClose={() => setModal(null)} onSaved={reloadAll} readOnly={!canManage} readOnlyReason="Only society admins can edit flats." />
    </div>
  );
}
