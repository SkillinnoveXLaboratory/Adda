import { useAuth } from '../../lib/auth.jsx';
import { noPermissionReason } from '../../lib/roles.js';
import { AnnouncementsManager } from '../../components/Announcements.jsx';

export default function SocietyAnnouncements() {
  const { can, role } = useAuth();
  const canWrite = can('announcements');
  return (
    <AnnouncementsManager
      basePath="/society/announcements"
      title="Notices"
      subtitle="Announcements for residents — they appear in the adda app and as notifications"
      canWrite={canWrite}
      writeReason={canWrite ? null : noPermissionReason(role)}
      allowEdit
      allowAttachments
      emptyMessage="Publish your first notice — maintenance schedules, meetings, events or emergencies."
    />
  );
}
