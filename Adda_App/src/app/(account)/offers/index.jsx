import { useLocalSearchParams } from 'expo-router';
import { ServiceBrowser } from '../../../components/ServiceBrowser';
import { DetailHeader } from '../../../components/ui';

/** Home services from KYC-verified vendors (search, categories, near me). Members browse and book. */
export default function Offers() {
  const params = useLocalSearchParams();
  return (
    <ServiceBrowser
      header={<DetailHeader title="Home Services" fallback="/" />}
      initialQ={typeof params.q === 'string' ? params.q : ''}
      initialCategory={typeof params.categoryId === 'string' ? params.categoryId : ''}
      initialNear={params.near === '1'}
    />
  );
}
