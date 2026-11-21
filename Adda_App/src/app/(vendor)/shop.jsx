import { useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { LocationPicker } from '../../components/LocationPicker';
import { PayoutStatusCard } from '../../components/PayoutStatusCard';
import { AsyncView, Button, Card, DetailHeader, Field, Hint, LoadingList, Screen, SectionTitle, T } from '../../components/ui';
import { useAuth } from '../../context/auth';
import { useToast } from '../../context/toast';
import { useAction, useApi } from '../../hooks/useApi';
import { api, uploadFile } from '../../lib/api';
import { notify } from '../../lib/dialog';
import { toApiLocation } from '../../lib/location';
import { colors } from '../../theme';

const MAX_MB = 5;
const sameLoc = (a, b) => (!a && !b) || (a && b && a.lat === b.lat && a.lng === b.lng && (a.label || '') === (b.label || ''));

/**
 * Shop settings (vendors): shop name, logo (purpose vendor_logo) and shop location → PUT /vendor/shop,
 * plus the Cashfree payout account status for online payments (GET /vendor/profile → payout).
 */
export default function ShopSettings() {
  const profile = useApi('/vendor/profile', { refetchOnFocus: false });
  return (
    <Screen header={<DetailHeader title="Shop settings" fallback="/vendor-profile" />}>
      <AsyncView state={profile} skeleton={<LoadingList rows={3} card={90} />}>
        {/* After a save the server copy is the new baseline: remount the form with it. */}
        {(d) => (
          <>
            <ShopForm key={JSON.stringify(d.shop || {})} profile={d} onSaved={(p) => profile.setData((cur) => ({ ...cur, ...p }))} />
            <SectionTitle title="Online payments" />
            <PayoutStatusCard key={`${d.payout?.status}|${d.payout?.updatedAt}`} payout={d.payout} kycStatus={d.kycStatus} />
          </>
        )}
      </AsyncView>
    </Screen>
  );
}

function ShopForm({ profile, onSaved }) {
  const toast = useToast();
  const { refreshProfile } = useAuth();
  const shop = profile.shop || {};
  const [name, setName] = useState(shop.name || '');
  const [logo, setLogo] = useState(shop.logo || null); // { _id, url } | null
  const [location, setLocation] = useState(shop.location || null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const changes = {};
  if (name.trim() !== (shop.name || '')) changes.shopName = name.trim();
  if ((logo?._id || null) !== (shop.logo?._id || null)) changes.logoId = logo?._id || null;
  if (!sameLoc(location, shop.location)) changes.location = toApiLocation(location);
  const dirty = Object.keys(changes).length > 0;

  const pickLogo = async () => {
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return notify('Photo access needed', 'Allow photo access in your phone settings to choose a logo.');
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8, exif: false });
    if (res.canceled) return undefined;
    const a = res.assets[0];
    if (a.fileSize && a.fileSize > MAX_MB * 1024 * 1024) return toast.error(`Choose an image smaller than ${MAX_MB} MB`);
    setUploading(true);
    try {
      const media = await uploadFile(a, 'vendor_logo');
      setLogo({ _id: media._id, url: media.url || a.uri });
    } catch (err) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
    return undefined;
  };

  const [save, busy] = useAction(async () => {
    if ('shopName' in changes && (changes.shopName.length < 2 || changes.shopName.length > 80)) return setError('Shop name must be 2 to 80 characters');
    setError(null);
    if (!dirty) return undefined;
    try {
      const updated = await api('/vendor/shop', { method: 'PUT', body: changes });
      onSaved(updated);
      refreshProfile().catch(() => {});
      toast.success(changes.location !== undefined ? 'Shop saved. Your services now use this location.' : 'Shop saved');
    } catch (err) {
      if (err.details?.length) setError(err.details.map((x) => x.message).join(' '));
      toast.error(err.message);
    }
    return undefined;
  });

  return (
    <>
      <Card style={styles.head}>
        <Pressable onPress={pickLogo} accessibilityRole="button" accessibilityLabel={logo ? 'Change shop logo' : 'Add shop logo'} style={styles.logoBox} testID="shop-logo">
          {uploading ? (
            <ActivityIndicator color={colors.gold} />
          ) : logo?.url ? (
            <Image source={{ uri: logo.url }} style={styles.logo} />
          ) : (
            <Ionicons name="storefront-outline" size={30} color={colors.goldDark} />
          )}
          <View style={styles.camera}>
            <Ionicons name="camera" size={13} color={colors.navy} />
          </View>
        </Pressable>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <T weight="extrabold" size={15} color={colors.navy} numberOfLines={2}>
            {name.trim() || profile.businessName || 'Your shop'}
          </T>
          <T size={11.5} color={colors.muted}>
            Members see your shop name and logo on every service.
          </T>
          {logo ? (
            <Pressable onPress={() => setLogo(null)} accessibilityRole="button" accessibilityLabel="Remove logo" style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
              <T weight="bold" size={12} color={colors.danger}>
                Remove logo
              </T>
            </Pressable>
          ) : null}
        </View>
      </Card>

      <Field label="Shop name" value={name} onChangeText={(v) => (setName(v), setError(null))} maxLength={80} placeholder={profile.businessName || 'e.g. Sharma Electricals'} error={error} testID="shop-name" />

      <SectionTitle title="Shop location" />
      <LocationPicker label={null} hint="Used for members’ “Near me” search. It applies to all your services." value={location} onChange={setLocation} testID="shop-location" />
      {!location ? <Hint tone="amber" icon="location-outline">Without a location your services don’t appear in “Near me”.</Hint> : null}

      <Button title="Save shop" icon="checkmark" onPress={save} loading={busy} disabled={!dirty || uploading} />
    </>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  logoBox: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.goldLight, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 76, height: 76, borderRadius: 38 },
  camera: { position: 'absolute', right: 0, bottom: 0, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.white },
});
