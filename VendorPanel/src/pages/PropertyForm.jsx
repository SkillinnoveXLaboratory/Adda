import { useCallback, useId, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useAction, useQuery, useTitle } from '../lib/hooks.js';
import { FURNISHING, paiseToRupeesInput, PROPERTY_TYPES, toPaise } from '../lib/format.js';
import { focusFirstError, normalizePhone, phoneError, phoneInput, PHONE_INPUT_MAX, rupeeError } from '../lib/validation.js';
import { Alert, Button, Card, ErrorState, Icon, PageHeader, PageSkeleton } from '../components/ui.jsx';
import { Field, Input, PhotoUploader, Segmented, Select, Textarea, Toggle } from '../components/Form.jsx';
import { useToast } from '../components/Toast.jsx';
import { useCounts } from '../layout/counts.js';

const int = (v) => (v === '' || v === undefined ? undefined : Number(v));

/** Create (/properties/new) or edit (/properties/:id/edit) a property listing. Content edits go back to review. */
export default function PropertyForm() {
  const { id } = useParams();
  useTitle(id ? 'Edit property' : 'List a property');
  const existing = useQuery(() => (id ? api.get(`/properties/${id}`) : Promise.resolve(null)), [id]);
  const back = (
    <Link to="/properties" className="mb-1 inline-flex min-h-[40px] items-center gap-1.5 text-xs font-semibold text-azea-purple hover:underline">
      <Icon name="fa-solid fa-arrow-left" className="text-[10px]" /> Properties
    </Link>
  );
  if (id && existing.loading && !existing.data) return <PageSkeleton rows={6} />;
  if (id && existing.error && !existing.data)
    return (
      <div>
        <PageHeader title="Edit property" back={back} />
        <div className="card">
          <ErrorState error={existing.error} onRetry={existing.reload} />
        </div>
      </div>
    );
  return <ListingForm key={id || 'new'} id={id} listing={existing.data} back={back} />;
}

function ListingForm({ id, listing: d, back }) {
  const { user, vendor } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { refreshCounts } = useCounts();
  const ids = { title: useId(), price: useId(), bedrooms: useId(), bathrooms: useId(), area: useId(), furnishing: useId(), description: useId(), locality: useId(), city: useId(), address: useId(), contactName: useId(), contactPhone: useId() };
  const [f, setF] = useState(() =>
    d
      ? { listingType: d.listingType, propertyType: d.propertyType, title: d.title, description: d.description || '', price: paiseToRupeesInput(d.pricePaise), areaSqft: d.areaSqft ? String(d.areaSqft) : '', bedrooms: String(d.bedrooms ?? ''), bathrooms: String(d.bathrooms ?? ''), furnishing: d.furnishing || '', locality: d.locality || '', city: d.city || '', address: d.address || '', contactName: d.contactName || '', contactPhone: d.contactPhone || '', whatsappAvailable: d.whatsappAvailable !== false }
      : { listingType: 'rent', propertyType: 'apartment', title: '', description: '', price: '', areaSqft: '', bedrooms: '', bathrooms: '', furnishing: '', locality: '', city: user?.city || '', address: '', contactName: vendor?.businessName || user?.name || '', contactPhone: user?.phone || '', whatsappAvailable: true },
  );
  const [photos, setPhotos] = useState(() => (d?.photos || []).map((p) => ({ ...p })));
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState(null);
  const set = (k) => (v) => (setF((x) => ({ ...x, [k]: v })), setErrors((e) => ({ ...e, [k]: undefined })));
  const numeric = (k, max) => (e) => set(k)(e.target.value.replace(/\D/g, '').slice(0, max));

  const validate = () => {
    const e = {
      title: f.title.trim().length < 5 ? 'Title needs at least 5 characters' : null,
      price: rupeeError(f.price, { label: f.listingType === 'rent' ? 'the monthly rent' : 'the price' }),
      city: f.city.trim().length < 2 ? 'Enter the city' : null,
      contactPhone: phoneError(f.contactPhone, 'contact mobile'),
      areaSqft: f.areaSqft && !(Number(f.areaSqft) > 0) ? 'Enter the area in square feet' : null,
    };
    Object.keys(e).forEach((k) => !e[k] && delete e[k]);
    setErrors(e);
    return e;
  };

  const [save, busy] = useAction(
    useCallback(async () => {
      const e = validate();
      if (Object.keys(e).length) {
        focusFirstError(e);
        throw new Error('Please fix the highlighted fields');
      }
      setServerError(null);
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
      };
      try {
        return id ? await api.patch(`/properties/${id}`, body) : await api.post('/properties', body);
      } catch (err) {
        if (Array.isArray(err.details) && err.details.length) setErrors(Object.fromEntries(err.details.map((x) => [x.path === 'pricePaise' ? 'price' : x.path, x.message])));
        setServerError(err);
        throw err;
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [f, photos, id]),
    { toast, success: (saved) => (saved?.moderationStatus === 'pending' ? 'Listing saved — sent for review' : 'Listing published'), onDone: () => (refreshCounts(), navigate('/properties')) },
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      noValidate
      data-testid="property-form"
    >
      <PageHeader title={id ? 'Edit property' : 'List a property'} subtitle="Members browse properties in the NIVASA app once NIVASA approves the listing." back={back} />
      {serverError && !Object.keys(errors).length && (
        <Alert tone="danger" title={serverError.code === 'KYC_REQUIRED' ? 'KYC needed' : 'Could not save'} className="mb-5">
          {serverError.message}
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Property">
            <div className="space-y-4">
              <Segmented
                name="listingType"
                label="Listing type"
                options={[
                  { value: 'rent', label: 'For rent' },
                  { value: 'sale', label: 'For sale' },
                ]}
                value={f.listingType}
                onChange={set('listingType')}
              />
              <Segmented name="propertyType" label="Property type" options={PROPERTY_TYPES} value={f.propertyType} onChange={set('propertyType')} />
              <Field label="Listing title" error={errors.title} htmlFor={ids.title} required>
                <Input id={ids.title} name="title" value={f.title} onChange={(e) => set('title')(e.target.value)} maxLength={140} invalid={Boolean(errors.title)} placeholder="e.g. Spacious 2BHK near Baner main road" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Bedrooms" htmlFor={ids.bedrooms}>
                  <Input id={ids.bedrooms} name="bedrooms" inputMode="numeric" value={f.bedrooms} onChange={numeric('bedrooms', 2)} maxLength={2} placeholder="e.g. 2" />
                </Field>
                <Field label="Bathrooms" htmlFor={ids.bathrooms}>
                  <Input id={ids.bathrooms} name="bathrooms" inputMode="numeric" value={f.bathrooms} onChange={numeric('bathrooms', 2)} maxLength={2} placeholder="e.g. 2" />
                </Field>
                <Field label="Area (sq ft)" error={errors.areaSqft} htmlFor={ids.area}>
                  <Input id={ids.area} name="areaSqft" inputMode="numeric" value={f.areaSqft} onChange={numeric('areaSqft', 7)} maxLength={7} invalid={Boolean(errors.areaSqft)} placeholder="e.g. 950" />
                </Field>
              </div>
              <Field label="Furnishing" htmlFor={ids.furnishing}>
                <Select id={ids.furnishing} name="furnishing" value={f.furnishing} onChange={(e) => set('furnishing')(e.target.value)}>
                  {FURNISHING.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Description (optional)" htmlFor={ids.description}>
                <Textarea id={ids.description} name="description" rows={4} value={f.description} onChange={(e) => set('description')(e.target.value)} maxLength={5000} placeholder="Highlights, amenities, availability date, preferred tenants…" />
              </Field>
            </div>
          </Card>
          <Card title="Location">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Locality (optional)" htmlFor={ids.locality}>
                  <Input id={ids.locality} name="locality" value={f.locality} onChange={(e) => set('locality')(e.target.value)} maxLength={120} placeholder="e.g. Baner" />
                </Field>
                <Field label="City" error={errors.city} htmlFor={ids.city} required>
                  <Input id={ids.city} name="city" value={f.city} onChange={(e) => set('city')(e.target.value)} maxLength={80} invalid={Boolean(errors.city)} placeholder="e.g. Pune" />
                </Field>
              </div>
              <Field label="Address (optional)" htmlFor={ids.address}>
                <Input id={ids.address} name="address" value={f.address} onChange={(e) => set('address')(e.target.value)} maxLength={300} placeholder="Building, street" />
              </Field>
            </div>
          </Card>
          <Card title="Photos">
            <PhotoUploader value={photos} onChange={setPhotos} purpose="property" max={10} label="Add property photos" testId="property-photos" />
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Price">
            <Field label={f.listingType === 'rent' ? 'Monthly rent (₹)' : 'Price (₹)'} error={errors.price} htmlFor={ids.price} required>
              <Input id={ids.price} name="price" prefix="₹" inputMode="decimal" value={f.price} onChange={(e) => set('price')(e.target.value.replace(/[^\d.]/g, ''))} maxLength={12} invalid={Boolean(errors.price)} placeholder={f.listingType === 'rent' ? 'e.g. 15000' : 'e.g. 4500000'} />
            </Field>
            <p className="mt-3 text-[11px] leading-relaxed text-azea-muted">No commission is charged on property listings.</p>
          </Card>
          <Card title="Contact">
            <div className="space-y-4">
              <Field label="Contact name" htmlFor={ids.contactName}>
                <Input id={ids.contactName} name="contactName" value={f.contactName} onChange={(e) => set('contactName')(e.target.value)} maxLength={120} placeholder="e.g. Ravi Kumar" />
              </Field>
              <Field label="Contact mobile" error={errors.contactPhone} htmlFor={ids.contactPhone} required>
                <Input id={ids.contactPhone} name="contactPhone" prefix="+91" type="tel" inputMode="numeric" value={f.contactPhone} onChange={(e) => set('contactPhone')(phoneInput(e.target.value))} maxLength={PHONE_INPUT_MAX} invalid={Boolean(errors.contactPhone)} placeholder="98765 43210" />
              </Field>
              <Toggle label="Available on WhatsApp" checked={f.whatsappAvailable} onChange={set('whatsappAvailable')} name="whatsappAvailable" />
            </div>
          </Card>
          <div className="flex flex-col gap-2">
            <Button type="submit" size="lg" icon="fa-solid fa-check" loading={busy} data-testid="property-save">
              {id ? 'Save changes' : 'Submit for review'}
            </Button>
            <Link to="/properties" className="inline-flex min-h-[40px] items-center justify-center rounded-lg text-xs font-semibold text-gray-500 hover:text-azea-purple">
              Cancel
            </Link>
          </div>
        </div>
      </div>
    </form>
  );
}
