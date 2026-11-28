import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CF_LINES_OF_BUSINESS, lineOfBusinessLabel } from '../lib/cashfree';
import { colors } from '../theme';
import { styles as ui, T } from './ui';

/**
 * Picks the vendor's Cashfree "line of business" (kyc_details.business_type). Looks like a Field; opens a sheet with
 * the list. `value` is the exact Cashfree string.
 */
export function LineOfBusinessPicker({ value, onChange, error, label = 'Line of business' }) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  return (
    <View style={{ gap: 7 }}>
      <T weight="bold" size={12.5} color="#1e293b">
        {label}
      </T>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`${label}: ${value ? lineOfBusinessLabel(value) : 'not chosen'}`} testID="kyc-line-of-business" style={[ui.input, error && ui.inputError, { justifyContent: 'space-between' }]}>
        <T size={14} color={value ? colors.navy : '#94a3b8'} numberOfLines={2} style={{ flex: 1, paddingVertical: 10 }}>
          {value ? lineOfBusinessLabel(value) : 'Choose what you do…'}
        </T>
        <Ionicons name="chevron-down" size={18} color="#94a3b8" />
      </Pressable>
      {error ? (
        <T size={12} color={colors.danger} accessibilityLiveRegion="polite">
          {error}
        </T>
      ) : (
        <T size={12} color={colors.muted}>
          Cashfree needs this to send your online payments to your bank.
        </T>
      )}
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={s.handle} />
          <T weight="extrabold" size={15} color={colors.navy} style={{ paddingHorizontal: 18, paddingBottom: 8 }}>
            {label}
          </T>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 10 }}>
            {CF_LINES_OF_BUSINESS.map((v) => {
              const on = v === value;
              return (
                <Pressable
                  key={v}
                  onPress={() => (onChange(v), setOpen(false))}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  style={({ pressed }) => [s.row, on && s.rowOn, pressed && { backgroundColor: '#f1f5f9' }]}
                >
                  <T weight={on ? 'bold' : 'semibold'} size={13.5} color={colors.navy} style={{ flex: 1 }}>
                    {lineOfBusinessLabel(v)}
                  </T>
                  {on ? <Ionicons name="checkmark-circle" size={20} color={colors.navy} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(7,22,44,0.45)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '75%', backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8, width: '100%', maxWidth: 560, alignSelf: 'center' },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#e2e8f0', marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },
  rowOn: { backgroundColor: colors.goldLight },
});
