import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadow } from '../theme';
import { NIcon } from './NivasaIcons';
import { T } from './Text';

export const ACCOUNT_TYPES = [
  { value: 'member', label: 'Member', icon: 'community', line: 'Resident or customer', detail: 'Join your society, pay bills, browse homes and book services' },
  { value: 'vendor', label: 'Vendor', icon: 'properties', line: 'Business or professional', detail: 'List properties and services, get bookings, boost your posts' },
];

/** Sign-up choice between a member and a vendor account (two cards), or a compact switch (`compact`) for sign-in. */
export function AccountTypePicker({ value, onChange, compact = false }) {
  if (compact) {
    return (
      <View style={styles.switch} accessibilityRole="radiogroup" accessibilityLabel="Sign in as">
        {ACCOUNT_TYPES.map((t) => {
          const on = t.value === value;
          return (
            <Pressable key={t.value} onPress={() => onChange(t.value)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`Sign in as ${t.label}`} style={[styles.switchItem, on && styles.switchOn]} testID={`login-as-${t.value}`}>
              <Ionicons name={t.value === 'vendor' ? 'briefcase' : 'people'} size={16} color={on ? colors.gold : '#64748b'} />
              <T weight="bold" size={13} color={on ? colors.white : '#475569'}>
                {t.label}
              </T>
            </Pressable>
          );
        })}
      </View>
    );
  }
  return (
    <View style={styles.cards} accessibilityRole="radiogroup" accessibilityLabel="Account type">
      {ACCOUNT_TYPES.map((t) => {
        const on = t.value === value;
        return (
          <Pressable key={t.value} onPress={() => onChange(t.value)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${t.label}: ${t.detail}`} style={[styles.card, on && styles.cardOn]} testID={`register-as-${t.value}`}>
            {on ? (
              <View style={styles.check}>
                <Ionicons name="checkmark" size={13} color={colors.navy} />
              </View>
            ) : null}
            <View style={[styles.iconBox, on && { backgroundColor: 'rgba(202,158,59,0.18)' }]}>
              <NIcon name={t.icon} size={34} />
            </View>
            <T weight="extrabold" size={14} color={colors.navy}>
              {t.label}
            </T>
            <T weight="bold" size={10.5} color={colors.goldText} style={{ textAlign: 'center' }}>
              {t.line}
            </T>
            <T size={10.5} color="#64748b" style={{ textAlign: 'center', lineHeight: 14 }}>
              {t.detail}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  cards: { flexDirection: 'row', gap: 10 },
  card: { flex: 1, alignItems: 'center', gap: 4, padding: 12, paddingTop: 14, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white, minHeight: 168, ...shadow.card },
  cardOn: { borderColor: colors.navy, backgroundColor: '#f4ecd8' },
  iconBox: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#f1f4f9', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  check: { position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  switch: { flexDirection: 'row', backgroundColor: '#eef2f7', borderRadius: 999, padding: 4, gap: 4 },
  switchItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40, borderRadius: 999 },
  switchOn: { backgroundColor: colors.navy, ...shadow.button },
});
