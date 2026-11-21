import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { PayButton, useCheckout } from '../../../components/Checkout';
import { Logo } from '../../../components/Logo';
import { AsyncView, Badge, Card, DetailHeader, Divider, Hint, KeyValue, ListRow, LoadingList, Screen, SectionTitle, T } from '../../../components/ui';
import { useAuth } from '../../../context/auth';
import { useApi } from '../../../hooks/useApi';
import { formatDate, methodLabel, money, periodLabel } from '../../../lib/format';
import { colors } from '../../../theme';

export default function InvoiceDetail() {
  const { id } = useLocalSearchParams();
  const { user, activeMembership } = useAuth();
  const inv = useApi(`/resident/invoices/${id}`);
  // After paying online the server records the payment + receipt; reload to show them.
  const pay = useCheckout({ onResult: inv.refresh, onClose: inv.refresh });

  return (
    <Screen header={<DetailHeader title="Invoice details" fallback="/bills" />} refreshing={inv.refreshing} onRefresh={inv.refresh}>
      <AsyncView state={inv} skeleton={<LoadingList rows={3} card={140} />}>
        {(d) => (
          <>
            <View style={{ backgroundColor: '#f1f5f9', borderRadius: 18, padding: 20, alignItems: 'center', gap: 8 }}>
              <Logo width={110} id={`inv-${id}`} />
              <T size={13} color={colors.muted}>
                {activeMembership?.society?.name}
              </T>
              <T weight="extrabold" size={18}>
                Maintenance invoice
              </T>
              <Badge status={d.overdue ? 'overdue' : d.status} label={d.overdue ? 'Overdue' : undefined} style={{ alignSelf: 'center' }} />
            </View>

            <Card>
              <KeyValue label="Invoice number" value={d.invoiceNumber} />
              <KeyValue label="Billing period" value={periodLabel(d.period)} />
              <KeyValue label="Resident" value={`${user?.name || ''} · ${d.building?.name || ''} ${d.flat?.number || ''}`} />
              <KeyValue label="Issued on" value={formatDate(d.issuedAt)} />
              <Divider dashed />
              {d.lines.map((l, i) => (
                <KeyValue key={`${l.label}-${i}`} label={l.label} value={money(l.amountPaise)} />
              ))}
              <Divider dashed />
              <KeyValue label="Total" value={money(d.totalPaise)} strong />
              {d.paidPaise > 0 ? <KeyValue label="Paid" value={`− ${money(d.paidPaise)}`} valueColor={colors.green} /> : null}
              {d.status !== 'cancelled' ? <KeyValue label="Balance due" value={money(d.balancePaise)} strong valueColor={d.balancePaise ? colors.coralText : colors.green} /> : null}
              <T size={12} color={colors.muted} style={{ marginTop: 6 }}>
                Due date: {formatDate(d.dueDate)}
              </T>
              {d.arrearsAtIssuePaise > 0 ? (
                <T size={12} color={colors.amber} style={{ marginTop: 4 }}>
                  Earlier unpaid bills at the time of issue: {money(d.arrearsAtIssuePaise)} (billed separately)
                </T>
              ) : null}
            </Card>

            {d.status === 'cancelled' ? (
              <Hint tone="amber" icon="close-circle-outline">
                This invoice was cancelled by the society office and does not need to be paid.
              </Hint>
            ) : d.balancePaise > 0 && d.onlinePayment?.available ? (
              <View style={{ gap: 8 }}>
                <PayButton title={`Pay ${money(d.balancePaise)}`} onPress={() => pay.start(`/resident/invoices/${d._id}/pay`)} loading={pay.busy} testID="invoice-pay" />
                <T size={12} color={colors.muted} style={{ lineHeight: 17 }}>
                  Pay securely with UPI, card or net banking. Your receipt appears here once the payment is confirmed. You can also pay at the society office.
                </T>
              </View>
            ) : d.balancePaise > 0 ? (
              <Hint icon="business-outline">
                {`Pay ${money(d.balancePaise)} at your society office (cash, bank transfer, cheque or UPI). Once the office records it, your receipt appears here automatically.`}
              </Hint>
            ) : (
              <Hint tone="green" icon="checkmark-circle-outline">
                This bill is fully paid. Thank you!
              </Hint>
            )}

            {d.payments?.length ? (
              <>
                <SectionTitle title="Payments" />
                {d.payments.map((p) => (
                  <ListRow
                    key={p._id}
                    icon={p.status === 'reversed' ? 'arrow-undo-outline' : 'checkmark-done-outline'}
                    tone={p.status === 'reversed' ? 'coral' : 'green'}
                    title={money(p.amountPaise)}
                    subtitle={`${methodLabel(p.method)} · ${formatDate(p.paidOn)}`}
                    right={<Badge status={p.status === 'captured' ? 'paid' : p.status} />}
                    onPress={p.receipt && p.status !== 'reversed' ? () => router.push(`/receipt/${p.receipt}`) : undefined}
                  />
                ))}
              </>
            ) : null}
          </>
        )}
      </AsyncView>
      {pay.sheet}
    </Screen>
  );
}
