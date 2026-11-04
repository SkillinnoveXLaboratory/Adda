import { useAuth } from '../../lib/auth.jsx';
import { noPermissionReason } from '../../lib/roles.js';
import { CategoriesManager } from '../../components/Categories.jsx';

export default function SocietyCategories() {
  const { can, role } = useAuth();
  const ok = can('society.manage');
  return <CategoriesManager writeReason={ok ? null : noPermissionReason(role)} />;
}
