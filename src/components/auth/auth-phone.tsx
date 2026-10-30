import { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { Palette } from '@/constants/theme';
import { DIAL_COUNTRIES, formatNational, nationalDigits, phoneHint, type DialCountry } from '@/lib/phone';

export function AuthPhone({
  country,
  onCountry,
  value,
  onChangeText,
  editable = true,
}: {
  country: DialCountry;
  onCountry: (next: DialCountry) => void;
  value: string;
  onChangeText: (next: string) => void;
  editable?: boolean;
}) {
  const { height } = useWindowDimensions();
  const compact = height < 760;
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const hint = useMemo(() => phoneHint(country), [country]);

  return (
    <View style={styles.block}>
      <View style={[styles.row, compact && styles.rowCompact, hover && styles.rowHover]}>
        <Pressable
          onHoverIn={() => setHover(true)}
          onHoverOut={() => setHover(false)}
          onPress={() => setOpen(true)}
          style={styles.dial}
          accessibilityLabel="Indicatif pays">
          <Text style={styles.flag}>{country.flag}</Text>
          <Text style={styles.dialText}>+{country.dial}</Text>
          <Text style={styles.caret}>▾</Text>
        </Pressable>
        <TextInput
          value={formatNational(value, country)}
          onChangeText={(next) => onChangeText(nationalDigits(next, country))}
          placeholder={hint}
          placeholderTextColor="rgba(20, 22, 34, 0.45)"
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          editable={editable}
          maxLength={18}
          style={[styles.input, compact && styles.inputCompact, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as Record<string, string>) : null]}
        />
      </View>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.modal}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Indicatif</Text>
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {DIAL_COUNTRIES.map((item) => (
                <Pressable
                  key={item.iso + item.dial}
                  onPress={() => {
                    onCountry(item);
                    onChangeText(nationalDigits(value, item));
                    setOpen(false);
                  }}
                  style={[styles.option, item.iso === country.iso && styles.optionOn]}>
                  <Text style={styles.flag}>{item.flag}</Text>
                  <Text style={styles.optionName}>{item.name}</Text>
                  <Text style={styles.optionDial}>+{item.dial}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { width: '100%' },
  row: {
    minHeight: 42,
    width: '100%',
    borderWidth: 1.5,
    borderColor: Palette.ink,
    borderRadius: 12,
    paddingLeft: 6,
    paddingRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Palette.white,
    gap: 6,
  },
  rowCompact: { minHeight: 38 },
  rowHover: {
    borderColor: Palette.gold,
    ...Platform.select({ web: { boxShadow: '0 0 0 3px rgba(212,175,55,0.28)' } as object, default: {} }),
  },
  dial: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    minWidth: 92,
    backgroundColor: 'rgba(212,175,55,0.22)',
    borderRadius: 8,
  },
  flag: { fontSize: 16 },
  dialText: { color: Palette.ink, fontWeight: '800', fontSize: 13 },
  caret: { color: Palette.ink, fontSize: 11, opacity: 0.6 },
  input: { flex: 1, color: Palette.ink, fontSize: 14, paddingVertical: 8, minWidth: 0 },
  inputCompact: { fontSize: 13, paddingVertical: 6 },
  modal: { flex: 1, justifyContent: 'center', padding: 24 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(20,22,34,0.45)' },
  sheet: {
    backgroundColor: Palette.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Palette.gold,
    maxHeight: 420,
    overflow: 'hidden',
  },
  sheetTitle: { color: Palette.ink, fontWeight: '800', fontSize: 16, padding: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(20,22,34,0.08)' },
  list: { maxHeight: 360 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  optionOn: { backgroundColor: 'rgba(212,175,55,0.22)' },
  optionName: { flex: 1, color: Palette.ink, fontWeight: '600' },
  optionDial: { color: Palette.ink, fontWeight: '800' },
});
