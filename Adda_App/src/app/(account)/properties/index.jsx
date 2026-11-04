import { useState } from 'react';
import { DetailHeader } from '../../../components/ui';
import { FilterButton, PropertyBrowser } from '../../../components/PropertyBrowser';

/** /properties — reachable before joining a society too (listings need no membership). */
export default function Properties() {
  const [showFilters, setShowFilters] = useState(false);
  return <PropertyBrowser showFilters={showFilters} setShowFilters={setShowFilters} header={<DetailHeader title="Properties" fallback="/" right={<FilterButton active={showFilters} onPress={() => setShowFilters((s) => !s)} />} />} />;
}
