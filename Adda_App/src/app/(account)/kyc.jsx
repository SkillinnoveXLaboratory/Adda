import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AttachmentPicker } from '../../components/AttachmentPicker';
import { NIcon } from '../../components/NivasaIcons';
import { AsyncView, Badge, Button, Card, DetailHeader, Field, Hint, KeyValue, LoadingList, PillToggle, Screen, SectionTitle, T } from '../../components/ui';
import { useAuth } from '../../context/auth';
import { useToast } from '../../context/toast';
import { useAction, useApi } from '../../hooks/useApi';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { aadhaarValid, formatAadhaar, IFSC_RX, PAN_RX } from '../../lib/validation';
import { colors } from '../../theme';

const STATUS = {
  not_submitted: ['Not submitted', 'warning', 'Add your details and documents to get verified. Only verified vendors can list properties and services.'],
  pending: ['Under review', 'info', 'NIVASA is checking your documents. You will get a notification when it is done.'],
  approved: ['Verified', 'success', 'Your KYC is approved. You can list properties and services and boost your posts.'],
  rejected: ['Needs changes', 'danger', null],
};
const DOCS = [
  ['panPhoto', 'PAN card photo', 'Front of your PAN card, all text readable'],
  ['aadhaarFront', 'Aadhaar — front', 'Side with your photo and Aadhaar number'],
  ['aadhaarBack', 'Aadhaar — back', 'Side with your address'],
];

/** Says exactly what is wrong with a PAN (5 letters, 4 digits, 1 letter). */
function panProblem(pan) {
  if (PAN_RX.test(pan)) return null;
  if (pan.length !== 10) return `PAN has 10 characters (you entered ${pan.length}): 5 letters, 4 digits, 1 letter — e.g. ABCDE1234F`;
  if (!/^[A-Z]{5}/.test(pan)) return 'The first 5 characters of a PAN are letters — e.g. ABCDE1234F';
  if (!/^[A-Z]{5}[0-9]{4}/.test(pan)) return 'Characters 6 to 9 of a PAN are digits (check for the letter O instead of 0) — e.g. ABCDE1234F';
  return 'The last character of a PAN is a letter — e.g. ABCDE1234F';
}

/** Says exactly what is wrong with an Aadhaar number (12 digits, not starting 0/1, valid check digit). */
function aadhaarProblem(a) {
  if (aadhaarValid(a)) return null;
  if (a.length !== 12) return `Aadhaar has 12 digits (you entered ${a.length})`;
  if (/^[01]/.test(a)) return 'Aadhaar numbers never start with 0 or 1';
  return 'This is not a valid Aadhaar number — one digit is probably wrong. Check it against your card.';
}

/** Vendor KYC: PAN, Aadhaar, bank details and document photos. Numbers are stored encrypted and shown masked. */
export default function Kyc() {
  const { isVendor } = useAuth();
  const profile = useApi(isVendor ? '/vendor/profile' : null);
  if (!isVendor) {
    return (
      <Screen header={<DetailHeader title="Vendor KYC" fallback="/" />}>
        <Hint tone="amber">KYC is only for vendor accounts. Members don’t need it.</Hint>
      </Screen>
    );
  }
  return (
    <AsyncView state={profile} skeleton={<LoadingScreen />}>
      {(p) => <KycView profile={p} onSaved={profile.refresh} />}
    </AsyncView>
  );
}

function LoadingScreen() {
  return (
    <Screen header={<DetailHeader title="Vendor KYC" fallback="/dashboard" />}>
      <LoadingList rows={4} card={80} />
    </Screen>
  );
}

function KycView({ profile: p, onSaved }) {
  const [editing, setEditing] = useState(['not_submitted', 'rejected'].includes(p.kycStatus));
  const [label, tone, body] = STATUS[p.kycStatus] || STATUS.not_submitted;
  if (editing) return <KycForm profile={p} onDone={() => (setEditing(false), onSaved())} onCancel={p.kycStatus === 'pending' ? () => setEditing(false) : null} />;
  return (
    <Screen header={<DetailHeader title="Vendor KYC" fallback="/dashboard" />} footer={p.kycStatus === 'pending' ? <Button title="Update details" variant="alt" icon="create-outline" onPress={() => setEditing(true)} /> : undefined}>
      <Card style={styles.status}>
        <NIcon name="shield" size={36} />
        <View style={{ flex: 1, gap: 4 }}>
          <Badge label={label} tone={tone} style={{ alignSelf: 'flex-start' }} />
          <T size={12.5} color="#475569" style={{ lineHeight: 18 }}>
            {body || (p.kycNote ? `Reason: ${p.kycNote}` : 'Please check your details and submit again.')}
          </T>
        </View>
      </Card>
      <SectionTitle title="Business" />
      <Card>
        <KeyValue label="Name" value={p.businessName} />
        <KeyValue label="Type" value={p.businessType === 'business' ? 'Business' : 'Individual'} />
        <KeyValue label="City" value={p.city} />
        {p.address ? <KeyValue label="Address" value={p.address} /> : null}
        {p.submittedAt ? <KeyValue label="Submitted" value={formatDate(p.submittedAt)} /> : null}
        {p.reviewedAt ? <KeyValue label="Reviewed" value={formatDate(p.reviewedAt)} /> : null}
      </Card>
      <SectionTitle title="Identity & bank (masked)" />
      <Card>
        <KeyValue label="PAN" value={p.pan} />
        <KeyValue label="Aadhaar" value={p.aadhaar} />
        <KeyValue label="Account holder" value={p.bankAccountHolder} />
        <KeyValue label="Account number" value={p.bankAccount} />
        <KeyValue label="IFSC" value={p.bankIfsc} />
        {p.bankName ? <KeyValue label="Bank" value={p.bankName} /> : null}
      </Card>
      <SectionTitle title="Documents" />
      <View style={styles.docs}>
        {DOCS.map(([key, title]) => (
          <View key={key} style={styles.doc}>
            {p.documents?.[key]?.mimeType?.startsWith('image/') ? (
              <Image source={{ uri: p.documents[key].url }} style={styles.docImg} accessibilityLabel={title} />
            ) : (
              <View style={[styles.docImg, styles.docPdf]}>
                <Ionicons name={p.documents?.[key] ? 'document-text-outline' : 'alert-circle-outline'} size={26} color={colors.goldDark} />
              </View>
            )}
            <T weight="semibold" size={10.5} color="#475569" numberOfLines={2} style={{ textAlign: 'center' }}>
              {title}
            </T>
          </View>
        ))}
      </View>
      <T size={11} color={colors.subtle} style={{ lineHeight: 16 }}>
        Your PAN, Aadhaar and account numbers are stored encrypted. Only NIVASA’s verification team can see them in full, and every view is logged.
      </T>
    </Screen>
  );
}

function KycForm({ profile: p, onDone, onCancel }) {
  const toast = useToast();
  const { refreshProfile } = useAuth();
  const [f, setF] = useState({ businessName: p.businessName || '', businessType: p.businessType || 'individual', city: p.city || '', address: p.address || '', pan: '', aadhaar: '', bankAccountHolder: p.bankAccountHolder || '', bankAccountNumber: '', confirmAccount: '', bankIfsc: p.bankIfsc || '', bankName: p.bankName || '' });
  const [docs, setDocs] = useState({ panPhoto: [], aadhaarFront: [], aadhaarBack: [] });
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState({});
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const setDoc = (k) => (updater) => setDocs((d) => ({ ...d, [k]: typeof updater === 'function' ? updater(d[k]) : updater }));

  const validate = () => {
    const e = {};
    const aadhaar = f.aadhaar.replace(/\s/g, '');
    if (f.businessName.trim().length < 2) e.businessName = 'Enter your business or full name';
    if (f.city.trim().length < 2) e.city = 'Enter your city';
    e.pan = panProblem(f.pan.trim().toUpperCase());
    e.aadhaar = aadhaarProblem(aadhaar);
    if (f.bankAccountHolder.trim().length < 2) e.bankAccountHolder = 'Enter the account holder’s name';
    if (!/^\d{9,18}$/.test(f.bankAccountNumber)) e.bankAccountNumber = 'Enter a valid account number (9 to 18 digits)';
    else if (f.confirmAccount !== f.bankAccountNumber) e.confirmAccount = 'Account numbers don’t match';
    if (!IFSC_RX.test(f.bankIfsc.trim().toUpperCase())) e.bankIfsc = 'Enter a valid IFSC, e.g. SBIN0001234';
    for (const [k, title] of DOCS) if (!docs[k].length) e[k] = `Upload the ${title.toLowerCase()}`;
    if (!consent) e.consent = 'Please confirm to continue';
    setErrors(e);
    return !Object.values(e).some(Boolean);
  };

  const [submit, busy] = useAction(async () => {
    if (!validate()) return toast.error('Please fix the highlighted fields');
    try {
      await api('/vendor/kyc', {
        method: 'PUT',
        body: {
          businessName: f.businessName.trim(),
          businessType: f.businessType,
          city: f.city.trim(),
          ...(f.address.trim() && { address: f.address.trim() }),
          pan: f.pan.trim().toUpperCase(),
          aadhaar: f.aadhaar.replace(/\s/g, ''),
          bankAccountHolder: f.bankAccountHolder.trim(),
          bankAccountNumber: f.bankAccountNumber,
          bankIfsc: f.bankIfsc.trim().toUpperCase(),
          ...(f.bankName.trim() && { bankName: f.bankName.trim() }),
          panPhoto: docs.panPhoto[0]._id,
          aadhaarFront: docs.aadhaarFront[0]._id,
          aadhaarBack: docs.aadhaarBack[0]._id,
          consent: true,
        },
      });
      await refreshProfile().catch(() => {});
      toast.success('KYC submitted for review');
      onDone();
    } catch (err) {
      toast.error(err.message);
    }
  });

  return (
    <Screen header={<DetailHeader title="Vendor KYC" fallback="/dashboard" />} footer={<Button title="Submit for verification" icon="shield-checkmark" onPress={submit} loading={busy} disabled={!p.kycAvailable} />}>
      {!p.kycAvailable ? <Hint tone="coral">Vendor verification is not set up on the server yet. Please try again later.</Hint> : null}
      {p.kycStatus === 'rejected' && p.kycNote ? <Hint tone="coral" icon="close-circle-outline">{`Not approved: ${p.kycNote}`}</Hint> : null}
      <Hint icon="lock-closed-outline">Your PAN, Aadhaar and bank account numbers are stored encrypted and shown masked. Re-enter them each time you submit.</Hint>

      <SectionTitle title="Business details" />
      <PillToggle
        options={[
          { value: 'individual', label: 'Individual' },
          { value: 'business', label: 'Business' },
        ]}
        value={f.businessType}
        onChange={set('businessType')}
      />
      <Field label={f.businessType === 'business' ? 'Business name' : 'Full name (as on PAN)'} value={f.businessName} onChangeText={set('businessName')} maxLength={120} error={errors.businessName} />
      <Field label="City" value={f.city} onChangeText={set('city')} maxLength={80} error={errors.city} />
      <Field label="Address (optional)" value={f.address} onChangeText={set('address')} maxLength={300} multiline />

      <SectionTitle title="Identity" />
      <Field label="PAN number" value={f.pan} onChangeText={(v) => set('pan')(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))} autoCapitalize="characters" maxLength={10} placeholder="ABCDE1234F" error={errors.pan} />
      <Field label="Aadhaar number" value={f.aadhaar} onChangeText={(v) => set('aadhaar')(formatAadhaar(v))} keyboardType="number-pad" maxLength={14} placeholder="1234 5678 9012" error={errors.aadhaar} />

      <SectionTitle title="Bank account (for payouts)" />
      <Field label="Account holder name" value={f.bankAccountHolder} onChangeText={set('bankAccountHolder')} maxLength={120} error={errors.bankAccountHolder} />
      <Field label="Account number" value={f.bankAccountNumber} onChangeText={(v) => set('bankAccountNumber')(v.replace(/\D/g, '').slice(0, 18))} keyboardType="number-pad" secure error={errors.bankAccountNumber} />
      <Field label="Confirm account number" value={f.confirmAccount} onChangeText={(v) => set('confirmAccount')(v.replace(/\D/g, '').slice(0, 18))} keyboardType="number-pad" error={errors.confirmAccount} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Field label="IFSC" value={f.bankIfsc} onChangeText={(v) => set('bankIfsc')(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11))} autoCapitalize="characters" maxLength={11} placeholder="SBIN0001234" error={errors.bankIfsc} style={{ flex: 1 }} />
        <Field label="Bank (optional)" value={f.bankName} onChangeText={set('bankName')} maxLength={120} style={{ flex: 1 }} />
      </View>

      <SectionTitle title="Document photos" />
      {DOCS.map(([key, title, hint]) => (
        <View key={key} style={{ gap: 4 }}>
          <T weight="bold" size={13} color={colors.navy}>
            {title}
          </T>
          <T size={11.5} color={colors.muted}>
            {hint}
          </T>
          <AttachmentPicker value={docs[key]} onChange={setDoc(key)} purpose="kyc" max={1} allowPdf label={`Add ${title.toLowerCase()}`} />
          {errors[key] ? (
            <T size={12} color={colors.danger}>
              {errors[key]}
            </T>
          ) : null}
        </View>
      ))}

      <Pressable onPress={() => setConsent((c) => !c)} accessibilityRole="checkbox" accessibilityState={{ checked: consent }} style={styles.consent}>
        <Ionicons name={consent ? 'checkbox' : 'square-outline'} size={22} color={consent ? colors.navy : '#94a3b8'} />
        <T size={12.5} color="#334155" style={{ flex: 1, lineHeight: 18 }}>
          I confirm these details and documents are mine and correct, and I agree to NIVASA verifying them for vendor KYC.
        </T>
      </Pressable>
      {errors.consent ? (
        <T size={12} color={colors.danger}>
          {errors.consent}
        </T>
      ) : null}
      {onCancel ? <Button title="Cancel" variant="ghost" onPress={onCancel} /> : null}
      {!onCancel && p.kycStatus === 'not_submitted' ? <Button title="I’ll do this later" variant="ghost" onPress={() => router.replace('/dashboard')} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  status: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  docs: { flexDirection: 'row', gap: 10 },
  doc: { flex: 1, gap: 6, alignItems: 'center' },
  docImg: { width: '100%', aspectRatio: 1.4, borderRadius: 12, backgroundColor: '#f1f5f9' },
  docPdf: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.goldLight },
  consent: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 6, minHeight: 44 },
});
