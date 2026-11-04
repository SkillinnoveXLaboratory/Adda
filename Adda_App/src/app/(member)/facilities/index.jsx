import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AsyncView, Button, DetailHeader, Hint, Screen, T } from '../../../components/ui';
import { useApi } from '../../../hooks/useApi';
import { money, time12 } from '../../../lib/format';
import { colors } from '../../../theme';
import { facilityIcon } from '../../../lib/icons';

export default function Facilities() {
  const list = useApi('/resident/facilities');
  return (
    <Screen header={<DetailHeader title="Book a facility" fallback="/home" />} refreshing={list.refreshing} onRefresh={list.refresh} footer={<Button title="My bookings" variant="alt" icon="calendar-outline" onPress={() => router.push('/bookings')} />}>
      <Hint>Reserve shared amenities. Some facilities need approval from the society office before your booking is confirmed.</Hint>
      <AsyncView state={list} empty={{ when: (d) => !d.items.length, icon: 'calendar-outline', title: 'No facilities yet', message: 'Your society has not listed any bookable facilities.' }}>
        {(d) => (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {d.items.map((f) => (
              <Pressable
                key={f._id}
                onPress={() => router.push(`/facilities/${f._id}`)}
                accessibilityRole="button"
                accessibilityLabel={`${f.name}, ${f.feePaise ? money(f.feePaise) : 'free'}`}
                style={({ pressed }) => [{ width: '47.5%', flexGrow: 1, backgroundColor: colors.white, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 16, padding: 16, alignItems: 'center', gap: 6 }, pressed && { opacity: 0.85 }]}
              >
                <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={facilityIcon(f)} size={26} color="#0b1a30" />
                </View>
                <T weight="bold" size={14} style={{ textAlign: 'center' }} numberOfLines={2}>
                  {f.name}
                </T>
                <T size={12} color="#94a3b8" style={{ textAlign: 'center' }}>
                  {time12(f.openTime)} – {time12(f.closeTime)}
                </T>
                <T weight="bold" size={12.5} color="#0b1a30">
                  {f.feePaise ? `${money(f.feePaise)} / slot` : 'Free'}
                </T>
                {f.requiresApproval ? (
                  <T size={11} color={colors.amber}>
                    Needs approval
                  </T>
                ) : null}
              </Pressable>
            ))}
          </View>
        )}
      </AsyncView>
    </Screen>
  );
}
