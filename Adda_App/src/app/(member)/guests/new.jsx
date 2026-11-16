import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Button, DetailHeader, Field, Hint, Screen, SectionTitle, T } from '../../../components/ui';
import { useAuth } from '../../../context/auth';
import { useToast } from '../../../context/toast';
import { useAction } from '../../../hooks/useApi';
import { api } from '../../../lib/api';
import { dayLabel, istDay, time12 } from '../../../lib/format';
import { PHONE_INPUT_MAX, normalizePhone, phoneInput } from '../../../lib/validation';
import { colors } from '../../../theme';

const DAYS = 31; // today … +30 (server rule)

/** "1830" / "18:3" / "6:30" → "18:30"-style text while typing (digits only, colon inserted). */
function timeInput(v) {
  const d = String(v || '')
    .replace(/\D/g, '')
    .slice(0, 4);
  return d.length <= 2 ? d : `${d.slice(0, 2)}:${d.slice(2)}`;
}
const validTime = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

/** Member pre-registers a guest for their own flat (the server takes the flat from the membership). */
export default function NewGuest() {
  const { activeMembership: m } = useAuth();
  const toast = useToast();
  const days = useMemo(() => Array.from({ length: DAYS }, (_, i) => istDay(i)), []);
  const [f, setF] = useState({ name: '', phone: '', purpose: '', date: istDay(0), timeIn: '', timeOut: '' });
  const [errors, setErrors] = useState({});
  const set = (k) => (v) => {
    setF((s) => ({ ...s, [k]: k === 'phone' ? phoneInput(v) : k === 'timeIn' || k === 'timeOut' ? timeInput(v) : v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: null }));
  };

  const [submit, busy] = useAction(async () => {
    const e = {};
    if (f.name.trim().length < 2) e.name = "Enter your guest's name (at least 2 letters)";
    const d = normalizePhone(f.phone);
    if (!f.phone) e.phone = "Enter your guest's mobile number so the gate can call them";
    else if (d.length !== 10) e.phone = `Enter all 10 digits of the mobile number (${d.length} entered)`;
    else if (!/^[6-9]/.test(d)) e.phone = 'Indian mobile numbers start with 6, 7, 8 or 9';
    if (!f.date || f.date < istDay(0) || f.date > istDay(30)) e.date = 'Choose a date from today up to 30 days ahead';
    if (f.timeIn && !validTime(f.timeIn)) e.timeIn = 'Enter the time as HH:MM (24-hour), e.g. 18:30';
    if (f.timeOut && !validTime(f.timeOut)) e.timeOut = 'Enter the time as HH:MM (24-hour), e.g. 20:00';
    if (!e.timeIn && !e.timeOut && f.timeIn && f.timeOut && f.timeOut <= f.timeIn) e.timeOut = 'The out time must be after the in time';
    setErrors(e);
    if (Object.keys(e).length) return;
    try {
      const v = await api('/resident/visitors', {
        method: 'POST',
        body: {
          name: f.name.trim(),
          phone: d,
          ...(f.purpose.trim() && { purpose: f.purpose.trim() }),
          expectedDate: f.date,
          ...(f.timeIn && { expectedIn: f.timeIn }),
          ...(f.timeOut && { expectedOut: f.timeOut }),
        },
      });
      toast.success(`${v.name} added. Gate security will expect them.`);
      router.back();
    } catch (err) {
      if (err.details?.fieldErrors?.expectedOut) setErrors({ timeOut: 'The out time must be after the in time' });
      toast.error(err.message);
    }
  });

  return (
    <Screen header={<DetailHeader title="Add guest" fallback="/guests" />} footer={<Button title="Add guest" icon="person-add" onPress={submit} loading={busy} />}>
      {m?.flat?.number ? <Hint icon="home-outline">For your flat {m.flat.number}. Gate security sees the guest and lets them in.</Hint> : null}
      <Field label="Guest name" value={f.name} onChangeText={set('name')} placeholder="e.g. Amit Kumar" maxLength={80} autoCapitalize="words" error={errors.name} />
      <Field label="Mobile number" prefix="+91" value={f.phone} onChangeText={set('phone')} placeholder="98765 43210" keyboardType="phone-pad" maxLength={PHONE_INPUT_MAX} error={errors.phone} />

      <SectionTitle title="Date of visit" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
        {days.map((d) => {
          const l = dayLabel(d);
          const on = d === f.date;
          return (
            <Pressable
              key={d}
              onPress={() => set('date')(d)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${l.weekday} ${l.day} ${l.month}`}
              style={{
                width: 58,
                paddingVertical: 10,
                borderRadius: 14,
                alignItems: 'center',
                backgroundColor: on ? colors.navy : colors.white,
                borderWidth: 1,
                borderColor: on ? colors.navy : colors.border,
              }}
            >
              <T size={11} color={on ? '#e2e8f0' : colors.muted}>
                {d === istDay(0) ? 'Today' : l.weekday}
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

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Field
          label="Expected in (optional)"
          value={f.timeIn}
          onChangeText={set('timeIn')}
          placeholder="18:30"
          keyboardType="number-pad"
          maxLength={5}
          error={errors.timeIn}
          hint={validTime(f.timeIn) ? time12(f.timeIn) : '24-hour HH:MM'}
          style={{ flex: 1 }}
        />
        <Field
          label="Expected out (optional)"
          value={f.timeOut}
          onChangeText={set('timeOut')}
          placeholder="20:00"
          keyboardType="number-pad"
          maxLength={5}
          error={errors.timeOut}
          hint={validTime(f.timeOut) ? time12(f.timeOut) : '24-hour HH:MM'}
          style={{ flex: 1 }}
        />
      </View>
      <Field label="Purpose (optional)" value={f.purpose} onChangeText={set('purpose')} placeholder="e.g. Family dinner, delivery, repair" maxLength={120} />
    </Screen>
  );
}
