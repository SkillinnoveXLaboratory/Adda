import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AttachmentPicker } from '../../../components/AttachmentPicker';
import { CommissionBreakdown } from '../../../components/Pricing';
import { AsyncView, Button, Chips, DetailHeader, ErrorState, Field, Hint, LoadingList, Screen, SectionTitle, ToggleRow } from '../../../components/ui';
import { useAuth } from '../../../context/auth';
import { useToast } from '../../../context/toast';
import { useAction, useApi } from '../../../hooks/useApi';
import { api } from '../../../lib/api';
import { OFFER_PRICE_TYPES, toPaise } from '../../../lib/format';
import { normalizePhone, PHONE_INPUT_MAX, phoneError, phoneInput, rupeeError } from '../../../lib/validation';

const MAX_PRICE_RUPEES = 1000000; // mirrors the API limit (₹10,00,000)

/** Create or edit a service offer (?id= to edit). Anyone signed in can offer a service; it is reviewed first. */
export default function OfferForm() {
  const { id } = useLocalSearchParams();
  const { user } = useAuth();
  const toast = useToast();
  const cats = useApi('/service-offers/categories', { refetchOnFocus: false });
  // Current platform commission (Master Admin → Settings); saving publishes the service at this rate.
  const config = useApi('/public/config', { refetchOnFocus: false });
  const commissionPercent = config.data?.services?.commissionPercent ?? 0;
  const [loading, setLoading] = useState(!!id);
  const [loadError, setLoadError] = useState(null);
  const [f, setF] = useState({ categoryId: '', title: '', description: '', priceType: 'starting_from', price: '', experience: '', serviceArea: '', city: user?.city || '', availabilityNote: '', contactName: user?.name || '', contactPhone: user?.phone || '', whatsappAvailable: true });
  const [photos, setPhotos] = useState([]);
  const [errors, setErrors] = useState({});
  const set = (k) => (v) => {
    setF((x) => ({ ...x, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: null }));
  };

  const applyExisting = (d) => {
    setF({
      categoryId: d.category?._id || '',
      title: d.title,
      description: d.description || '',
      priceType: d.priceType,
      price: d.pricePaise ? String(d.pricePaise / 100) : '',
      experience: d.experienceYears ? String(d.experienceYears) : '',
      serviceArea: d.serviceArea || '',
      city: d.city || '',
      availabilityNote: d.availabilityNote || '',
      contactName: d.contactName || '',
      contactPhone: d.contactPhone || '',
      whatsappAvailable: d.whatsappAvailable !== false,
    });
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
    api(`/service-offers/${id}`).then(applyExisting, failLoad);
  };
  useEffect(() => {
    if (!id) return undefined;
    let alive = true;
    api(`/service-offers/${id}`).then((d) => alive && applyExisting(d), (e) => alive && failLoad(e));
    return () => {
      alive = false;
    };
  }, [id]);

  const onQuote = f.priceType === 'on_quote';
  const [save, busy] = useAction(async () => {
    const priceErr = onQuote ? null : rupeeError(f.price) || (Number(f.price) > MAX_PRICE_RUPEES ? 'Maximum ₹10,00,000' : null);
    const exp = f.experience === '' ? null : Number(f.experience);
    const e = {
      categoryId: f.categoryId ? null : 'Choose a category',
      title: f.title.trim().length < 5 ? 'Describe the service in at least 5 characters' : null,
      price: priceErr,
      experience: exp !== null && (!Number.isInteger(exp) || exp < 0 || exp > 60) ? 'Enter years between 0 and 60' : null,
      city: f.city.trim().length < 2 ? 'Enter the city you work in' : null,
      contactPhone: phoneError(f.contactPhone),
    };
    setErrors(e);
    if (Object.values(e).some(Boolean)) return toast.error(e.categoryId || 'Please fix the highlighted fields');
    const body = {
      categoryId: f.categoryId,
      title: f.title.trim(),
      description: f.description.trim(),
      priceType: f.priceType,
      pricePaise: onQuote ? null : toPaise(f.price),
      experienceYears: exp,
      serviceArea: f.serviceArea.trim(),
      city: f.city.trim(),
      availabilityNote: f.availabilityNote.trim(),
      contactName: f.contactName.trim(),
      contactPhone: normalizePhone(f.contactPhone),
      whatsappAvailable: f.whatsappAvailable,
      photos: photos.map((p) => p._id),
    };
    try {
      const saved = await api(id ? `/service-offers/${id}` : '/service-offers', { method: id ? 'PATCH' : 'POST', body });
      toast.success(saved.moderationStatus === 'pending' ? 'Submitted for review' : 'Service listed');
      router.replace(`/offers/${saved._id}`);
    } catch (err) {
      if (err.code === 'OFFER_LIMIT') toast.error(err.message);
      else if (err.details?.length) {
        setErrors(Object.fromEntries(err.details.map((d) => [d.path === 'pricePaise' ? 'price' : d.path === 'experienceYears' ? 'experience' : d.path, d.message])));
        toast.error(err.message);
      } else toast.error(err.message);
    }
  });

  const header = <DetailHeader title={id ? 'Edit service' : 'Offer your service'} fallback="/offers" />;
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
    <Screen header={header} footer={<Button title={id ? 'Save changes' : 'Submit for review'} icon="checkmark" onPress={save} loading={busy} />}>
      <SectionTitle title="Category" />
      <AsyncView state={cats} skeleton={<LoadingList rows={1} card={36} />} empty={{ when: (d) => !d.items.length, icon: 'construct-outline', title: 'No service categories yet', message: 'The platform has not added service categories yet. Please try later.' }}>
        {(d) => <Chips options={d.items.map((c) => ({ value: c._id, label: c.name }))} value={f.categoryId} onChange={set('categoryId')} />}
      </AsyncView>
      <Field label="What service do you offer?" value={f.title} onChangeText={set('title')} maxLength={140} placeholder="e.g. Leak repair & bathroom fittings" error={errors.title} />
      <Field label="Details (optional)" value={f.description} onChangeText={set('description')} multiline maxLength={3000} placeholder="What you do, tools you bring, warranty, languages…" />

      <SectionTitle title="Pricing" />
      <Chips options={OFFER_PRICE_TYPES} value={f.priceType} onChange={set('priceType')} />
      {onQuote ? null : <Field label="Price (₹)" value={f.price} onChangeText={(v) => set('price')(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" placeholder="e.g. 299" error={errors.price} />}
      <CommissionBreakdown pricePaise={!onQuote && Number(f.price) > 0 ? toPaise(f.price) : 0} percent={commissionPercent} onQuote={onQuote} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Field label="Experience (years)" value={f.experience} onChangeText={(v) => set('experience')(v.replace(/[^\d]/g, ''))} keyboardType="number-pad" maxLength={2} placeholder="Optional" error={errors.experience} style={{ flex: 1 }} />
        <Field label="City" value={f.city} onChangeText={set('city')} maxLength={80} error={errors.city} style={{ flex: 1 }} />
      </View>
      <Field label="Areas you cover (optional)" value={f.serviceArea} onChangeText={set('serviceArea')} maxLength={200} placeholder="e.g. Salt Lake, New Town" />
      <Field label="When are you available? (optional)" value={f.availabilityNote} onChangeText={set('availabilityNote')} maxLength={120} placeholder="e.g. Mon–Sat, 9 AM–7 PM" />

      <SectionTitle title="Photos of your work (optional)" />
      <AttachmentPicker value={photos} onChange={setPhotos} purpose="service" max={6} label="Add photos" />

      <SectionTitle title="Contact" />
      <Field label="Name shown to customers" value={f.contactName} onChangeText={set('contactName')} maxLength={120} />
      <Field label="Contact mobile" prefix="+91" value={f.contactPhone} onChangeText={(v) => set('contactPhone')(phoneInput(v))} keyboardType="number-pad" maxLength={PHONE_INPUT_MAX} error={errors.contactPhone} />
      <ToggleRow label="Available on WhatsApp" value={f.whatsappAvailable} onChange={set('whatsappAvailable')} />
      <Hint>Your phone number is shown to everyone who can see this service. Services are reviewed before they appear. You can list up to 10.</Hint>
    </Screen>
  );
}
