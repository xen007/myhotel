import { useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { AppIcon, type BoxIconName } from '@/components/box-icon';
import { GoldBtn } from '@/components/hotel/kit';
import { VisitKicker, VisitSection, VisitTitle } from '@/components/visit/visit-kit';
import { Breakpoints, Palette } from '@/constants/theme';
import { visitPost } from '@/lib/api';
import type { VisitCompany } from '@/hooks/use-visit';

export function VisitContact({ company, id }: { company: VisitCompany | null; id?: string }) {
  const { width } = useWindowDimensions();
  const stacked = width < Breakpoints.tablet;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const query = encodeURIComponent([company?.address, 'Bertoua', 'Cameroun'].filter(Boolean).join(' '));
  const lines: { icon: BoxIconName; text: string }[] = [
    ...(company?.address ? [{ icon: 'map' as const, text: company.address }] : []),
    { icon: 'building', text: 'Bertoua, Cameroun' },
    ...(company?.phone ? [{ icon: 'phone' as const, text: company.phone }] : []),
    ...(company?.email ? [{ icon: 'envelope' as const, text: company.email }] : []),
  ];

  async function submit() {
    setError(null);
    setOk(null);
    if (name.trim().length < 2) {
      setError('Indiquez votre nom.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Adresse e-mail invalide.');
      return;
    }
    if (subject.trim().length < 2) {
      setError('Indiquez l’objet du message.');
      return;
    }
    if (message.trim().length < 8) {
      setError('Écrivez un message plus précis.');
      return;
    }
    setBusy(true);
    try {
      await visitPost('visit/contact', { name, email, phone, subject, message });
      setOk('Votre message a bien été transmis à la réception.');
      setMessage('');
      setSubject('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Envoi impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <VisitSection id={id} ink wide>
      <VisitKicker light>Contact</VisitKicker>
      <VisitTitle light>Partenariat ou question ?</VisitTitle>
      <View style={[styles.grid, stacked && styles.gridStack]}>
        <View style={[styles.info, stacked && styles.colFull]}>
          {lines.map((item) => (
            <View key={item.text} style={styles.infoRow}>
              <View style={styles.infoIcon}><AppIcon name={item.icon} size={16} color={Palette.ink} /></View>
              <Text style={styles.line}>{item.text}</Text>
            </View>
          ))}
          <Text style={styles.hours}>Réception 24h/24 7j/7</Text>
          {query ? (
            Platform.OS === 'web' ? (
              // eslint-disable-next-line react/iframe-missing-sandbox
              <iframe
                title="Carte"
                src={`https://maps.google.com/maps?q=${query}&output=embed`}
                style={{ border: 0, width: '100%', height: 220, borderRadius: 16, marginTop: 8 }}
              />
            ) : (
              <Text style={styles.meta}>Ouvrez la carte depuis un navigateur pour localiser l’hôtel.</Text>
            )
          ) : null}
        </View>
        <View style={[styles.form, stacked && styles.colFull]}>
          <View style={[styles.row, stacked && styles.rowStack]}>
            <View style={[styles.field, stacked && styles.fieldFull]}>
              <TextInput value={name} onChangeText={setName} placeholder="Nom" placeholderTextColor="rgba(20,22,34,0.4)" style={styles.input} />
            </View>
            <View style={[styles.field, stacked && styles.fieldFull]}>
              <TextInput value={email} onChangeText={setEmail} placeholder="E-mail" keyboardType="email-address" autoCapitalize="none" placeholderTextColor="rgba(20,22,34,0.4)" style={styles.input} />
            </View>
          </View>
          <View style={[styles.row, stacked && styles.rowStack]}>
            <View style={[styles.field, stacked && styles.fieldFull]}>
              <TextInput value={phone} onChangeText={setPhone} placeholder="Téléphone (facultatif)" keyboardType="phone-pad" placeholderTextColor="rgba(20,22,34,0.4)" style={styles.input} />
            </View>
            <View style={[styles.field, stacked && styles.fieldFull]}>
              <TextInput value={subject} onChangeText={setSubject} placeholder="Objet" placeholderTextColor="rgba(20,22,34,0.4)" style={styles.input} />
            </View>
          </View>
          <TextInput value={message} onChangeText={setMessage} placeholder="Votre message" multiline style={[styles.input, styles.area]} placeholderTextColor="rgba(20,22,34,0.4)" />
          {error ? <Text style={styles.err}>{error}</Text> : null}
          {ok ? <Text style={styles.ok}>{ok}</Text> : null}
          <GoldBtn label={busy ? 'Envoi…' : 'Envoyer'} onPress={() => void submit()} />
        </View>
      </View>
    </VisitSection>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  gridStack: { flexDirection: 'column' },
  colFull: { width: '100%', flexBasis: 'auto' },
  info: { flexGrow: 1, flexBasis: 260, gap: 10, minWidth: 0 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: Palette.gold, alignItems: 'center', justifyContent: 'center' },
  form: { flexGrow: 1, flexBasis: 300, gap: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(212,175,55,0.35)', padding: 16, minWidth: 0, justifyContent: 'flex-start' },
  row: { flexDirection: 'row', gap: 10, width: '100%', alignItems: 'stretch' },
  rowStack: { flexDirection: 'column' },
  field: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  fieldFull: { width: '100%', flexBasis: 'auto' },
  line: { color: Palette.white, fontSize: 15, fontWeight: '600', flex: 1 },
  hours: { color: Palette.gold, fontWeight: '800', marginTop: 6 },
  meta: { color: Palette.white, opacity: 0.7 },
  input: { borderWidth: 1, borderColor: 'rgba(212,175,55,0.45)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, color: Palette.ink, backgroundColor: Palette.white, width: '100%', height: 48 },
  area: { height: undefined, minHeight: 180, flexGrow: 1, textAlignVertical: 'top', paddingTop: 12 },
  err: { color: Palette.gold, fontWeight: '700' },
  ok: { color: Palette.ink, fontWeight: '700', backgroundColor: Palette.gold, padding: 10, borderRadius: 10 },
});
