import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useToast } from '../context/toast';
import { api } from '../lib/api';
import { confirm } from '../lib/dialog';
import { dayLabel, formatDateTime, money, time12, titleCase, toPaise } from '../lib/format';
import { colors, shadow } from '../theme';
import { Badge, Button, Field, T } from './ui';

const ACTION_LABEL = { accept: 'Accept', decline: 'Decline', complete: 'Mark job done', cancel: 'Cancel booking' };
const STATUS_LABEL = { requested: 'Waiting for vendor', accepted: 'Confirmed', declined: 'Declined', cancelled: 'Cancelled', completed: 'Job done' };

/**
 * One service booking. `role` comes from the server ("customer" or "vendor") and decides what is shown:
 * customers see the vendor's contact and can cancel; vendors see the customer and move the booking along,
 * including recording a cash payment after the job ("Mark as paid").
 */
export function BookingCard({ booking: b, onChanged }) {
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState(b.pricePaise ? String(b.pricePaise / 100) : '');
  const [amountError, setAmountError] = useState(null);
  const vendorView = b.role === 'vendor';
  const contact = vendorView ? b.customer : b.vendor;
  const day = dayLabel(b.preferredDate);
  const paid = b.payment?.status === 'paid';

  const run = async (action) => {
    if (['decline', 'cancel'].includes(action)) {
      const ok = await confirm({ title: `${ACTION_LABEL[action]}?`, message: vendorView ? 'The customer will be notified.' : 'The vendor will be notified.', confirmText: ACTION_LABEL[action], destructive: true });
      if (!ok) return;
    }
    setBusy(action);
    try {
      const path = vendorView ? `/vendor/bookings/${b._id}/${action}` : `/service-bookings/${b._id}/cancel`;
      await api(path, { method: 'POST', body: {} });
      toast.success(action === 'accept' ? 'Booking accepted' : action === 'complete' ? 'Marked as done' : action === 'decline' ? 'Booking declined' : 'Booking cancelled');
      onChanged?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  const markPaid = async () => {
    const paise = toPaise(amount);
    if (!Number.isFinite(paise) || paise <= 0) return setAmountError('Enter the amount you received');
    setAmountError(null);
    const ok = await confirm({ title: `Record ${money(paise)} received in cash?`, message: 'This can’t be changed later. The customer will see it.', confirmText: 'Mark as paid' });
    if (!ok) return;
    setBusy('mark-paid');
    try {
      await api(`/vendor/bookings/${b._id}/mark-paid`, { method: 'POST', body: { amountPaise: paise } });
      toast.success('Payment recorded');
      setPaying(false);
      onChanged?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  const call = () => contact?.phone && Linking.openURL(`tel:+91${contact.phone}`).catch(() => toast.error('Calling is not available on this device'));
  const whatsapp = () => contact?.phone && Linking.openURL(`https://wa.me/91${contact.phone}`).catch(() => toast.error('Could not open WhatsApp'));
  const actions = (b.actions || []).filter((a) => a !== 'mark-paid');

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.date}>
          <T weight="bold" size={9.5} color={colors.goldText}>
            {day.weekday?.toUpperCase()}
          </T>
          <T weight="extrabold" size={17} color={colors.navy} style={{ lineHeight: 21 }}>
            {day.day}
          </T>
          <T weight="bold" size={9.5} color={colors.muted}>
            {day.month}
          </T>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <T weight="bold" size={13.5} color={colors.navy} numberOfLines={2}>
            {b.offerTitle}
          </T>
          <T size={11.5} color={colors.muted} numberOfLines={1}>
            {b.preferredTime ? time12(b.preferredTime) : 'Any time'}
            {contact?.name ? ` · ${vendorView ? 'Customer' : 'Vendor'}: ${contact.name}` : ''}
          </T>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
            <Badge status={b.status} label={STATUS_LABEL[b.status] || titleCase(b.status)} />
            {paid ? <Badge tone="success" label={`Paid ${money(b.payment.amountPaise)} · cash`} /> : b.status === 'completed' ? <Badge tone="warning" label="Payment not recorded" /> : null}
          </View>
        </View>
      </View>

      <View style={styles.row}>
        <Ionicons name="location-outline" size={14} color="#94a3b8" />
        <T size={12} color={colors.textSoft} style={{ flex: 1 }}>
          {b.address}
        </T>
      </View>
      {b.note ? (
        <View style={styles.row}>
          <Ionicons name="chatbox-ellipses-outline" size={14} color="#94a3b8" />
          <T size={12} color={colors.textSoft} style={{ flex: 1 }}>
            {b.note}
          </T>
        </View>
      ) : null}
      {b.timeline?.length > 1 ? (
        <T size={11} color="#94a3b8">
          Last update: {titleCase(b.timeline[b.timeline.length - 1].status)} · {formatDateTime(b.timeline[b.timeline.length - 1].at)}
        </T>
      ) : null}

      {contact?.phone && !['declined', 'cancelled'].includes(b.status) ? (
        <View style={styles.actions}>
          <Button small title="Call" icon="call" variant="alt" onPress={call} style={{ flex: 1 }} />
          {vendorView || contact.whatsappAvailable ? <Button small title="WhatsApp" icon="logo-whatsapp" variant="alt" onPress={whatsapp} style={{ flex: 1 }} /> : null}
        </View>
      ) : null}

      {actions.length ? (
        <View style={styles.actions}>
          {actions.map((a) => (
            <Button key={a} small title={ACTION_LABEL[a] || titleCase(a)} variant={a === 'accept' || a === 'complete' ? 'brand' : a === 'cancel' || a === 'decline' ? 'danger' : 'alt'} loading={busy === a} disabled={!!busy && busy !== a} onPress={() => run(a)} style={{ flex: 1 }} />
          ))}
        </View>
      ) : null}

      {vendorView && b.actions?.includes('mark-paid') ? (
        paying ? (
          <View style={{ gap: 8 }}>
            <Field label="Amount received in cash" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" prefix="₹" error={amountError} />
            <View style={styles.actions}>
              <Button small title="Cancel" variant="alt" onPress={() => setPaying(false)} style={{ flex: 1 }} />
              <Button small title="Confirm paid" icon="checkmark" variant="brand" loading={busy === 'mark-paid'} onPress={markPaid} style={{ flex: 1.3 }} />
            </View>
          </View>
        ) : (
          <Button small title="Mark as paid (cash)" icon="cash-outline" variant="gold" onPress={() => setPaying(true)} />
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 8, ...shadow.card },
  head: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  date: { width: 52, borderRadius: 12, backgroundColor: colors.goldLight, alignItems: 'center', paddingVertical: 6 },
  row: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  actions: { flexDirection: 'row', gap: 8 },
});
