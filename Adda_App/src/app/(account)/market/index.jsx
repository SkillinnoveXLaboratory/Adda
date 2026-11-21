import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { FilterButton, PropertyBrowser } from '../../../components/PropertyBrowser';
import { ProductBrowser } from '../../../components/ProductBrowser';
import { ServiceBrowser } from '../../../components/ServiceBrowser';
import { DetailHeader, IconButton, PillToggle } from '../../../components/ui';
import { useAuth } from '../../../context/auth';
import { colors } from '../../../theme';

const TABS = [
  { value: 'services', label: 'Services' },
  { value: 'products', label: 'Products' },
  { value: 'properties', label: 'Properties' },
];

/**
 * Marketplace (members): every approved vendor service — with "Near me" —, shop products (Buy → My orders) and,
 * on the Properties tab, the property browser (Buy / Rent). Vendors list here from their own area.
 */
export default function Marketplace() {
  const params = useLocalSearchParams();
  const { isVendor } = useAuth();
  const [tab, setTab] = useState(TABS.some((t) => t.value === params.tab) ? params.tab : 'services');
  const [showFilters, setShowFilters] = useState(false);
  const top = <PillToggle options={TABS} value={tab} onChange={setTab} />;
  const orders = isVendor ? null : <IconButton icon="receipt-outline" label="My orders" color={colors.white} onPress={() => router.push('/my-orders')} />;
  if (tab === 'properties') {
    return (
      <PropertyBrowser
        top={top}
        showFilters={showFilters}
        setShowFilters={setShowFilters}
        header={
          <DetailHeader
            title="Marketplace"
            fallback="/"
            right={
              <View style={{ flexDirection: 'row' }}>
                {orders}
                <FilterButton active={showFilters} onPress={() => setShowFilters((s) => !s)} />
              </View>
            }
          />
        }
      />
    );
  }
  const header = <DetailHeader title="Marketplace" fallback="/" right={orders} />;
  if (tab === 'products') return <ProductBrowser top={top} header={header} />;
  return <ServiceBrowser top={top} header={header} initialNear={params.near === '1'} />;
}
