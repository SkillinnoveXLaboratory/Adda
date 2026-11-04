import { ListingsModeration } from '../../components/ListingsModeration.jsx';
import { useCounts } from '../../layout/Portals.jsx';

export default function PlatformListings() {
  const { refreshCounts } = useCounts();
  return <ListingsModeration platform onChanged={refreshCounts} />;
}
