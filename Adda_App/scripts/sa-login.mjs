/**
 * Platform-owner sign-in for LOCAL test scripts (email + password). Never point this at production.
 * Returns `{ status, body }`; body holds the tokens when status is 200. `api` ends with /api/v1.
 */
export async function superAdminLogin(api, email, password) {
  const r = await fetch(`${api}/auth/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  return { status: r.status, body: await r.json().catch(() => null) };
}
