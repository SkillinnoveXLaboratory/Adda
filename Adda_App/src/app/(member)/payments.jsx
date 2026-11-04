import { View } from 'react-native';
import { router } from 'expo-router';
import { AsyncView, Badge, DetailHeader, ListRow, Screen, T } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { formatDate, methodLabel, money, periodLabel } from '../../lib/format';

export default function Payments() {
  const list = useApi('/resident/payments', { query: { limit: 50 } });
  return (
    <Screen header={<DetailHeader title="Payment history" fallback="/bills" />} refreshing={list.refreshing} onRefresh={list.refresh}>
      <AsyncView
        state={list}
        empty={{ when: (d) => !d.items.length, icon: 'wallet-outline', title: 'No payments yet', message: 'Payments recorded by your society office will appear here with their receipts.', action: 'View bills', onAction: () => router.push('/bills') }}
      >
        {(d) => (
          <View style={{ gap: 10 }}>
            {d.items.map((p) => (
              <ListRow
                key={p._id}
                icon={p.status === 'reversed' || p.status === 'failed' ? 'close-circle-outline' : 'checkmark-circle-outline'}
                tone={p.status === 'reversed' || p.status === 'failed' ? 'coral' : 'green'}
                title={p.invoice ? `Maintenance · ${periodLabel(p.invoice.period)}` : 'Maintenance payment'}
                subtitle={`${formatDate(p.paidOn || p.createdAt)} · ${methodLabel(p.method)}`}
                meta={p.receipt?.receiptNumber}
                onPress={p.receipt?._id && p.status !== 'failed' ? () => router.push(`/receipt/${p.receipt._id}`) : undefined}
                right={
                  <View style={{ alignItems: 'flex-end', gap: 5 }}>
                    <T weight="extrabold" size={14}>
                      {money(p.amountPaise)}
                    </T>
                    <Badge status={p.status === 'captured' ? 'paid' : p.status} />
                  </View>
                }
              />
            ))}
          </View>
        )}
      </AsyncView>
    </Screen>
  );
}
