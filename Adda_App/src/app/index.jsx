import { Redirect } from 'expo-router';
import { useAuth } from '../context/auth';

/** Entry point: sends the user to the right place for their session and membership state. */
export default function Index() {
  const { status, isMember } = useAuth();
  if (status !== 'signedIn') return <Redirect href="/welcome" />;
  return <Redirect href={isMember ? '/home' : '/society'} />;
}
