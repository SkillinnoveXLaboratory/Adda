import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, ErrorState, Field, Hint, LoadingList, Screen, SearchBar, SectionTitle, T, TextLink, ToggleRow } from '../../../../components/ui';
import { GateHeader, useDebounced, useGate } from '../../../../components/GateKit';
import { useToast } from '../../../../context/toast';
import { useAction, useApi } from '../../../../hooks/useApi';
import { api } from '../../../../lib/api';
import { titleCase } from '../../../../lib/format';
import { PHONE_INPUT_MAX, normalizePhone, phoneInput } from '../../../../lib/validation';
import { colors } from '../../../../theme';

const EMPTY = { name: '', phone: '', purpose: '' };

function phoneProblem(value) {
  if (!value) return "Enter the guest's mobile number";
  const d = normalizePhone(value);
  if (d.length !== 10) return `Enter all 10 digits of the mobile number (${d.length} entered)`;
  if (!/^[6-9]/.test(d)) return 'Indian mobile numbers start with 6, 7, 8 or 9';
  return null;
}

/** Walk-in guest: name, phone, purpose, the flat they are visiting (and optionally which member), "Entered now". */
export default function GateAddGuest() {
  const { society } = useGate();
  const toast = useToast();
  const [f, setF] = useState(EMPTY);
  const [flat, setFlat] = useState(null);
  const [hostId, setHostId] = useState(null);
  const [enterNow, setEnterNow] = useState(true);
  const [errors, setErrors] = useState({});
  const [flatSearch, setFlatSearch] = useState('');
  const fq = useDebounced(flatSearch.trim().slice(0, 20));
  const flats = useApi(flat ? null : '/gate/flats', { query: { q: fq } });
  const set = (k) => (v) => {
    setF((s) => ({ ...s, [k]: k === 'phone' ? phoneInput(v) : v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: null }));
  };

  const [submit, busy] = useAction(async () => {
    const e = {};
    if (f.name.trim().length < 2) e.name = "Enter the guest's name (at least 2 letters)";
    e.phone = phoneProblem(f.phone);
    if (!flat) e.flat = 'Choose the flat the guest is visiting';
    Object.keys(e).forEach((k) => e[k] || delete e[k]);
    setErrors(e);
    if (Object.keys(e).length) return toast.error(Object.values(e)[0]);
    try {
      const v = await api('/gate/visitors', {
        method: 'POST',
        body: { name: f.name.trim(), phone: normalizePhone(f.phone), ...(f.purpose.trim() && { purpose: f.purpose.trim() }), flatId: flat._id, ...(hostId && { hostId }), enterNow },
      });
      toast.success(enterNow ? `${v.name} let in to flat ${flat.number}` : `${v.name} added for flat ${flat.number}`);
      setF(EMPTY);
      setFlat(null);
      setHostId(null);
      setFlatSearch('');
      setEnterNow(true);
      router.push(`/gate/guest/${v._id}`);
    } catch (err) {
      toast.error(err.message);
    }
  });

  return (
    <Screen
      header={<GateHeader society={society} subtitle="Add a walk-in guest" />}
      footer={<Button title={enterNow ? 'Add guest & let in' : 'Add guest'} icon={enterNow ? 'log-in-outline' : 'person-add'} onPress={submit} loading={busy} />}
    >
      <Field label="Guest name" value={f.name} onChangeText={set('name')} placeholder="e.g. Amit Kumar" maxLength={80} autoCapitalize="words" error={errors.name} />
      <Field
        label="Mobile number"
        prefix="+91"
        value={f.phone}
        onChangeText={set('phone')}
        placeholder="98765 43210"
        keyboardType="phone-pad"
        maxLength={PHONE_INPUT_MAX}
        autoComplete="off"
        error={errors.phone}
      />
      <Field label="Purpose (optional)" value={f.purpose} onChangeText={set('purpose')} placeholder="e.g. Delivery, plumber, relative" maxLength={120} />

      <SectionTitle title="Visiting flat" />
      {flat ? (
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={styles.flatIcon}>
              <Ionicons name="business" size={18} color={colors.gold} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T weight="extrabold" size={15} color={colors.navy} numberOfLines={1}>
                Flat {flat.number}
              </T>
              <T size={12} color={colors.muted} numberOfLines={1}>
                {[flat.building?.name, flat.floor != null ? `Floor ${flat.floor}` : null].filter(Boolean).join(' · ')}
              </T>
            </View>
            <TextLink
              title="Change"
              onPress={() => {
                setFlat(null);
                setHostId(null);
              }}
            />
          </View>
          <T weight="bold" size={12.5}>
            Who are they visiting? (optional)
          </T>
          <Choice selected={!hostId} title="Whole flat" subtitle="Every member of this flat is told" onPress={() => setHostId(null)} />
          {flat.members.map((m) => (
            <Choice key={m._id} selected={hostId === m._id} title={m.name || 'Member'} subtitle={titleCase(m.residentType || '')} onPress={() => setHostId(m._id)} />
          ))}
          {!flat.members.length ? <Hint tone="amber">No approved members live in this flat yet. The guest is still recorded for the flat.</Hint> : null}
        </Card>
      ) : (
        <View style={{ gap: 10 }}>
          <SearchBar value={flatSearch} onChangeText={setFlatSearch} placeholder="Search flat number, e.g. A-101" />
          {errors.flat ? (
            <T size={12} color={colors.danger}>
              {errors.flat}
            </T>
          ) : null}
          {flats.loading && !flats.data ? (
            <LoadingList rows={3} card={56} />
          ) : flats.error && !flats.data ? (
            <ErrorState error={flats.error} onRetry={flats.reload} />
          ) : !flats.data?.items?.length ? (
            <T color={colors.muted}>No flat matches “{fq}”. Check the flat number.</T>
          ) : (
            flats.data.items.map((x) => (
              <Pressable
                key={x._id}
                onPress={() => {
                  setFlat(x);
                  setHostId(x.members.length === 1 ? x.members[0]._id : null);
                  if (errors.flat) setErrors((e) => ({ ...e, flat: null }));
                }}
                accessibilityRole="button"
                accessibilityLabel={`Flat ${x.number}`}
                style={({ pressed }) => [styles.flatRow, pressed && { borderColor: colors.gold }]}
              >
                <View style={styles.flatIcon}>
                  <Ionicons name="business" size={18} color={colors.gold} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T weight="bold" size={14} color={colors.navy} numberOfLines={1}>
                    Flat {x.number}
                  </T>
                  <T size={12} color={colors.muted} numberOfLines={1}>
                    {[x.building?.name, x.members.length ? x.members.map((m) => m.name).join(', ') : 'No members yet'].filter(Boolean).join(' · ')}
                  </T>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
              </Pressable>
            ))
          )}
        </View>
      )}

      <ToggleRow label="Entered now (let in straight away)" value={enterNow} onChange={setEnterNow} />
      <Hint>{enterNow ? 'The guest is recorded as inside now and the flat is told they came in.' : 'The guest waits at the gate as approved; tap “Entered” on the guest list when they go in.'}</Hint>
    </Screen>
  );
}

function Choice({ selected, title, subtitle, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={title} style={[styles.choice, selected && styles.choiceOn]}>
      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? colors.navy : '#94a3b8'} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T weight="bold" size={13.5} color={colors.navy} numberOfLines={1}>
          {title}
        </T>
        {subtitle ? (
          <T size={11.5} color={colors.muted} numberOfLines={1}>
            {subtitle}
          </T>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flatIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  flatRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 10, minHeight: 56 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, minHeight: 50 },
  choiceOn: { borderColor: colors.navy, backgroundColor: colors.goldLight },
});
