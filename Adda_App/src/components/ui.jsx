import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Animated, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useNavigation } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { badgeTone, colors, fonts, radius, shadow, toneFor } from '../theme';
import { T } from './Text';
import { initials, titleCase } from '../lib/format';

export { T };

// ------------------------------------------------------------------ layout
/**
 * Screen container: safe areas, keyboard avoidance, pull-to-refresh.
 * `header` renders above the scroll area (fixed); `tabs` reserves space for the bottom tab bar.
 */
export function Screen({ children, header, refreshing, onRefresh, scroll = true, padded = true, footer, statusBar = 'dark', contentStyle, keyboardOffset = 0 }) {
  const insets = useSafeAreaInsets();
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[padded && styles.content, { paddingBottom: (footer ? 16 : 28) + (footer ? 0 : insets.bottom) }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} colors={[colors.gold]} tintColor={colors.navy} /> : undefined}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, padded && styles.content, contentStyle]}>{children}</View>
  );
  return (
    <View style={styles.screen}>
      <StatusBar style={statusBar} />
      {header}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={keyboardOffset}>
        {body}
        {footer ? <View style={[styles.footer, { paddingBottom: 12 + insets.bottom }]}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </View>
  );
}

/**
 * Back navigation that also works when a screen was opened directly (deep link, notification, browser URL):
 * asks the screen's own navigator (which checks parents too) and otherwise replaces with a sensible fallback.
 */
export function useGoBack(fallback = '/') {
  const navigation = useNavigation();
  return useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else router.replace(fallback);
  }, [navigation, fallback]);
}

/**
 * After finishing an action (publish, delete, save): go back to `href` if it is in the history,
 * otherwise (screen opened directly from a link/notification) replace the current screen with it.
 */
export function returnTo(href) {
  if (router.canDismiss()) router.dismissTo(href);
  else router.replace(href);
}

/** Navy sub-screen header (prototype: back arrow + left-aligned white title). */
export function DetailHeader({ title, right, onBack, fallback }) {
  const insets = useSafeAreaInsets();
  const back = useGoBack(fallback);
  return (
    <View style={[styles.detailHead, { paddingTop: insets.top }]}>
      <StatusBar style="light" />
      <View style={styles.detailHeadRow}>
        <IconButton icon="arrow-back" label="Go back" color={colors.white} onPress={onBack || back} />
        <T weight="bold" size={16} color={colors.white} numberOfLines={1} style={{ flex: 1, marginLeft: 2, marginRight: 6 }} accessibilityRole="header">
          {title}
        </T>
        <View style={{ minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' }}>{right || null}</View>
      </View>
    </View>
  );
}

/** Notification bell with unread dot (prototype top bar). */
export function BellButton({ unread = 0, onPress, color = colors.white }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Notifications${unread ? `, ${unread} unread` : ''}`} style={styles.bell} hitSlop={6}>
      <Ionicons name="notifications-outline" size={22} color={color} />
      {unread > 0 ? (
        <View style={styles.bellBadge}>
          <T weight="bold" size={9} color={colors.white} style={{ lineHeight: 12 }}>
            {unread > 99 ? '99+' : unread}
          </T>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Navy tab-screen header (prototype: title bar; optional subtitle line, bell and extra content below). */
export function Hero({ title, subtitle, unread = 0, onBell, right, children }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.hero, { paddingTop: insets.top }]}>
      <StatusBar style="light" />
      <View style={styles.heroTop}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <T weight="bold" size={16} color={colors.white} numberOfLines={1} accessibilityRole="header">
            {title}
          </T>
          {subtitle ? (
            <T size={11.5} color="#cbd5e1" numberOfLines={1} style={{ marginTop: 1 }}>
              {subtitle}
            </T>
          ) : null}
        </View>
        {right}
        {onBell ? <BellButton unread={unread} onPress={onBell} /> : null}
      </View>
      {children ? <View style={{ paddingBottom: 14 }}>{children}</View> : null}
    </View>
  );
}

// ------------------------------------------------------------------ primitives
export function Card({ children, style, onPress, accessibilityLabel }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, style, small, accessibilityLabel }) {
  const v = BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.primary;
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      style={({ pressed }) => [styles.button, small && styles.buttonSmall, v.box, isDisabled && styles.disabled, pressed && !isDisabled && { transform: [{ scale: 0.98 }] }, style]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} size="small" />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={small ? 16 : 18} color={v.fg} /> : null}
          <T weight="bold" size={small ? 12.5 : 14} color={v.fg} numberOfLines={1}>
            {title}
          </T>
        </>
      )}
    </Pressable>
  );
}
const BUTTON_VARIANTS = {
  primary: { box: { backgroundColor: colors.gold, ...shadow.gold }, fg: '#0f172a' },
  brand: { box: { backgroundColor: colors.navy, ...shadow.button }, fg: colors.white },
  alt: { box: { backgroundColor: colors.white, borderWidth: 1, borderColor: '#cbd5e1' }, fg: '#334155' },
  outline: { box: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.navy }, fg: colors.navy },
  light: { box: { backgroundColor: colors.gold }, fg: '#0f172a' },
  danger: { box: { backgroundColor: colors.dangerBg }, fg: colors.danger },
  ghost: { box: { backgroundColor: 'transparent' }, fg: colors.link },
  onDark: { box: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: 'rgba(212,175,55,0.7)' }, fg: colors.gold },
};

export function IconButton({ icon, onPress, label, color = colors.navy, size = 22, style }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8} style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.6 }, style]}>
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
}

export function TextLink({ title, onPress, color = colors.link, size = 13, style }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" hitSlop={{ left: 8, right: 8 }} style={[{ minHeight: 44, justifyContent: 'center' }, style]}>
      <T weight="bold" size={size} color={color}>
        {title}
      </T>
    </Pressable>
  );
}

/** Labelled input with inline error (prototype .form label/input). */
export function Field({ label, error, hint, value, onChangeText, multiline, prefix, icon, secure, right, style, inputStyle, ...rest }) {
  const [hidden, setHidden] = useState(!!secure);
  const [focused, setFocused] = useState(false);
  return (
    <View style={[{ gap: 7, minWidth: 0 }, style]}>
      {label ? (
        <T weight="bold" size={12.5} color="#1e293b">
          {label}
        </T>
      ) : null}
      <View style={[styles.input, multiline && styles.inputMulti, focused && styles.inputFocused, error && styles.inputError]}>
        {icon ? <Ionicons name={icon} size={18} color="#94a3b8" style={{ marginRight: 8 }} /> : null}
        {prefix ? (
          <View style={styles.prefix}>
            <T weight="bold" size={14} color={colors.navy}>
              {prefix}
            </T>
          </View>
        ) : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          multiline={multiline}
          secureTextEntry={hidden}
          placeholderTextColor="#94a3b8"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          textAlignVertical={multiline ? 'top' : 'center'}
          maxFontSizeMultiplier={1.3}
          accessibilityLabel={label}
          style={[styles.inputText, multiline && { minHeight: 110, paddingTop: 12 }, inputStyle]}
          {...rest}
        />
        {secure ? (
          <IconButton icon={hidden ? 'eye-outline' : 'eye-off-outline'} label={hidden ? 'Show password' : 'Hide password'} color="#94a3b8" size={20} onPress={() => setHidden((h) => !h)} />
        ) : null}
        {right}
      </View>
      {error ? (
        <T size={12} color={colors.danger} accessibilityLiveRegion="polite">
          {error}
        </T>
      ) : hint ? (
        <T size={12} color={colors.muted}>
          {hint}
        </T>
      ) : null}
    </View>
  );
}

export function Badge({ status, label, tone, style }) {
  const t = badgeTone[tone || toneFor(status)];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }, style]}>
      <T weight="extrabold" size={10.5} color={t.fg} style={{ lineHeight: 15 }} numberOfLines={1}>
        {label || titleCase(status || '')}
      </T>
    </View>
  );
}

export function IconCircle({ icon, tone = 'blue', size = 40 }) {
  const t = { blue: colors.tileBlue, coral: colors.tileRose, green: colors.tileGreen, amber: colors.tileAmber, purple: colors.tilePurple, gold: [colors.goldLight, colors.goldDark], navy: colors.tileSlate }[tone] || colors.tileBlue;
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: t[0], alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={size * 0.5} color={t[1]} />
    </View>
  );
}

export function Avatar({ name, size = 40 }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.navy, borderWidth: size >= 56 ? 2 : 1.5, borderColor: colors.gold, alignItems: 'center', justifyContent: 'center' }}>
      <T weight="extrabold" size={size * 0.34} color={colors.gold} style={{ lineHeight: size * 0.45 }}>
        {initials(name)}
      </T>
    </View>
  );
}

export function SectionTitle({ title, action, onAction, style }) {
  return (
    <View style={[styles.sectionTitle, style]}>
      <T weight="bold" size={14} color={colors.text}>
        {title}
      </T>
      {action ? <TextLink title={action} onPress={onAction} size={12} /> : null}
    </View>
  );
}

/** Generic tappable list row (prototype .list-card / .notice-mini). */
export function ListRow({ icon, tone, title, subtitle, meta, right, onPress, chevron = true, children }) {
  const content = (
    <>
      {icon ? <IconCircle icon={icon} tone={tone} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <T weight="bold" size={14} numberOfLines={2}>
          {title}
        </T>
        {subtitle ? (
          <T size={12} color={colors.muted} numberOfLines={2} style={{ marginTop: 3 }}>
            {subtitle}
          </T>
        ) : null}
        {meta ? (
          <T size={11.5} color={colors.subtle} numberOfLines={1} style={{ marginTop: 3 }}>
            {meta}
          </T>
        ) : null}
        {children}
      </View>
      {right}
      {onPress && chevron ? <Ionicons name="chevron-forward" size={18} color="#94a3b8" /> : null}
    </>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.listRow, pressed && styles.pressed]}>
      {content}
    </Pressable>
  ) : (
    <View style={styles.listRow}>{content}</View>
  );
}

export function KeyValue({ label, value, strong, valueColor }) {
  return (
    <View style={styles.kv}>
      <T size={13} color={colors.muted} style={{ flexShrink: 0 }}>
        {label}
      </T>
      <T weight={strong ? 'extrabold' : 'bold'} size={strong ? 16 : 13} color={valueColor || colors.text} style={{ flex: 1, textAlign: 'right' }} selectable>
        {value}
      </T>
    </View>
  );
}

export function Divider({ dashed }) {
  return <View style={{ borderTopWidth: 1, borderStyle: dashed ? 'dashed' : 'solid', borderColor: dashed ? '#cbd5e1' : colors.border, marginVertical: 12 }} />;
}

export function Hint({ children, icon = 'information-circle-outline', tone = 'blue' }) {
  const t = tone === 'amber' ? [colors.amberBg, colors.amber] : tone === 'green' ? [colors.greenBg, colors.green] : tone === 'coral' ? [colors.dangerBg, colors.danger] : [colors.hint, colors.hintText];
  return (
    <View style={[styles.hint, { backgroundColor: t[0] }]}>
      <Ionicons name={icon} size={18} color={t[1]} style={{ marginTop: 1 }} />
      <T size={13} color={t[1]} style={{ flex: 1, lineHeight: 19 }}>
        {children}
      </T>
    </View>
  );
}

/** Horizontal filter chips (prototype .filters). */
export function Chips({ options, value, onChange, style }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[{ gap: 8, paddingVertical: 2 }, style]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={String(o.value)} onPress={() => onChange(o.value)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.chip, on && styles.chipOn]}>
            <T weight={on ? 'bold' : 'semibold'} size={12.5} color={on ? colors.white : colors.chipText}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function SearchBar({ value, onChangeText, placeholder, onSubmit }) {
  return (
    <View style={styles.search}>
      <Ionicons name="search" size={17} color="#94a3b8" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        maxFontSizeMultiplier={1.3}
        accessibilityLabel={placeholder}
        style={[styles.inputText, { paddingVertical: 11 }]}
      />
      {value ? <IconButton icon="close-circle" label="Clear search" size={18} color="#94a3b8" onPress={() => onChangeText('')} /> : null}
    </View>
  );
}

// ------------------------------------------------------------------ states
export function Skeleton({ height = 16, width = '100%', radius: r = 10, style }) {
  const [opacity] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[{ height, width, borderRadius: r, backgroundColor: '#e2e8f0', opacity }, style]} />;
}

export function LoadingList({ rows = 4, card = 74 }) {
  return (
    <View style={{ gap: 12 }} accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={card} radius={14} />
      ))}
    </View>
  );
}

export function EmptyState({ icon = 'file-tray-outline', title, message, action, onAction }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={32} color={colors.goldDark} />
      </View>
      <T weight="extrabold" size={16} style={{ textAlign: 'center' }}>
        {title}
      </T>
      {message ? (
        <T size={13} color={colors.muted} style={{ textAlign: 'center', maxWidth: 300 }}>
          {message}
        </T>
      ) : null}
      {action ? <Button title={action} onPress={onAction} style={{ alignSelf: 'stretch', marginTop: 6 }} /> : null}
    </View>
  );
}

const ERROR_COPY = {
  NETWORK: { icon: 'cloud-offline-outline', title: "You're offline" },
  TIMEOUT: { icon: 'time-outline', title: 'Server is slow to respond' },
  MEMBERSHIP_PENDING: { icon: 'hourglass-outline', title: 'Awaiting approval' },
  MEMBERSHIP_REQUIRED: { icon: 'people-outline', title: 'Join your society first' },
  SOCIETY_SUSPENDED: { icon: 'pause-circle-outline', title: 'Society suspended' },
  FORBIDDEN: { icon: 'lock-closed-outline', title: 'No access' },
  NOT_FOUND: { icon: 'search-outline', title: 'Not found' },
};

export function ErrorState({ error, onRetry }) {
  const c = ERROR_COPY[error?.code] || { icon: 'alert-circle-outline', title: "Couldn't load this" };
  return (
    <View style={styles.empty} accessibilityRole="alert">
      <View style={[styles.emptyIcon, { backgroundColor: colors.dangerBg }]}>
        <Ionicons name={c.icon} size={32} color={colors.danger} />
      </View>
      <T weight="extrabold" size={16} style={{ textAlign: 'center' }}>
        {c.title}
      </T>
      <T size={13} color={colors.muted} style={{ textAlign: 'center', maxWidth: 300 }}>
        {error?.message || 'Something went wrong.'}
      </T>
      {onRetry ? <Button title="Try again" icon="refresh" variant="alt" onPress={onRetry} style={{ alignSelf: 'stretch', marginTop: 6 }} /> : null}
    </View>
  );
}

/** Renders loading / error / empty / content for a useApi result. */
export function AsyncView({ state, empty, skeleton, children }) {
  if (state.loading && !state.data) return skeleton || <LoadingList />;
  if (state.error && !state.data) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (empty && state.data && empty.when(state.data)) return <EmptyState {...empty} />;
  return children(state.data);
}

export function PillToggle({ options, value, onChange }) {
  return (
    <View style={styles.segment}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.segmentItem, on && styles.segmentOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
            <T weight="bold" size={12.5} color={on ? colors.white : '#475569'}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Labelled on/off switch row. */
export function ToggleRow({ label, value, onChange }) {
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, minHeight: 52 }}>
      <T weight="semibold" size={14} style={{ flex: 1 }}>
        {label}
      </T>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: '#e7cf7d', false: '#cbd5e1' }} thumbColor={value ? colors.navy : '#f8fafc'} />
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 14 },
  footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border },
  detailHead: { backgroundColor: colors.navy, zIndex: 2 },
  detailHeadRow: { height: 54, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 },
  hero: { backgroundColor: colors.navy, paddingHorizontal: 16 },
  heroTop: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  bell: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  bellBadge: { position: 'absolute', top: 6, right: 4, minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: 9, backgroundColor: '#ef4444', borderWidth: 1.5, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: colors.card, borderRadius: radius.xl, borderWidth: 1, borderColor: '#f1f5f9', padding: 16, ...shadow.card },
  pressed: { opacity: 0.85, transform: [{ scale: 0.995 }] },
  button: { minHeight: 50, borderRadius: radius.md, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonSmall: { minHeight: 40, paddingHorizontal: 14, borderRadius: 11 },
  disabled: { opacity: 0.55 },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  input: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: radius.md, paddingHorizontal: 12, minHeight: 48 },
  inputMulti: { alignItems: 'flex-start' },
  inputFocused: { borderColor: colors.gold, backgroundColor: colors.white },
  inputError: { borderColor: colors.danger },
  inputText: { flex: 1, minWidth: 0, fontFamily: fonts.semibold, fontSize: 14, color: '#1e293b', paddingVertical: Platform.OS === 'web' ? 12 : 10, outlineStyle: 'none' },
  prefix: { borderRightWidth: 1, borderRightColor: colors.inputBorder, paddingRight: 10, marginRight: 10 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' },
  sectionTitle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: '#f1f5f9', borderRadius: radius.xl, padding: 12, ...shadow.card },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, paddingVertical: 6 },
  hint: { flexDirection: 'row', gap: 8, borderRadius: 12, padding: 12 },
  chip: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 7, minHeight: 34, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, borderRadius: radius.md, paddingLeft: 12, minHeight: 44 },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 20, gap: 10 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.goldLight, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  segment: { flexDirection: 'row', backgroundColor: '#e2e8f0', borderRadius: 12, padding: 4 },
  segmentItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 36, borderRadius: 9 },
  segmentOn: { backgroundColor: colors.navy, ...shadow.card },
});
