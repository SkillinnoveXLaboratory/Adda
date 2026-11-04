import { Alert, Platform } from 'react-native';

/** Native confirmation dialog (window.confirm on the web preview). Resolves true when confirmed. */
export function confirm({ title, message, confirmText = 'OK', cancelText = 'Cancel', destructive = false }) {
  if (Platform.OS === 'web') return Promise.resolve(globalThis.confirm?.(`${title}\n\n${message || ''}`.trim()) ?? false);
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

export function notify(title, message) {
  if (Platform.OS === 'web') {
    globalThis.alert?.(`${title}\n\n${message || ''}`.trim());
    return;
  }
  Alert.alert(title, message, [{ text: 'OK' }]);
}
