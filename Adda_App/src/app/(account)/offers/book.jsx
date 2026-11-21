import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BookingPriceSummary, DiscountOffer } from '../../../components/Pricing';
import { AsyncView, Button, Card, DetailHeader, Field, Hint, LoadingList, Screen, SectionTitle, T } from '../../../components/ui';
import { useAuth } from '../../../context/auth';
import { useToast } from '../../../context/toast';
import { useAction, useApi } from '../../../hooks/useApi';
import { api } from '../../../lib/api';
import { dayLabel, istDay, money, offerPrice, time12 } from '../../../lib/format';
import { colors } from '../../../theme';

const TIMES = ['09:00', '11:00', '13:00', '15:00', '17:00', '19:00'];

/** Book a vendor's service: date (next 14 days), optional time slot, address, note, and the NIVASA discount when offered. */
export default function BookService() {
  const { id } = useLocalSearchParams();
  const offer = useApi(`/service-offers/${id}`);
  if (offer.data) return <BookingForm offer={offer.data} />;
  return (
    <Screen header={<DetailHeader title="Book service" fallback="/offers" />}>
      <AsyncView state={offer} skeleton={<LoadingList rows={3} card={90} />}>
        {() => null}
      </AsyncView>
    </Screen>
  );
}

function BookingForm({ offer }) {
  const { activeMembership: m, isVendor } = useAuth();
  const toast = useToast();
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => istDay(i)), []);
  const defaultAddress = m ? [m.flat?.number ? `Flat ${m.flat.number}` : null, m.building?.name, m.society?.name, m.society?.city].filter(Boolean).join(', ') : '';
  const [date, setDate] = useState(null);
  const [time, setTime] = useState(null);
  const [address, setAddress] = useState(defaultAddress);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});
  // The member price comes from the server; the discount is only offered when the vendor gives one.
  const pricing = offer.pricing || {};
  const memberPrice = pricing.memberPricePaise ?? (offer.priceType !== 'on_quote' ? offer.pricePaise : null);
  const canDiscount = !!pricing.discountAvailable && pricing.discountPaise > 0;
  // "Apply discount" on the service page opens this form with ?discount=1.
  const params = useLocalSearchParams();
  const [discount, setDiscount] = useState(params.discount === '1' && canDiscount);

  const [submit, busy] = useAction(async () => {
    const e = {};
    if (!date) e.date = 'Choose a date for the visit';
    if (address.trim().length < 5) e.address = 'Enter the full address where the work is needed';
    setErrors(e);
    if (Object.keys(e).length) return;
    try {
      await api(`/service-offers/${offer._id}/bookings`, { method: 'POST', body: { preferredDate: date, ...(time && { preferredTime: time }), address: address.trim(), ...(note.trim() && { note: note.trim() }), ...(discount && { applyDiscount: true }) } });
      toast.success(discount ? `Booking sent with your ${money(pricing.discountPaise)} discount. The vendor will confirm it.` : 'Booking sent. The vendor will confirm it.');
      router.replace('/service-bookings');
    } catch (err) {
      // The vendor may have changed their rates since this screen loaded: drop the discount and say why.
      if (err.code === 'NO_DISCOUNT') setDiscount(false);
      toast.error(err.message);
    }
  });

  return (
    <Screen header={<DetailHeader title="Book service" fallback={`/offers/${offer._id}`} />} footer={isVendor ? null : <Button title="Confirm booking" icon="checkmark-circle" onPress={submit} loading={busy} />}>
      <Card style={{ gap: 4 }}>
        <T weight="extrabold" size={15} color={colors.navy} numberOfLines={2}>
          {offer.title}
        </T>
        <T weight="bold" size={13} color={colors.goldText}>
          {offerPrice(offer)}
        </T>
        <T size={12} color={colors.muted} numberOfLines={1}>
          {[offer.shop?.name || offer.contactName || offer.postedBy, offer.city].filter(Boolean).join(' · ')}
        </T>
      </Card>
      {isVendor ? <Hint tone="amber">Vendor accounts can’t book services. Use a member account to book.</Hint> : null}
      {memberPrice > 0 ? (
        <>
          <SectionTitle title="Price" />
          {canDiscount ? <DiscountOffer pricing={pricing} applied={discount} onToggle={() => setDiscount((d) => !d)} /> : null}
          <BookingPriceSummary memberPricePaise={memberPrice} discountPaise={discount ? pricing.discountPaise : 0} />
        </>
      ) : null}

      <SectionTitle title="Choose a date" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
        {days.map((d) => {
          const l = dayLabel(d);
          const on = d === date;
          return (
            <Pressable key={d} onPress={() => setDate(d)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${l.weekday} ${l.day} ${l.month}`} style={{ width: 58, paddingVertical: 10, borderRadius: 14, alignItems: 'center', backgroundColor: on ? colors.navy : colors.white, borderWidth: 1, borderColor: on ? colors.navy : colors.border }}>
              <T size={11} color={on ? '#e2e8f0' : colors.muted}>
                {l.weekday}
              </T>
              <T weight="extrabold" size={18} color={on ? colors.gold : colors.navy}>
                {l.day}
              </T>
              <T size={11} color={on ? '#e2e8f0' : colors.muted}>
                {l.month}
              </T>
            </Pressable>
          );
        })}
      </ScrollView>
      {errors.date ? (
        <T size={12} color={colors.danger}>
          {errors.date}
        </T>
      ) : null}

      <SectionTitle title="Preferred time (optional)" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {TIMES.map((t) => {
          const on = t === time;
          return (
            <Pressable key={t} onPress={() => setTime(on ? null : t)} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ flexDirection: 'row', gap: 6, alignItems: 'center', paddingHorizontal: 14, minHeight: 44, borderRadius: 22, borderWidth: 1.5, borderColor: on ? colors.navy : colors.border, backgroundColor: on ? colors.goldLight : colors.white }}>
              {on ? <Ionicons name="checkmark-circle" size={16} color={colors.navy} /> : null}
              <T weight={on ? 'bold' : 'medium'} size={13} color={colors.navy}>
                {time12(t)}
              </T>
            </Pressable>
          );
        })}
      </View>

      <Field label="Address for the visit" value={address} onChangeText={setAddress} multiline maxLength={300} placeholder="Flat, building, society, area" error={errors.address} />
      <Field label="Note for the vendor (optional)" value={note} onChangeText={setNote} multiline maxLength={500} placeholder="e.g. AC is not cooling; please bring gas" />

      <Hint icon="cash-outline">Pay after the job is done — in cash to the vendor (they record it) or online from My service bookings.</Hint>
    </Screen>
  );
}
