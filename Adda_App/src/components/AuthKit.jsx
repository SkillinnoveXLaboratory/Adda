import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, shadow } from '../theme';
import { Logo } from './Logo';
import { T } from './Text';

/** White sign-in / sign-up screen (prototype screen 2): logo on top, form in the middle, footer at the bottom. */
export function AuthShell({ children, footer, brand = true }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.white }}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 20, paddingBottom: insets.bottom + 16, paddingHorizontal: 24, justifyContent: 'space-between', gap: 20 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {brand ? (
            <View style={{ paddingTop: 8 }}>
              <Logo width={92} />
            </View>
          ) : null}
          <View style={{ width: '100%', maxWidth: 440, alignSelf: 'center' }}>{children}</View>
          {footer ? <View style={{ width: '100%', maxWidth: 440, alignSelf: 'center' }}>{footer}</View> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

export function AuthHeading({ lead, strong, sub }) {
  return (
    <View style={{ gap: 4 }}>
      <T weight="extrabold" size={20} color={colors.navy} accessibilityRole="header">
        {lead} {strong}
      </T>
      {sub ? (
        <T size={13} color={colors.muted}>
          {sub}
        </T>
      ) : null}
    </View>
  );
}

/** Boxed input with a leading icon (prototype: slate-50 field, rounded-xl, gold focus ring). */
export function LineField({ label, value, onChangeText, error, prefix, valid, secure, hint, icon, ...rest }) {
  const [hidden, setHidden] = useState(!!secure);
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <T weight="bold" size={12} color="#334155">
          {label}
        </T>
      ) : null}
      <View style={[styles.box, focused && styles.boxFocused, error && { borderColor: colors.danger }]}>
        <Ionicons name={icon || (secure ? 'lock-closed-outline' : prefix ? 'phone-portrait-outline' : 'person-outline')} size={18} color="#94a3b8" style={{ marginRight: 8 }} />
        {prefix ? (
          <View style={styles.prefix}>
            <T weight="bold" size={14} color="#475569">
              {prefix}
            </T>
          </View>
        ) : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={hidden}
          placeholderTextColor="#94a3b8"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          maxFontSizeMultiplier={1.3}
          accessibilityLabel={label}
          style={styles.input}
          {...rest}
        />
        {secure ? (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={12} accessibilityRole="button" accessibilityLabel={hidden ? 'Show password' : 'Hide password'} style={styles.eye}>
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={19} color="#94a3b8" />
          </Pressable>
        ) : valid ? (
          <View style={styles.check}>
            <Ionicons name="checkmark" size={12} color={colors.navy} />
          </View>
        ) : null}
      </View>
      {error ? (
        <T size={12} color={colors.danger}>
          {error}
        </T>
      ) : hint ? (
        <T size={11.5} color={colors.muted}>
          {hint}
        </T>
      ) : null}
    </View>
  );
}

export function StrengthMeter({ score }) {
  const labels = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];
  const tones = ['#e2e8f0', '#ef4444', '#f59e0b', '#22c55e', '#16a34a'];
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: score >= i ? tones[score] : '#e2e8f0' }} />
        ))}
      </View>
      <T size={12} color={colors.muted}>
        Password strength: <T weight="bold" size={12} color={tones[score] === '#e2e8f0' ? colors.muted : tones[score]}>{labels[score]}</T>
      </T>
    </View>
  );
}

export function Steps({ total, current }) {
  return (
    <View style={styles.steps}>
      <View style={styles.stepsLine} />
      {Array.from({ length: total }).map((_, i) => {
        const n = i + 1;
        const done = n < current;
        const on = n === current;
        return (
          <View key={n} style={[styles.step, done && styles.stepDone, on && styles.stepOn]}>
            {done ? <Ionicons name="checkmark" size={14} color={colors.navy} /> : <T weight="extrabold" size={12} color={on ? colors.gold : '#64748b'}>{n}</T>}
          </View>
        );
      })}
    </View>
  );
}

export function PrimaryAuthButton({ title, onPress, loading, disabled }) {
  const off = disabled || loading;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={({ pressed }) => [styles.primary, off && { opacity: 0.6 }, pressed && !off && { backgroundColor: colors.goldDark, transform: [{ scale: 0.98 }] }]}
    >
      <T weight="bold" size={14} color="#0f172a">
        {loading ? 'Please wait…' : title}
      </T>
    </Pressable>
  );
}

export function OutlineAuthButton({ title, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={({ pressed }) => [styles.outline, pressed && { backgroundColor: '#f8fafc' }]}>
      <T weight="bold" size={13} color="#334155">
        {title}
      </T>
    </Pressable>
  );
}

/** "──── or ────" separator (prototype login). */
export function OrDivider({ label = 'or' }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
      <T weight="medium" size={11} color="#94a3b8">
        {label}
      </T>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
    </View>
  );
}

export function FormError({ message }) {
  if (!message) return null;
  return (
    <View style={styles.formError} accessibilityRole="alert">
      <Ionicons name="alert-circle" size={18} color={colors.danger} />
      <T size={13} color={colors.danger} style={{ flex: 1 }}>
        {message}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 12, minHeight: 48 },
  boxFocused: { borderColor: colors.gold, backgroundColor: colors.white },
  prefix: { borderRightWidth: 1, borderRightColor: '#e2e8f0', paddingRight: 10, marginRight: 10 },
  input: { flex: 1, fontFamily: fonts.semibold, fontSize: 14, color: '#1e293b', paddingVertical: 10, outlineStyle: 'none' },
  eye: { paddingLeft: 8, minHeight: 44, justifyContent: 'center' },
  check: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: colors.gold, borderRadius: 12, minHeight: 50, alignItems: 'center', justifyContent: 'center', ...shadow.gold },
  outline: { backgroundColor: colors.white, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  formError: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colors.dangerBg, borderRadius: 12, padding: 12 },
  steps: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', position: 'relative' },
  stepsLine: { position: 'absolute', left: 14, right: 14, top: 14, height: 2, backgroundColor: '#e2e8f0' },
  step: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  stepDone: { backgroundColor: colors.gold },
  stepOn: { backgroundColor: colors.navy },
});
