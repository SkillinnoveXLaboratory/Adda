import { useEffect, useId, useState } from 'react';
import { api } from '../lib/api.js';
import { useDebounced } from '../lib/hooks.js';
import { osmUrl, validLocation } from '../lib/location.js';
import { Button, Icon } from './ui.jsx';
import { Field, Input } from './Form.jsx';

/**
 * Shop location without a map library (skills/location-maps): address search through the server proxy
 * (GET /public/geocode — never OpenStreetMap directly), "Use my current location", and lat / lng / place inputs.
 * value = { lat, lng, label } as strings; onChange(patch).
 */
export function LocationFields({ value, onChange, errors = {} }) {
  const ids = { q: useId(), lat: useId(), lng: useId(), label: useId() };
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim(), 450);
  const [search, setSearch] = useState({ items: [], loading: false, error: null, for: '' });
  const [gps, setGps] = useState({ busy: false, error: null });

  useEffect(() => {
    if (q.length < 3) return undefined;
    let live = true;
    setSearch((s) => ({ ...s, loading: true, error: null }));
    api
      .get('/public/geocode', { q }, { auth: false })
      .then((r) => live && setSearch({ items: r?.items || [], loading: false, error: null, for: q }))
      .catch((err) => live && setSearch({ items: [], loading: false, error: err?.status === 503 ? 'Address search is unavailable right now — use your location or type the coordinates.' : err?.message || 'Search failed', for: q }));
    return () => {
      live = false;
    };
  }, [q]);

  const pick = (it) => {
    onChange({ lat: String(Number(it.lat).toFixed(6)), lng: String(Number(it.lng).toFixed(6)), label: String(it.label || '').slice(0, 200) });
    setQuery('');
    setSearch({ items: [], loading: false, error: null, for: '' });
  };
  const useMine = () => {
    if (!navigator.geolocation) return setGps({ busy: false, error: 'This browser can’t share its location. Search or type the coordinates.' });
    setGps({ busy: true, error: null });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ busy: false, error: null });
        onChange({ lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) });
      },
      (err) => setGps({ busy: false, error: err.code === 1 ? 'Location permission was denied. Allow it in the browser, or search / type the coordinates.' : 'Couldn’t get your location. Search or type the coordinates.' }),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };
  const loc = validLocation({ lat: value.lat === '' ? null : value.lat, lng: value.lng === '' ? null : value.lng });
  const showResults = q.length >= 3 && query.trim().length >= 3;

  return (
    <div className="space-y-4" data-testid="location-fields">
      <Field label="Search address" htmlFor={ids.q} hint="Type at least 3 characters, then pick a result. Only use your location if you are at the shop.">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Input id={ids.q} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Salt Lake Sector V, Kolkata" maxLength={120} autoComplete="off" data-testid="location-search" />
            {showResults && (
              <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-gray-100 bg-white shadow-lg" role="listbox" aria-label="Address results">
                {search.loading ? (
                  <p className="px-3 py-2 text-[11px] text-gray-400">Searching…</p>
                ) : search.error ? (
                  <p className="px-3 py-2 text-[11px] text-rose-500">{search.error}</p>
                ) : search.for === q && !search.items.length ? (
                  <p className="px-3 py-2 text-[11px] text-gray-400">No places found. Try a different spelling, or type the coordinates.</p>
                ) : (
                  search.items.map((it) => (
                    <button key={`${it.lat},${it.lng},${it.label}`} type="button" role="option" aria-selected="false" onClick={() => pick(it)} className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs text-gray-700 hover:bg-brand-light">
                      <Icon name="fa-solid fa-location-dot" className="mt-0.5 text-[11px] text-brand" />
                      <span className="min-w-0 flex-1">{it.label}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <Button variant="secondary" icon="fa-solid fa-location-crosshairs" loading={gps.busy} onClick={useMine} data-testid="location-gps">
            Use my current location
          </Button>
        </div>
        {gps.error && <p className="mt-1 text-[11px] font-medium text-amber-600">{gps.error}</p>}
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Latitude" htmlFor={ids.lat} error={errors.lat}>
          <Input id={ids.lat} name="lat" value={value.lat} onChange={(e) => onChange({ lat: e.target.value.replace(/[^\d.-]/g, '') })} inputMode="decimal" maxLength={12} placeholder="22.572600" invalid={Boolean(errors.lat)} data-testid="location-lat" />
        </Field>
        <Field label="Longitude" htmlFor={ids.lng} error={errors.lng}>
          <Input id={ids.lng} name="lng" value={value.lng} onChange={(e) => onChange({ lng: e.target.value.replace(/[^\d.-]/g, '') })} inputMode="decimal" maxLength={12} placeholder="88.363900" invalid={Boolean(errors.lng)} data-testid="location-lng" />
        </Field>
        <Field label="Place name" htmlFor={ids.label} error={errors.label} hint="Optional">
          <Input id={ids.label} name="label" value={value.label} onChange={(e) => onChange({ label: e.target.value })} maxLength={200} placeholder="e.g. Sector V, Salt Lake" invalid={Boolean(errors.label)} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
        {loc ? (
          <a href={osmUrl(loc)} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1">
            <Icon name="fa-solid fa-map-location-dot" /> Check this point on OpenStreetMap
          </a>
        ) : (
          <span className="text-brand-muted">Optional. With a location, this vendor’s services show up in members’ “near me” search.</span>
        )}
        {(value.lat || value.lng || value.label) && (
          <button type="button" className="text-gray-400 hover:text-rose-500" onClick={() => onChange({ lat: '', lng: '', label: '' })}>
            Clear location
          </button>
        )}
        <span className="text-gray-300">Address search © OpenStreetMap contributors</span>
      </div>
    </div>
  );
}
