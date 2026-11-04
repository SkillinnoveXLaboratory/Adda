import { useLocalSearchParams } from 'expo-router';
import { ListingDetailView } from '../../../components/ListingDetail';
import { AsyncView, DetailHeader, LoadingList, Screen } from '../../../components/ui';
import { useApi } from '../../../hooks/useApi';

export default function PropertyDetail() {
  const { id } = useLocalSearchParams();
  const item = useApi(`/properties/${id}`);
  return (
    <Screen header={<DetailHeader title="Property details" fallback="/properties" />} refreshing={item.refreshing} onRefresh={item.refresh}>
      <AsyncView state={item} skeleton={<LoadingList rows={2} card={200} />}>
        {(d) => <ListingDetailView item={d} kind="property" onChanged={item.refresh} />}
      </AsyncView>
    </Screen>
  );
}
