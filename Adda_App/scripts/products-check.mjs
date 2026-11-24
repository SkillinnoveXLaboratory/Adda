#!/usr/bin/env node
/**
 * Vendor products + orders checks (skills/vendor-products) against a LOCAL backend only (never production / Atlas).
 * Product categories (Master Admin), product CRUD + KYC gate + moderation, member view (never vendor price / rates),
 * order math, stock reserve/restore, every status transition + illegal ones, COD settlement at delivery, member
 * cancel window, vendor cancel needs a reason, earnings include products, isolation.
 *
 *   cd Backend && node server.js dev:db          (then db:init + create-super-admin, start the API on :3013)
 *   cd Adda_App && npm run products-check       (= node scripts/products-check.mjs http://localhost:3013)
 */
import { Buffer } from 'node:buffer';

const [BASE = 'http://localhost:3013', SA_EMAIL = 'admin@addaapp.local', SA_PASSWORD = 'DevAdmin12345'] = process.argv.slice(2);
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(BASE)) {
  console.error('Refusing to run: products-check only targets a local backend.');
  process.exit(2);
}
const API = `${BASE.replace(/\/$/, '')}/api/v1`;
const RUN = Date.now().toString(36).slice(-5);
let passed = 0;
const failed = [];
function check(name, ok, detail) {
  if (ok) passed++;
  else failed.push(`${name}${detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)?.slice(0, 300)}` : ''}`);
  console.log(`${ok ? '✓' : '✗'} ${name}${!ok && detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)?.slice(0, 300)}` : ''}`);
  return ok;
}
async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${API}${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, body: json };
}
const code = (r) => r.body?.error?.code;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
async function upload(token, purpose) {
  const form = new FormData();
  form.append('purpose', purpose);
  form.append('file', new Blob([PNG], { type: 'image/png' }), `${purpose}.png`);
  const res = await fetch(`${API}/uploads`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const D = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]];
const P = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]];
const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];
const withVerhoeff = (b) => b + INV[b.split('').reverse().reduce((c, d, i) => D[c][P[(i + 1) % 8][Number(d)]], 0)];
const STAMP = Date.now();
const phoneFor = (n) => `8${String(STAMP + n * 104729).slice(-9)}`;
const register = (n, name, accountType) => call('POST', '/auth/resident/register', { body: { phone: phoneFor(n), name, password: 'ProductCheck12345', accountType } });

/** A vendor with approved KYC and Master Admin rates. */
async function approvedVendor(n, T, { commissionPercent = 20, memberDiscountPercent = 50 } = {}) {
  const r = await register(n, `Shop owner ${n} ${RUN}`, 'vendor');
  const token = r.body?.accessToken;
  const id = r.body?.user?._id;
  const docs = [];
  for (let i = 0; i < 3; i++) docs.push((await upload(token, 'kyc')).body?._id);
  const aad = withVerhoeff(`3${String(STAMP + n).slice(-10)}`);
  const kyc = await call('PUT', '/vendor/kyc', { token, body: { businessName: `Kirana ${n} ${RUN}`, businessType: 'individual', city: 'Pune', address: `${n} Market Road`, pan: `ABCPE${String(STAMP + n).slice(-4)}F`, aadhaar: aad, bankAccountHolder: 'Asha Patil', bankAccountNumber: `6001${String(STAMP + n).slice(-8)}`, bankIfsc: 'HDFC0001234', bankName: 'HDFC', panPhoto: docs[0], aadhaarFront: docs[1], aadhaarBack: docs[2], consent: true } });
  const ok = await call('POST', `/platform/vendors/${id}/kyc`, { token: T, body: { decision: 'approved' } });
  const pr = await call('PATCH', `/platform/vendors/${id}/pricing`, { token: T, body: { commissionPercent, memberDiscountPercent } });
  return { token, id, ok: kyc.status === 200 && ok.status === 200 && pr.status === 200 };
}

// ---------------------------------------------------------------- setup
const owner = await call('POST', '/auth/admin/login', { body: { email: SA_EMAIL, password: SA_PASSWORD } });
if (owner.status !== 200) {
  console.error('Owner sign-in failed — create the local super admin first.');
  process.exit(2);
}
const T = owner.body.accessToken;

// ---------------------------------------------------------------- categories (Master Admin)
const cat = await call('POST', '/platform/categories', { token: T, body: { kind: 'product', name: `Groceries ${RUN}` } });
check('Master Admin adds a product category → 201', cat.status === 201 && cat.body?.kind === 'product', cat.body);
const cat2 = await call('POST', '/platform/categories', { token: T, body: { kind: 'product', name: `Home & Kitchen ${RUN}` } });
const off = await call('POST', '/platform/categories', { token: T, body: { kind: 'product', name: `Hidden ${RUN}`, active: false } });
check('platform list filters kind=product', (await call('GET', '/platform/categories?kind=product', { token: T })).body?.items?.every((c) => c.kind === 'product'));
const V = await approvedVendor(1, T);
check('vendor KYC approved + rates set (20% / 50%)', V.ok);
const V2 = await approvedVendor(2, T);
const mReg = await register(3, `Buyer ${RUN}`);
const M = mReg.body?.accessToken;
const M2 = (await register(4, `Other buyer ${RUN}`)).body?.accessToken;
const pc = await call('GET', '/products/categories', { token: M });
check('members see active product categories only', pc.status === 200 && pc.body.items.some((c) => c._id === cat.body._id) && !pc.body.items.some((c) => c._id === off.body?._id), pc.body);

// ---------------------------------------------------------------- products
const unverified = (await register(5, `No KYC ${RUN}`, 'vendor')).body?.accessToken;
const body = { categoryId: cat.body._id, title: `Basmati rice ${RUN}`, description: 'Aged long grain', pricePaise: 100000, unit: '5 kg', stock: 5, maxPerOrder: 3, delivery: true, pickup: true, deliveryChargePaise: 4000 };
check('vendor without KYC → 403 KYC_REQUIRED', code(await call('POST', '/products', { token: unverified, body })) === 'KYC_REQUIRED');
check('member cannot add a product → 403 VENDOR_ONLY', code(await call('POST', '/products', { token: M, body })) === 'VENDOR_ONLY');
check('service category id rejected → 400', (await call('POST', '/products', { token: V.token, body: { ...body, categoryId: (await call('GET', '/service-offers/categories', { token: M })).body.items[0]._id } })).status === 400);
check('inactive category rejected → 400', (await call('POST', '/products', { token: V.token, body: { ...body, categoryId: off.body._id } })).status === 400);
check('price below ₹1 → 400', (await call('POST', '/products', { token: V.token, body: { ...body, pricePaise: 50 } })).status === 400);
check('fractional paise → 400', (await call('POST', '/products', { token: V.token, body: { ...body, pricePaise: 100.5 } })).status === 400);
check('neither delivery nor pickup → 400', (await call('POST', '/products', { token: V.token, body: { ...body, delivery: false, pickup: false } })).status === 400);
check('unknown field → 400', (await call('POST', '/products', { token: V.token, body: { ...body, commissionBps: 0 } })).status === 400);
const photo = (await upload(V.token, 'product')).body?._id;
check('vendor uploads a product photo', !!photo);
const p1 = await call('POST', '/products', { token: V.token, body: { ...body, photos: [photo] } });
check('vendor adds a product → 201 pending review', p1.status === 201 && p1.body?.moderationStatus === 'pending' && p1.body.mine === true, p1.body);
check('vendor sees own pricing: ₹1,000 → members pay ₹1,000, commission ₹200, vendor earns ₹800, discount ₹100', p1.body?.pricing?.vendorPricePaise === 100000 && p1.body.pricing.memberPricePaise === 100000 && p1.body.pricing.vendorEarningsPaise === 80000 && p1.body.pricing.discountPaise === 10000 && p1.body.pricing.commissionPercent === 20, p1.body?.pricing);
const pid = p1.body?._id;
check('pending product hidden from members → 404', (await call('GET', `/products/${pid}`, { token: M })).status === 404);
const queue = await call('GET', '/platform/listings?kind=product&status=pending', { token: T });
check('Master Admin sees it in Listings → Products (pending)', queue.body?.items?.some((l) => l._id === pid), queue.body?.items?.length);
check('Master Admin approves the product', (await call('POST', `/platform/listings/product/${pid}/moderate`, { token: T, body: { decision: 'approved' } })).body?.moderationStatus === 'approved');
const mv = await call('GET', `/products/${pid}`, { token: M });
check('member sees the vendor price ₹1,000 + discount offer ₹100', mv.status === 200 && mv.body.pricePaise === 100000 && mv.body.pricing.discountAvailable === true && mv.body.pricing.payableWithDiscountPaise === 90000, mv.body?.pricing);
const mvTxt = JSON.stringify(mv.body);
check('member never sees vendor price / rates', !mvTxt.includes('vendorPricePaise') && !mvTxt.includes('commissionPercent') && !mvTxt.includes('memberDiscountPercent') && !mvTxt.includes('"commissionPaise"'));
check('product shows the shop name', !!mv.body?.shop?.name, mv.body?.shop);
const p2 = await call('POST', '/products', { token: V.token, body: { ...body, categoryId: cat2.body._id, title: `Steel kadai ${RUN}`, pricePaise: 50000, stock: 0, pickup: false } });
await call('POST', `/platform/listings/product/${p2.body?._id}/moderate`, { token: T, body: { decision: 'approved' } });
const browse = await call('GET', `/products?q=${RUN}`, { token: M });
check('search by text finds both products', browse.status === 200 && browse.body.items.length === 2, browse.body?.items?.length);
const byCat = await call('GET', `/products?categoryId=${cat.body._id}&q=${RUN}`, { token: M });
check('filter by category', byCat.body?.items?.length === 1 && byCat.body.items[0]._id === pid, byCat.body?.items?.map((i) => i.title));
check('inStock=true hides out-of-stock', (await call('GET', `/products?q=${RUN}&inStock=true`, { token: M })).body?.items?.length === 1);
check('another vendor cannot edit it → 404', (await call('PATCH', `/products/${pid}`, { token: V2.token, body: { stock: 99 } })).status === 404);
const stockEdit = await call('PATCH', `/products/${pid}`, { token: V.token, body: { stock: 5 } });
check('stock change keeps it approved', stockEdit.body?.moderationStatus === 'approved', stockEdit.body?.moderationStatus);
const sameText = await call('PATCH', `/products/${pid}`, { token: V.token, body: { title: body.title, unit: body.unit, categoryId: cat.body._id } });
check('re-saving unchanged title/unit/category keeps it approved', sameText.body?.moderationStatus === 'approved', sameText.body?.moderationStatus);
check('vendors cannot order → 403 MEMBER_ONLY', code(await call('POST', `/products/${pid}/orders`, { token: V2.token, body: { quantity: 1, fulfilment: 'pickup', paymentMethod: 'cod' } })) === 'MEMBER_ONLY');

// ---------------------------------------------------------------- orders (COD)
const order = (token, b, id = pid) => call('POST', `/products/${id}/orders`, { token, body: b });
check('delivery without address → 400', (await order(M, { quantity: 1, fulfilment: 'delivery', paymentMethod: 'cod' })).status === 400);
check('more than maxPerOrder → 400', (await order(M, { quantity: 4, fulfilment: 'pickup', paymentMethod: 'cod' })).status === 400);
check('out of stock product → 409 OUT_OF_STOCK', code(await order(M, { quantity: 1, fulfilment: 'delivery', address: '1 Lake View, Pune', paymentMethod: 'cod' }, p2.body?._id)) === 'OUT_OF_STOCK');
check('pickup on a delivery-only product → 400', (await order(M, { quantity: 1, fulfilment: 'pickup', paymentMethod: 'cod' }, p2.body?._id)).status === 400);
const o1 = await order(M, { quantity: 2, fulfilment: 'delivery', address: 'Flat 12, Lake View, Pune', applyDiscount: true, paymentMethod: 'cod', note: 'Ring the bell' });
check('member orders 2 with discount, delivery ₹40 → 201 placed', o1.status === 201 && o1.body?.order?.status === 'placed' && o1.body.checkout === null, o1.body);
const O = o1.body?.order;
check('order math: 2 × ₹1,000 − ₹200 + ₹40 = payable ₹1,840', O?.memberTotalPaise === 200000 && O.discountPaise === 20000 && O.deliveryChargePaise === 4000 && O.payablePaise === 184000, O);
check('member order view has no vendor price / commission', !JSON.stringify(O).includes('vendorUnitPaise') && !JSON.stringify(O).includes('commission'));
check('stock reserved: 5 → 3', (await call('GET', `/products/${pid}`, { token: V.token })).body?.stock === 3);
const vo = await call('GET', '/vendor/orders', { token: V.token });
const VO = vo.body?.items?.find((x) => x._id === O?._id);
check('vendor sees the order with customer + earnings ₹1,640 (₹2,000 − ₹400 + ₹40)', VO && VO.customer?.phone === phoneFor(3) && VO.vendorTotalPaise === 200000 && VO.yourEarningsPaise === 164000 && VO.commissionPaise === 40000, VO);
check('vendor next steps: confirmed / cancelled', JSON.stringify(VO?.nextStatuses) === JSON.stringify(['confirmed', 'cancelled']), VO?.nextStatuses);
check('another vendor cannot see it → 404', (await call('GET', `/vendor/orders/${O?._id}`, { token: V2.token })).status === 404);
check('another member cannot see it → 404', (await call('GET', `/product-orders/${O?._id}`, { token: M2 })).status === 404);
const st = (to, note, token = V.token, id = O?._id) => call('POST', `/vendor/orders/${id}/status`, { token, body: { status: to, ...(note ? { note } : {}) } });
check('skip to shipped → 409', (await st('shipped')).status === 409);
check('vendor confirms', (await st('confirmed')).body?.status === 'confirmed');
check('vendor packs', (await st('packed')).body?.status === 'packed');
check('member cannot cancel once packed → 409', (await call('POST', `/product-orders/${O?._id}/cancel`, { token: M, body: {} })).status === 409);
check('ready_for_pickup on a delivery order → 409', (await st('ready_for_pickup')).status === 409);
check('vendor ships', (await st('shipped', 'Courier: Delhivery')).body?.status === 'shipped');
check('out for delivery', (await st('out_for_delivery')).body?.status === 'out_for_delivery');
const del = await st('delivered');
check('delivered → COD recorded as cash ₹1,840', del.body?.status === 'delivered' && del.body.payment?.status === 'paid' && del.body.payment.method === 'cash' && del.body.payment.amountPaise === 184000, del.body?.payment);
check('settlement: commission ₹400, discount ₹200, NIVASA ₹200, vendor ₹1,640', del.body?.settlement?.commissionPaise === 40000 && del.body.settlement.discountPaise === 20000 && del.body.settlement.netToPlatformPaise === 20000 && del.body.settlement.vendorEarningsPaise === 164000, del.body?.settlement);
check('no steps after delivered', (await st('cancelled', 'late')).status === 409);
const track = await call('GET', `/product-orders/${O?._id}`, { token: M });
check('member tracking timeline: placed → confirmed → packed → shipped → out → delivered', JSON.stringify(track.body?.timeline?.map((t) => t.status)) === JSON.stringify(['placed', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered']), track.body?.timeline);
check('shipping note visible to the member', track.body?.timeline?.some((t) => t.note === 'Courier: Delhivery'));

// pickup + cancels
const o2 = await order(M, { quantity: 1, fulfilment: 'pickup', paymentMethod: 'cod' });
check('pickup order → placed', o2.body?.order?.status === 'placed', o2.body);
check('vendor cancel without reason → 400', (await st('cancelled', undefined, V.token, o2.body?.order?._id)).status === 400);
const vc = await st('cancelled', 'Out of stock today', V.token, o2.body?.order?._id);
check('vendor cancels with a reason', vc.body?.status === 'cancelled' && vc.body.cancelReason === 'Out of stock today');
const o3 = await order(M, { quantity: 1, fulfilment: 'pickup', paymentMethod: 'cod' });
check('pickup next steps after packed: ready_for_pickup (no shipped)', (await st('confirmed', null, V.token, o3.body?.order?._id)).status === 200 && JSON.stringify((await st('packed', null, V.token, o3.body?.order?._id)).body?.nextStatuses) === JSON.stringify(['ready_for_pickup', 'cancelled']));
const o4 = await order(M, { quantity: 1, fulfilment: 'pickup', paymentMethod: 'cod' });
const mc = await call('POST', `/product-orders/${o4.body?.order?._id}/cancel`, { token: M, body: { reason: 'Ordered by mistake' } });
check('member cancels a placed order', mc.body?.status === 'cancelled' && mc.body.cancelledBy === 'member', mc.body);
check('cancelled twice → 409', (await call('POST', `/product-orders/${o4.body?.order?._id}/cancel`, { token: M, body: {} })).status === 409);
check('stock restored after cancels: 3 − 1 (o3) = 2', (await call('GET', `/products/${pid}`, { token: V.token })).body?.stock === 2);
check('no discount when shop has none → 409 NO_DISCOUNT', code(await (async () => {
  await call('PATCH', `/platform/vendors/${V2.id}/pricing`, { token: T, body: { memberDiscountPercent: 0 } });
  const p = await call('POST', '/products', { token: V2.token, body: { ...body, title: `Ghee ${RUN}` } });
  await call('POST', `/platform/listings/product/${p.body?._id}/moderate`, { token: T, body: { decision: 'approved' } });
  return order(M, { quantity: 1, fulfilment: 'pickup', applyDiscount: true, paymentMethod: 'cod' }, p.body?._id);
})()) === 'NO_DISCOUNT');

// ---------------------------------------------------------------- earnings + platform
const ve = await call('GET', '/vendor/earnings', { token: V.token });
check('vendor earnings include the product order (₹1,640)', ve.body?.breakdown?.products?.vendorEarningsPaise === 164000 && ve.body.totals.vendorEarningsPaise >= 164000, ve.body?.breakdown);
const pe = await call('GET', `/platform/earnings?vendorId=${V.id}`, { token: T });
check('platform earnings: products NIVASA net ₹200', pe.body?.breakdown?.products?.platformNetPaise === 20000 && pe.body.totals.commissionPaise >= 40000, pe.body?.breakdown);
const po = await call('GET', `/platform/product-orders?vendorId=${V.id}`, { token: T });
check('platform product orders list + totals', po.status === 200 && po.body.items.length >= 4 && po.body.totals?.netToPlatformPaise === 20000, po.body?.totals);
const dv = await call('GET', `/platform/vendors/${V.id}`, { token: T });
check('vendor page counts products + orders', dv.body?.counts?.products === 2 && dv.body.counts.orders >= 4, dv.body?.counts);
check('category in use cannot be deleted → 409', (await call('DELETE', `/platform/categories/${cat.body._id}`, { token: T })).status === 409);
const renamed = await call('PATCH', `/products/${pid}`, { token: V.token, body: { title: `Premium basmati ${RUN}` } });
check('changed title → back to review (pending)', renamed.body?.moderationStatus === 'pending', renamed.body?.moderationStatus);
const del2 = await call('DELETE', `/products/${pid}`, { token: V.token });
check('vendor deletes product → gone for members', del2.status === 200 && (await call('GET', `/products/${pid}`, { token: M })).status === 404);

console.log(`\n${passed} passed, ${failed.length} failed`);
for (const f of failed) console.log(`  ✗ ${f}`);
process.exit(failed.length ? 1 : 0);
