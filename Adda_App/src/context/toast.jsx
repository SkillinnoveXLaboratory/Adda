import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { T } from '../components/Text';

const ToastContext = createContext(null);
const ICONS = { success: ['checkmark-circle', '#10b981'], error: ['alert-circle', '#ef4444'], info: ['information-circle', '#cbd5e1'] };

/** Prototype .toast: dark pill near the bottom. */
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const timer = useRef(null);
  const insets = useSafeAreaInsets();

  const show = useCallback(
    (message, type = 'success') => {
      if (!message) return;
      clearTimeout(timer.current);
      setToast({ message, type, key: Date.now() });
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: Platform.OS !== 'web' }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: Platform.OS !== 'web' }).start(() => setToast(null));
      }, type === 'error' ? 4200 : 2800);
    },
    [opacity],
  );
  useEffect(() => () => clearTimeout(timer.current), []);

  const value = useMemo(() => ({ show, success: (m) => show(m, 'success'), error: (m) => show(m, 'error'), info: (m) => show(m, 'info') }), [show]);
  const icon = ICONS[toast?.type] || ICONS.info;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + 92 }]}>
          <Animated.View style={[styles.toast, { opacity }]} accessibilityLiveRegion="polite" accessibilityRole="alert">
            <Ionicons name={icon[0]} size={18} color={icon[1]} />
            <T weight="semibold" size={13} color="#fff" style={{ flexShrink: 1 }}>
              {toast.message}
            </T>
          </Animated.View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 100 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#0b1a30', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 22, maxWidth: '100%' },
});
