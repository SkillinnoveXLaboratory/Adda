import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { AttachmentPicker } from '../../../components/AttachmentPicker';
import { KycStatusCard } from '../../../components/KycStatusCard';
import { ProductPricePreview, stockBadge } from '../../../components/VendorProductCard';
import { AsyncView, Badge, Button, Card, Chips, DetailHeader, ErrorState, Field, Hint, LoadingList, PillToggle, Screen, SectionTitle, T, ToggleRow, returnTo } from '../../../components/ui';
import { useAuth } from '../../../context/auth';
import { useToast } from '../../../context/toast';
import { useAction, useApi } from '../../../hooks/useApi';
import { api } from '../../../lib/api';
import { confirm } from '../../../lib/dialog';
import { money, toPaise } from '../../../lib/format';
import { rupeeError } from '../../../lib/validation';
import { colors } from '../../../theme';

// Mirrors the API limits (skills/vendor-products rule 2).
const MAX_PRICE_PAISE = 1_00_00_000_00; // ₹1,00,00,000
const MAX_DELIVERY_PAISE = 1_00_000_00; // ₹1,00,000
const LIST = '/vendor-listings?tab=product';
const FIELD_OF = { pricePaise: 'price', deliveryChargePaise: 'deliveryCharge', photos: 'photos' };
const STATUS_OPTIONS = [
  { value: 'active', label: 'Active (on sale)' },
  { value: 'paused', label: 'Paused (hidden)' },
];

const EMPTY = { categoryId: '', title: '', description: '', price: '', unit: '', stock: '', maxPerOrder: '10', delivery: true, deliveryCharge: '', pickup: false, status: 'active' };
const rupees = (paise) => (paise ? String(paise / 100) : '');
const digits = (v) => v.replace(/[^\d]/g, '');
const decimal = (v) => v.replace(/[^\d.]/g, '');

/**
 * Add or edit a product (?id= to edit). KYC-approved vendors only (server: 403 KYC_REQUIRED).
 * The price typed is what members see and pay per unit, in ₹ (sent as integer paise); NIVASA's fee comes out of it.
 * Products take the shop location (Shop settings) for members' "Near me".
 */
export default function ProductForm() {
  const { vendor } = useAuth();
  const { id } = useLocalSearchParams();
  if (vendor?.kycStatus !== 'approved') {
    return (
      <Screen header={<DetailHeader title={id ? 'Edit product' : 'Add a product'} fallback={LIST} />}>
        <KycStatusCard status={vendor?.kycStatus} note={vendor?.kycNote} />
        <Hint>Only vendors with approved KYC can sell products.</Hint>
      </Screen>
    );
  }
  return <VendorProductForm id={id} />;
}

function VendorProductForm({ id }) {
  const toast = useToast();
  const cats = useApi('/products/categories', { refetchOnFocus: false });
  const profile = useApi('/vendor/profile', { refetchOnFocus: false });
  const [loading, setLoading] = useState(!!id);
  const [loadError, setLoadError] = useState(null);
  const [saved, setSaved] = useState(null); // owner view of the product being edited
  const [f, setF] = useState(EMPTY);
  const [photos, setPhotos] = useState([]);
  const [errors, setErrors] = useState({});
  const set = (k) => (v) => {
    setF((x) => ({ ...x, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: null }));
  };

  const applyExisting = (d) => {
    setSaved(d);
    setF({
      categoryId: d.category?._id || '',
      title: d.title || '',
      description: d.description || '',
      price: rupees(d.pricePaise),
      unit: d.unit || '',
      stock: String(d.stock ?? ''),
      maxPerOrder: String(d.maxPerOrder ?? 10),
      delivery: !!d.delivery,
      deliveryCharge: rupees(d.deliveryChargePaise),
      pickup: !!d.pickup,
      status: d.status === 'paused' ? 'paused' : 'active',
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
    api(`/products/${id}`).then(applyExisting, failLoad);
  };
  useEffect(() => {
    if (!id) return undefined;
    let alive = true;
    api(`/products/${id}`).then((d) => alive && applyExisting(d), (e) => alive && failLoad(e));
    return () => {
      alive = false;
    };
  }, [id]);

  const pricePaise = Number(f.price) > 0 ? toPaise(f.price) : 0;
  const deliveryPaise = f.delivery && Number(f.deliveryCharge) > 0 ? toPaise(f.deliveryCharge) : 0;

  const validate = () => {
    const stock = f.stock === '' ? NaN : Number(f.stock);
    const max = Number(f.maxPerOrder);
    let priceErr = rupeeError(f.price);
    if (!priceErr && toPaise(f.price) < 100) priceErr = 'Price must be at least ₹1';
    if (!priceErr && toPaise(f.price) > MAX_PRICE_PAISE) priceErr = 'Maximum ₹1,00,00,000';
    let deliveryErr = null;
    if (f.delivery && f.deliveryCharge !== '') {
      const n = Number(f.deliveryCharge);
      if (!Number.isFinite(n) || n < 0) deliveryErr = 'Enter a delivery charge in ₹, or leave it empty for free delivery';
      else if (toPaise(f.deliveryCharge) > MAX_DELIVERY_PAISE) deliveryErr = 'Maximum ₹1,00,000';
    }
    return {
      categoryId: f.categoryId ? null : 'Choose a category',
      title: f.title.trim().length < 2 ? 'Name the product (at least 2 characters)' : null,
      price: priceErr,
      stock: !Number.isInteger(stock) || stock < 0 || stock > 100000 ? 'Enter how many you have, 0 to 1,00,000' : null,
      maxPerOrder: !Number.isInteger(max) || max < 1 || max > 100 ? 'Enter 1 to 100' : null,
      delivery: !f.delivery && !f.pickup ? 'Offer delivery, pickup or both' : null,
      deliveryCharge: deliveryErr,
    };
  };

  const [save, busy] = useAction(async () => {
    const e = validate();
    setErrors(e);
    if (Object.values(e).some(Boolean)) return toast.error(e.categoryId || e.delivery || 'Please fix the highlighted fields');
    const body = {
      categoryId: f.categoryId,
      title: f.title.trim(),
      description: f.description.trim(),
      photos: photos.map((p) => p._id),
      pricePaise: toPaise(f.price),
      unit: f.unit.trim(),
      stock: Number(f.stock),
      maxPerOrder: Number(f.maxPerOrder),
      delivery: f.delivery,
      pickup: f.pickup,
      deliveryChargePaise: f.delivery ? (f.deliveryCharge === '' ? 0 : toPaise(f.deliveryCharge)) : 0,
      status: f.status,
    };
    // PATCH only what changed: any title/description/unit/photos/category key sends the product back to review.
    let payload = body;
    if (saved) {
      const before = {
        categoryId: saved.category?._id || '',
        title: saved.title || '',
        description: saved.description || '',
        photos: (saved.photos || []).map((p) => p._id),
        pricePaise: saved.pricePaise,
        unit: saved.unit || '',
        stock: saved.stock,
        maxPerOrder: saved.maxPerOrder,
        delivery: !!saved.delivery,
        pickup: !!saved.pickup,
        deliveryChargePaise: saved.deliveryChargePaise || 0,
        status: saved.status,
      };
      payload = Object.fromEntries(Object.entries(body).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(before[k])));
      if (!Object.keys(payload).length) {
        toast.success('No changes to save');
        return returnTo(LIST);
      }
    }
    try {
      const out = await api(id ? `/products/${id}` : '/products', { method: id ? 'PATCH' : 'POST', body: payload });
      toast.success(out.moderationStatus === 'pending' ? 'Saved. NIVASA reviews it before members see it.' : id ? 'Product saved' : 'Product listed');
      returnTo(LIST);
    } catch (err) {
      if (err.details?.length) {
        setErrors(Object.fromEntries(err.details.map((d) => [FIELD_OF[d.path] || d.path, d.message])));
        toast.error(err.message);
      } else toast.error(err.message); // KYC_REQUIRED, PRODUCT_LIMIT, …
    }
    return undefined;
  });

  const [remove, removing] = useAction(async () => {
    const ok = await confirm({ title: 'Delete this product?', message: 'Members will no longer see it. Orders already placed are not affected.', confirmText: 'Delete', destructive: true });
    if (!ok) return;
    try {
      await api(`/products/${id}`, { method: 'DELETE' });
      toast.success('Product deleted');
      returnTo(LIST);
    } catch (err) {
      toast.error(err.message);
    }
  });

  const header = <DetailHeader title={id ? 'Edit product' : 'Add a product'} fallback={LIST} />;
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
  const stock = saved ? stockBadge(saved.stock) : null;
  const shopLocation = profile.data?.shop?.location;
  const payout = profile.data?.payout;

  return (
    <Screen header={header} footer={<Button title={id ? 'Save changes' : 'Add product'} icon="checkmark" onPress={save} loading={busy} disabled={removing} testID="product-save" />}>
      {saved ? (
        <Card style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {saved.moderationStatus === 'pending' ? <Badge label="In review" tone="warning" /> : saved.moderationStatus === 'rejected' ? <Badge label="Rejected" tone="danger" /> : <Badge label="Approved" tone="success" />}
            <Badge label={saved.status === 'paused' ? 'Paused' : 'Active'} tone={saved.status === 'paused' ? 'neutral' : 'info'} />
            {stock ? <Badge label={stock.label} tone={stock.tone} /> : null}
          </View>
          <T size={12} color={colors.textSoft}>
            {saved.moderationStatus === 'pending'
              ? 'NIVASA is reviewing this product. Members see it once it is approved.'
              : saved.moderationStatus === 'rejected'
                ? `Not approved${saved.moderationNote ? `: ${saved.moderationNote}` : '.'} Fix it and save to send it for review again.`
                : 'Approved. Changing the name, details, unit, photos or category sends it for review again; price, stock and status don’t.'}
          </T>
          {saved.pricing?.memberPricePaise != null ? (
            <T size={12} color={colors.muted}>
              Members now see {money(saved.pricing.memberPricePaise)} per unit.
            </T>
          ) : null}
        </Card>
      ) : null}

      <SectionTitle title="Category" />
      <AsyncView state={cats} skeleton={<LoadingList rows={1} card={36} />} empty={{ when: (d) => !d.items.length, icon: 'cube-outline', title: 'No product categories yet', message: 'NIVASA has not added product categories yet. Please try later.' }}>
        {(d) => (
          <View style={{ gap: 6 }}>
            <Chips options={d.items.map((c) => ({ value: c._id, label: c.name }))} value={f.categoryId} onChange={set('categoryId')} />
            {errors.categoryId ? (
              <T size={12} color={colors.danger}>
                {errors.categoryId}
              </T>
            ) : null}
          </View>
        )}
      </AsyncView>
      <Field label="Product name" value={f.title} onChangeText={set('title')} maxLength={140} placeholder="e.g. Organic basmati rice" error={errors.title} testID="product-title" />
      <Field label="Details (optional)" value={f.description} onChangeText={set('description')} multiline maxLength={3000} placeholder="What it is, brand, size, freshness, warranty…" error={errors.description} />

      <SectionTitle title="Photos (up to 6)" />
      <AttachmentPicker value={photos} onChange={setPhotos} purpose="product" max={6} label="Add photos" />
      {errors.photos ? (
        <T size={12} color={colors.danger}>
          {errors.photos}
        </T>
      ) : null}

      <SectionTitle title="Price & stock" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Field label="Your price (₹)" value={f.price} onChangeText={(v) => set('price')(decimal(v))} keyboardType="decimal-pad" maxLength={12} placeholder="e.g. 250" error={errors.price} style={{ flex: 1 }} testID="product-price" />
        <Field label="Unit (optional)" value={f.unit} onChangeText={set('unit')} maxLength={40} placeholder="e.g. 1 kg" error={errors.unit} style={{ flex: 1 }} />
      </View>
      {profile.data || profile.error ? <ProductPricePreview pricePaise={pricePaise} deliveryChargePaise={deliveryPaise} rates={profile.data?.pricing} saved={saved?.pricing} /> : <LoadingList rows={1} card={70} />}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Field label="In stock" value={f.stock} onChangeText={(v) => set('stock')(digits(v))} keyboardType="number-pad" maxLength={6} placeholder="e.g. 20" error={errors.stock} style={{ flex: 1 }} testID="product-stock" />
        <Field label="Max per order" value={f.maxPerOrder} onChangeText={(v) => set('maxPerOrder')(digits(v))} keyboardType="number-pad" maxLength={3} placeholder="10" error={errors.maxPerOrder} style={{ flex: 1 }} />
      </View>
      {f.stock === '0' ? <Hint tone="amber">With 0 in stock members see the product as out of stock and can’t order it.</Hint> : null}

      <SectionTitle title="Delivery & pickup" />
      <ToggleRow label="I deliver to the customer" value={f.delivery} onChange={set('delivery')} />
      {f.delivery ? (
        <Field label="Delivery charge per order (₹, optional)" value={f.deliveryCharge} onChangeText={(v) => set('deliveryCharge')(decimal(v))} keyboardType="decimal-pad" maxLength={9} placeholder="0 = free delivery" error={errors.deliveryCharge} hint="You keep the delivery charge. NIVASA takes no fee on it." />
      ) : null}
      <ToggleRow label="Customer can pick up from my shop" value={f.pickup} onChange={set('pickup')} />
      {errors.delivery ? (
        <T size={12} color={colors.danger}>
          {errors.delivery}
        </T>
      ) : null}

      <SectionTitle title="Status" />
      <PillToggle options={STATUS_OPTIONS} value={f.status} onChange={set('status')} />

      {profile.data && !shopLocation ? (
        <Hint tone="amber" icon="location-outline">
          Your shop has no location yet, so this product won’t show in members’ “Near me” search. Add it in Shop settings.
        </Hint>
      ) : null}
      {payout && payout.status !== 'active' ? <Hint icon="card-outline">Members pay cash on delivery or at pickup. Online payment for your products turns on once your Cashfree payout account is active (Shop settings).</Hint> : null}
      <Hint>New products may be reviewed by NIVASA before members see them. You can list up to 200.</Hint>

      {id ? <Button title="Delete product" icon="trash-outline" variant="danger" onPress={remove} loading={removing} disabled={busy} /> : null}
    </Screen>
  );
}
