import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadow } from '../theme';
import { NIcon } from './NivasaIcons';
import { T } from './Text';

const COPY = {
  not_submitted: ['Complete your KYC to start listing', 'Add PAN, Aadhaar and bank details with photos. It takes about 3 minutes.', 'Start KYC', '#fde68a', '#fffbeb'],
  pending: ['KYC under review', 'NIVASA is checking your documents. You can list properties and services once it is approved.', 'View details', '#dbeafe', '#eff6ff'],
  rejected: ['KYC needs changes', null, 'Fix and resubmit', '#fecaca', '#fef2f2'],
};

/** Vendor KYC prompt; renders nothing once KYC is approved. */
export function KycStatusCard({ status, note }) {
  const c = COPY[status || 'not_submitted'];
  if (!c) return null;
  const [title, body, cta, border, bg] = c;
  return (
    <Pressable onPress={() => router.push('/kyc')} accessibilityRole="button" accessibilityLabel={`${title}. ${cta}`} style={({ pressed }) => [styles.card, { borderColor: border, backgroundColor: bg }, pressed && { opacity: 0.92 }]}>
      <View style={styles.icon}>
        <NIcon name="shield" size={30} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <T weight="extrabold" size={13.5} color={colors.navy}>
          {title}
        </T>
        <T size={11.5} color="#475569" style={{ lineHeight: 16 }}>
          {body || (note ? `Reason: ${note}` : 'Please check your details and documents and submit again.')}
        </T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
          <T weight="bold" size={12} color={colors.goldText}>
            {cta}
          </T>
          <Ionicons name="arrow-forward" size={13} color={colors.goldText} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: 12, borderWidth: 1, borderRadius: 16, padding: 14, ...shadow.card },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
});
