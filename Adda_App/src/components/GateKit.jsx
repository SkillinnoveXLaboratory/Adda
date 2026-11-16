import { createContext, useContext, useEffect, useState } from 'react';
import { Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Button, IconButton, T } from './ui';
import { absoluteUrl } from '../lib/api';
import { dayLabel, istDay, time12 } from '../lib/format';
import { normalizePhone } from '../lib/validation';
import { colors, fonts, shadow } from '../theme';

/**
 * Shared pieces of the gate-security feature (skills/gate-security): the gateman's area and the member Guests screen.
 * Phone numbers are shown as +91 and dial with tel:, times are India time.
 */

// ------------------------------------------------------------------ gate session context
const GateContext = createContext({ me: null, society: null, reload: () => {} });
export const GateProvider = GateContext.Provider;
/** `{ me (GET /gate/me), society, reload }` inside the gate area. */
export const useGate = () => useContext(GateContext);

/** Value that settles `ms` after the last change (search boxes). */
export function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// ------------------------------------------------------------------ phone
/** "9876543210" → "+91 98765 43210". */
export function formatPhone(p) {
  const d = normalizePhone(p);
  return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : p || '';
}
export function callPhone(p) {
  const d = normalizePhone(p);
  if (d) Linking.openURL(`tel:+91${d}`).catch(() => {});
}

/** Round call button (44 px). Renders nothing without a number. */
export function GateCallButton({ phone, name, style }) {
  if (!phone) return null;
  return (
    <Pressable
      onPress={() => callPhone(phone)}
      accessibilityRole="button"
      accessibilityLabel={`Call ${name || ''} ${formatPhone(phone)}`.replace(/\s+/g, ' ')}
      hitSlop={4}
      style={({ pressed }) => [styles.call, pressed && { opacity: 0.7 }, style]}
    >
      <Ionicons name="call" size={18} color={colors.green} />
    </Pressable>
  );
}

// ------------------------------------------------------------------ visitor status + times
export const VISITOR_STATUS = {
  expected: { label: 'Expected', tone: 'warning' },
  approved: { label: 'Approved', tone: 'info' },
  inside: { label: 'Inside', tone: 'success' },
  exited: { label: 'Left', tone: 'neutral' },
  rejected: { label: 'Not allowed', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};
export function VisitorStatusBadge({ status }) {
  const s = VISITOR_STATUS[status] || { label: status, tone: 'neutral' };
  return <Badge label={s.label} tone={s.tone} style={{ flexShrink: 0 }} />;
}

/** "Today", "Tomorrow", "Yesterday" or "Sat, 14 Nov" for a YYYY-MM-DD India day. */
export function dayName(ymd) {
  if (!ymd) return '';
  if (ymd === istDay(0)) return 'Today';
  if (ymd === istDay(1)) return 'Tomorrow';
  if (ymd === istDay(-1)) return 'Yesterday';
  const l = dayLabel(ymd);
  return `${l.weekday}, ${l.day} ${l.month}`;
}
/** "6:00 PM – 8:00 PM" / "from 6:00 PM" / "" from the HH:MM expected times. */
export function expectedWindow(v) {
  if (v.expectedIn && v.expectedOut) return `${time12(v.expectedIn)} – ${time12(v.expectedOut)}`;
  if (v.expectedIn) return `from ${time12(v.expectedIn)}`;
  if (v.expectedOut) return `until ${time12(v.expectedOut)}`;
  return '';
}

// ------------------------------------------------------------------ header
/** Navy gate header: society logo (or a shield) + society name, a subtitle line and an optional right action. */
export function GateHeader({ title, subtitle, society, onBack, right }) {
  const insets = useSafeAreaInsets();
  const logo = absoluteUrl(society?.logoUrl);
  return (
    <View style={[styles.head, { paddingTop: insets.top }]}>
      <StatusBar style="light" />
      <View style={styles.headRow}>
        {onBack ? <IconButton icon="arrow-back" label="Go back" color={colors.white} onPress={onBack} style={{ marginLeft: -10 }} /> : <GateSocietyLogo uri={logo} size={38} />}
        <View style={{ flex: 1, minWidth: 0 }}>
          <T weight="bold" size={16} color={colors.white} numberOfLines={1} accessibilityRole="header">
            {title || society?.name || 'Gate security'}
          </T>
          {subtitle ? (
            <T size={11.5} color="#cbd5e1" numberOfLines={1}>
              {subtitle}
            </T>
          ) : null}
        </View>
        {right}
      </View>
    </View>
  );
}

export function GateSocietyLogo({ uri, size = 38 }) {
  const [brokenUri, setBrokenUri] = useState(null);
  if (uri && brokenUri !== uri) {
    return (
      <Image
        source={{ uri }}
        onError={() => setBrokenUri(uri)}
        style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: colors.white }}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
    );
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: colors.navySoft, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="shield-checkmark" size={size * 0.52} color={colors.gold} />
    </View>
  );
}

// ------------------------------------------------------------------ bottom sheet with a text box
/**
 * Small modal sheet used for "Send note" (3–500 chars) and the optional reject reason.
 * `onSubmit(text)` returns a promise; the sheet stays open (and shows the error) if it throws.
 */
export function NoteSheet({ visible, onClose, ...rest }) {
  // The body mounts each time the sheet opens, so the text box always starts empty.
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {visible ? <NoteSheetBody onClose={onClose} {...rest} /> : null}
    </Modal>
  );
}

function NoteSheetBody({ title, subtitle, label, placeholder, min = 0, max = 500, submitLabel = 'Send', destructive, onSubmit, onClose }) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const len = text.trim().length;
  const submit = async () => {
    if (busy) return;
    if (min && len < min) return setError(`Write at least ${min} characters`);
    setBusy(true);
    try {
      await onSubmit(text.trim());
    } catch (err) {
      setError(err?.message || 'Could not send. Please try again.');
      setBusy(false);
    }
  };
  return (
    <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Tapping outside the sheet closes it; screen readers use the Close button instead. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={busy ? undefined : onClose} accessibilityRole="none" accessible={false} importantForAccessibility="no" />
      <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]} accessibilityViewIsModal>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T weight="extrabold" size={16} color={colors.navy} numberOfLines={2}>
              {title}
            </T>
            {subtitle ? (
              <T size={12.5} color={colors.muted} numberOfLines={2} style={{ marginTop: 2 }}>
                {subtitle}
              </T>
            ) : null}
          </View>
          <IconButton icon="close" label="Close" color={colors.muted} onPress={busy ? undefined : onClose} />
        </View>
        <T weight="bold" size={12.5} color={colors.text} style={{ marginTop: 6 }}>
          {label}
        </T>
        <TextInput
          value={text}
          onChangeText={(t) => {
            setText(t);
            if (error) setError(null);
          }}
          placeholder={placeholder}
          placeholderTextColor="#94a3b8"
          multiline
          maxLength={max}
          textAlignVertical="top"
          maxFontSizeMultiplier={1.3}
          accessibilityLabel={label}
          style={[styles.textArea, error && { borderColor: colors.danger }]}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <T size={12} color={error ? colors.danger : colors.muted} style={{ flex: 1 }} accessibilityLiveRegion="polite">
            {error || (min ? `At least ${min} characters` : 'Optional')}
          </T>
          <T size={12} color={colors.muted}>
            {len}/{max}
          </T>
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
          <Button title="Cancel" variant="alt" onPress={onClose} disabled={busy} style={{ flex: 1 }} />
          <Button title={submitLabel} variant={destructive ? 'danger' : 'primary'} icon={destructive ? 'close-circle' : 'send'} onPress={submit} loading={busy} style={{ flex: 1 }} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  call: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.greenBg, alignItems: 'center', justifyContent: 'center' },
  head: { backgroundColor: colors.navy, paddingHorizontal: 16, zIndex: 2, ...shadow.button },
  headRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10 },
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, gap: 8, width: '100%', maxWidth: 560, alignSelf: 'center' },
  textArea: {
    minHeight: 110,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    padding: 12,
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.text,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
});
