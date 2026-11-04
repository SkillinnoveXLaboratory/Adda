import { useState } from 'react';
import { Hero } from '../../../components/ui';
import { FilterButton, PropertyBrowser } from '../../../components/PropertyBrowser';

/** Properties tab (prototype screen 5). */
export default function ExploreProperties() {
  const [showFilters, setShowFilters] = useState(false);
  return <PropertyBrowser inTab showFilters={showFilters} setShowFilters={setShowFilters} header={<Hero title="Properties" right={<FilterButton active={showFilters} onPress={() => setShowFilters((s) => !s)} />} />} />;
}
