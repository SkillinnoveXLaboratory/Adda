import { useEffect, useRef, useState } from 'react';
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
import { CustomSplash } from '../components/CustomSplash';
import { SKY } from '../components/SplashScene';
import { colors } from '../theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

/** The branded splash stays at least this long so it never just flickers. */
const SPLASH_MIN_MS = 1800;

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
  const { status, isMember, isVendor, bootError, retryBoot, activeMembership } = useAuth();
  const toast = useToast();
  const ready = fontsReady && status !== 'booting';
  const wasMember = useRef(null);
  const [minElapsed, setMinElapsed] = useState(false);
  const [splashGone, setSplashGone] = useState(false);

  useEffect(() => {
    if (status !== 'signedIn') {
      wasMember.current = null;
      return;
    }
    if (wasMember.current === false && isMember) toast.success(`Welcome to ${activeMembership?.society?.name || 'your society'}!`);
    wasMember.current = isMember;
  }, [status, isMember, activeMembership, toast]);

  // The native splash is plain white; once fonts are in, hand over to the branded splash for SPLASH_MIN_MS.
  useEffect(() => {
    if (!fontsReady) return undefined;
    SplashScreen.hideAsync().catch(() => {});
    const t = setTimeout(() => setMinElapsed(true), SPLASH_MIN_MS);
    return () => clearTimeout(t);
  }, [fontsReady]);

  if (!fontsReady) return <View style={{ flex: 1, backgroundColor: colors.white }} />;

  const signedIn = status === 'signedIn';
  let app = null;
  if (ready && status === 'offline') {
    app = (
      <View style={{ flex: 1, backgroundColor: colors.white, justifyContent: 'center', padding: 24 }}>
        <Logo width={120} id="offline" />
        <ErrorState error={bootError} onRetry={retryBoot} />
      </View>
    );
  } else if (ready) {
    app = (
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="index" options={{ animation: 'none' }} />
        <Stack.Protected guard={!signedIn} redirectTo="/">
          <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !isMember && !isVendor} redirectTo="/">
          <Stack.Screen name="(onboarding)" options={{ animation: 'fade' }} />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && isMember && !isVendor} redirectTo="/">
          <Stack.Screen name="(member)" options={{ animation: 'fade' }} />
        </Stack.Protected>
        {/* Vendors: their own area only — never society onboarding or member screens. */}
        <Stack.Protected guard={signedIn && isVendor} redirectTo="/">
          <Stack.Screen name="(vendor)" options={{ animation: 'fade' }} />
        </Stack.Protected>
        <Stack.Protected guard={signedIn} redirectTo="/">
          <Stack.Screen name="(account)" />
        </Stack.Protected>
      </Stack>
    );
  }

  // The branded splash sits on top and fades out over the first screen (Get Started draws the same backdrop).
  return (
    <View style={{ flex: 1, backgroundColor: SKY }}>
      {app}
      {splashGone ? null : <CustomSplash visible={!(ready && minElapsed)} onHidden={() => setSplashGone(true)} />}
    </View>
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
