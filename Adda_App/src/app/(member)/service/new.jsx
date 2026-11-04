import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, DetailHeader, Field, Hint, Screen, SectionTitle, T } from '../../../components/ui';
import { useToast } from '../../../context/toast';
import { useAction } from '../../../hooks/useApi';
import { api } from '../../../lib/api';
import { dayLabel, istDay } from '../../../lib/format';
import { colors } from '../../../theme';

const TIMES = ['Morning (8–12)', 'Afternoon (12–4)', 'Evening (4–8)', 'Any time'];

export default function NewServiceRequest() {
  const { categoryId, name } = useLocalSearchParams();
  const toast = useToast();
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(null);
  const [time, setTime] = useState(null);
  const [error, setError] = useState(null);
  const days = useMemo(() => Array.from({ length: 10 }, (_, i) => istDay(i)), []);

  const [submit, busy] = useAction(async () => {
    if (description.trim().length < 5) return setError('Describe what you need in at least 5 characters');
    setError(null);
    try {
      await api('/resident/service-requests', { method: 'POST', body: { categoryId, description: description.trim(), ...(date && { preferredDate: date }), ...(time && { preferredTime: time }) } });
      toast.success(`${name || 'Service'} request sent`);
      router.replace('/service-requests');
    } catch (err) {
      toast.error(err.message);
    }
  });

  return (
    <Screen header={<DetailHeader title={`Request ${name || 'service'}`} fallback="/services" />} footer={<Button title="Send request" icon="send" onPress={submit} loading={busy} />}>
      <Hint icon="construct-outline">Your society office receives this request and arranges a verified professional. You can track the status under My requests.</Hint>
      <Field label="What do you need?" value={description} onChangeText={setDescription} multiline maxLength={2000} placeholder="e.g. Kitchen tap is leaking and needs a new washer" error={error} />
      <SectionTitle title="Preferred date (optional)" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {days.map((d) => {
          const l = dayLabel(d);
          const on = d === date;
          return (
            <Pressable key={d} onPress={() => setDate(on ? null : d)} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ width: 58, paddingVertical: 10, borderRadius: 14, alignItems: 'center', backgroundColor: on ? colors.chipOn : colors.white, borderWidth: 1, borderColor: on ? colors.chipOn : colors.border }}>
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
      <SectionTitle title="Preferred time (optional)" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {TIMES.map((t) => {
          const on = t === time;
          return (
            <Pressable key={t} onPress={() => setTime(on ? null : t)} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ flexDirection: 'row', gap: 6, alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 20, borderWidth: 1.5, borderColor: on ? colors.blue : colors.border, backgroundColor: on ? '#f1f5f9' : colors.white }}>
              {on ? <Ionicons name="checkmark-circle" size={16} color={colors.blue} /> : null}
              <T weight={on ? 'bold' : 'medium'} size={13} color={on ? colors.blue : colors.textSoft}>
                {t}
              </T>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}
