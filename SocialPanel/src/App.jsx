import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AuthProvider, homePathFor, useAuth } from './lib/auth.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { PageSkeleton } from './components/ui.jsx';
import { NotFound, RequireAuth, RequirePerm, SocietyPortal } from './layout/Portals.jsx';

const page = (loader) => lazy(loader);

// Public
const Login = page(() => import('./pages/public/Login.jsx'));
const ForgotPassword = page(() => import('./pages/public/ForgotPassword.jsx'));
const Register = page(() => import('./pages/public/Register.jsx'));
const Status = page(() => import('./pages/public/Status.jsx'));
const SetPassword = page(() => import('./pages/public/SetPassword.jsx'));

// Society admin
const SDashboard = page(() => import('./pages/society/Dashboard.jsx'));
const SResidents = page(() => import('./pages/society/Residents.jsx'));
const SStructure = page(() => import('./pages/society/Structure.jsx'));
const SComplaints = page(() => import('./pages/society/Complaints.jsx'));
const SAnnouncements = page(() => import('./pages/society/Announcements.jsx'));
const SCommunity = page(() => import('./pages/society/Community.jsx'));
const SVoting = page(() => import('./pages/society/Voting.jsx'));
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

function Home() {
  const { isAuthenticated, user, staffRoles } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Navigate to={homePathFor(user, staffRoles)} replace />;
}

const gate = (perm, El) => (
  <RequirePerm perm={perm}>
    <El />
  </RequirePerm>
);

function PublicFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-azea-bg">
      <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-azea-purple border-r-transparent" role="status" aria-label="Loading" />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Suspense fallback={<PublicFallback />}><Login /></Suspense>} />
            <Route path="/forgot-password" element={<Suspense fallback={<PublicFallback />}><ForgotPassword /></Suspense>} />
            <Route path="/register" element={<Suspense fallback={<PublicFallback />}><Register /></Suspense>} />
            <Route path="/status" element={<Suspense fallback={<PublicFallback />}><Status /></Suspense>} />
            <Route path="/set-password" element={<Suspense fallback={<PublicFallback />}><SetPassword /></Suspense>} />

            <Route
              path="/society"
              element={
                <RequireAuth>
                  <SocietyPortal />
                </RequireAuth>
              }
            >
              <Route index element={<Lazy el={SDashboard} />} />
              <Route path="residents" element={<Lazy el={SResidents} perm="members.read" />} />
              <Route path="structure" element={<Lazy el={SStructure} perm="members.read" />} />
              <Route path="complaints" element={<Lazy el={SComplaints} perm="complaints" />} />
              <Route path="announcements" element={<Lazy el={SAnnouncements} />} />
              <Route path="community" element={<Lazy el={SCommunity} perm="community" />} />
              <Route path="voting" element={<Lazy el={SVoting} perm="community" />} />
              <Route path="facilities" element={<Lazy el={SFacilities} perm="facilities" />} />
              <Route path="services" element={<Lazy el={SServices} perm="services" />} />
              <Route path="listings" element={<Lazy el={SListings} perm="listings" />} />
              <Route path="billing" element={<Lazy el={SBilling} perm="finance.read" />} />
              <Route path="payments" element={<Lazy el={SPayments} perm="finance.read" />} />
              <Route path="expenses" element={<Lazy el={SExpenses} perm="finance.read" />} />
              <Route path="ledger" element={<Lazy el={SLedger} perm="finance.read" />} />
              <Route path="reports" element={<Lazy el={SReports} perm="reports" />} />
              <Route path="staff" element={<Lazy el={SStaff} />} />
              <Route path="profile" element={<Lazy el={SProfile} />} />
              <Route path="categories" element={<Lazy el={SCategories} />} />
              <Route path="audit" element={<Lazy el={SAudit} perm="audit" />} />
              <Route path="*" element={<NotFound />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

function Lazy({ el: El, perm }) {
  const content = <Suspense fallback={<PageSkeleton />}>{perm ? gate(perm, El) : <El />}</Suspense>;
  return content;
}
