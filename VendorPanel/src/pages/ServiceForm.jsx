import { useCallback, useEffect, useId, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { commissionPercentOf, useConfig } from '../lib/config.js';
import { useAction, useQuery, useTitle } from '../lib/hooks.js';
import { OFFER_PRICE_TYPES, paiseToRupeesInput, toPaise } from '../lib/format.js';
import { focusFirstError, normalizePhone, phoneError, phoneInput, PHONE_INPUT_MAX, rupeeError } from '../lib/validation.js';
import { Alert, Button, Card, ErrorState, Icon, PageHeader, PageSkeleton } from '../components/ui.jsx';
import { Field, Input, PhotoUploader, Segmented, Select, Textarea, Toggle } from '../components/Form.jsx';
import { CommissionBreakdown } from '../components/Pricing.jsx';
import { useToast } from '../components/Toast.jsx';
import { useCounts } from '../layout/counts.js';

const MAX_PRICE_RUPEES = 1000000; // mirrors the API limit (₹10,00,000)
const SERVER_FIELD = { pricePaise: 'price', experienceYears: 'experience' };

/** Create (/services/new) or edit (/services/:id/edit) a service offer. Saving sends it for review. */
export default function ServiceForm() {
  const { id } = useParams();
  useTitle(id ? 'Edit service' : 'Add service');
  const existing = useQuery(() => (id ? api.get(`/service-offers/${id}`) : Promise.resolve(null)), [id]);
  const back = (
    <Link to="/services" className="mb-1 inline-flex min-h-[40px] items-center gap-1.5 text-xs font-semibold text-azea-purple hover:underline">
      <Icon name="fa-solid fa-arrow-left" className="text-[10px]" /> Services
    </Link>
  );
  if (id && existing.loading && !existing.data) return <PageSkeleton rows={6} />;
  if (id && existing.error && !existing.data)
    return (
      <div>
        <PageHeader title="Edit service" back={back} />
        <div className="card">
          <ErrorState error={existing.error} onRetry={existing.reload} />
        </div>
      </div>
    );
  return <OfferForm key={id || 'new'} id={id} offer={existing.data} back={back} />;
}

function OfferForm({ id, offer, back }) {
  const { user, vendor } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { refreshCounts } = useCounts();
  const cats = useQuery(() => api.get('/public/categories', { kind: 'service' }, { auth: false }));
  // Current platform commission (Master Admin → Settings); saving publishes the service at this rate.
  const config = useConfig({ fresh: true });
  const commissionPercent = commissionPercentOf(config.data);
  const ids = { category: useId(), title: useId(), description: useId(), price: useId(), experience: useId(), city: useId(), area: useId(), availability: useId(), contactName: useId(), contactPhone: useId() };
  const [f, setF] = useState(() =>
    offer
      ? {
          categoryId: offer.category?._id || '',
          title: offer.title,
          description: offer.description || '',
          priceType: offer.priceType,
          price: offer.pricePaise ? paiseToRupeesInput(offer.pricePaise) : '',
          experience: offer.experienceYears !== undefined && offer.experienceYears !== null ? String(offer.experienceYears) : '',
          serviceArea: offer.serviceArea || '',
          city: offer.city || '',
          availabilityNote: offer.availabilityNote || '',
          contactName: offer.contactName || '',
          contactPhone: offer.contactPhone || '',
          whatsappAvailable: offer.whatsappAvailable !== false,
        }
      : { categoryId: '', title: '', description: '', priceType: 'fixed', price: '', experience: '', serviceArea: '', city: user?.city || '', availabilityNote: '', contactName: vendor?.businessName || user?.name || '', contactPhone: user?.phone || '', whatsappAvailable: true },
  );
  const [photos, setPhotos] = useState(() => (offer?.photos || []).map((p) => ({ ...p })));
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState(null);
  const set = (k) => (v) => (setF((x) => ({ ...x, [k]: v })), setErrors((e) => ({ ...e, [k]: undefined })));
  const onQuote = f.priceType === 'on_quote';
  const pricePaise = onQuote ? 0 : toPaise(f.price) || 0;

  // A category that the platform switched off is still shown for an existing service.
  const categories = cats.data?.items || [];
  const knownCategory = !f.categoryId || categories.some((c) => c._id === f.categoryId);
  useEffect(() => {
    if (cats.data && !f.categoryId && categories.length === 1) set('categoryId')(categories[0]._id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cats.data]);

  const validate = () => {
    const exp = f.experience === '' ? null : Number(f.experience);
    const e = {
      categoryId: f.categoryId ? null : 'Choose a category',
      title: f.title.trim().length < 5 ? 'Describe the service in at least 5 characters' : null,
      price: onQuote ? null : rupeeError(f.price, { label: 'the price in rupees', max: MAX_PRICE_RUPEES }),
      experience: exp !== null && (!Number.isInteger(exp) || exp < 0 || exp > 60) ? 'Enter years between 0 and 60' : null,
      city: f.city.trim().length < 2 ? 'Enter the city you work in' : null,
      contactPhone: phoneError(f.contactPhone, 'contact mobile'),
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
        categoryId: f.categoryId,
        title: f.title.trim(),
        description: f.description.trim(),
        priceType: f.priceType,
        pricePaise: onQuote ? null : toPaise(f.price),
        experienceYears: f.experience === '' ? null : Number(f.experience),
        serviceArea: f.serviceArea.trim(),
        city: f.city.trim(),
        availabilityNote: f.availabilityNote.trim(),
        contactName: f.contactName.trim(),
        contactPhone: normalizePhone(f.contactPhone),
        whatsappAvailable: f.whatsappAvailable,
        photos: photos.map((p) => p._id),
      };
      try {
        return id ? await api.patch(`/service-offers/${id}`, body) : await api.post('/service-offers', body);
      } catch (err) {
        if (Array.isArray(err.details) && err.details.length) setErrors(Object.fromEntries(err.details.map((d) => [SERVER_FIELD[d.path] || d.path, d.message])));
        setServerError(err);
        throw err;
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [f, photos, id, onQuote]),
    {
      toast,
      success: (saved) => (saved?.moderationStatus === 'pending' ? 'Service saved — sent for review' : 'Service saved and live'),
      onDone: () => (refreshCounts(), navigate('/services')),
    },
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      noValidate
      data-testid="service-form"
    >
      <PageHeader title={id ? 'Edit service' : 'Add a service'} subtitle="Members see this in Home Maintenance once NIVASA approves it." back={back} />
      {serverError && !Object.keys(errors).length && (
        <Alert tone="danger" title={serverError.code === 'OFFER_LIMIT' ? 'Service limit reached' : serverError.code === 'KYC_REQUIRED' ? 'KYC needed' : 'Could not save'} className="mb-5">
          {serverError.message}
        </Alert>
      )}
      {id && offer?.moderationStatus === 'approved' && (
        <Alert tone="info" className="mb-5">
          Changing the details sends the service for review again and applies the current commission rate ({commissionPercent}%).
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2 lg:row-start-1" title="About the service">
            <div className="space-y-4">
              <Field label="Category" error={errors.categoryId} htmlFor={ids.category} required hint={cats.error ? cats.error.message : undefined}>
                <Select id={ids.category} name="categoryId" value={f.categoryId} onChange={(e) => set('categoryId')(e.target.value)} invalid={Boolean(errors.categoryId)} disabled={cats.loading && !cats.data}>
                  <option value="">{cats.loading && !cats.data ? 'Loading categories…' : categories.length ? 'Choose a category' : 'No categories yet'}</option>
                  {!knownCategory && <option value={f.categoryId}>{offer?.category?.name || 'Current category'}</option>}
                  {categories.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="What service do you offer?" error={errors.title} htmlFor={ids.title} required>
                <Input id={ids.title} name="title" value={f.title} onChange={(e) => set('title')(e.target.value)} maxLength={140} invalid={Boolean(errors.title)} placeholder="e.g. Leak repair & bathroom fittings" />
              </Field>
              <Field label="Details (optional)" htmlFor={ids.description} error={errors.description}>
                <Textarea id={ids.description} name="description" rows={4} value={f.description} onChange={(e) => set('description')(e.target.value)} maxLength={3000} placeholder="What you do, tools you bring, warranty, languages…" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Experience in years (optional)" error={errors.experience} htmlFor={ids.experience}>
                  <Input id={ids.experience} name="experience" inputMode="numeric" value={f.experience} onChange={(e) => set('experience')(e.target.value.replace(/\D/g, '').slice(0, 2))} maxLength={2} invalid={Boolean(errors.experience)} placeholder="e.g. 5" />
                </Field>
                <Field label="City" error={errors.city} htmlFor={ids.city} required>
                  <Input id={ids.city} name="city" value={f.city} onChange={(e) => set('city')(e.target.value)} maxLength={80} invalid={Boolean(errors.city)} placeholder="e.g. Pune" />
                </Field>
              </div>
              <Field label="Areas you cover (optional)" htmlFor={ids.area}>
                <Input id={ids.area} name="serviceArea" value={f.serviceArea} onChange={(e) => set('serviceArea')(e.target.value)} maxLength={200} placeholder="e.g. Baner, Aundh, Wakad" />
              </Field>
              <Field label="When are you available? (optional)" htmlFor={ids.availability}>
                <Input id={ids.availability} name="availabilityNote" value={f.availabilityNote} onChange={(e) => set('availabilityNote')(e.target.value)} maxLength={120} placeholder="e.g. Mon–Sat, 9 AM–7 PM" />
              </Field>
            </div>
          </Card>
          <Card className="self-start lg:col-start-3 lg:row-span-3 lg:row-start-1" title="Pricing">
            <div className="space-y-4">
              <Segmented name="priceType" label="Price type" options={OFFER_PRICE_TYPES} value={f.priceType} onChange={set('priceType')} />
              {!onQuote && (
                <Field label="Price (₹)" error={errors.price} htmlFor={ids.price} required hint="Up to ₹10,00,000">
                  <Input id={ids.price} name="price" prefix="₹" inputMode="decimal" value={f.price} onChange={(e) => set('price')(e.target.value.replace(/[^\d.]/g, ''))} maxLength={10} invalid={Boolean(errors.price)} placeholder="e.g. 499" />
                </Field>
              )}
              {config.error && !config.data ? <Alert tone="warning">Couldn’t load the current commission rate: {config.error.message}</Alert> : <CommissionBreakdown pricePaise={pricePaise} percent={commissionPercent} onQuote={onQuote} />}
            </div>
          </Card>
          <Card className="lg:col-span-2 lg:row-start-2" title="Photos of your work (optional)">
            <PhotoUploader value={photos} onChange={setPhotos} purpose="service" max={6} label="Add photos" testId="service-photos" />
          </Card>
          <Card className="lg:col-span-2 lg:row-start-3" title="Contact shown to customers">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name shown to customers" htmlFor={ids.contactName}>
                  <Input id={ids.contactName} name="contactName" value={f.contactName} onChange={(e) => set('contactName')(e.target.value)} maxLength={120} placeholder="e.g. Ravi Plumbing" />
                </Field>
                <Field label="Contact mobile" error={errors.contactPhone} htmlFor={ids.contactPhone} required>
                  <Input id={ids.contactPhone} name="contactPhone" prefix="+91" type="tel" inputMode="numeric" value={f.contactPhone} onChange={(e) => set('contactPhone')(phoneInput(e.target.value))} maxLength={PHONE_INPUT_MAX} invalid={Boolean(errors.contactPhone)} placeholder="98765 43210" />
                </Field>
              </div>
              <Toggle label="Available on WhatsApp" description="Customers can message you on this number." checked={f.whatsappAvailable} onChange={set('whatsappAvailable')} name="whatsappAvailable" />
              <p className="text-[11px] leading-relaxed text-azea-muted">Your phone number is shown to members who can see this service. You can list up to 10 services.</p>
            </div>
          </Card>
          <div className="flex flex-col gap-2 sm:flex-row-reverse sm:items-center lg:col-span-3 lg:row-start-4">
            <Button type="submit" size="lg" icon="fa-solid fa-check" loading={busy} data-testid="service-save">
              {id ? 'Save changes' : 'Submit for review'}
            </Button>
            <Link to="/services" className="inline-flex min-h-[40px] items-center justify-center rounded-lg text-xs font-semibold text-gray-500 hover:text-azea-purple">
              Cancel
            </Link>
          </div>
      </div>
    </form>
  );
}
