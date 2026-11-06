import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, Pressable, StyleSheet, View } from 'react-native';
import { notify } from '../lib/dialog';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { uploadFile } from '../lib/api';
import { useToast } from '../context/toast';
import { colors } from '../theme';
import { T } from './Text';

const MAX_MB = 8;

/**
 * Picks photos (and optionally PDFs), uploads each immediately to /uploads, and reports the uploaded ids.
 * value: [{ _id, url, mimeType, localUri }]
 */
export function AttachmentPicker({ value, onChange, purpose, max = 6, allowPdf = false, label = 'Add photos' }) {
  const toast = useToast();
  const [uploading, setUploading] = useState(0);
  const remaining = max - value.length - uploading;

  async function uploadAll(assets) {
    const ok = [];
    setUploading((n) => n + assets.length);
    for (const a of assets) {
      try {
        if (a.fileSize && a.fileSize > MAX_MB * 1024 * 1024) throw new Error(`${a.fileName || 'File'} is larger than ${MAX_MB} MB`);
        const media = await uploadFile(a, purpose);
        ok.push({ ...media, localUri: a.uri });
      } catch (err) {
        toast.error(err.message || 'Upload failed');
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (ok.length) onChange((prev) => [...prev, ...ok].slice(0, max));
  }

  async function pickImages() {
    if (remaining <= 0) return;
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        notify('Photo access needed', 'Allow photo access in your phone settings to attach pictures.');
        return;
      }
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: remaining > 1, selectionLimit: remaining, quality: 0.7, exif: false });
    if (!res.canceled) await uploadAll(res.assets.slice(0, remaining));
  }

  async function takePhoto() {
    if (remaining <= 0) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      notify('Camera access needed', 'Allow camera access in your phone settings to take a photo.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.7, exif: false });
    if (!res.canceled) await uploadAll(res.assets.slice(0, 1));
  }

  async function pickPdf() {
    if (remaining <= 0) return;
    const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false });
    if (!res.canceled) await uploadAll(res.assets.slice(0, 1).map((a) => ({ ...a, fileName: a.name, mimeType: 'application/pdf', fileSize: a.size })));
  }

  const choose = () => {
    const options = [{ text: 'Photo library', onPress: pickImages }];
    if (Platform.OS !== 'web') options.push({ text: 'Take a photo', onPress: takePhoto });
    if (allowPdf) options.push({ text: 'PDF document', onPress: pickPdf });
    if (Platform.OS === 'web' || options.length === 1) return pickImages();
    options.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(label, `You can attach up to ${max} files (max ${MAX_MB} MB each).`, options);
  };

  return (
    <View style={{ gap: 10 }}>
      <Pressable onPress={choose} disabled={remaining <= 0} accessibilityRole="button" accessibilityLabel={label} style={[styles.upload, remaining <= 0 && { opacity: 0.5 }]}>
        <Ionicons name="image-outline" size={20} color="#07162c" />
        <T weight="bold" size={13} color="#07162c" style={{ flex: 1 }}>
          {label}
        </T>
        <T size={12} color="#334155">
          {value.length}/{max} · optional
        </T>
      </Pressable>
      {value.length || uploading ? (
        <View style={styles.grid}>
          {value.map((m) => (
            <View key={m._id} style={styles.thumb}>
              {m.mimeType === 'application/pdf' ? (
                <View style={[styles.thumbImg, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9' }]}>
                  <Ionicons name="document-text" size={28} color="#334155" />
                  <T size={10} color="#334155">
                    PDF
                  </T>
                </View>
              ) : (
                <Image source={{ uri: m.localUri || m.url }} style={styles.thumbImg} />
              )}
              <Pressable onPress={() => onChange((prev) => prev.filter((x) => x._id !== m._id))} style={styles.remove} accessibilityRole="button" accessibilityLabel="Remove attachment" hitSlop={8}>
                <Ionicons name="close" size={14} color={colors.white} />
              </Pressable>
            </View>
          ))}
          {Array.from({ length: uploading }).map((_, i) => (
            <View key={`u${i}`} style={[styles.thumb, styles.thumbImg, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9' }]}>
              <ActivityIndicator color={colors.blue} />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}


const styles = StyleSheet.create({
  upload: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: '#94a3b8', backgroundColor: '#f1f5f9', borderRadius: 12, padding: 14, minHeight: 52 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumb: { width: 78, height: 78 },
  thumbImg: { width: 78, height: 78, borderRadius: 12, backgroundColor: '#f1f5f9' },
  remove: { position: 'absolute', top: -6, right: -6, width: 24, height: 24, borderRadius: 12, backgroundColor: '#07162c', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.white },
});
