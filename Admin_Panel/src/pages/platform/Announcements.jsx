import { AnnouncementsManager } from '../../components/Announcements.jsx';
import { useAuth } from '../../lib/auth.jsx';

export default function PlatformAnnouncements() {
  const { canManage } = useAuth();
  return (
    <AnnouncementsManager
      basePath="/platform/announcements"
      title="Platform announcements"
      subtitle="Platform-wide notices from the Nivasa team (e.g. maintenance windows, policy updates)"
      canWrite
      readOnly={!canManage('announcements')}
      writeReason={null}
      allowEdit={false}
      allowAttachments={false}
      statusTabs={false}
      emptyMessage="Create an announcement to inform every society on Nivasa."
    />
  );
}
