import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ListingCard } from '../../components/ListingCard';
import { OfferCard } from '../../components/OfferCard';
import { AsyncView, Button, DetailHeader, PillToggle, Screen } from '../../components/ui';
import { useApi } from '../../hooks/useApi';

/**
 * A member's own listings. Members sell items in the marketplace; property and service listings come from
 * verified vendors (Vendor Panel website), so those tabs only show what the member listed before (to pause or delete).
 */
const KINDS = {
  marketplace: { label: 'Items', path: '/marketplace/mine', add: ['Sell an item', '/marketplace/edit'], open: '/marketplace', icon: 'bag-handle-outline', empty: 'Sell things you no longer need to your neighbours.' },
  property: { label: 'Properties', path: '/properties/mine', open: '/properties', icon: 'business-outline', empty: 'Properties are listed by verified vendors. Browse homes under Properties.' },
  service: { label: 'Services', path: '/service-offers/mine', open: '/offers', icon: 'construct-outline', empty: 'Services are listed by verified vendors. Book one from Home Maintenance.' },
};

export default function MyListings() {
  const { tab } = useLocalSearchParams();
  const [kind, setKind] = useState(KINDS[tab] ? tab : 'marketplace');
  const k = KINDS[kind];
  const list = useApi(k.path, { query: { limit: 50 } });
  return (
    <Screen header={<DetailHeader title="My listings" fallback="/" />} refreshing={list.refreshing} onRefresh={list.refresh} footer={k.add ? <Button title={k.add[0]} icon="add" onPress={() => router.push(k.add[1])} /> : undefined}>
      <PillToggle options={Object.entries(KINDS).map(([value, v]) => ({ value, label: v.label }))} value={kind} onChange={setKind} />
      <AsyncView state={list} empty={{ when: (d) => !d.items.length, icon: k.icon, title: kind === 'marketplace' ? 'No items yet' : 'Nothing listed', message: k.empty }}>
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
