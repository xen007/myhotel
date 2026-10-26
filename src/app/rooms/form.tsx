import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { createElement, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppIcon, type BoxIconName } from '@/components/box-icon';
import { FilterSelect } from '@/components/hotel/filter-bar';
import { HotelShell } from '@/components/hotel/hotel-shell';
import { GoldBtn } from '@/components/hotel/kit';
import { Palette } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { pmsGet, pmsPost, roomRequest, roomsRequest, type EquipmentItem } from '@/lib/api';
import { roomStatusLabel } from '@/lib/format';

type FormState = {
  number: string;
  type: string;
  floor: string;
  capacity: string;
  price_night: string;
  status: string;
  description: string;
  photos: string[];
  videos: string[];
};

const emptyForm = (): FormState => ({
  number: '',
  type: 'Standard',
  floor: '1',
  capacity: '2',
  price_night: '72000',
  status: 'disponible',
  description: '',
  photos: [],
  videos: [],
});

const STATUS_OPTIONS = Object.entries(roomStatusLabel).map(([id, label]) => ({ id, label }));
const DEFAULT_TYPES = ['Économique', 'Standard', 'De luxe', 'Suite', 'Familiale', 'Présidentielle'];

async function toStoredUri(asset: ImagePicker.ImagePickerAsset) {
  if (asset.base64) {
    const mime = asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
    return `data:${mime};base64,${asset.base64}`;
  }
  const uri = asset.uri;
  if (uri.startsWith('data:')) return uri;
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
      reader.readAsDataURL(blob);
    });
  }
  return uri;
}

export default function RoomFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { user, ready, token } = useAuth();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [newEquip, setNewEquip] = useState({ name: '', category: 'Confort' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [typeOptions, setTypeOptions] = useState(DEFAULT_TYPES.map((item) => ({ id: item, label: item })));
  const editing = Boolean(id);
  const canManage = user?.role === 'manager' || user?.role === 'owner';

  async function load() {
    if (!token) return;
    try {
      const catalog = await roomsRequest(token);
      const types = [...DEFAULT_TYPES];
      try {
        const payload = await pmsGet<{ categories: { name: string }[] }>(token, 'room-categories');
        (payload.categories || []).forEach((item) => {
          if (item.name && !types.includes(item.name)) types.push(item.name);
        });
      } catch {
        /* les types déjà utilisés restent proposés */
      }
      catalog.forEach((room) => {
        if (room.type && !types.includes(room.type)) types.push(room.type);
      });
      if (id) {
        const room = await roomRequest(token, String(id));
        if (room.type && !types.includes(room.type)) types.push(room.type);
        setForm({
          number: room.number,
          type: room.type,
          floor: String(room.floor),
          capacity: String(room.capacity),
          price_night: String(room.price_night),
          status: room.status || 'disponible',
          description: room.description || '',
          photos: room.photos?.length ? room.photos : room.photo ? [room.photo] : [],
          videos: room.videos?.length ? room.videos : room.video ? [room.video] : [],
        });
        setEquipment(room.equipment ?? []);
      } else {
        setEquipment([]);
      }
      setTypeOptions(types.map((item) => ({ id: item, label: item })));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id]);

  if (ready && !user) return <Redirect href="/welcome" />;
  if (ready && !canManage) return <Redirect href="/rooms" />;

  async function pick(kind: 'image' | 'video') {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: kind === 'image' ? ['images'] : ['videos'],
        allowsMultipleSelection: true,
        quality: 0.55,
        base64: true,
      });
      if (result.canceled) return;
      const stored: string[] = [];
      for (const asset of result.assets) {
        if ((asset.fileSize || 0) > 6_000_000) {
          setError('Un fichier dépasse 6 Mo. Compressez-le puis réessayez.');
          continue;
        }
        stored.push(await toStoredUri(asset));
      }
      if (!stored.length) return;
      setForm((current) =>
        kind === 'image'
          ? { ...current, photos: [...current.photos, ...stored] }
          : { ...current, videos: [...current.videos, ...stored] },
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import impossible.');
    }
  }

  async function save() {
    if (!token || saving) return;
    if (!form.number.trim()) {
      setError('Indiquez le numéro de chambre.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await pmsPost<{ id: number }>(token, 'rooms/save', {
        id: id ? Number(id) : undefined,
        number: form.number.trim(),
        type: form.type.trim() || 'Standard',
        floor: Number(form.floor || 1),
        capacity: Number(form.capacity || 2),
        price_night: Number(form.price_night || 0),
        status: form.status,
        description: form.description.trim(),
        photos: form.photos,
        videos: form.videos,
        equipment_ids: equipment.map((item) => item.id),
      });
      router.replace('/rooms');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  async function addEquipment() {
    if (!token || !newEquip.name.trim()) {
      setError('Indiquez le nom de l’équipement.');
      return;
    }
    try {
      const category = newEquip.category.trim() || 'Confort';
      const name = newEquip.name.trim();
      const created = await pmsPost<{ id: number }>(token, 'equipment/save', {
        name,
        category,
        icon: 'cabinet',
      });
      setEquipment((current) => [...current, { id: created.id, name, category, icon: 'cabinet' }]);
      setNewEquip({ name: '', category: 'Confort' });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ajout d’équipement impossible.');
    }
  }

  async function removeEquipment(itemId: number) {
    setEquipment((current) => current.filter((item) => item.id !== itemId));
    if (!token) return;
    try {
      await pmsPost(token, 'equipment/delete', { id: itemId });
    } catch {
      setError('Suppression impossible.');
    }
  }

  return (
    <HotelShell
      back
      onBack={() => router.replace('/rooms')}
      title={editing ? 'Modification' : 'Nouvelle chambre'}
      loading={loading}
      error={null}
      right={
        <GoldBtn
          compact
          icon="check-circle"
          label={saving ? 'Enregistrement…' : 'Enregistrer'}
          onPress={() => void save()}
        />
      }>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.grid}>
        <Field label="Numéro" value={form.number} onChange={(number) => setForm({ ...form, number })} />
        <View style={styles.field}>
          <Text style={styles.label}>Type</Text>
          {Platform.OS === 'web' ? (
            <FilterSelect value={form.type} onChange={(type) => setForm({ ...form, type })} options={typeOptions} />
          ) : (
            <View style={styles.typeChips}>
              {typeOptions.map((opt) => (
                <Pressable
                  key={opt.id}
                  onPress={() => setForm({ ...form, type: opt.id })}
                  style={[styles.typeChip, form.type === opt.id && styles.typeChipOn]}>
                  <Text style={[styles.typeChipText, form.type === opt.id && styles.typeChipTextOn]}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
        <Field label="Étage" value={form.floor} onChange={(floor) => setForm({ ...form, floor })} keyboard="numeric" />
        <Field label="Capacité" value={form.capacity} onChange={(capacity) => setForm({ ...form, capacity })} keyboard="numeric" />
        <Field
          label="Prix / nuit (FCFA)"
          value={form.price_night}
          onChange={(price_night) => setForm({ ...form, price_night })}
          keyboard="numeric"
        />
        <View style={styles.field}>
          <Text style={styles.label}>Statut</Text>
          <FilterSelect value={form.status} onChange={(status) => setForm({ ...form, status })} options={STATUS_OPTIONS} />
        </View>
      </View>
      <Text style={styles.label}>Description</Text>
      <TextInput
        value={form.description}
        onChangeText={(description) => setForm({ ...form, description })}
        multiline
        style={[styles.input, styles.area]}
      />

      <View style={styles.sectionRow}>
        <Text style={styles.section}>Photos</Text>
        <GoldBtn compact icon="plus" label="Importer" onPress={() => void pick('image')} />
      </View>
      <View style={styles.mediaRow}>
        {form.photos.map((uri, index) => (
          <View key={`${uri.slice(0, 24)}-${index}`} style={styles.photoWrap}>
            <Image source={{ uri }} style={styles.photo} contentFit="contain" />
            <Pressable style={styles.remove} onPress={() => setForm({ ...form, photos: form.photos.filter((_, i) => i !== index) })}>
              <AppIcon name="trash" size={14} color={Palette.white} />
            </Pressable>
          </View>
        ))}
      </View>

      <View style={styles.sectionRow}>
        <Text style={styles.section}>Vidéos</Text>
        <GoldBtn compact icon="plus" label="Importer" onPress={() => void pick('video')} />
      </View>
      <View style={styles.mediaRow}>
        {form.videos.map((uri, index) => (
          <View key={`${uri.slice(0, 24)}-${index}`} style={styles.videoWrap}>
            {Platform.OS === 'web'
              ? createElement('video', {
                  src: uri,
                  controls: true,
                  style: { width: '100%', height: '100%', objectFit: 'contain', background: '#141622' },
                })
              : <Image source={{ uri: form.photos[0] }} style={styles.photo} contentFit="contain" />}
            <Pressable style={styles.remove} onPress={() => setForm({ ...form, videos: form.videos.filter((_, i) => i !== index) })}>
              <AppIcon name="trash" size={14} color={Palette.white} />
            </Pressable>
          </View>
        ))}
      </View>

      <Text style={styles.section}>Équipements</Text>
      <View style={styles.addEquip}>
        <TextInput
          placeholder="Nouvel équipement"
          value={newEquip.name}
          onChangeText={(name) => setNewEquip({ ...newEquip, name })}
          style={[styles.input, styles.equipInput]}
        />
        <TextInput
          placeholder="Catégorie"
          value={newEquip.category}
          onChangeText={(category) => setNewEquip({ ...newEquip, category })}
          style={[styles.input, styles.equipInput]}
        />
        <GoldBtn compact icon="plus" label="Ajouter" onPress={() => void addEquipment()} />
      </View>
      <View style={styles.equipGrid}>
        {equipment.map((item) => (
          <View key={item.id} style={styles.equip}>
            <View style={styles.equipIcon}>
              <AppIcon name={item.icon as BoxIconName} size={18} color={Palette.ink} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.equipName}>{item.name}</Text>
              <Text style={styles.equipCat}>{item.category}</Text>
            </View>
            <Pressable style={styles.iconBtn} onPress={() => void removeEquipment(item.id)}>
              <AppIcon name="trash" size={16} color={Palette.white} />
            </Pressable>
          </View>
        ))}
        {!equipment.length ? <Text style={styles.equipEmpty}>Aucun équipement pour cette chambre.</Text> : null}
      </View>
    </HotelShell>
  );
}

function Field({
  label,
  value,
  onChange,
  keyboard,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  keyboard?: 'numeric';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} keyboardType={keyboard} style={styles.input} />
    </View>
  );
}

const styles = StyleSheet.create({
  error: {
    color: Palette.ink,
    fontWeight: '700',
    backgroundColor: 'rgba(212,175,55,0.18)',
    padding: 12,
    borderRadius: 12,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  field: { minWidth: 160, flexGrow: 1, flexBasis: 160, gap: 6 },
  typeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: {
    borderWidth: 1,
    borderColor: 'rgba(20,22,34,0.14)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Palette.white,
  },
  typeChipOn: { backgroundColor: Palette.gold, borderColor: Palette.ink },
  typeChipText: { color: Palette.ink, fontWeight: '700', fontSize: 13 },
  typeChipTextOn: { color: Palette.ink },
  label: { color: Palette.ink, fontWeight: '700', fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(20,22,34,0.14)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Palette.ink,
    backgroundColor: Palette.white,
  },
  area: { minHeight: 90, textAlignVertical: 'top' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  section: { color: Palette.ink, fontWeight: '800', fontSize: 18 },
  mediaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoWrap: {
    width: 160,
    minHeight: 110,
    maxHeight: 200,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: Palette.ink,
  },
  photo: { width: '100%', height: 140 },
  videoWrap: {
    width: 240,
    aspectRatio: 16 / 9,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: Palette.ink,
  },
  remove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: Palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addEquip: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  equipInput: { minWidth: 140, flexGrow: 1, flexBasis: 140 },
  equipGrid: { gap: 8 },
  equip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(20,22,34,0.1)',
    backgroundColor: Palette.white,
  },
  equipIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  equipName: { color: Palette.ink, fontWeight: '700' },
  equipCat: { color: Palette.ink, opacity: 0.55, fontSize: 12 },
  equipEmpty: { color: Palette.ink, opacity: 0.55, fontSize: 13 },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
