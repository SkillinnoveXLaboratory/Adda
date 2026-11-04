import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AttachmentPicker } from '../../../components/AttachmentPicker';
import { AsyncView, Button, Chips, DetailHeader, ErrorState, Field, Hint, LoadingList, Screen, SectionTitle, ToggleRow } from '../../../components/ui';
import { useAuth } from '../../../context/auth';
import { useToast } from '../../../context/toast';
import { useAction, useApi } from '../../../hooks/useApi';
import { api } from '../../../lib/api';
import { toPaise } from '../../../lib/format';
import { normalizePhone, PHONE_INPUT_MAX, phoneError, phoneInput, rupeeError } from '../../../lib/validation';

const CONDITIONS = [
  { value: 'new', label: 'New' },
  { value: 'like_new', label: 'Like new' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
];

/** Create or edit a second-hand item (?id= to edit). */
export default function MarketForm() {
  const { id } = useLocalSearchParams();
  const { user, isMember } = useAuth();
  const toast = useToast();
  const cats = useApi('/marketplace/categories', { refetchOnFocus: false });
  const [loading, setLoading] = useState(!!id);
  const [loadError, setLoadError] = useState(null);
  const [f, setF] = useState({ categoryId: '', title: '', description: '', price: '', negotiable: false, condition: 'good', locality: '', city: user?.city || '', contactName: user?.name || '', contactPhone: user?.phone || '', whatsappAvailable: true, societyOnly: false });
  const [photos, setPhotos] = useState([]);
  const [errors, setErrors] = useState({});
  const set = (k) => (v) => {
    setF((x) => ({ ...x, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: null }));
  };

  /** Copies a loaded listing into the form. */
  const applyExisting = (d) => {
    setF({ categoryId: d.category?._id || '', title: d.title, description: d.description || '', price: String(d.pricePaise / 100), negotiable: !!d.negotiable, condition: d.condition || 'good', locality: d.locality || '', city: d.city || '', contactName: d.contactName || '', contactPhone: d.contactPhone || '', whatsappAvailable: d.whatsappAvailable !== false, societyOnly: d.visibility === 'society' });
    setPhotos(d.photos || []);
    setLoading(false);
  };
  const failLoad = (err) => {
    setLoadError(err);
    setLoading(false);
  };
  const loadExisting = () => {
    setLoading(true);
    setLoadError(null);
    api(`/marketplace/${id}`).then(applyExisting, failLoad);
  };
  useEffect(() => {
    if (!id) return undefined;
    let alive = true;
    api(`/marketplace/${id}`).then((d) => alive && applyExisting(d), (e) => alive && failLoad(e));
    return () => {
      alive = false;
    };
  }, [id]);

  const [save, busy] = useAction(async () => {
    const e = {
      categoryId: f.categoryId ? null : 'Choose a category',
      title: f.title.trim().length < 3 ? 'Title needs at least 3 characters' : null,
      price: rupeeError(f.price, { allowZero: true }),
      contactPhone: phoneError(f.contactPhone),
    };
    setErrors(e);
    if (Object.values(e).some(Boolean)) return toast.error(e.categoryId || 'Please fix the highlighted fields');
    const body = {
      categoryId: f.categoryId,
      title: f.title.trim(),
      description: f.description.trim(),
      pricePaise: toPaise(f.price),
      negotiable: f.negotiable,
      condition: f.condition,
      locality: f.locality.trim(),
      city: f.city.trim(),
      contactName: f.contactName.trim(),
      contactPhone: normalizePhone(f.contactPhone),
      whatsappAvailable: f.whatsappAvailable,
      photos: photos.map((p) => p._id),
      visibility: f.societyOnly ? 'society' : 'public',
    };
    try {
      const saved = await api(id ? `/marketplace/${id}` : '/marketplace', { method: id ? 'PATCH' : 'POST', body });
      toast.success(saved.moderationStatus === 'pending' ? 'Submitted for review' : 'Item listed');
      router.replace(`/marketplace/${saved._id}`);
    } catch (err) {
      toast.error(err.message);
    }
  });

  const header = <DetailHeader title={id ? 'Edit item' : 'Sell an item'} fallback="/marketplace" />;
  if (loading) {
    return (
      <Screen header={header}>
        <LoadingList rows={4} card={60} />
      </Screen>
    );
  }
  if (loadError) {
    return (
      <Screen header={header}>
        <ErrorState error={loadError} onRetry={loadExisting} />
      </Screen>
    );
  }

  return (
    <Screen header={header} footer={<Button title={id ? 'Save changes' : 'Publish listing'} icon="checkmark" onPress={save} loading={busy} />}>
      <SectionTitle title="Category" />
      <AsyncView state={cats}>{(d) => <Chips options={d.items.map((c) => ({ value: c._id, label: c.name }))} value={f.categoryId} onChange={set('categoryId')} />}</AsyncView>
      <Field label="What are you selling?" value={f.title} onChangeText={set('title')} maxLength={140} placeholder="e.g. Study table with drawer" error={errors.title} />
      <Field label="Price (₹)" value={f.price} onChangeText={(v) => set('price')(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" placeholder="Enter 0 to give it away free" error={errors.price} />
      <ToggleRow label="Price is negotiable" value={f.negotiable} onChange={set('negotiable')} />
      <SectionTitle title="Condition" />
      <Chips options={CONDITIONS} value={f.condition} onChange={set('condition')} />
      <Field label="Description" value={f.description} onChangeText={set('description')} multiline maxLength={3000} placeholder="Age, brand, size, reason for selling…" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Field label="Locality" value={f.locality} onChangeText={set('locality')} maxLength={120} style={{ flex: 1 }} />
        <Field label="City" value={f.city} onChangeText={set('city')} maxLength={80} style={{ flex: 1 }} />
      </View>
      <SectionTitle title="Photos" />
      <AttachmentPicker value={photos} onChange={setPhotos} purpose="marketplace" max={6} label="Add item photos" />
      <SectionTitle title="Contact" />
      <Field label="Contact name" value={f.contactName} onChangeText={set('contactName')} maxLength={120} />
      <Field label="Contact mobile" prefix="+91" value={f.contactPhone} onChangeText={(v) => set('contactPhone')(phoneInput(v))} keyboardType="number-pad" maxLength={PHONE_INPUT_MAX} error={errors.contactPhone} />
      <ToggleRow label="Available on WhatsApp" value={f.whatsappAvailable} onChange={set('whatsappAvailable')} />
      {isMember ? <ToggleRow label="Only show to my society" value={f.societyOnly} onChange={set('societyOnly')} /> : null}
      <Hint>Listings are reviewed by moderators before they appear to others.</Hint>
    </Screen>
  );
}
