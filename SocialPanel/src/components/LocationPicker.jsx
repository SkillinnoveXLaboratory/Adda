import { useEffect, useId, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../lib/api.js';
import { useDebounced } from '../lib/hooks.js';
import { formatCoord, geocodeMessage, geolocationMessage, INDIA_CENTER, makeLocation } from '../lib/location.js';
import { Button, cx, Icon, Spinner } from './ui.jsx';

// A CSS pin (no image files: Leaflet's default marker images break under bundlers).
const PIN = L.divIcon({
  className: 'nivasa-pin',
  html: '<span class="nivasa-pin-dot"><i class="fa-solid fa-location-dot" aria-hidden="true"></i></span>',
  iconSize: [34, 42],
  iconAnchor: [17, 40],
});

/**
 * Map location picker (skills/location-maps): address search through the server proxy (/public/geocode, debounced
 * 400 ms), "Use my current location", OpenStreetMap tiles with a draggable pin (click the map to drop it), the pin's
 * address via reverse geocoding, read-only lat/lng (6 decimals) and Clear. Works without the internet: tiles may not
 * load, but GPS and the pin still set the location; a 503 from the search proxy shows an honest message.
 *
 * value: { lat, lng, label } | null — onChange(next | null)
 */
export function LocationPicker({ value, onChange, disabled = false, height = 280, testId = 'location-picker' }) {
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const reverseSeq = useRef(0);
  const disabledRef = useRef(disabled);
  valueRef.current = value;
  onChangeRef.current = onChange;
  disabledRef.current = disabled;

  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchMsg, setSearchMsg] = useState(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [locating, setLocating] = useState(false);
  const [geoMsg, setGeoMsg] = useState(null);
  const [labelBusy, setLabelBusy] = useState(false);
  const [labelMsg, setLabelMsg] = useState(null);
  const debounced = useDebounced(q, 400);
  const listId = useId();

  /** Set the pin; look up its address unless a label is already known. */
  const place = (lat, lng, label, { lookup = !label } = {}) => {
    const loc = makeLocation(lat, lng, label);
    if (!loc) return;
    onChangeRef.current?.(loc);
    setLabelMsg(null);
    if (!lookup) return;
    const seq = ++reverseSeq.current;
    setLabelBusy(true);
    api
      .get('/public/geocode/reverse', { lat: loc.lat, lng: loc.lng }, { auth: false })
      .then((r) => {
        const cur = valueRef.current;
        if (seq !== reverseSeq.current || !cur || cur.lat !== loc.lat || cur.lng !== loc.lng) return;
        if (r?.label) onChangeRef.current?.({ ...cur, label: String(r.label).slice(0, 200) });
        else setLabelMsg('No address found for this point. The coordinates are still saved.');
      })
      .catch((err) => {
        if (seq === reverseSeq.current) setLabelMsg(err?.status === 503 ? 'Address lookup is unavailable right now. The coordinates are still saved.' : 'Couldn’t look up the address. The coordinates are still saved.');
      })
      .finally(() => seq === reverseSeq.current && setLabelBusy(false));
  };
  const placeRef = useRef(place);
  placeRef.current = place;

  // Create the map once.
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return undefined;
    const v = valueRef.current;
    const map = L.map(mapEl.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView(v ? [v.lat, v.lng] : [INDIA_CENTER.lat, INDIA_CENTER.lng], v ? 16 : 4);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    }).addTo(map);
    map.attributionControl.setPrefix(false);
    map.on('click', (e) => {
      if (disabledRef.current) return;
      placeRef.current(e.latlng.lat, e.latlng.lng);
    });
    mapRef.current = map;
    // The container may have been laid out after creation (cards, modals) — fix tile sizing.
    const t = setTimeout(() => map.invalidateSize(), 150);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => map.invalidateSize()) : null;
    ro?.observe(mapEl.current);
    return () => {
      clearTimeout(t);
      ro?.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Keep the marker in sync with the value.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!value) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    const ll = [value.lat, value.lng];
    if (!markerRef.current) {
      const m = L.marker(ll, { icon: PIN, draggable: !disabled, keyboard: true, title: 'Society location (drag to adjust)', alt: 'Society location pin' }).addTo(map);
      m.on('dragend', () => {
        const p = m.getLatLng();
        placeRef.current(p.lat, p.lng);
      });
      markerRef.current = m;
      map.setView(ll, Math.max(map.getZoom(), 15));
    } else {
      const cur = markerRef.current.getLatLng();
      if (cur.lat !== value.lat || cur.lng !== value.lng) {
        markerRef.current.setLatLng(ll);
        if (!map.getBounds().pad(-0.1).contains(ll)) map.setView(ll, Math.max(map.getZoom(), 15));
      }
    }
  }, [value, disabled]);

  useEffect(() => {
    const m = markerRef.current;
    if (!m?.dragging) return;
    if (disabled) m.dragging.disable();
    else m.dragging.enable();
  }, [disabled, value]);

  // Debounced address suggestions.
  useEffect(() => {
    const term = debounced.trim();
    if (term.length < 3) {
      setResults([]);
      setSearchMsg(null);
      return undefined;
    }
    let live = true;
    setSearching(true);
    api
      .get('/public/geocode', { q: term }, { auth: false })
      .then((r) => {
        if (!live) return;
        setResults(r?.items || []);
        setSearchMsg(r?.items?.length ? null : 'No matching places. Try a nearby landmark or locality, or drag the pin.');
        setActive(0);
        setOpen(true);
      })
      .catch((err) => {
        if (!live) return;
        setResults([]);
        setSearchMsg(geocodeMessage(err));
        setOpen(true);
      })
      .finally(() => live && setSearching(false));
    return () => {
      live = false;
    };
  }, [debounced]);

  const choose = (item) => {
    setOpen(false);
    setQ('');
    setResults([]);
    reverseSeq.current += 1; // a pending reverse lookup must not overwrite the chosen label
    setLabelBusy(false);
    place(item.lat, item.lng, item.label, { lookup: false });
    const map = mapRef.current;
    if (map) map.setView([item.lat, item.lng], 16);
  };

  const useMyLocation = () => {
    setGeoMsg(null);
    if (!navigator.geolocation) return setGeoMsg(geolocationMessage({ code: 'UNSUPPORTED' }));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        place(pos.coords.latitude, pos.coords.longitude);
        mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 17);
      },
      (err) => {
        setLocating(false);
        setGeoMsg(geolocationMessage(err));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };

  const clear = () => {
    reverseSeq.current += 1;
    setLabelBusy(false);
    setLabelMsg(null);
    onChangeRef.current?.(null);
    mapRef.current?.setView([INDIA_CENTER.lat, INDIA_CENTER.lng], 4);
  };

  return (
    <div className="space-y-3" data-testid={testId}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">{searching ? <Spinner className="h-3 w-3" /> : <Icon name="fa-solid fa-magnifying-glass" className="text-xs" />}</span>
          <input
            type="search"
            value={q}
            disabled={disabled}
            onChange={(e) => (setQ(e.target.value), setOpen(true))}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a) => Math.min(a + 1, results.length - 1)));
              if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)));
              if (e.key === 'Enter') {
                e.preventDefault(); // never submit the surrounding form from the search box
                if (results[active]) choose(results[active]);
              }
              if (e.key === 'Escape') setOpen(false);
            }}
            maxLength={120}
            placeholder="Search an address, landmark or area (e.g. Baner Road, Pune)"
            aria-label="Search address"
            role="combobox"
            aria-expanded={open && results.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            className="form-input pl-8"
            data-testid="location-search"
          />
          {open && q.trim().length >= 3 && (results.length > 0 || searchMsg) && (
            <div id={listId} role="listbox" className="absolute left-0 right-0 top-full z-[1000] mt-1 max-h-64 overflow-auto rounded-xl border border-gray-100 bg-white py-1 shadow-lg">
              {results.map((r, i) => (
                <button
                  key={`${r.lat},${r.lng},${i}`}
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(r)}
                  className={cx('flex w-full items-start gap-2.5 px-3 py-2 text-left text-xs', i === active ? 'bg-azea-purpleLight text-azea-purple' : 'text-gray-600')}
                >
                  <Icon name="fa-solid fa-location-dot" className="mt-0.5 text-[11px]" />
                  <span className="min-w-0 flex-1 leading-snug">{r.label}</span>
                </button>
              ))}
              {!results.length && searchMsg && (
                <p className="px-3 py-2.5 text-[11px] leading-relaxed text-azea-muted" role="status" data-testid="location-search-message">
                  {searchMsg}
                </p>
              )}
            </div>
          )}
        </div>
        <Button variant="outline" size="md" icon="fa-solid fa-location-crosshairs" loading={locating} disabled={disabled} onClick={useMyLocation} data-testid="use-my-location">
          Use my current location
        </Button>
      </div>
      {geoMsg && (
        <p className="flex items-start gap-1.5 text-[11px] font-medium leading-relaxed text-amber-700" role="alert" data-testid="location-geo-message">
          <Icon name="fa-solid fa-triangle-exclamation" className="mt-0.5 text-[10px]" />
          {geoMsg}
        </p>
      )}
      {!open && searchMsg && !results.length && q.trim().length >= 3 && <p className="text-[11px] text-azea-muted">{searchMsg}</p>}

      <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-[#e8eef3]">
        <div ref={mapEl} style={{ height }} className="w-full" role="application" aria-label="Map: click to drop the pin, drag the pin to adjust" data-testid="location-map" />
        {!value && (
          <p className="pointer-events-none absolute left-1/2 top-3 z-[500] -translate-x-1/2 whitespace-nowrap rounded-full bg-white/95 px-3 py-1 text-[11px] font-medium text-gray-600 shadow">
            <Icon name="fa-regular fa-hand-pointer" className="mr-1" /> Click the map to drop a pin
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="block">
          <span className="form-label">Latitude</span>
          <input readOnly tabIndex={-1} value={formatCoord(value?.lat)} placeholder="—" className="form-input bg-gray-50 font-mono" aria-label="Latitude" data-testid="location-lat" />
        </label>
        <label className="block">
          <span className="form-label">Longitude</span>
          <input readOnly tabIndex={-1} value={formatCoord(value?.lng)} placeholder="—" className="form-input bg-gray-50 font-mono" aria-label="Longitude" data-testid="location-lng" />
        </label>
        <Button variant="secondary" size="md" icon="fa-solid fa-xmark" disabled={disabled || !value} onClick={clear} className="col-span-2 sm:col-span-1" data-testid="location-clear">
          Clear
        </Button>
      </div>
      {value && (
        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-gray-600" data-testid="location-label">
          <Icon name="fa-solid fa-location-dot" className="mt-0.5 text-[10px] text-azea-purple" />
          <span className="min-w-0 break-words">{labelBusy ? 'Looking up the address…' : value.label || labelMsg || 'Pinned location (no address label)'}</span>
        </p>
      )}
    </div>
  );
}
