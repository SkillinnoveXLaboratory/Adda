import { api } from './api.js';
import { useQuery } from './hooks.js';

// Fallback only; the platform owner sets the choices in Master Admin → Settings (served in /public/config).
export const DEFAULT_DAY_OPTIONS = [3, 7, 15, 30];

let cached = null;
let inflight = null;

/** GET /public/config, cached for the tab (boost durations, commission %, upload limits). */
export function loadConfig({ fresh = false } = {}) {
  if (cached && !fresh) return Promise.resolve(cached);
  if (!inflight) {
    inflight = api
      .get('/public/config', undefined, { auth: false })
      .then((c) => (cached = c))
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Public config for a page; `fresh` re-reads the commission rate (it can change at any time). */
export function useConfig({ fresh = false } = {}) {
  return useQuery(() => loadConfig({ fresh }), []);
}

export const dayOptionsOf = (config) => (config?.ads?.dayOptions?.length ? config.ads.dayOptions : DEFAULT_DAY_OPTIONS);
export const commissionPercentOf = (config) => Number(config?.services?.commissionPercent ?? 0);
