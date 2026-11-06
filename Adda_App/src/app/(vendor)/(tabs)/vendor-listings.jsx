import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { KycStatusCard } from '../../../components/KycStatusCard';
import { ListingCard } from '../../../components/ListingCard';
import { OfferCard } from '../../../components/OfferCard';
import { AsyncView, Button, Hero, PillToggle, Screen } from '../../../components/ui';
import { useAuth } from '../../../context/auth';
import { useApi } from '../../../hooks/useApi';

const KINDS = {
  property: { label: 'Properties', path: '/properties/mine', add: ['List a property', '/properties/edit'], open: '/properties', icon: 'business-outline', empty: 'List a flat, house, plot or shop for sale or rent.' },
  service: { label: 'Services', path: '/service-offers/mine', add: ['Add a service', '/offers/edit'], open: '/offers', icon: 'construct-outline', empty: 'Add the home services you offer — plumbing, electrical, cleaning and more.' },
};

/** A vendor's own properties and services with review status; approved, live ones can be boosted. */
export default function VendorListings() {
  const { tab } = useLocalSearchParams();
  const { vendor } = useAuth();
  // The ?tab= link wins when it changes (e.g. from the dashboard); otherwise the user's own choice stays.
  const [sel, setSel] = useState({ tab, kind: KINDS[tab] ? tab : 'property' });
  const kind = sel.tab === tab ? sel.kind : KINDS[tab] ? tab : sel.kind;
  const setKind = (k) => setSel({ tab, kind: k });
  const k = KINDS[kind];
  const list = useApi(k.path, { query: { limit: 50 } });
  const verified = vendor?.kycStatus === 'approved';
  const live = (p) => p.moderationStatus === 'approved' && (kind === 'property' ? p.availability === 'available' : p.status === 'active');

  return (
    <Screen
      header={<Hero title="My Listings" subtitle="Properties and services you offer" />}
      refreshing={list.refreshing}
      onRefresh={list.refresh}
      footer={<Button title={verified ? k.add[0] : 'Complete KYC to list'} icon={verified ? 'add' : 'shield-checkmark-outline'} onPress={() => router.push(verified ? k.add[1] : '/kyc')} />}
    >
      {!verified ? <KycStatusCard status={vendor?.kycStatus} note={vendor?.kycNote} /> : null}
      <PillToggle options={Object.entries(KINDS).map(([value, v]) => ({ value, label: v.label }))} value={kind} onChange={setKind} />
      <AsyncView state={list} empty={{ when: (d) => !d.items.length, icon: k.icon, title: kind === 'service' ? 'No services yet' : 'No properties yet', message: k.empty }}>
        {(d) => (
          <View style={{ gap: 12 }}>
            {d.items.map((p) => (
              <View key={p._id} style={{ gap: 6 }}>
                {kind === 'service' ? (
                  <OfferCard item={p} showModeration onPress={() => router.push(`/offers/${p._id}`)} />
                ) : (
                  <ListingCard item={p} kind="property" showModeration onPress={() => router.push(`/properties/${p._id}`)} />
                )}
                {verified && live(p) ? <Button small title="Boost this post" icon="rocket-outline" variant="outline" onPress={() => router.push({ pathname: '/boost', params: { kind, id: p._id } })} /> : null}
              </View>
            ))}
          </View>
        )}
      </AsyncView>
    </Screen>
  );
}
