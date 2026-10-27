import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { HotelShell } from '@/components/hotel/hotel-shell';
import { GoldBtn } from '@/components/hotel/kit';
import { Palette, Radius } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { pmsGet, pmsPost, type CompanyProfile } from '@/lib/api';

const emptyCompany = (): CompanyProfile => ({
  name: 'MyHotel',
  legal_name: '',
  address: '',
  city: '',
  country: 'Cameroun',
  phone: '',
  email: '',
  website: '',
  nif: '',
  rccm: '',
  slogan: '',
  logo: null,
  stamp: null,
});

async function fileToDataUrl(asset: ImagePicker.ImagePickerAsset) {
  if (asset.base64) {
    const mime = asset.mimeType || 'image/jpeg';
    return `data:${mime};base64,${asset.base64}`;
  }
  if (asset.uri.startsWith('data:')) return asset.uri;
  if (Platform.OS === 'web') {
    const response = await fetch(asset.uri);
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Lecture impossible.'));
      reader.readAsDataURL(blob);
    });
  }
  return asset.uri;
}

export default function SettingsScreen() {
  const { user, ready, token } = useAuth();
  const [company, setCompany] = useState<CompanyProfile>(emptyCompany);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const isOwner = user?.role === 'owner';

  useEffect(() => {
    if (!token || !isOwner) {
      setLoading(false);
      return;
    }
    void pmsGet<CompanyProfile>(token, 'company')
      .then((row) => {
        setCompany({ ...emptyCompany(), ...row });
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Chargement impossible.'))
      .finally(() => setLoading(false));
  }, [token, isOwner]);

  function notify(message: string) {
    if (Platform.OS === 'web') globalThis.alert(message);
    else Alert.alert(message);
  }

  async function pickImage(kind: 'logo' | 'stamp') {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.7,
        base64: true,
      });
      if (result.canceled || !result.assets[0]) return;
      const uri = await fileToDataUrl(result.assets[0]);
      setCompany((current) => ({ ...current, [kind]: uri }));
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Import impossible.');
    }
  }

  async function save() {
    if (!token || saving) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await pmsPost<CompanyProfile>(token, 'company', { ...company } as Record<string, unknown>);
      setCompany({ ...emptyCompany(), ...saved });
      notify('Informations de l’hôtel enregistrées.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  if (ready && !user) return <Redirect href="/welcome" />;
  if (ready && user && !isOwner) return <Redirect href="/home" />;

  return (
    <HotelShell
      title="Paramètres"
      loading={loading}
      error={error}
      right={
        <GoldBtn
          compact
          icon="check-circle"
          label={saving ? 'Enregistrement…' : 'Enregistrer'}
          onPress={() => void save()}
        />
      }>
      <View style={styles.grid}>
        <Field label="Nom commercial" value={company.name} onChange={(name) => setCompany({ ...company, name })} />
        <Field
          label="Raison sociale"
          value={company.legal_name ?? ''}
          onChange={(legal_name) => setCompany({ ...company, legal_name })}
        />
        <Field label="Adresse" value={company.address ?? ''} onChange={(address) => setCompany({ ...company, address })} />
        <Field label="Ville" value={company.city ?? ''} onChange={(city) => setCompany({ ...company, city })} />
        <Field label="Pays" value={company.country ?? ''} onChange={(country) => setCompany({ ...company, country })} />
        <Field label="Téléphone" value={company.phone ?? ''} onChange={(phone) => setCompany({ ...company, phone })} />
        <Field label="E-mail" value={company.email ?? ''} onChange={(email) => setCompany({ ...company, email })} />
        <Field label="Site web" value={company.website ?? ''} onChange={(website) => setCompany({ ...company, website })} />
        <Field label="NIF" value={company.nif ?? ''} onChange={(nif) => setCompany({ ...company, nif })} />
        <Field label="RCCM" value={company.rccm ?? ''} onChange={(rccm) => setCompany({ ...company, rccm })} />
      </View>
      <Field label="Slogan" value={company.slogan ?? ''} onChange={(slogan) => setCompany({ ...company, slogan })} />
      <View style={styles.brandRow}>
        <Pressable style={styles.brandPick} onPress={() => void pickImage('logo')}>
          {company.logo ? <Image source={{ uri: company.logo }} style={styles.brandImg} contentFit="contain" /> : null}
          <Text style={styles.brandLabel}>Logo</Text>
        </Pressable>
        <Pressable style={styles.brandPick} onPress={() => void pickImage('stamp')}>
          {company.stamp ? <Image source={{ uri: company.stamp }} style={styles.brandImg} contentFit="contain" /> : null}
          <Text style={styles.brandLabel}>Cachet numérique</Text>
        </Pressable>
      </View>
    </HotelShell>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} placeholder={label} style={styles.input} />
    </View>
  );
}

const styles = StyleSheet.create({
  lead: { color: Palette.ink, opacity: 0.65, marginBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  field: { flexGrow: 1, minWidth: 220, gap: 6 },
  label: { color: Palette.ink, fontWeight: '700', fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(20,22,34,0.14)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Palette.ink,
    backgroundColor: Palette.white,
  },
  brandRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  brandPick: {
    flex: 1,
    minHeight: 110,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Palette.gold,
    borderBottomWidth: 4,
    borderBottomColor: Palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: Palette.white,
  },
  brandImg: { width: 72, height: 72 },
  brandLabel: { color: Palette.ink, fontWeight: '800', fontSize: 12 },
});
