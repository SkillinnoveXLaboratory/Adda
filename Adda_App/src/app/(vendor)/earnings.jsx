import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Chips, DetailHeader, EmptyState, ErrorState, Field, Hint, LoadingList, Screen, SectionTitle, T } from '../../components/ui';
import { NIcon } from '../../components/NivasaIcons';
import { api } from '../../lib/api';
import { formatDate, istDay, money, periodLabel } from '../../lib/format';
import { colors, shadow } from '../../theme';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const PERIODS = [
  { value: 'month', label: 'This month' },
  { value: '3m', label: 'Last 3 months' },
  { value: 'year', label: 'This year' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom' },
];

/** India-time date ranges for the period chips (`to` is inclusive on the server). */
function rangeFor(period) {
  const today = istDay(0);
  const [y, m] = today.split('-').map(Number);
  if (period === 'month') return { from: `${today.slice(0, 7)}-01`, to: today };
  if (period === '3m') {
    const d = new Date(Date.UTC(y, m - 3, 1));
    return { from: d.toISOString().slice(0, 10), to: today };
  }
  if (period === 'year') return { from: `${y}-01-01`, to: today };
  return {};
}

/**
 * Vendor earnings (GET /vendor/earnings): paid service jobs + paid product orders. "You earned" = amount received − NIVASA's share;
 * NIVASA's share = its fee − the discounts it gave members.
 */
export default function Earnings() {
  const [period, setPeriod] = useState('month');
  const [custom, setCustom] = useState({ from: istDay(-30), to: istDay(0) });
  const [customError, setCustomError] = useState(null);
  const [applied, setApplied] = useState(null); // custom range in use
  const [tick, setTick] = useState(0); // retry
  const [state, setState] = useState({ data: null, items: [], page: 1, loading: true, more: false, error: null });

  const range = period === 'custom' ? applied || {} : rangeFor(period);
  const key = `${range.from || ''}|${range.to || ''}`;

  useEffect(() => {
    if (period === 'custom' && !applied) return undefined;
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    const [from, to] = key.split('|');
    api('/vendor/earnings', { query: { from, to, page: 1, limit: 20 } }).then(
      (d) => alive && setState({ data: d, items: d.items || [], page: 1, loading: false, more: false, error: null }),
      (error) => alive && setState((s) => ({ ...s, loading: false, error })),
    );
    return () => {
      alive = false;
    };
  }, [key, period, applied, tick]);

  const loadMore = async () => {
    const [from, to] = key.split('|');
    setState((s) => ({ ...s, more: true }));
    try {
      const d = await api('/vendor/earnings', { query: { from, to, page: state.page + 1, limit: 20 } });
      setState((s) => ({ ...s, items: [...s.items, ...(d.items || [])], page: d.page, more: false }));
    } catch (error) {
      setState((s) => ({ ...s, more: false, error }));
    }
  };

  const applyCustom = () => {
    if (!YMD.test(custom.from) || !YMD.test(custom.to)) return setCustomError('Enter dates as YYYY-MM-DD, e.g. 2026-11-01');
    if (custom.from > custom.to) return setCustomError('The start date must be on or before the end date');
    setCustomError(null);
    setApplied({ ...custom });
    return undefined;
  };

  const t = state.data?.totals;
  const bd = state.data?.breakdown; // services + products (totals include both)
  const months = state.data?.months || [];
  const maxMonth = Math.max(1, ...months.map((x) => x.vendorEarningsPaise || 0));

  return (
    <Screen header={<DetailHeader title="Earnings" fallback="/dashboard" />}>
      <Chips options={PERIODS} value={period} onChange={(p) => (setPeriod(p), setCustomError(null))} />
      {period === 'custom' ? (
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Field label="From" value={custom.from} onChangeText={(v) => setCustom((c) => ({ ...c, from: v.trim() }))} placeholder="YYYY-MM-DD" maxLength={10} style={{ flex: 1 }} />
            <Field label="To" value={custom.to} onChangeText={(v) => setCustom((c) => ({ ...c, to: v.trim() }))} placeholder="YYYY-MM-DD" maxLength={10} style={{ flex: 1 }} />
          </View>
          {customError ? (
            <T size={12} color={colors.danger}>
              {customError}
            </T>
          ) : null}
          <Button small title="Show earnings" variant="brand" onPress={applyCustom} />
        </Card>
      ) : null}

      {period === 'custom' && !applied ? null : state.loading && !state.data ? (
        <LoadingList rows={3} card={90} />
      ) : state.error && !state.data ? (
        <ErrorState error={state.error} onRetry={() => setTick((n) => n + 1)} />
      ) : t ? (
        <>
          <View style={[styles.hero, shadow.card]} testID="earnings-total">
            <NIcon name="cash" size={34} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T size={12} color={colors.muted}>
                You earned
              </T>
              <T weight="extrabold" size={22} color={colors.green} numberOfLines={1}>
                {money(t.vendorEarningsPaise)}
              </T>
              <T size={11.5} color={colors.muted}>
                {bd ? `${plural(bd.services?.paidJobs, 'job')} · ${plural(bd.products?.paidJobs, 'order')}` : plural(t.paidJobs, 'paid job')}
                {state.data.range?.from ? ` · ${formatDate(state.data.range.from)} – ${formatDate(state.data.range.to)}` : ' · all time'}
              </T>
            </View>
          </View>

          <View style={styles.grid}>
            <Stat label="Amount received" value={money(t.cashCollectedPaise)} note="cash + online" />
            <Stat label="NIVASA share" value={money(t.platformNetPaise)} />
            <Stat label="NIVASA fee" value={money(t.commissionPaise)} />
            <Stat label="Member discounts" value={money(t.memberDiscountsPaise)} note="paid by NIVASA" />
          </View>
          <Hint icon="information-circle-outline">You earned = amount received − NIVASA’s share. NIVASA’s share is its fee minus the discounts it gave members.</Hint>

          {bd ? (
            <>
              <SectionTitle title="Services and products" />
              <View style={styles.grid} testID="earnings-breakdown">
                <Split title="Services" icon="maintenance" b={bd.services} unit="job" />
                <Split title="Products" icon="market" b={bd.products} unit="order" />
              </View>
            </>
          ) : null}

          {months.length ? (
            <>
              <SectionTitle title="By month" />
              <Card style={{ gap: 10 }}>
                {months.map((mo) => (
                  <View key={mo.month} style={{ gap: 4 }}>
                    <View style={styles.rowBetween}>
                      <T weight="semibold" size={12.5} color={colors.textSoft}>
                        {periodLabel(mo.month)}
                      </T>
                      <T weight="bold" size={12.5} color={colors.navy}>
                        {money(mo.vendorEarningsPaise)}
                      </T>
                    </View>
                    <View style={styles.barTrack}>
                      <View style={[styles.bar, { width: `${Math.max(2, Math.round(((mo.vendorEarningsPaise || 0) / maxMonth) * 100))}%` }]} />
                    </View>
                    <T size={10.5} color={colors.muted}>
                      {plural(mo.paidJobs, 'sale')} · received {money(mo.cashCollectedPaise)} · NIVASA {money(mo.platformNetPaise)}
                    </T>
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          <SectionTitle title="Paid service jobs" />
          {state.items.length ? (
            <View style={{ gap: 10 }}>
              {state.items.map((it) => (
                <Card key={it._id} style={{ gap: 4 }}>
                  <View style={styles.rowBetween}>
                    <T weight="bold" size={13} color={colors.navy} numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                      {it.offerTitle}
                    </T>
                    <T weight="extrabold" size={13} color={colors.green}>
                      {money(it.vendorEarningsPaise)}
                    </T>
                  </View>
                  <T size={11.5} color={colors.muted} numberOfLines={1}>
                    {[it.customer?.name, it.paidAt ? formatDate(it.paidAt) : null].filter(Boolean).join(' · ')}
                  </T>
                  <T size={11.5} color={colors.textSoft}>
                    Cash {money(it.cashPaise)} · NIVASA fee {money(it.commissionPaise)}
                    {it.discountPaise ? ` · discount ${money(it.discountPaise)}` : ''}
                  </T>
                </Card>
              ))}
              {state.data.pages > state.page ? <Button title="Show more" variant="alt" loading={state.more} onPress={loadMore} /> : null}
            </View>
          ) : (
            <EmptyState icon="wallet-outline" title="No paid service jobs in this period" message="After a job, mark the booking as paid and it shows up here. Product orders count in the totals above." />
          )}
        </>
      ) : null}
    </Screen>
  );
}

const plural = (n, word) => `${n || 0} ${word}${n === 1 ? '' : 's'}`;

function Split({ title, icon, b, unit }) {
  return (
    <View style={styles.stat}>
      <View style={styles.rowBetween}>
        <T weight="bold" size={12.5} color={colors.navy}>
          {title}
        </T>
        <NIcon name={icon} size={22} />
      </View>
      <T weight="extrabold" size={15} color={colors.green} numberOfLines={1}>
        {money(b?.vendorEarningsPaise || 0)}
      </T>
      <T size={10.5} color={colors.muted} numberOfLines={2}>
        {plural(b?.paidJobs, unit)} · received {money(b?.cashCollectedPaise || 0)} · NIVASA {money(b?.platformNetPaise || 0)}
      </T>
    </View>
  );
}

function Stat({ label, value, note }) {
  return (
    <View style={styles.stat}>
      <T size={11.5} color={colors.muted} numberOfLines={1}>
        {label}
      </T>
      <T weight="extrabold" size={15} color={colors.navy} numberOfLines={1}>
        {value}
      </T>
      {note ? (
        <T size={10} color={colors.goldText}>
          {note}
        </T>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { width: '47%', flexGrow: 1, backgroundColor: colors.white, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 2 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: colors.bg, overflow: 'hidden' },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.gold },
});
