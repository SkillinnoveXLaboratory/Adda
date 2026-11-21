---
name: location-maps
description: Use for anything with latitude/longitude — society registration location, society profile location, vendor shop location, members' "near me" service search, the address search (geocoding) proxy and the map pickers in SocialPanel (Leaflet) and the app (WebView + Leaflet, expo-location GPS). Rules, API, UI and checks.
---

# Location & maps

## Data
- A location is `{ lat, lng, label? }` in APIs. Stored as GeoJSON `{ type: 'Point', coordinates: [lng, lat] }` plus
  `locationLabel`. Valid: lat −90…90, lng −180…180, both numbers; `null` clears it. India is not enforced.
- Where: `SocietyRegistration.location` (public registration form) → copied to `Society.location` on approval;
  `Society.location` editable in Society settings (`PATCH /society/profile { location }`); `VendorProfile.location`
  (`PUT /vendor/shop`, also accepted at vendor sign-up) → copied to all the vendor's `ServiceOffer.location`.
- `ServiceOffer.location` has a `2dsphere` index (created by `npm run db:init`).

## Address search (server proxy — clients never call OpenStreetMap directly)
- `GET /public/geocode?q=<3–120 chars>` → `{ items:[{ label, lat, lng }] }` (≤5, India first: `countrycodes=in`).
- `GET /public/geocode/reverse?lat=&lng=` → `{ label }`.
- Uses OpenStreetMap **Nominatim** with a proper `User-Agent` (`NIVASA/1.0 (+https://adda.skillinnovex.in)`), 6 s
  timeout, 10-minute in-memory cache, rate-limited per IP (public form limiter). When the service can't be reached →
  503 `GEOCODER_UNAVAILABLE` with an honest message; the UI then still allows GPS or dragging the pin.
- Attribution "© OpenStreetMap contributors" must be visible on every map.

## UI
- **SocialPanel** (registration form + Society settings): `LocationPicker` — search box with suggestions (debounced
  400 ms), "Use my current location" (browser geolocation, explains when denied), Leaflet map (OSM tiles) with a
  draggable pin, lat/lng shown read-only with 6 decimals, Clear. Optional field; the form says why it helps.
- **App** (vendor sign-up, Shop settings, members' near-me): "Use my location" (`expo-location`, foreground permission
  with a clear reason; denied → explain + search instead), search field with results list (server proxy), and a map
  preview/picker in a `react-native-webview` page running Leaflet (pin drag posts the new lat/lng back). Radius picker
  for near-me: chips 2 / 5 / 10 / 25 / 50 km + custom 1–100.
- Distances: haversine on the server, `distanceKm` with one decimal; show "1.2 km away".

## Checks
- vendor-check: shop location saved → service gets it; near-me returns only services inside the radius, nearest first,
  correct `distanceKm` (two known points ≈ known distance ± 0.2 km), invalid lat/lng → 400, radius > 100 → 400.
- society: registration with location → approved society has it; profile update; clear with `null`.
- geocode endpoints: 400 on short query; 200 or 503 (never 500) — tests must not depend on the internet.
