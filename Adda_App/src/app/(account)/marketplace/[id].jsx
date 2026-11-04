import { useLocalSearchParams } from 'expo-router';
import { ListingDetailView } from '../../../components/ListingDetail';
import { AsyncView, DetailHeader, LoadingList, Screen } from '../../../components/ui';
import { useApi } from '../../../hooks/useApi';

export default function MarketItemDetail() {
  const { id } = useLocalSearchParams();
  const item = useApi(`/marketplace/${id}`);
  return (
    <Screen header={<DetailHeader title="Item details" fallback="/marketplace" />} refreshing={item.refreshing} onRefresh={item.refresh}>
      <AsyncView state={item} skeleton={<LoadingList rows={2} card={200} />}>
        {(d) => <ListingDetailView item={d} kind="marketplace" onChanged={item.refresh} />}
      </AsyncView>
    </Screen>
  );
}
