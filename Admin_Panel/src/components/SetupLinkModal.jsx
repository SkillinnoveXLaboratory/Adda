import { Alert, Button, CopyField } from './ui.jsx';
import { Modal } from './Modal.jsx';

/** Shows a one-time setup link (staff invite / regenerate / platform add-admin). */
export function SetupLinkModal({ open, onClose, title = 'Share the setup link', email, link, emailed, hours = 72 }) {
  return (
    <Modal open={open} onClose={onClose} title={title} icon="fa-solid fa-link" footer={<Button onClick={onClose}>Done</Button>}>
      <div className="space-y-4" data-testid="setup-link-modal">
        {emailed ? (
          <Alert tone="success" title="Invitation emailed">
            We emailed {email} a link to set their password. You can also share the link below.
          </Alert>
        ) : (
          <Alert tone="warning" title="Email is not configured — share this link yourself">
            Send this link to {email || 'the new user'} over a channel you trust (WhatsApp, SMS, in person). It lets them set their password and is shown only now.
          </Alert>
        )}
        {link ? <CopyField label={`One-time setup link (valid about ${hours} hours)`} value={link} testId="setup-link" /> : <Alert tone="info">This person already has an active account, so no setup link is needed. They can sign in with their existing password.</Alert>}
      </div>
    </Modal>
  );
}
