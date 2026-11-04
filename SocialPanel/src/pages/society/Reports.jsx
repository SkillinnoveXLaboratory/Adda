import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useDebounced, useQuery } from '../../lib/hooks.js';
import { currentPeriodIST, formatDateTime, formatINR, formatNumber, todayIST } from '../../lib/format.js';
import { downloadReport } from '../../lib/files.js';
import { Alert, Button, Card, cx, EmptyState, ErrorState, Icon, PageHeader, PageSkeleton, Skeleton } from '../../components/ui.jsx';
import { Field, Input, PeriodSelect, Select } from '../../components/Form.jsx';
import { useToast } from '../../components/Toast.jsx';

const ICONS = {
  'collection-monthly': 'fa-regular fa-calendar',
  'collection-yearly': 'fa-solid fa-calendar-days',
  dues: 'fa-solid fa-hourglass-half',
  'resident-statement': 'fa-regular fa-user',
  'income-expense': 'fa-solid fa-scale-balanced',
  'vendor-expenditure': 'fa-solid fa-truck',
  ledger: 'fa-solid fa-book',
  'audit-summary': 'fa-solid fa-shield-halved',
};

const firstOfMonth = () => `${todayIST().slice(0, 7)}-01`;
const defaults = () => ({ period: currentPeriodIST(), year: String(new Date().getFullYear()), from: firstOfMonth(), to: todayIST(), flatId: '' });

function FlatPicker({ value, onChange, error }) {
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const flats = useQuery(() => api.get('/society/flats', { q, limit: 50 }), [q]);
  return (
    <div className="space-y-2">
      <Input aria-label="Search flats" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search flat number…" />
      <Select value={value} onChange={(e) => onChange(e.target.value)} invalid={Boolean(error)} aria-label="Flat">
        <option value="">{flats.loading ? 'Loading flats…' : 'Choose a flat'}</option>
        {(flats.data?.items || []).map((f) => (
          <option key={f._id} value={f._id}>
            {f.building?.name} · {f.number}
            {f.residents?.[0] ? ` — ${f.residents[0].name}` : ''}
          </option>
        ))}
      </Select>
    </div>
  );
}

function cell(col, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (col.type === 'money') return formatINR(v);
  if (typeof v === 'number') return formatNumber(v);
  return String(v);
}

export default function Reports() {
  const toast = useToast();
  const types = useQuery(() => api.get('/society/reports'), []);
  const [type, setType] = useState(null);
  const [params, setParams] = useState(defaults);
  const [errors, setErrors] = useState({});
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dl, setDl] = useState(null);

  useEffect(() => {
    if (types.data?.items?.length && !type) setType(types.data.items[0]);
  }, [types.data, type]);

  const query = () => Object.fromEntries((type?.params || []).map((p) => [p, params[p]]));
  const validate = () => {
    const errs = {};
    for (const p of type?.params || []) if (!params[p]) errs[p] = 'Required';
    if (params.from && params.to && params.from > params.to && type?.params.includes('from')) errs.to = 'Must be after the start date';
    setErrors(errs);
    return !Object.keys(errs).length;
  };
  const preview = async () => {
    if (!validate()) return;
    setLoading(true);
    setError(null);
    try {
      setReport(await api.get(`/society/reports/${type.type}`, { ...query(), format: 'json' }));
    } catch (err) {
      setError(err);
      setReport(null);
    } finally {
      setLoading(false);
    }
  };
  const download = async (format) => {
    if (!validate()) return;
    setDl(format);
    try {
      await downloadReport(type.type, query(), format);
      toast.success(`${format.toUpperCase()} downloaded`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDl(null);
    }
  };
  const set = (k) => (e) => (setParams({ ...params, [k]: e.target ? e.target.value : e }), setErrors((x) => ({ ...x, [k]: undefined })));

  if (types.loading && !types.data) return <PageSkeleton rows={8} />;
  if (types.error && !types.data)
    return (
      <div className="card">
        <ErrorState error={types.error} onRetry={types.reload} />
      </div>
    );

  return (
    <div>
      <PageHeader title="Reports" subtitle="Preview financial reports and download them as PDF or Excel" />
      <div className="grid grid-cols-12 gap-6">
        <section className="card col-span-12 self-start p-3 lg:col-span-4 xl:col-span-3">
          <p className="card-title px-2 pb-2 pt-2">Report type</p>
          <ul className="space-y-1" data-testid="report-types">
            {types.data.items.map((t) => (
              <li key={t.type}>
                <button type="button" onClick={() => (setType(t), setReport(null), setError(null), setErrors({}))} className={cx('flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left', type?.type === t.type ? 'bg-azea-purpleLight text-azea-purple' : 'text-gray-600 hover:bg-gray-50')}>
                  <Icon name={ICONS[t.type] || 'fa-regular fa-file-lines'} className="w-5 text-center text-xs" />
                  <span className="text-xs font-semibold">{t.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <div className="col-span-12 min-w-0 space-y-6 lg:col-span-8 xl:col-span-9">
          <Card title={type?.label || 'Report'}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
              <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
                {type?.params.includes('period') && (
                  <Field label="Month" error={errors.period}>
                    <PeriodSelect value={params.period} onChange={set('period')} invalid={Boolean(errors.period)} />
                  </Field>
                )}
                {type?.params.includes('year') && (
                  <Field label="Year" error={errors.year}>
                    <Select value={params.year} onChange={set('year')}>
                      {Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() - i)).map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                {type?.params.includes('from') && (
                  <Field label="From" error={errors.from}>
                    <Input type="date" value={params.from} max={params.to || undefined} onChange={set('from')} invalid={Boolean(errors.from)} />
                  </Field>
                )}
                {type?.params.includes('to') && (
                  <Field label="To" error={errors.to}>
                    <Input type="date" value={params.to} min={params.from || undefined} onChange={set('to')} invalid={Boolean(errors.to)} />
                  </Field>
                )}
                {type?.params.includes('flatId') && (
                  <Field label="Flat" error={errors.flatId} className="sm:col-span-2">
                    <FlatPicker value={params.flatId} onChange={set('flatId')} error={errors.flatId} />
                  </Field>
                )}
                {!type?.params.length && <p className="text-xs text-gray-500 sm:col-span-2">This report needs no parameters — it reflects the current state of your books.</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button icon="fa-regular fa-eye" onClick={preview} loading={loading} data-testid="report-preview">
                  Preview
                </Button>
                <Button variant="outline" icon="fa-regular fa-file-pdf" onClick={() => download('pdf')} loading={dl === 'pdf'} disabled={Boolean(dl)}>
                  PDF
                </Button>
                <Button variant="outline" icon="fa-regular fa-file-excel" onClick={() => download('xlsx')} loading={dl === 'xlsx'} disabled={Boolean(dl)}>
                  Excel
                </Button>
              </div>
            </div>
          </Card>

          {loading && !report && <Skeleton className="h-72 rounded-xl" />}
          {error && (
            <div className="card">
              <ErrorState error={error} onRetry={preview} compact />
            </div>
          )}
          {!loading && !report && !error && (
            <div className="card">
              <EmptyState icon="fa-regular fa-chart-bar" title="Choose parameters and preview" message="The preview shows exactly what the PDF and Excel files contain. All reports are system-generated, audit-supporting statements — not certified or statutory audits." />
            </div>
          )}
          {report && (
            <section className={cx('card', loading && 'opacity-60')} data-testid="report-result">
              <div className="border-b border-gray-100 px-5 py-4">
                <h2 className="text-sm font-bold text-gray-800">{report.title}</h2>
                {report.subtitle && <p className="mt-0.5 text-[11px] text-azea-muted">{report.subtitle}</p>}
                {report.generatedAt && <p className="mt-0.5 text-[10px] text-gray-400">Generated {formatDateTime(report.generatedAt)} IST</p>}
              </div>
              {report.summary?.length > 0 && (
                <div className="grid grid-cols-2 gap-3 border-b border-gray-100 p-5 md:grid-cols-4">
                  {report.summary.map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-azea-bg p-3">
                      <p className="truncate text-[10px] font-bold uppercase tracking-wider text-gray-400">{k}</p>
                      <p className="mt-0.5 truncate text-sm font-bold text-gray-800">{typeof v === 'number' ? formatNumber(v) : v}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="max-h-[60vh] overflow-auto">
                <table className="min-w-full border-separate border-spacing-0">
                  <thead>
                    <tr>
                      {report.columns.map((c) => (
                        <th key={c.key} className={cx('th', c.type === 'money' && 'text-right')}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50/60">
                        {report.columns.map((c) => (
                          <td key={c.key} className={cx('td', c.type === 'money' && 'text-right font-medium text-gray-700')}>
                            {cell(c, r[c.key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {report.totals && Object.keys(report.totals).length > 0 && (
                      <tr className="bg-gray-50">
                        {report.columns.map((c, i) => (
                          <td key={c.key} className={cx('td sticky bottom-0 bg-gray-50 font-bold text-gray-800', c.type === 'money' && 'text-right')}>
                            {report.totals[c.key] !== undefined ? cell(c, report.totals[c.key]) : i === 0 ? 'Total' : ''}
                          </td>
                        ))}
                      </tr>
                    )}
                  </tbody>
                </table>
                {!report.rows.length && <EmptyState compact icon="fa-regular fa-folder-open" title="No rows for these parameters" />}
              </div>
            </section>
          )}
          {report?.notes?.length > 0 && (
            <Alert tone="warning" title="Please note" icon="fa-solid fa-circle-info">
              <ul className="list-disc space-y-0.5 pl-4">
                {report.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}
