import { ListingsModeration } from '../../components/ListingsModeration.jsx';
import { useCounts } from '../../layout/Portals.jsx';
import { useAuth } from '../../lib/auth.jsx';

export default function PlatformListings() {
  const { refreshCounts } = useCounts();
  const { canManage } = useAuth();
  return <ListingsModeration platform onChanged={refreshCounts} readOnly={!canManage('listings')} />;
}
