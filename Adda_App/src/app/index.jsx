import { Redirect } from 'expo-router';
import { useAuth } from '../context/auth';

/** Entry point: sends the user to the right place for their session, account type and membership state. */
export default function Index() {
  const { status, isMember, isVendor, vendor } = useAuth();
  if (status !== 'signedIn') return <Redirect href="/welcome" />;
  if (isVendor) return <Redirect href={vendor?.kycStatus === 'not_submitted' ? '/kyc' : '/dashboard'} />;
  return <Redirect href={isMember ? '/home' : '/society'} />;
}
