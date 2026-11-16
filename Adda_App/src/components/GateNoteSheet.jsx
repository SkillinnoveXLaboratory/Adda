import { NoteSheet } from './GateKit';
import { useToast } from '../context/toast';
import { api } from '../lib/api';

/**
 * "Send note" from the gate to one member (3–500 characters, optionally about a guest).
 * `member` = { _id (user id), name, flat? } or null (closed). `onSent(note)` after the server saved it.
 */
export function GateNoteSheet({ member, visitor, onClose, onSent }) {
  const toast = useToast();
  return (
    <NoteSheet
      visible={!!member}
      title={`Note to ${member?.name || 'member'}`}
      subtitle={visitor ? `About ${visitor.name}. They get it as a notification.` : `${member?.flat?.number ? `Flat ${member.flat.number} · ` : ''}They get it as a notification.`}
      label="Note"
      placeholder="e.g. Your parcel is kept at the gate"
      min={3}
      max={500}
      submitLabel="Send note"
      onClose={onClose}
      onSubmit={async (text) => {
        const note = await api('/gate/notes', { method: 'POST', body: { memberId: member._id, text, ...(visitor && { visitorId: visitor._id }) } });
        toast.success(`Note sent to ${member.name || 'the member'}`);
        onSent?.(note);
        onClose();
      }}
    />
  );
}
