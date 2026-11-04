import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { AuthProvider, useAuth } from '../context/auth';
import { ToastProvider, useToast } from '../context/toast';
import { Button, EmptyState, ErrorState } from '../components/ui';
import { Logo } from '../components/Logo';
import { colors } from '../theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  return (
    <SafeAreaProvider>
      <ToastProvider>
        <SessionAwareAuth>
          <Gate fontsReady={fontsLoaded || !!fontError} />
        </SessionAwareAuth>
      </ToastProvider>
    </SafeAreaProvider>
  );
}

function SessionAwareAuth({ children }) {
  const toast = useToast();
  return <AuthProvider onSessionExpired={() => toast.info('Your session ended. Please sign in again.')}>{children}</AuthProvider>;
}

function Gate({ fontsReady }) {
  const { status, isMember, bootError, retryBoot, activeMembership } = useAuth();
  const toast = useToast();
  const ready = fontsReady && status !== 'booting';
  const wasMember = useRef(null);

  useEffect(() => {
    if (status !== 'signedIn') {
      wasMember.current = null;
      return;
    }
    if (wasMember.current === false && isMember) toast.success(`Welcome to ${activeMembership?.society?.name || 'your society'}!`);
    wasMember.current = isMember;
  }, [status, isMember, activeMembership, toast]);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.logoBg }} />;

  if (status === 'offline') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.white, justifyContent: 'center', padding: 24 }}>
        <Logo width={120} id="offline" />
        <ErrorState error={bootError} onRetry={retryBoot} />
      </View>
    );
  }

  const signedIn = status === 'signedIn';
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="index" options={{ animation: 'none' }} />
      <Stack.Protected guard={!signedIn} redirectTo="/">
        <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !isMember} redirectTo="/">
        <Stack.Screen name="(onboarding)" options={{ animation: 'fade' }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && isMember} redirectTo="/">
        <Stack.Screen name="(member)" options={{ animation: 'fade' }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn} redirectTo="/">
        <Stack.Screen name="(account)" />
      </Stack.Protected>
    </Stack>
  );
}

export function ErrorBoundary({ error, retry }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.white, justifyContent: 'center', padding: 24 }}>
      <EmptyState icon="warning-outline" title="Something went wrong" message={error?.message || 'An unexpected error occurred.'} />
      <Button title="Try again" onPress={retry} />
    </View>
  );
}
