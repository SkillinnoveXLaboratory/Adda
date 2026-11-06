import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AuthProvider } from './lib/auth.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { ReasonPromptHost } from './components/ReasonPrompt.jsx';
import { PageSkeleton } from './components/ui.jsx';
import { NotFound, PlatformPortal, RequireAuth, SocietyWorkspace } from './layout/Portals.jsx';

const page = (loader) => lazy(loader);

const Login = page(() => import('./pages/public/Login.jsx'));

// Master (platform owner)
const PDashboard = page(() => import('./pages/platform/Dashboard.jsx'));
const PApplications = page(() => import('./pages/platform/Applications.jsx'));
const PSocieties = page(() => import('./pages/platform/Societies.jsx'));
const PSocietyDetail = page(() => import('./pages/platform/SocietyDetail.jsx'));
const PMembers = page(() => import('./pages/platform/Members.jsx'));
const PMemberProfile = page(() => import('./pages/platform/MemberProfile.jsx'));
const PUsers = page(() => import('./pages/platform/Users.jsx'));
const PListings = page(() => import('./pages/platform/Listings.jsx'));
const PVendors = page(() => import('./pages/platform/Vendors.jsx'));
const PVendorDetail = page(() => import('./pages/platform/VendorDetail.jsx'));
const PAds = page(() => import('./pages/platform/Ads.jsx'));
const PReports = page(() => import('./pages/platform/ContentReports.jsx'));
const PPayments = page(() => import('./pages/platform/Payments.jsx'));
const PCategories = page(() => import('./pages/platform/Categories.jsx'));
const PAnnouncements = page(() => import('./pages/platform/Announcements.jsx'));
const PSettings = page(() => import('./pages/platform/Settings.jsx'));
const PAudit = page(() => import('./pages/platform/Audit.jsx'));
const PSecurity = page(() => import('./pages/platform/Security.jsx'));

// Society workspace (the society-admin screens, acting on the chosen society)
const SDashboard = page(() => import('./pages/society/Dashboard.jsx'));
const SResidents = page(() => import('./pages/society/Residents.jsx'));
const SStructure = page(() => import('./pages/society/Structure.jsx'));
const SComplaints = page(() => import('./pages/society/Complaints.jsx'));
const SAnnouncements = page(() => import('./pages/society/Announcements.jsx'));
const SCommunity = page(() => import('./pages/society/Community.jsx'));
const SFacilities = page(() => import('./pages/society/Facilities.jsx'));
const SServices = page(() => import('./pages/society/Services.jsx'));
const SListings = page(() => import('./pages/society/Listings.jsx'));
const SBilling = page(() => import('./pages/society/Billing.jsx'));
const SPayments = page(() => import('./pages/society/Payments.jsx'));
const SExpenses = page(() => import('./pages/society/Expenses.jsx'));
const SLedger = page(() => import('./pages/society/Ledger.jsx'));
const SReports = page(() => import('./pages/society/Reports.jsx'));
const SStaff = page(() => import('./pages/society/Staff.jsx'));
const SProfile = page(() => import('./pages/society/Profile.jsx'));
const SCategories = page(() => import('./pages/society/Categories.jsx'));
const SAudit = page(() => import('./pages/society/Audit.jsx'));

function PublicFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-bg">
      <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-brand border-r-transparent" role="status" aria-label="Loading" />
    </div>
  );
}

const L = (El) => (
  <Suspense fallback={<PageSkeleton />}>
    <El />
  </Suspense>
);

const platformRoutes = [
  ['applications', PApplications],
  ['societies', PSocieties],
  ['societies/:id', PSocietyDetail],
  ['members', PMembers],
  ['members/:id', PMemberProfile],
  ['users', PUsers],
  ['vendors', PVendors],
  ['vendors/:id', PVendorDetail],
  ['listings', PListings],
  ['ads', PAds],
  ['reports', PReports],
  ['payments', PPayments],
  ['categories', PCategories],
  ['announcements', PAnnouncements],
  ['settings', PSettings],
  ['audit', PAudit],
  ['security', PSecurity],
];
const societyRoutes = [
  ['residents', SResidents],
  ['structure', SStructure],
  ['complaints', SComplaints],
  ['announcements', SAnnouncements],
  ['community', SCommunity],
  ['facilities', SFacilities],
  ['services', SServices],
  ['listings', SListings],
  ['billing', SBilling],
  ['payments', SPayments],
  ['expenses', SExpenses],
  ['ledger', SLedger],
  ['reports', SReports],
  ['staff', SStaff],
  ['profile', SProfile],
  ['categories', SCategories],
  ['audit', SAudit],
];

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <ReasonPromptHost />
          <Routes>
            <Route path="/" element={<Navigate to="/admin" replace />} />
            <Route
              path="/login"
              element={
                <Suspense fallback={<PublicFallback />}>
                  <Login />
                </Suspense>
              }
            />
            <Route
              path="/admin"
              element={
                <RequireAuth>
                  <PlatformPortal />
                </RequireAuth>
              }
            >
              <Route index element={L(PDashboard)} />
              {platformRoutes.map(([path, El]) => (
                <Route key={path} path={path} element={L(El)} />
              ))}
              <Route path="*" element={<NotFound />} />
            </Route>
            <Route
              path="/society"
              element={
                <RequireAuth>
                  <SocietyWorkspace />
                </RequireAuth>
              }
            >
              <Route index element={L(SDashboard)} />
              {societyRoutes.map(([path, El]) => (
                <Route key={path} path={path} element={L(El)} />
              ))}
              <Route path="*" element={<NotFound />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
