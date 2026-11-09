import { CategoriesManager } from '../../components/Categories.jsx';
import { useAuth } from '../../lib/auth.jsx';

export default function PlatformCategories() {
  const { canManage } = useAuth();
  return <CategoriesManager platform readOnly={!canManage('categories')} />;
}
