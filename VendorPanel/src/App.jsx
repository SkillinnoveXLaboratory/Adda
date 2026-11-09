import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { AuthProvider, useAuth } from './lib/auth.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { PageSkeleton } from './components/ui.jsx';
import { NotFound, RequireAuth, VendorPortal } from './layout/Portals.jsx';

const Login = lazy(() => import('./pages/public/Login.jsx'));
const Register = lazy(() => import('./pages/public/Register.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Kyc = lazy(() => import('./pages/Kyc.jsx'));
const Properties = lazy(() => import('./pages/Properties.jsx'));
const PropertyForm = lazy(() => import('./pages/PropertyForm.jsx'));
const Services = lazy(() => import('./pages/Services.jsx'));
const ServiceForm = lazy(() => import('./pages/ServiceForm.jsx'));
const Bookings = lazy(() => import('./pages/Bookings.jsx'));
const Earnings = lazy(() => import('./pages/Earnings.jsx'));
const Boosts = lazy(() => import('./pages/Boosts.jsx'));
const BoostForm = lazy(() => import('./pages/BoostForm.jsx'));
const Notifications = lazy(() => import('./pages/Notifications.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));

function Home() {
  const { isAuthenticated } = useAuth();
  return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />;
}

/**
 * Listing and boost actions need approved KYC (the server enforces it too). Until then they land on the KYC page
 * with the reason, instead of failing with an error.
 */
function RequireKyc({ reason, children }) {
  const { verified } = useAuth();
  const location = useLocation();
  if (!verified) return <Navigate to="/kyc" replace state={{ reason, from: location.pathname }} />;
  return children;
}

function PublicFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-azea-bg">
      <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-azea-purple border-r-transparent" role="status" aria-label="Loading" />
    </div>
  );
}

const page = (El) => (
  <Suspense fallback={<PageSkeleton />}>
    <El />
  </Suspense>
);

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Suspense fallback={<PublicFallback />}><Login /></Suspense>} />
            <Route path="/register" element={<Suspense fallback={<PublicFallback />}><Register /></Suspense>} />
            <Route
              element={
                <RequireAuth>
                  <VendorPortal />
                </RequireAuth>
              }
            >
              <Route path="/dashboard" element={page(Dashboard)} />
              <Route path="/kyc" element={page(Kyc)} />
              <Route path="/properties" element={page(Properties)} />
              <Route path="/properties/new" element={<RequireKyc reason="property">{page(PropertyForm)}</RequireKyc>} />
              <Route path="/properties/:id/edit" element={page(PropertyForm)} />
              <Route path="/services" element={page(Services)} />
              <Route path="/services/new" element={<RequireKyc reason="service">{page(ServiceForm)}</RequireKyc>} />
              <Route path="/services/:id/edit" element={page(ServiceForm)} />
              <Route path="/bookings" element={page(Bookings)} />
              <Route path="/earnings" element={page(Earnings)} />
              <Route path="/boosts" element={page(Boosts)} />
              <Route path="/boosts/new" element={<RequireKyc reason="boost">{page(BoostForm)}</RequireKyc>} />
              <Route path="/notifications" element={page(Notifications)} />
              <Route path="/profile" element={page(Profile)} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
