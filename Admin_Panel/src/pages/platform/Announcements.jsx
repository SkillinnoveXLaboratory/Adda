import { AnnouncementsManager } from '../../components/Announcements.jsx';

export default function PlatformAnnouncements() {
  return (
    <AnnouncementsManager
      basePath="/platform/announcements"
      title="Platform announcements"
      subtitle="Platform-wide notices from the adda team (e.g. maintenance windows, policy updates)"
      canWrite
      writeReason={null}
      allowEdit={false}
      allowAttachments={false}
      statusTabs={false}
      emptyMessage="Create an announcement to inform every society on adda."
    />
  );
}
