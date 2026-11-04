import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AsyncView, Button, Card, DetailHeader, Field, Hint, PillToggle, Screen, SectionTitle, T } from '../../components/ui';
import { useAuth } from '../../context/auth';
import { useToast } from '../../context/toast';
import { api } from '../../lib/api';
import { colors } from '../../theme';
import { useAction } from '../../hooks/useApi';
import { usePublic } from '../../hooks/usePublic';

const TYPES = [
  { value: 'owner', label: 'Owner' },
  { value: 'tenant', label: 'Tenant' },
  { value: 'family', label: 'Family' },
];

/** Membership request: building → flat number → resident type. */
export default function Join() {
  const { societyId } = useLocalSearchParams();
  const { user, refreshProfile } = useAuth();
  const toast = useToast();
  const state = usePublic(`/public/societies/${societyId}/buildings`);
  const [buildingId, setBuildingId] = useState(null);
  const [flat, setFlat] = useState('');
  const [type, setType] = useState('owner');
  const [note, setNote] = useState('');
  const [name, setName] = useState(user?.name || '');
  const [errors, setErrors] = useState({});

  const [submit, busy] = useAction(async () => {
    const e = {
      building: buildingId ? null : 'Select your building',
      flat: flat.trim() ? null : 'Enter your flat number',
      name: !user?.name && name.trim().length < 2 ? 'Enter your full name' : null,
    };
    setErrors(e);
    if (e.building || e.flat || e.name) return;
    try {
      await api('/memberships', { method: 'POST', body: { societyId, buildingId, flatNumber: flat.trim().toUpperCase(), residentType: type, ...(note.trim() && { note: note.trim() }), ...(!user?.name && { name: name.trim() }) } });
      await refreshProfile();
      toast.success('Request sent to your society');
      router.replace('/membership');
    } catch (err) {
      if (err.code === 'FLAT_NOT_FOUND') setErrors({ flat: err.message });
      else toast.error(err.message);
    }
  });

  return (
    <Screen
      header={<DetailHeader title="Join your society" fallback="/society" />}
      footer={<Button title="Send request" icon="paper-plane-outline" onPress={submit} loading={busy} disabled={!state.data} />}
    >
      <AsyncView state={state}>
        {(data) => (
          <>
            <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' }}>
              <Ionicons name="business" size={26} color="#0b1a30" />
              <View style={{ flex: 1 }}>
                <T weight="extrabold" size={16} color="#0b1a30">
                  {data.society.name}
                </T>
                <T size={12.5} color="#334155">
                  {[data.society.area, data.society.city].filter(Boolean).join(', ')} · Code {data.society.code}
                </T>
              </View>
            </Card>

            <SectionTitle title="1. Select your building" />
            {data.buildings.length === 0 ? (
              <Hint tone="amber" icon="warning-outline">
                This society hasn’t added its buildings yet. Please check back later or contact the society office.
              </Hint>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {data.buildings.map((b) => {
                  const on = b._id === buildingId;
                  return (
                    <Pressable
                      key={b._id}
                      onPress={() => {
                        setBuildingId(b._id);
                        setErrors((x) => ({ ...x, building: null }));
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      style={{ minWidth: '30%', flexGrow: 1, borderRadius: 14, borderWidth: 1.5, borderColor: on ? colors.blue : colors.border, backgroundColor: on ? '#f1f5f9' : colors.white, padding: 14, gap: 4 }}
                    >
                      <Ionicons name={on ? 'checkmark-circle' : 'business-outline'} size={20} color={on ? colors.blue : '#94a3b8'} />
                      <T weight="bold" size={14} numberOfLines={1}>
                        {b.name}
                      </T>
                      {b.floors ? (
                        <T size={11.5} color={colors.muted}>
                          {b.floors} floors
                        </T>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            )}
            {errors.building ? (
              <T size={12} color={colors.danger}>
                {errors.building}
              </T>
            ) : null}

            <SectionTitle title="2. Your flat" />
            <Field label="Flat / unit number" value={flat} onChangeText={(v) => setFlat(v.toUpperCase())} placeholder="e.g. A-102" autoCapitalize="characters" maxLength={20} error={errors.flat} hint="Enter it exactly as written on your door or maintenance bill." />
            {!user?.name ? <Field label="Your full name" value={name} onChangeText={setName} autoCapitalize="words" error={errors.name} /> : null}

            <SectionTitle title="3. You are the" />
            <PillToggle options={TYPES} value={type} onChange={setType} />
            <Field label="Note for the society office (optional)" value={note} onChangeText={setNote} multiline maxLength={500} placeholder="e.g. Moved in on 1 October, agreement with the owner." />
            <Hint>The society office verifies your details before approving. You’ll get a notification as soon as they decide.</Hint>
          </>
        )}
      </AsyncView>
    </Screen>
  );
}
