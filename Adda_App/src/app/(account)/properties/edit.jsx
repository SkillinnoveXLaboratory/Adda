import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AttachmentPicker } from '../../../components/AttachmentPicker';
import { Button, Chips, DetailHeader, ErrorState, Field, Hint, LoadingList, PillToggle, Screen, SectionTitle, ToggleRow } from '../../../components/ui';
import { useAuth } from '../../../context/auth';
import { useToast } from '../../../context/toast';
import { useAction } from '../../../hooks/useApi';
import { api } from '../../../lib/api';
import { toPaise } from '../../../lib/format';
import { normalizePhone, PHONE_INPUT_MAX, phoneError, phoneInput, rupeeError } from '../../../lib/validation';

const TYPES = [
  { value: 'apartment', label: 'Apartment' },
  { value: 'house', label: 'House' },
  { value: 'plot', label: 'Plot' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'room', label: 'Room' },
];
const FURNISH = [
  { value: '', label: 'Not specified' },
  { value: 'unfurnished', label: 'Unfurnished' },
  { value: 'semi_furnished', label: 'Semi-furnished' },
  { value: 'furnished', label: 'Furnished' },
];
const int = (v) => (v === '' || v === undefined ? undefined : Number(v));

/** Create or edit a property listing (?id= to edit). */
export default function PropertyForm() {
  const { id } = useLocalSearchParams();
  const { user, isMember } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(!!id);
  const [loadError, setLoadError] = useState(null);
  const [f, setF] = useState({ listingType: 'rent', propertyType: 'apartment', title: '', description: '', price: '', areaSqft: '', bedrooms: '', bathrooms: '', furnishing: '', locality: '', city: user?.city || '', address: '', contactName: user?.name || '', contactPhone: user?.phone || '', whatsappAvailable: true, linkToMySociety: false });
  const [photos, setPhotos] = useState([]);
  const [errors, setErrors] = useState({});
  const set = (k) => (v) => {
    setF((x) => ({ ...x, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: null }));
  };

  /** Copies a loaded listing into the form. */
  const applyExisting = (d) => {
    setF({ listingType: d.listingType, propertyType: d.propertyType, title: d.title, description: d.description || '', price: String(d.pricePaise / 100), areaSqft: d.areaSqft ? String(d.areaSqft) : '', bedrooms: d.bedrooms !== undefined && d.bedrooms !== null ? String(d.bedrooms) : '', bathrooms: d.bathrooms !== undefined && d.bathrooms !== null ? String(d.bathrooms) : '', furnishing: d.furnishing || '', locality: d.locality || '', city: d.city || '', address: d.address || '', contactName: d.contactName || '', contactPhone: d.contactPhone || '', whatsappAvailable: d.whatsappAvailable !== false, linkToMySociety: !!d.society });
    setPhotos((d.photos || []).map((p) => ({ ...p })));
    setLoading(false);
  };
  const failLoad = (err) => {
    setLoadError(err);
    setLoading(false);
  };
  const loadExisting = () => {
    setLoading(true);
    setLoadError(null);
    api(`/properties/${id}`).then(applyExisting, failLoad);
  };
  useEffect(() => {
    if (!id) return undefined;
    let alive = true;
    api(`/properties/${id}`).then((d) => alive && applyExisting(d), (e) => alive && failLoad(e));
    return () => {
      alive = false;
    };
  }, [id]);

  const [save, busy] = useAction(async () => {
    const e = {
      title: f.title.trim().length < 5 ? 'Title needs at least 5 characters' : null,
      price: rupeeError(f.price),
      city: f.city.trim().length < 2 ? 'Enter the city' : null,
      contactPhone: phoneError(f.contactPhone),
      areaSqft: f.areaSqft && !(Number(f.areaSqft) > 0) ? 'Enter a valid area' : null,
    };
    setErrors(e);
    if (Object.values(e).some(Boolean)) return toast.error('Please fix the highlighted fields');
    const body = {
      listingType: f.listingType,
      propertyType: f.propertyType,
      title: f.title.trim(),
      description: f.description.trim(),
      pricePaise: toPaise(f.price),
      areaSqft: int(f.areaSqft),
      bedrooms: int(f.bedrooms),
      bathrooms: int(f.bathrooms),
      ...(f.furnishing && { furnishing: f.furnishing }),
      locality: f.locality.trim(),
      city: f.city.trim(),
      address: f.address.trim(),
      contactName: f.contactName.trim(),
      contactPhone: normalizePhone(f.contactPhone),
      whatsappAvailable: f.whatsappAvailable,
      photos: photos.map((p) => p._id),
      ...(!id && { linkToMySociety: f.linkToMySociety }),
    };
    try {
      const saved = await api(id ? `/properties/${id}` : '/properties', { method: id ? 'PATCH' : 'POST', body });
      toast.success(saved.moderationStatus === 'pending' ? 'Submitted for review' : 'Listing published');
      router.replace(`/properties/${saved._id}`);
    } catch (err) {
      toast.error(err.message);
    }
  });

  if (loading) {
    return (
      <Screen header={<DetailHeader title="Edit listing" fallback="/my-listings" />}>
        <LoadingList rows={4} card={60} />
      </Screen>
    );
  }
  if (loadError) {
    return (
      <Screen header={<DetailHeader title="Edit listing" fallback="/my-listings" />}>
        <ErrorState error={loadError} onRetry={loadExisting} />
      </Screen>
    );
  }

  const numeric = (k) => (v) => set(k)(v.replace(/[^\d]/g, ''));
  return (
    <Screen header={<DetailHeader title={id ? 'Edit property' : 'List a property'} fallback="/properties" />} footer={<Button title={id ? 'Save changes' : 'Publish listing'} icon="checkmark" onPress={save} loading={busy} />}>
      <PillToggle options={[{ value: 'rent', label: 'For rent' }, { value: 'sale', label: 'For sale' }]} value={f.listingType} onChange={set('listingType')} />
      <SectionTitle title="Property type" />
      <Chips options={TYPES} value={f.propertyType} onChange={set('propertyType')} />
      <Field label="Listing title" value={f.title} onChangeText={set('title')} maxLength={140} placeholder="e.g. Spacious 2BHK near Salt Lake Sector V" error={errors.title} />
      <Field label={f.listingType === 'rent' ? 'Monthly rent (₹)' : 'Price (₹)'} value={f.price} onChangeText={(v) => set('price')(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" placeholder="e.g. 15000" error={errors.price} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Field label="Bedrooms" value={f.bedrooms} onChangeText={numeric('bedrooms')} keyboardType="number-pad" maxLength={2} style={{ flex: 1 }} />
        <Field label="Bathrooms" value={f.bathrooms} onChangeText={numeric('bathrooms')} keyboardType="number-pad" maxLength={2} style={{ flex: 1 }} />
        <Field label="Area (sq ft)" value={f.areaSqft} onChangeText={numeric('areaSqft')} keyboardType="number-pad" maxLength={7} error={errors.areaSqft} style={{ flex: 1.2 }} />
      </View>
      <SectionTitle title="Furnishing" />
      <Chips options={FURNISH} value={f.furnishing} onChange={set('furnishing')} />
      <Field label="Description" value={f.description} onChangeText={set('description')} multiline maxLength={5000} placeholder="Highlights, amenities, availability date, preferred tenants…" />
      <SectionTitle title="Location" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Field label="Locality" value={f.locality} onChangeText={set('locality')} maxLength={120} style={{ flex: 1 }} />
        <Field label="City" value={f.city} onChangeText={set('city')} maxLength={80} error={errors.city} style={{ flex: 1 }} />
      </View>
      <Field label="Address (optional)" value={f.address} onChangeText={set('address')} maxLength={300} />
      <SectionTitle title="Photos" />
      <AttachmentPicker value={photos} onChange={setPhotos} purpose="property" max={10} label="Add property photos" />
      <SectionTitle title="Contact" />
      <Field label="Contact name" value={f.contactName} onChangeText={set('contactName')} maxLength={120} />
      <Field label="Contact mobile" prefix="+91" value={f.contactPhone} onChangeText={(v) => set('contactPhone')(phoneInput(v))} keyboardType="number-pad" maxLength={PHONE_INPUT_MAX} error={errors.contactPhone} />
      <ToggleRow label="Available on WhatsApp" value={f.whatsappAvailable} onChange={set('whatsappAvailable')} />
      {!id && isMember ? <ToggleRow label="Show my society name on this listing" value={f.linkToMySociety} onChange={set('linkToMySociety')} /> : null}
      <Hint>Listings are reviewed by moderators before they appear to others.</Hint>
    </Screen>
  );
}
