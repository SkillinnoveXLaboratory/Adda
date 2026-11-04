import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Logo } from '../../../components/Logo';
import { AsyncView, Badge, Button, Card, DetailHeader, Divider, Hint, KeyValue, LoadingList, Screen, T } from '../../../components/ui';
import { useToast } from '../../../context/toast';
import { useAction, useApi } from '../../../hooks/useApi';
import { api } from '../../../lib/api';
import { downloadAndShare } from '../../../lib/download';
import { formatDate, methodLabel, money, periodLabel } from '../../../lib/format';
import { colors } from '../../../theme';

export default function ReceiptDetail() {
  const { id } = useLocalSearchParams();
  const toast = useToast();
  const r = useApi(`/resident/receipts/${id}`);

  const [download, downloading] = useAction(async () => {
    try {
      await downloadAndShare(`/resident/receipts/${id}/pdf`, `${r.data.receiptNumber.replace(/[^\w-]/g, '_')}.pdf`, () => api(`/resident/receipts/${id}`));
    } catch (err) {
      toast.error(err.message);
    }
  });

  return (
    <Screen header={<DetailHeader title="Payment receipt" fallback="/payments" />}>
      <AsyncView state={r} skeleton={<LoadingList rows={2} card={160} />}>
        {(d) => {
          const reversed = d.payment?.status === 'reversed';
          return (
            <>
              <View style={{ alignItems: 'center', gap: 8, paddingVertical: 8 }}>
                <Logo width={110} id={`rcpt-${id}`} />
                <T weight="extrabold" size={18}>
                  Payment receipt
                </T>
                <Badge status={reversed ? 'reversed' : 'paid'} label={reversed ? 'Reversed' : 'Successful'} style={{ alignSelf: 'center' }} />
              </View>
              <Card>
                <KeyValue label="Receipt number" value={d.receiptNumber} />
                <KeyValue label="Invoice" value={`${d.invoice?.invoiceNumber} (${periodLabel(d.invoice?.period)})`} />
                <KeyValue label="Received from" value={d.issuedToName || 'Resident'} />
                <KeyValue label="Unit" value={`${d.flat?.building || ''} ${d.flat?.number || ''}`.trim()} />
                <KeyValue label="Payment mode" value={methodLabel(d.method)} />
                {d.payment?.providerPaymentId ? <KeyValue label="Transaction ID" value={d.payment.providerPaymentId} /> : null}
                <KeyValue label="Date" value={formatDate(d.issuedAt)} />
                <Divider dashed />
                <T weight="extrabold" size={28} color={reversed ? colors.danger : '#059669'} style={{ textAlign: 'center', lineHeight: 36 }}>
                  {money(d.amountPaise)}
                </T>
                <T size={12} color={colors.muted} style={{ textAlign: 'center' }}>
                  {d.society?.name}
                </T>
              </Card>
              {reversed ? <Hint tone="coral" icon="arrow-undo-outline">This payment was reversed by the society office (e.g. a bounced cheque). The bill is open again.</Hint> : null}
              <Button title="Download receipt (PDF)" icon="download-outline" onPress={download} loading={downloading} />
              <Button title="View all payments" variant="alt" onPress={() => router.push('/payments')} />
            </>
          );
        }}
      </AsyncView>
    </Screen>
  );
}
