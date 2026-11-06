import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Button, DetailHeader, ErrorState, Field, Hint, LoadingList, Screen, SectionTitle, Skeleton, T } from '../../../components/ui';
import { useToast } from '../../../context/toast';
import { useAction, useApi } from '../../../hooks/useApi';
import { api } from '../../../lib/api';
import { dayLabel, istDay, money, time12 } from '../../../lib/format';
import { colors } from '../../../theme';
import { facilityIcon } from '../../../lib/icons';

/** Date strip → slot grid → contiguous multi-slot selection → booking request. */
export default function FacilityBooking() {
  const { id } = useLocalSearchParams();
  const toast = useToast();
  const [date, setDate] = useState(istDay(0));
  const [sel, setSel] = useState([]); // indexes of selected contiguous slots
  const [purpose, setPurpose] = useState('');
  const av = useApi(`/resident/facilities/${id}/availability`, { query: { date } });
  const facility = av.data?.facility;
  const slots = av.data?.date === date ? av.data.slots : null;


  const days = useMemo(() => Array.from({ length: Math.min(facility?.maxAdvanceDays || 14, 30) + 1 }, (_, i) => istDay(i)), [facility?.maxAdvanceDays]);

  const toggle = (i) => {
    if (!slots?.[i]?.available) return;
    if (!sel.length) return setSel([i]);
    const min = Math.min(...sel);
    const max = Math.max(...sel);
    if (sel.includes(i)) {
      // Only allow removing from the ends so the range stays contiguous.
      if (i === min) return setSel(sel.filter((x) => x !== i));
      if (i === max) return setSel(sel.filter((x) => x !== i));
      return setSel([i]);
    }
    if (i === max + 1 || i === min - 1) return setSel([...sel, i].sort((a, b) => a - b));
    return setSel([i]);
  };

  const [book, booking] = useAction(async () => {
    if (!sel.length || !slots) return toast.error('Select at least one time slot');
    const first = slots[Math.min(...sel)];
    const last = slots[Math.max(...sel)];
    try {
      const b = await api('/resident/bookings', { method: 'POST', body: { facilityId: id, date, startTime: first.startTime, endTime: last.endTime, ...(purpose.trim() && { purpose: purpose.trim() }) } });
      toast.success(b.status === 'confirmed' ? 'Booking confirmed' : 'Booking request sent for approval');
      router.replace('/bookings');
    } catch (err) {
      toast.error(err.message);
      if (err.code === 'SLOT_TAKEN') av.reload();
    }
  });

  const total = (facility?.feePaise || 0) * sel.length;

  return (
    <Screen
      header={<DetailHeader title={facility?.name || 'Book facility'} fallback="/facilities" />}
      footer={
        <View style={{ gap: 8 }}>
          {sel.length && slots ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T size={13} color={colors.muted}>
                {time12(slots[Math.min(...sel)].startTime)} – {time12(slots[Math.max(...sel)].endTime)} · {sel.length} slot{sel.length > 1 ? 's' : ''}
              </T>
              <T weight="extrabold" size={14}>
                {total ? money(total) : 'Free'}
              </T>
            </View>
          ) : null}
          <Button title={facility?.requiresApproval ? 'Request booking' : 'Confirm booking'} icon="calendar" onPress={book} loading={booking} disabled={!sel.length || !slots} />
        </View>
      }
    >
      {facility ? (
        <LinearGradient colors={['#f1f5f9', '#e2e8f0']} style={{ borderRadius: 18, padding: 18, alignItems: 'center', gap: 4 }}>
          <Ionicons name={facilityIcon(facility)} size={36} color="#07162c" />
          <T weight="extrabold" size={19}>
            {facility.name}
          </T>
          <T weight="bold" size={13} color="#07162c">
            {facility.feePaise ? `${money(facility.feePaise)} per ${facility.slotMinutes}-min slot` : 'Free for residents'}
          </T>
        </LinearGradient>
      ) : (
        <Skeleton height={110} radius={18} />
      )}
      {facility?.rules ? <Hint icon="document-text-outline">{facility.rules}</Hint> : null}
      {facility?.requiresApproval ? (
        <Hint tone="amber" icon="hourglass-outline">
          Bookings for this facility are confirmed after the society office approves them.
        </Hint>
      ) : null}

      <SectionTitle title="Select date" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {days.map((d) => {
          const l = dayLabel(d);
          const on = d === date;
          return (
            <Pressable key={d} onPress={() => {
                setDate(d);
                setSel([]);
              }} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${l.weekday} ${l.day} ${l.month}`} style={{ width: 58, paddingVertical: 10, borderRadius: 14, alignItems: 'center', backgroundColor: on ? colors.chipOn : colors.white, borderWidth: 1, borderColor: on ? colors.chipOn : colors.border }}>
              <T size={11} color={on ? '#f1f5f9' : colors.muted}>
                {l.weekday}
              </T>
              <T weight="extrabold" size={18} color={on ? colors.white : colors.text}>
                {l.day}
              </T>
              <T size={11} color={on ? '#f1f5f9' : colors.muted}>
                {l.month}
              </T>
            </Pressable>
          );
        })}
      </ScrollView>

      <SectionTitle title="Available time slots" />
      {!slots ? (
        av.error ? (
          <ErrorState error={av.error} onRetry={av.reload} />
        ) : (
          <LoadingList rows={2} card={48} />
        )
      ) : slots.every((s) => !s.available) ? (
        <Hint tone="amber" icon="close-circle-outline">
          No free slots on this date. Try another day.
        </Hint>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {slots.map((s, i) => {
            const on = sel.includes(i);
            const busy = !s.available;
            return (
              <Pressable
                key={s.startTime}
                onPress={() => toggle(i)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityState={{ selected: on, disabled: busy }}
                accessibilityLabel={`${time12(s.startTime)} to ${time12(s.endTime)}${busy ? ', unavailable' : ''}`}
                style={{ width: '31.5%', flexGrow: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', borderWidth: 1.5, borderColor: on ? colors.blue : busy ? '#e2e8f0' : colors.border, backgroundColor: on ? '#f1f5f9' : busy ? '#f1f5f9' : colors.white }}
              >
                <T weight="bold" size={13} color={busy ? '#cbd5e1' : on ? colors.blue : colors.text} style={busy ? { textDecorationLine: 'line-through' } : null}>
                  {time12(s.startTime)}
                </T>
                <T size={10.5} color={busy ? '#cbd5e1' : colors.muted}>
                  {busy ? (s.status === 'past' ? 'Passed' : 'Booked') : `to ${time12(s.endTime)}`}
                </T>
              </Pressable>
            );
          })}
        </View>
      )}
      <T size={12} color={colors.muted}>
        Tip: tap neighbouring slots to book a longer time.
      </T>
      <Field label="Purpose (optional)" value={purpose} onChangeText={setPurpose} maxLength={300} placeholder="e.g. Birthday party for 30 guests" />
    </Screen>
  );
}
