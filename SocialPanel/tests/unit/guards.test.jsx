import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AuthProvider } from '../../src/lib/auth.jsx';
import { session } from '../../src/lib/session.js';
import { ToastProvider } from '../../src/components/Toast.jsx';
import { RequireAuth, RequirePerm, SocietyPortal } from '../../src/layout/Portals.jsx';

const ok = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const society = { _id: 's1', name: 'Green Meadows', code: 'SOC1', city: 'Pune', status: 'active' };

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<p>LOGIN PAGE</p>} />
            <Route
              path="/society"
              element={
                <RequireAuth>
                  <SocietyPortal />
                </RequireAuth>
              }
            >
              <Route index element={<p>SOCIETY HOME</p>} />
              <Route
                path="structure-edit"
                element={
                  <RequirePerm perm="society.manage">
                    <p>MANAGE STRUCTURE</p>
                  </RequirePerm>
                }
              />
            </Route>
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

const staff = (role) => ({ accessToken: 't', refreshToken: 'r'.repeat(30), user: { _id: 'u', name: 'Staff', platformRole: 'user' }, staffRoles: [{ _id: 'st', role, society }] });

describe('route guards', () => {
  beforeEach(() => {
    session.clear();
    globalThis.fetch = vi.fn(async (url) =>
      String(url).endsWith('/me') ? ok({ user: session.get()?.user, staffRoles: session.get()?.staffRoles || [], memberships: [] }) : ok({ counts: {}, complaints: {}, society, items: [], unread: 0 }),
    );
  });

  it('sends unauthenticated users to /login', () => {
    renderAt('/society');
    expect(screen.getByText('LOGIN PAGE')).toBeInTheDocument();
  });

  it('lets society staff into the society portal', async () => {
    session.set(staff('admin'));
    renderAt('/society');
    expect(await screen.findByText('SOCIETY HOME')).toBeInTheDocument();
  });

  it('keeps a platform-owner session out (owner uses the Master Admin panel)', async () => {
    session.set({ accessToken: 't', refreshToken: 'r'.repeat(30), user: { _id: 'sa', name: 'Dev', platformRole: 'super_admin' }, staffRoles: [] });
    renderAt('/society');
    expect(await screen.findByText('LOGIN PAGE')).toBeInTheDocument();
    expect(screen.queryByText('SOCIETY HOME')).not.toBeInTheDocument();
  });

  it('shows a lock on pages the role cannot use', async () => {
    session.set(staff('treasurer'));
    renderAt('/society/structure-edit');
    expect(await screen.findByText('Not available for your role')).toBeInTheDocument();
    expect(screen.queryByText('MANAGE STRUCTURE')).not.toBeInTheDocument();
  });

  it('hides navigation the treasurer cannot use', async () => {
    session.set(staff('treasurer'));
    renderAt('/society');
    await screen.findByText('SOCIETY HOME');
    expect(screen.getAllByText('Billing & invoices').length).toBeGreaterThan(0);
    expect(screen.queryByText('Complaints')).not.toBeInTheDocument();
    expect(screen.queryByText('Community')).not.toBeInTheDocument();
  });
});
