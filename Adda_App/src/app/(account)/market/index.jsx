import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { FilterButton, PropertyBrowser } from '../../../components/PropertyBrowser';
import { ServiceBrowser } from '../../../components/ServiceBrowser';
import { DetailHeader, PillToggle } from '../../../components/ui';

const TABS = [
  { value: 'services', label: 'Services' },
  { value: 'properties', label: 'Properties' },
];

/**
 * Marketplace (members): every approved vendor service — with "Near me" — and, on the Properties tab,
 * the property browser (Buy / Rent). Vendors list here from their own area.
 */
export default function Marketplace() {
  const params = useLocalSearchParams();
  const [tab, setTab] = useState(params.tab === 'properties' ? 'properties' : 'services');
  const [showFilters, setShowFilters] = useState(false);
  const top = <PillToggle options={TABS} value={tab} onChange={setTab} />;
  if (tab === 'properties') {
    return <PropertyBrowser top={top} showFilters={showFilters} setShowFilters={setShowFilters} header={<DetailHeader title="Marketplace" fallback="/" right={<FilterButton active={showFilters} onPress={() => setShowFilters((s) => !s)} />} />} />;
  }
  return <ServiceBrowser top={top} header={<DetailHeader title="Marketplace" fallback="/" />} initialNear={params.near === '1'} />;
}
