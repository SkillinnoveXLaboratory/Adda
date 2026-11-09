import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useToast } from '../context/toast';
import { api } from '../lib/api';
import { confirm } from '../lib/dialog';
import { dayLabel, formatDateTime, money, time12, titleCase } from '../lib/format';
import { colors, shadow } from '../theme';
import { Badge, Button, T } from './ui';

const STATUS_LABEL = { requested: 'Waiting for vendor', accepted: 'Confirmed', declined: 'Declined', cancelled: 'Cancelled', completed: 'Job done' };

/**
 * One of the member's own service bookings: date and time, the vendor's contact, the price with any coupon,
 * the cash payment once the vendor records it, and Cancel while the booking is still open.
 * (Vendors manage bookings on the Vendor Panel website.)
 */
export function BookingCard({ booking: b, onChanged }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const pr = b.pricing || {};
  const contact = b.vendor;
  const day = dayLabel(b.preferredDate);
  const paid = b.payment?.status === 'paid';
  const canCancel = (b.actions || []).includes('cancel');

  const cancel = async () => {
    const ok = await confirm({ title: 'Cancel booking?', message: 'The vendor will be notified.', confirmText: 'Cancel booking', destructive: true });
    if (!ok) return;
    setBusy(true);
    try {
      await api(`/service-bookings/${b._id}/cancel`, { method: 'POST', body: {} });
      toast.success('Booking cancelled');
      onChanged?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const call = () => contact?.phone && Linking.openURL(`tel:+91${contact.phone}`).catch(() => toast.error('Calling is not available on this device'));
  const whatsapp = () => contact?.phone && Linking.openURL(`https://wa.me/91${contact.phone}`).catch(() => toast.error('Could not open WhatsApp'));

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
            {contact?.name ? ` · Vendor: ${contact.name}` : ''}
          </T>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
            <Badge status={b.status} label={STATUS_LABEL[b.status] || titleCase(b.status)} />
            {paid ? <Badge tone="success" label={`Paid ${money(b.payment.amountPaise)} · cash`} /> : null}
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
      {pr.listPricePaise ? (
        <View style={styles.row}>
          <Ionicons name="pricetag-outline" size={14} color="#94a3b8" />
          <T size={12} color={colors.textSoft} style={{ flex: 1 }}>
            {money(pr.listPricePaise)}
            {pr.discountPaise ? ` · Coupon ${pr.couponCode} −${money(pr.discountPaise)} · You pay ${money(pr.payablePaise)}` : ''}
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
          {contact.whatsappAvailable ? <Button small title="WhatsApp" icon="logo-whatsapp" variant="alt" onPress={whatsapp} style={{ flex: 1 }} /> : null}
        </View>
      ) : null}

      {canCancel ? <Button small title="Cancel booking" variant="danger" loading={busy} onPress={cancel} /> : null}
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
