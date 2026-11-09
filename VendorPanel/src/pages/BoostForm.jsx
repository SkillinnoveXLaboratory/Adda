import { useCallback, useId, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api, mediaHref } from '../lib/api.js';
import { dayOptionsOf, useConfig } from '../lib/config.js';
import { useAction, useQuery, useTitle } from '../lib/hooks.js';
import { money, offerPrice } from '../lib/format.js';
import { Alert, Button, Card, cx, EmptyState, ErrorState, Icon, PageHeader, PageSkeleton, Thumb } from '../components/ui.jsx';
import { Field, Input } from '../components/Form.jsx';
import { useToast } from '../components/Toast.jsx';

const live = (kind, l) => l.moderationStatus === 'approved' && (kind === 'property' ? l.availability === 'available' : l.status === 'active');

/** Boost a post: pick an approved, live listing, a city (+ area) and one of the admin-set durations; NIVASA reviews it. */
export default function BoostForm() {
  useTitle('Boost a post');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const listings = useQuery(() => Promise.all([api.get('/properties/mine', { limit: 50 }), api.get('/service-offers/mine', { limit: 50 })]));
  const config = useConfig({ fresh: true });
  const dayOptions = dayOptionsOf(config.data);
  const options = useMemo(() => {
    if (!listings.data) return [];
    const [props, offers] = listings.data;
    return [...offers.items.filter((l) => live('service', l)).map((item) => ({ kind: 'service', item })), ...props.items.filter((l) => live('property', l)).map((item) => ({ kind: 'property', item }))];
  }, [listings.data]);
  const preselected = options.find((o) => o.item._id === params.get('id')) || null;
  const [pickedId, setPickedId] = useState(null);
  const picked = options.find((o) => o.item._id === pickedId) || (pickedId ? null : preselected);
  const [cityEdit, setCity] = useState(null);
  const city = cityEdit ?? picked?.item.city ?? '';
  const [area, setArea] = useState('');
  const [pickedDays, setDays] = useState(null);
  const days = pickedDays && dayOptions.includes(pickedDays) ? pickedDays : dayOptions.includes(7) ? 7 : dayOptions[0];
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState(null);
  const cityId = useId();
  const areaId = useId();

  const [submit, busy] = useAction(
    useCallback(async () => {
      const e = {};
      if (!picked) e.post = 'Choose a post to boost';
      if (city.trim().length < 2) e.city = 'Enter the city where the boost should show';
      setErrors(e);
      if (Object.keys(e).length) throw new Error(e.post || e.city);
      setServerError(null);
      try {
        await api.post('/vendor/ads', { kind: picked.kind, listingId: picked.item._id, city: city.trim(), ...(area.trim() && { area: area.trim() }), days });
      } catch (err) {
        setServerError(err);
        throw err;
      }
    }, [picked, city, area, days]),
    { toast, success: 'Boost submitted for review', onDone: () => navigate('/boosts') },
  );

  const back = (
    <Link to="/boosts" className="mb-1 inline-flex min-h-[40px] items-center gap-1.5 text-xs font-semibold text-azea-purple hover:underline">
      <Icon name="fa-solid fa-arrow-left" className="text-[10px]" /> Boosts
    </Link>
  );
  if (listings.loading && !listings.data) return <PageSkeleton rows={4} />;
  if (listings.error && !listings.data)
    return (
      <div>
        <PageHeader title="Boost a post" back={back} />
        <div className="card">
          <ErrorState error={listings.error} onRetry={listings.reload} />
        </div>
      </div>
    );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      noValidate
      data-testid="boost-form"
    >
      <PageHeader title="Boost a post" subtitle="Your post shows first in its category for people in the city you choose, marked Sponsored." back={back} />
      {serverError && (
        <Alert tone="danger" title={serverError.code === 'AD_EXISTS' ? 'Already boosted' : serverError.code === 'LISTING_NOT_LIVE' ? 'Post not live' : 'Could not submit'} className="mb-5">
          {serverError.message}
        </Alert>
      )}
      {!options.length ? (
        <div className="card">
          <EmptyState
            icon="fa-solid fa-tags"
            title="Nothing to boost yet"
            message="Only approved, live posts can be boosted. Add a service or property and wait for NIVASA to approve it."
            action={
              <Link to="/services" className="inline-flex min-h-[40px] items-center rounded-lg bg-azea-purple px-4 text-xs font-semibold text-white hover:bg-azea-purpleDark">
                My services
              </Link>
            }
          />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card title="1. Choose a post">
              <div role="radiogroup" aria-label="Post to boost" className="grid gap-2">
                {options.map((o) => {
                  const on = picked?.item._id === o.item._id;
                  return (
                    <button
                      key={o.item._id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      data-testid="boost-option"
                      onClick={() => (setPickedId(o.item._id), setCity(null), setErrors((x) => ({ ...x, post: undefined })))}
                      className={cx('flex min-h-[64px] w-full items-center gap-3 rounded-xl border-2 bg-white p-2.5 text-left transition-colors', on ? 'border-azea-purple bg-azea-purpleLight/40' : 'border-gray-100 hover:border-violet-200')}
                    >
                      <Thumb src={o.item.photos?.[0] ? mediaHref(o.item.photos[0].url) : null} icon={o.kind === 'property' ? 'fa-solid fa-building' : 'fa-solid fa-screwdriver-wrench'} className="h-12 w-14" />
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-xs font-bold text-gray-800">{o.item.title}</span>
                        <span className="block text-[11px] text-azea-muted">
                          {o.kind === 'property' ? `Property · ${money(o.item.pricePaise)}` : `Service · ${offerPrice(o.item)}`} · {o.item.city}
                        </span>
                      </span>
                      <Icon name={on ? 'fa-solid fa-circle-dot' : 'fa-regular fa-circle'} className={on ? 'text-azea-purple' : 'text-gray-300'} />
                    </button>
                  );
                })}
              </div>
              {errors.post && (
                <p className="mt-2 text-[11px] font-medium text-rose-600" role="alert">
                  {errors.post}
                </p>
              )}
            </Card>
            <Card title="2. Where should it show?">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="City" error={errors.city} htmlFor={cityId} required>
                  <Input id={cityId} name="city" value={city} onChange={(e) => (setCity(e.target.value), setErrors((x) => ({ ...x, city: undefined })))} maxLength={80} invalid={Boolean(errors.city)} placeholder="e.g. Pune" />
                </Field>
                <Field label="Area (optional)" htmlFor={areaId}>
                  <Input id={areaId} name="area" value={area} onChange={(e) => setArea(e.target.value)} maxLength={120} placeholder="e.g. Baner" />
                </Field>
              </div>
            </Card>
            <Card title="3. For how many days?">
              <div role="radiogroup" aria-label="Days" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {dayOptions.map((d) => {
                  const on = d === days;
                  return (
                    <button key={d} type="button" role="radio" aria-checked={on} aria-label={`${d} days`} data-testid={`boost-days-${d}`} onClick={() => setDays(d)} className={cx('flex min-h-[64px] flex-col items-center justify-center rounded-xl border-2 transition-colors', on ? 'border-azea-purple bg-azea-purple text-white' : 'border-gray-100 bg-white text-gray-700 hover:border-violet-200')}>
                      <span className="text-lg font-bold">{d}</span>
                      <span className={cx('text-[11px] font-semibold', on ? 'text-violet-100' : 'text-azea-muted')}>day{d === 1 ? '' : 's'}</span>
                    </button>
                  );
                })}
              </div>
            </Card>
          </div>
          <div className="space-y-6">
            <Card title="Summary">
              {picked ? (
                <p className="text-xs leading-relaxed text-gray-700" data-testid="boost-summary">
                  “{picked.item.title}” will show first in {picked.kind === 'property' ? 'property' : 'service'} results for people in {city.trim() || 'your city'}
                  {area.trim() ? ` (${area.trim()})` : ''}, marked Sponsored, for {days} days from the day NIVASA approves it.
                </p>
              ) : (
                <p className="text-xs text-azea-muted">Choose a post first.</p>
              )}
              <p className="mt-3 text-[11px] leading-relaxed text-azea-muted">There is no charge for boosting right now. Each boost is reviewed by NIVASA before it goes live.</p>
            </Card>
            <Button type="submit" size="lg" className="w-full" icon="fa-solid fa-rocket" loading={busy} data-testid="boost-submit">
              Submit for review
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
