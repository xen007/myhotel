import { Redirect } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { FilterBar } from '@/components/hotel/filter-bar';
import { HotelShell } from '@/components/hotel/hotel-shell';
import { GoldBtn } from '@/components/hotel/kit';
import { Breakpoints, Palette, Radius } from '@/constants/theme';
import { usePms } from '@/hooks/use-pms';
import { pmsPost } from '@/lib/api';
import { prettyStamp } from '@/lib/format';

type ClientAccount = {
  id: number;
  full_name: string;
  email: string;
  phone?: string | null;
  status?: string | null;
  created_at?: string | null;
  last_login?: string | null;
};

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

type Payload = { items: ClientAccount[] };

const EMPTY = { first_name: '', last_name: '', email: '', phone: '', password: '', password_confirm: '' };

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function ClientsScreen() {
  const { data, error, loading, reload, token, user, ready } = usePms<Payload>('clients');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<typeof EMPTY | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const allowed = user?.role === 'receptionist' || user?.role === 'manager' || user?.role === 'owner';
  const { width } = useWindowDimensions();
  const isDesktop = width >= Breakpoints.desktop;
  const items = data?.items ?? [];
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => `${item.full_name} ${item.email} ${item.phone ?? ''}`.toLowerCase().includes(needle));
  }, [items, query]);

  if (ready && !user) return <Redirect href="/welcome" />;
  if (ready && user && !allowed) return <Redirect href="/home" />;

  async function save() {
    if (!token || !form || saving) return;
    const first = form.first_name.trim();
    const last = form.last_name.trim();
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.trim();
    if (last.length < 2 || first.length < 2) {
      setFormError('Indiquez le nom et le prénom.');
      return;
    }
    if (!isEmail(email)) {
      setFormError('Adresse e-mail invalide.');
      return;
    }
    if (!/^[0-9+\s().-]{6,30}$/.test(phone)) {
      setFormError('Numéro de téléphone invalide.');
      return;
    }
    if (form.password.length < 8) {
      setFormError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (form.password !== form.password_confirm) {
      setFormError('Les mots de passe ne correspondent pas.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await pmsPost(token, 'clients', {
        first_name: first,
        last_name: last,
        email,
        phone,
        password: form.password,
        password_confirm: form.password_confirm,
      });
      setForm(null);
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Création impossible.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <HotelShell
      title="Clients"
      loading={loading && !data}
      error={error}
      right={<GoldBtn compact icon="plus" label="Nouveau client" onPress={() => { setFormError(null); setForm({ ...EMPTY }); }} />}>
      <FilterBar query={query} onQuery={setQuery} queryPlaceholder="Rechercher un client..." />
      <ScrollView horizontal={!isDesktop} showsHorizontalScrollIndicator={!isDesktop}>
        <View style={[styles.table, { minWidth: isDesktop ? '100%' : 760 }]}>
          <View style={[styles.tr, styles.th]}>
            <Text style={[styles.td, styles.colName, styles.thText]}>Nom</Text>
            <Text style={[styles.td, styles.colMail, styles.thText]}>E-mail</Text>
            <Text style={[styles.td, styles.colPhone, styles.thText]}>Téléphone</Text>
            <Text style={[styles.td, styles.colStatus, styles.thText]}>Statut</Text>
          </View>
          {visible.map((item, index) => (
            <View key={item.id} style={[styles.tr, index % 2 ? styles.trAlt : null]}>
              <View style={[styles.td, styles.colName, styles.nameCell]}>
                <View style={styles.thumb}>
                  <Text style={styles.thumbText}>{initials(item.full_name)}</Text>
                </View>
                <View style={styles.nameCopy}>
                  <Text style={styles.name} numberOfLines={1}>{item.full_name}</Text>
                  <Text style={styles.lot} numberOfLines={1}>
                    {item.last_login ? `Connexion ${prettyStamp(item.last_login)}` : 'Jamais connecté'}
                  </Text>
                </View>
              </View>
              <Text style={[styles.td, styles.colMail, styles.cell]} numberOfLines={1}>{item.email}</Text>
              <Text style={[styles.td, styles.colPhone, styles.cell]} numberOfLines={1}>{item.phone || '—'}</Text>
              <Text style={[styles.td, styles.colStatus, styles.cell]} numberOfLines={1}>{item.status === 'banni' ? 'Banni' : 'Actif'}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
      {!visible.length ? <Text style={styles.empty}>Aucun compte client.</Text> : null}

      <Modal visible={!!form} transparent animationType="fade" onRequestClose={() => setForm(null)}>
        <View style={styles.overlay}>
          <Pressable style={styles.fill} onPress={() => setForm(null)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Nouveau client</Text>
            <Text style={styles.meta}>Le client se connecte ensuite avec cet e-mail.</Text>
            <View style={styles.grid}>
              <TextInput value={form?.last_name} onChangeText={(last_name) => form && setForm({ ...form, last_name })} placeholder="Nom" style={[styles.input, styles.inputHalf]} />
              <TextInput value={form?.first_name} onChangeText={(first_name) => form && setForm({ ...form, first_name })} placeholder="Prénom" style={[styles.input, styles.inputHalf]} />
            </View>
            <TextInput value={form?.email} onChangeText={(email) => form && setForm({ ...form, email })} placeholder="E-mail" autoCapitalize="none" keyboardType="email-address" style={styles.input} />
            <TextInput value={form?.phone} onChangeText={(phone) => form && setForm({ ...form, phone })} placeholder="Téléphone" keyboardType="phone-pad" style={styles.input} />
            <TextInput value={form?.password} onChangeText={(password) => form && setForm({ ...form, password })} placeholder="Mot de passe" secureTextEntry style={styles.input} />
            <TextInput value={form?.password_confirm} onChangeText={(password_confirm) => form && setForm({ ...form, password_confirm })} placeholder="Confirmation du mot de passe" secureTextEntry style={styles.input} />
            {formError ? <Text style={styles.err}>{formError}</Text> : null}
            <View style={styles.actions}>
              <GoldBtn compact label={saving ? 'Création…' : 'Créer le compte'} onPress={() => void save()} />
              <GoldBtn compact variant="ghost" label="Fermer" onPress={() => setForm(null)} />
            </View>
          </View>
        </View>
      </Modal>
    </HotelShell>
  );
}

const styles = StyleSheet.create({
  table: { borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(20,22,34,0.08)', backgroundColor: Palette.white },
  tr: { flexDirection: 'row', alignItems: 'center', backgroundColor: Palette.white, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(20,22,34,0.06)' },
  trAlt: { backgroundColor: 'rgba(212,175,55,0.08)' },
  th: { backgroundColor: 'rgba(20,22,34,0.03)' },
  thText: { color: Palette.ink, opacity: 0.55, fontWeight: '800', fontSize: 11, textTransform: 'uppercase' },
  td: { paddingRight: 8 },
  cell: { color: Palette.ink, fontSize: 13, fontWeight: '700' },
  colName: { flex: 1.5, minWidth: 180 },
  colMail: { flex: 1.2, minWidth: 180 },
  colPhone: { width: 140 },
  colStatus: { width: 90 },
  nameCell: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: { width: 36, height: 36, borderRadius: 10, backgroundColor: Palette.gold, alignItems: 'center', justifyContent: 'center' },
  thumbText: { color: Palette.ink, fontWeight: '800', fontSize: 11 },
  nameCopy: { flex: 1, minWidth: 0 },
  name: { color: Palette.ink, fontWeight: '800', fontSize: 14 },
  lot: { color: Palette.ink, opacity: 0.5, fontSize: 11, marginTop: 1 },
  meta: { color: Palette.ink, opacity: 0.65, fontSize: 13 },
  empty: { color: Palette.ink, opacity: 0.55, fontSize: 13 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(20,22,34,0.28)', padding: 16 },
  fill: { ...StyleSheet.absoluteFill },
  sheet: {
    width: '100%',
    maxWidth: 460,
    gap: 10,
    padding: 16,
    borderRadius: Radius.card,
    backgroundColor: Palette.white,
    borderWidth: 1,
    borderColor: Palette.gold,
  },
  sheetTitle: { color: Palette.ink, fontWeight: '800', fontSize: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(20,22,34,0.14)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Palette.ink,
    fontSize: 14,
  },
  inputHalf: { flex: 1, minWidth: 140 },
  err: { color: Palette.ink, fontWeight: '700', fontSize: 13, backgroundColor: 'rgba(212,175,55,0.2)', padding: 8, borderRadius: 10 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
