import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ListingCard } from '../../components/ListingCard';
import { OfferCard } from '../../components/OfferCard';
import { AsyncView, Button, DetailHeader, PillToggle, Screen } from '../../components/ui';
import { useApi } from '../../hooks/useApi';

const KINDS = {
  property: { label: 'Properties', path: '/properties/mine', add: ['List a property', '/properties/edit'], open: '/properties', icon: 'business-outline', empty: 'List your flat for rent or sale.' },
  marketplace: { label: 'Items', path: '/marketplace/mine', add: ['Sell an item', '/marketplace/edit'], open: '/marketplace', icon: 'bag-handle-outline', empty: 'Sell things you no longer need.' },
  service: { label: 'Services', path: '/service-offers/mine', add: ['Offer your service', '/offers/edit'], open: '/offers', icon: 'construct-outline', empty: 'Offer your skills — plumbing, tuition, cooking — to neighbours.' },
};

/** Everything the user has listed: properties, marketplace items and services (?tab=service). */
export default function MyListings() {
  const { tab } = useLocalSearchParams();
  const [kind, setKind] = useState(KINDS[tab] ? tab : 'property');
  const k = KINDS[kind];
  const list = useApi(k.path, { query: { limit: 50 } });
  return (
    <Screen header={<DetailHeader title="My listings" fallback="/" />} refreshing={list.refreshing} onRefresh={list.refresh} footer={<Button title={k.add[0]} icon="add" onPress={() => router.push(k.add[1])} />}>
      <PillToggle options={Object.entries(KINDS).map(([value, v]) => ({ value, label: v.label }))} value={kind} onChange={setKind} />
      <AsyncView state={list} empty={{ when: (d) => !d.items.length, icon: k.icon, title: kind === 'service' ? 'No services yet' : 'No listings yet', message: k.empty }}>
        {(d) => (
          <View style={{ gap: 10 }}>
            {d.items.map((p) =>
              kind === 'service' ? (
                <OfferCard key={p._id} item={p} showModeration onPress={() => router.push(`/offers/${p._id}`)} />
              ) : (
                <ListingCard key={p._id} item={p} kind={kind} showModeration onPress={() => router.push(`${k.open}/${p._id}`)} />
              ),
            )}
          </View>
        )}
      </AsyncView>
    </Screen>
  );
}
