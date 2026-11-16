import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, T } from './ui';
import { GateCallButton, NoteSheet, VisitorStatusBadge, dayName, expectedWindow, formatPhone } from './GateKit';
import { useToast } from '../context/toast';
import { useAction } from '../hooks/useApi';
import { api } from '../lib/api';
import { confirm } from '../lib/dialog';
import { formatTime } from '../lib/format';
import { colors, shadow } from '../theme';

const GATE_ACTIONS = {
  approve: { title: 'Approve', icon: 'checkmark-circle', variant: 'brand', done: 'approved' },
  reject: { title: 'Reject', icon: 'close-circle', variant: 'danger', done: 'not allowed in' },
  enter: { title: 'Entered', icon: 'log-in-outline', variant: 'primary', done: 'marked as entered' },
  exit: { title: 'Exited', icon: 'log-out-outline', variant: 'outline', done: 'marked as exited' },
};

/**
 * One guest. `mode="gate"` shows the gateman's buttons from the server's `actions` (Approve / Reject / Entered / Exited);
 * `mode="member"` shows Cancel while the guest is still expected/approved. `onChanged(visitor|null)` after an action
 * (null = refresh the list, e.g. after a 409 because another gate already acted).
 */
export function VisitorCard({ visitor: v, mode = 'gate', onChanged, onOpen, showDate }) {
  const toast = useToast();
  const [rejecting, setRejecting] = useState(false);
  const base = mode === 'gate' ? `/gate/visitors/${v._id}` : `/resident/visitors/${v._id}`;

  const post = async (action, body = {}) => {
    try {
      const updated = await api(`${base}/${action}`, { method: 'POST', body });
      toast.success(mode === 'gate' ? `${v.name} ${GATE_ACTIONS[action].done}` : `${v.name}'s visit cancelled`);
      onChanged?.(updated);
      return updated;
    } catch (err) {
      toast.error(err.message);
      if (err.code === 'INVALID_TRANSITION' || err.status === 404) onChanged?.(null);
      if (action === 'reject') throw err;
      return null;
    }
  };
  const [run, busy] = useAction(post);

  const onAction = async (action) => {
    if (action === 'reject') return setRejecting(true);
    if (action === 'cancel') {
      const ok = await confirm({ title: `Cancel ${v.name}'s visit?`, message: 'Gate security will no longer expect this guest.', confirmText: 'Cancel visit', cancelText: 'Keep', destructive: true });
      if (!ok) return undefined;
    }
    return run(action);
  };

  const flat = [v.flat?.number ? `Flat ${v.flat.number}` : null, v.building?.name].filter(Boolean).join(' · ');
  const window = expectedWindow(v);
  const when = [showDate || mode === 'member' ? dayName(v.expectedDate) : null, window].filter(Boolean).join(', ');
  const actions = (v.actions || []).filter((a) => (mode === 'gate' ? GATE_ACTIONS[a] : a === 'cancel'));
  const times = [v.entryAt ? `In ${formatTime(v.entryAt)}` : null, v.exitAt ? `Out ${formatTime(v.exitAt)}` : null].filter(Boolean).join(' · ');

  const body = (
    <>
      <View style={styles.top}>
        <View style={styles.avatar}>
          <Ionicons name={v.status === 'inside' ? 'walk' : 'person'} size={20} color={colors.navy} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T weight="extrabold" size={15} color={colors.navy} numberOfLines={1}>
            {v.name}
          </T>
          <T size={12.5} color={colors.textSoft} numberOfLines={1} selectable>
            {formatPhone(v.phone)}
          </T>
        </View>
        <VisitorStatusBadge status={v.status} />
        <GateCallButton phone={v.phone} name={v.name} />
      </View>

      <View style={styles.meta}>
        {mode === 'gate' && flat ? <Line icon="business-outline" text={flat} strong /> : null}
        {mode === 'gate' ? <Line icon="person-outline" text={v.host?.name ? `Host: ${v.host.name}` : 'Host: whole flat'} /> : null}
        {when ? <Line icon="time-outline" text={`Expected ${when}`} /> : null}
        {times ? <Line icon="swap-horizontal-outline" text={times} /> : null}
        {v.purpose ? <Line icon="chatbox-ellipses-outline" text={v.purpose} /> : null}
        {v.status === 'rejected' && v.rejectedReason ? <Line icon="alert-circle-outline" text={`Reason: ${v.rejectedReason}`} danger /> : null}
        {v.createdByRole === 'gateman' ? <Line icon="shield-checkmark-outline" text="Added at the gate (walk-in)" /> : null}
      </View>

      {actions.length ? (
        <View style={styles.actions}>
          {actions.map((a) =>
            mode === 'gate' ? (
              <Button
                key={a}
                title={GATE_ACTIONS[a].title}
                icon={GATE_ACTIONS[a].icon}
                variant={GATE_ACTIONS[a].variant}
                onPress={() => onAction(a)}
                disabled={busy}
                loading={busy && a !== 'reject'}
                accessibilityLabel={`${GATE_ACTIONS[a].title} ${v.name}`}
                style={styles.action}
              />
            ) : (
              <Button
                key={a}
                title="Cancel visit"
                icon="close-circle-outline"
                variant="danger"
                onPress={() => onAction(a)}
                loading={busy}
                accessibilityLabel={`Cancel ${v.name}'s visit`}
                style={styles.action}
              />
            ),
          )}
        </View>
      ) : null}

      {mode === 'gate' ? (
        <NoteSheet
          visible={rejecting}
          title={`Reject ${v.name}?`}
          subtitle={`The ${flat ? `residents of ${flat}` : 'flat'} will be told this guest was not allowed in.`}
          label="Reason (optional)"
          placeholder="e.g. Resident not reachable"
          max={300}
          submitLabel="Reject"
          destructive
          onClose={() => setRejecting(false)}
          onSubmit={async (note) => {
            await run('reject', note ? { note } : {});
            setRejecting(false);
          }}
        />
      ) : null}
    </>
  );

  return onOpen ? (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Guest ${v.name}, ${v.status}`} style={({ pressed }) => [styles.card, pressed && { borderColor: colors.gold }]}>
      {body}
    </Pressable>
  ) : (
    <View style={styles.card}>{body}</View>
  );
}

function Line({ icon, text, strong, danger }) {
  return (
    <View style={styles.line}>
      <Ionicons name={icon} size={15} color={danger ? colors.danger : colors.subtle} style={{ marginTop: 2 }} />
      <T weight={strong ? 'bold' : 'medium'} size={12.5} color={danger ? colors.danger : strong ? colors.navy : colors.textSoft} style={{ flex: 1 }} numberOfLines={2}>
        {text}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 10, ...shadow.card },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.goldLight, alignItems: 'center', justifyContent: 'center' },
  meta: { gap: 4 },
  line: { flexDirection: 'row', gap: 7, alignItems: 'flex-start' },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1, minHeight: 46 },
});
