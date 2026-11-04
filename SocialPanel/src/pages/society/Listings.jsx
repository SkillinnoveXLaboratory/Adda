import { ListingsModeration } from '../../components/ListingsModeration.jsx';
import { useCounts } from '../../layout/Portals.jsx';

export default function SocietyListings() {
  const { refreshCounts } = useCounts();
  return <ListingsModeration onChanged={refreshCounts} />;
}
