import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AttachmentPicker } from '../../../components/AttachmentPicker';
import { AsyncView, Button, DetailHeader, Field, PillToggle, Screen, SectionTitle, T } from '../../../components/ui';
import { useAuth } from '../../../context/auth';
import { useToast } from '../../../context/toast';
import { useAction, useApi } from '../../../hooks/useApi';
import { api } from '../../../lib/api';
import { colors } from '../../../theme';

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export default function NewComplaint() {
  const toast = useToast();
  const { activeMembership } = useAuth();
  const cats = useApi('/resident/complaint-categories', { refetchOnFocus: false });
  const [categoryId, setCategoryId] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('normal');
  const [media, setMedia] = useState([]);
  const [errors, setErrors] = useState({});

  const [submit, busy] = useAction(async () => {
    const e = {
      category: categoryId ? null : 'Choose a category',
      title: title.trim().length < 4 ? 'Title needs at least 4 characters' : null,
      description: description.trim().length < 10 ? 'Describe the issue in at least 10 characters' : null,
    };
    setErrors(e);
    if (e.category || e.title || e.description) return;
    try {
      const c = await api('/resident/complaints', { method: 'POST', body: { categoryId, title: title.trim(), description: description.trim(), priority, media: media.map((m) => m._id) } });
      toast.success(`Complaint ${c.ticketNumber} submitted`);
      router.replace(`/complaints/${c._id}`);
    } catch (err) {
      toast.error(err.message);
    }
  });

  return (
    <Screen header={<DetailHeader title="Raise complaint" fallback="/complaints" />} footer={<Button title="Submit complaint" icon="send" onPress={submit} loading={busy} />}>
      <SectionTitle title="Category" />
      <AsyncView state={cats}>
        {(d) => (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {d.items.map((c) => {
              const on = c._id === categoryId;
              return (
                <Pressable
                  key={c._id}
                  onPress={() => {
                    setCategoryId(c._id);
                    setErrors((x) => ({ ...x, category: null }));
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 20, borderWidth: 1.5, borderColor: on ? colors.blue : colors.border, backgroundColor: on ? '#f1f5f9' : colors.white }}
                >
                  {on ? <Ionicons name="checkmark-circle" size={16} color={colors.blue} /> : null}
                  <T weight={on ? 'bold' : 'medium'} size={13} color={on ? colors.blue : colors.textSoft}>
                    {c.name}
                  </T>
                </Pressable>
              );
            })}
          </View>
        )}
      </AsyncView>
      {errors.category ? (
        <T size={12} color={colors.danger}>
          {errors.category}
        </T>
      ) : null}
      <Field label="Complaint title" value={title} onChangeText={setTitle} placeholder="Briefly describe the issue" maxLength={140} error={errors.title} />
      <Field label="Description" value={description} onChangeText={setDescription} multiline maxLength={4000} placeholder="Where is it, since when, and anything the staff should know…" error={errors.description} hint={`${description.length}/4000`} />
      <View style={{ gap: 7 }}>
        <T weight="bold" size={13} color="#334155">
          Priority
        </T>
        <PillToggle options={PRIORITIES} value={priority} onChange={setPriority} />
      </View>
      <Field label="Building / Flat" value={`${activeMembership?.building?.name || ''}, ${activeMembership?.flat?.number || ''}`} editable={false} />
      <AttachmentPicker value={media} onChange={setMedia} purpose="complaint" allowPdf label="Attach photos or documents" />
    </Screen>
  );
}
