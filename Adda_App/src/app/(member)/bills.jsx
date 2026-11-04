import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Chips, DetailHeader, EmptyState, ErrorState, ListRow, LoadingList, Screen, SectionTitle, Skeleton, T, TextLink } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { formatDate, money, periodLabel } from '../../lib/format';
import { colors } from '../../theme';

const FILTERS = [
  { value: 'open', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: '', label: 'All bills' },
];

export default function Bills() {
  const [filter, setFilter] = useState('open');
  const list = useApi('/resident/invoices', { query: { status: filter, limit: 50 } });
  const dues = list.data?.dues;

  return (
    <Screen padded={false} refreshing={list.refreshing} onRefresh={list.refresh} header={<DetailHeader title="Maintenance Bills" fallback="/manage" />}>
      <View style={{ padding: 16, gap: 14 }}>
        {dues ? (
          <LinearGradient colors={[colors.balanceFrom, colors.balanceTo]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 18, padding: 20 }}>
            <T weight="bold" size={11} color={colors.gold} style={{ letterSpacing: 0.6 }}>
              CURRENT OUTSTANDING
            </T>
            <T weight="extrabold" size={32} color={colors.white} style={{ marginVertical: 4, lineHeight: 40 }}>
              {money(dues.outstandingPaise)}
            </T>
            <T size={13} color="#cbd5e1">
              {dues.openInvoices ? `${dues.openInvoices} open bill${dues.openInvoices > 1 ? 's' : ''}${dues.overdueInvoices ? ` · ${dues.overdueInvoices} overdue` : ''}` : 'No pending bills — you are all caught up.'}
            </T>
          </LinearGradient>
        ) : (
          <Skeleton height={118} radius={18} />
        )}

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <SectionTitle title="Invoices" />
          <TextLink title="Payment history" onPress={() => router.push('/payments')} />
        </View>
        <Chips options={FILTERS} value={filter} onChange={setFilter} />

        {list.loading && !list.data ? (
          <LoadingList rows={4} />
        ) : list.error && !list.data ? (
          <ErrorState error={list.error} onRetry={list.reload} />
        ) : !list.data.items.length ? (
          <EmptyState
            icon="receipt-outline"
            title={filter === 'open' ? 'No pending bills' : 'No bills yet'}
            message={filter === 'open' ? 'Great — nothing to pay right now.' : 'Your society has not issued any maintenance bills for your flat yet.'}
          />
        ) : (
          <View style={{ gap: 10 }}>
            {list.data.items.map((inv) => (
              <ListRow
                key={inv._id}
                icon="document-text-outline"
                tone={inv.overdue ? 'coral' : inv.status === 'paid' ? 'green' : 'blue'}
                title={periodLabel(inv.period)}
                subtitle={`Invoice ${inv.invoiceNumber}`}
                meta={inv.status === 'paid' ? `Paid${inv.paidAt ? ` on ${formatDate(inv.paidAt)}` : ''}` : `Due ${formatDate(inv.dueDate)}`}
                onPress={() => router.push(`/invoice/${inv._id}`)}
                right={
                  <View style={{ alignItems: 'flex-end', gap: 5 }}>
                    <T weight="extrabold" size={14}>
                      {money(inv.status === 'paid' || inv.status === 'cancelled' ? inv.totalPaise : inv.balancePaise)}
                    </T>
                    <Badge status={inv.overdue ? 'overdue' : inv.status} label={inv.overdue ? 'Overdue' : undefined} />
                  </View>
                }
              />
            ))}
          </View>
        )}
        {list.error && list.data ? (
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <Ionicons name="cloud-offline-outline" size={16} color={colors.muted} />
            <T size={12} color={colors.muted}>
              Showing saved results — {list.error.message}
            </T>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
