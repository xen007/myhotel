import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { AppIcon } from '@/components/box-icon';
import { FilterBar } from '@/components/hotel/filter-bar';
import { HotelShell } from '@/components/hotel/hotel-shell';
import { GoldBtn } from '@/components/hotel/kit';
import { Palette, Radius } from '@/constants/theme';
import { usePms } from '@/hooks/use-pms';
import { pmsPost } from '@/lib/api';
import { money } from '@/lib/format';

type Dish = {
  id: number;
  name: string;
  category: string;
  price: number;
  description?: string | null;
  photo?: string | null;
  available?: number;
  of_day?: number;
  day_date?: string | null;
};

type Payload = { date: string; items: Dish[] };

const FOOD = ['Entrée', 'Plat', 'Dessert', 'Petit-déjeuner'];
const DRINKS = ['Eau', 'Jus', 'Bière', 'Alcool', 'Chaud'];

function isDrink(category: string) {
  const value = category.toLowerCase();
  return value === 'boisson' || DRINKS.some((item) => item.toLowerCase() === value);
}

const EMPTY = { id: 0, name: '', category: 'Plat', price: '', description: '', photo: '' };

async function toStoredUri(asset: ImagePicker.ImagePickerAsset) {
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
      reader.onerror = () => reject(new Error('Lecture de la photo impossible.'));
      reader.readAsDataURL(blob);
    });
  }
  return asset.uri;
}

export function DishBoard({ mode, title: titleOverride }: { mode: 'food' | 'drink' | 'daily'; title?: string }) {
  const { data, error, loading, reload, token } = usePms<Payload>('restaurant');
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [form, setForm] = useState<typeof EMPTY | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const today = data?.date || '';
  const minCard = 400;
  const cols = Math.max(1, Math.min(3, Math.floor(Math.max(width - 48, minCard) / minCard)));
  const cardWidth = (cols === 1 ? '100%' : `${100 / cols - 1.6}%`) as `${number}%`;

  const items = useMemo(() => {
    const rows = data?.items ?? [];
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const drink = isDrink(row.category);
      if (mode === 'drink' && !drink) return false;
      if (mode === 'food' && drink) return false;
      if ((mode === 'food' || mode === 'drink') && kind !== 'all' && row.category !== kind) return false;
      if (mode === 'daily') {
        const on = Number(row.of_day) === 1 && String(row.day_date || '').slice(0, 10) === today;
        if (kind === 'on' && !on) return false;
        if (kind === 'off' && on) return false;
      }
      if (needle && !`${row.name} ${row.description || ''} ${row.category}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [data?.items, query, kind, mode, today]);

  const title = titleOverride || (mode === 'drink' ? 'Boisson' : mode === 'daily' ? 'Menu du jour' : 'Menu');

  async function pickPhoto() {
    if (!form) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5, base64: true });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if ((asset.fileSize || 0) > 6_000_000) {
        setFormError('La photo dépasse 6 Mo.');
        return;
      }
      const photo = await toStoredUri(asset);
      setForm({ ...form, photo });
      setFormError(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Import impossible.');
    }
  }

  async function save() {
    if (!token || !form || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      await pmsPost(token, 'restaurant/item', {
        id: form.id || undefined,
        name: form.name,
        category: mode === 'drink' ? (DRINKS.includes(form.category) ? form.category : 'Jus') : form.category,
        price: Number(form.price),
        description: form.description,
        photo: form.photo,
      });
      setForm(null);
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleDay(dish: Dish) {
    if (!token) return;
    const on = Number(dish.of_day) === 1 && String(dish.day_date || '').slice(0, 10) === today;
    await pmsPost(token, 'restaurant/day', { id: dish.id, of_day: on ? 0 : 1 });
    await reload();
  }

  async function toggleAvailable(dish: Dish) {
    if (!token) return;
    const on = Number(dish.available ?? 1) === 1;
    await pmsPost(token, 'restaurant/available', { id: dish.id, available: on ? 0 : 1 });
    await reload();
  }

  function openCreate() {
    setFormError(null);
    setForm({ ...EMPTY, category: mode === 'drink' ? 'Jus' : 'Plat' });
  }

  return (
    <HotelShell
      title={title}
      loading={loading && !data}
      error={error}
      right={<GoldBtn compact icon="plus" label={mode === 'drink' ? 'Ajouter' : 'Publier'} onPress={openCreate} />}>
      <FilterBar
        query={query}
        onQuery={setQuery}
        queryPlaceholder={mode === 'drink' ? 'Rechercher une boisson...' : 'Rechercher...'}
        status={kind}
        onStatus={setKind}
        statuses={
          mode === 'food'
            ? [{ id: 'all', label: 'Toute la nourriture' }, ...FOOD.map((item) => ({ id: item, label: item }))]
            : mode === 'drink'
              ? [{ id: 'all', label: 'Toutes les boissons' }, ...DRINKS.map((item) => ({ id: item, label: item }))]
              : [{ id: 'all', label: 'Tous' }, { id: 'on', label: 'Au menu' }, { id: 'off', label: 'Hors menu' }]
        }
      />
      <View style={styles.grid}>
        {items.map((dish) => {
          const onDay = Number(dish.of_day) === 1 && String(dish.day_date || '').slice(0, 10) === today;
          const available = Number(dish.available ?? 1) === 1;
          return (
            <View key={dish.id} style={[styles.card, { width: cardWidth }, !available && styles.off]}>
              <View style={styles.photoWrap}>
                {dish.photo ? (
                  <Image source={{ uri: dish.photo }} style={styles.photo} contentFit="cover" />
                ) : (
                  <View style={styles.photo}>
                    <AppIcon name={isDrink(dish.category) ? 'coffee' : 'restaurant'} size={28} color={Palette.gold} />
                  </View>
                )}
              </View>
              <View style={styles.body}>
                <View style={styles.row}>
                  <Text style={styles.name} numberOfLines={1}>{dish.name}</Text>
                  <Text style={styles.price}>{money(dish.price)}</Text>
                </View>
                <Text style={styles.meta}>{dish.category}{onDay ? ' · Au menu du jour' : ''}{available ? '' : ' · Indisponible'}</Text>
                {dish.description ? <Text style={styles.desc} numberOfLines={2}>{dish.description}</Text> : null}
                <View style={styles.actions}>
                  <GoldBtn compact icon="star" label="Menu du jour" variant={onDay ? 'gold' : 'ghost'} onPress={() => void toggleDay(dish)} />
                  <GoldBtn compact icon="edit" label="Modifier" variant="ghost" onPress={() => { setFormError(null); setForm({ id: dish.id, name: dish.name, category: dish.category, price: String(dish.price), description: dish.description || '', photo: dish.photo || '' }); }} />
                  <GoldBtn compact icon={available ? 'hide' : 'show'} label={available ? 'Indisponible' : 'Disponible'} variant={available ? 'ghost' : 'ink'} onPress={() => void toggleAvailable(dish)} />
                </View>
              </View>
            </View>
          );
        })}
      </View>
      {!items.length ? <Text style={styles.empty}>{mode === 'drink' ? 'Aucune boisson.' : 'Aucun plat ne correspond.'}</Text> : null}

      <Modal visible={!!form} transparent animationType="fade" onRequestClose={() => setForm(null)}>
        <View style={styles.overlay}>
          <Pressable style={styles.fill} onPress={() => setForm(null)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{form?.id ? 'Modifier' : mode === 'drink' ? 'Nouvelle boisson' : 'Nouveau plat'}</Text>
            <Pressable onPress={() => void pickPhoto()} style={styles.picker}>
              {form?.photo ? <Image source={{ uri: form.photo }} style={styles.preview} contentFit="cover" /> : <AppIcon name="plus" size={22} color={Palette.ink} />}
              <Text style={styles.meta}>{form?.photo ? 'Changer la photo' : 'Ajouter une photo'}</Text>
            </Pressable>
            {form?.photo ? <GoldBtn compact icon="trash" label="Retirer la photo" variant="ghost" onPress={() => form && setForm({ ...form, photo: '' })} /> : null}
            <TextInput value={form?.name} onChangeText={(name) => form && setForm({ ...form, name })} placeholder="Nom" style={styles.input} />
            <View style={styles.kinds}>
              {(mode === 'drink' ? DRINKS : FOOD).map((item) => (
                <GoldBtn key={item} tiny label={item} variant={form?.category === item ? 'gold' : 'ghost'} onPress={() => form && setForm({ ...form, category: item })} />
              ))}
            </View>
            <TextInput value={form?.price} onChangeText={(price) => form && setForm({ ...form, price })} placeholder="Prix" keyboardType="numeric" style={styles.input} />
            <TextInput value={form?.description} onChangeText={(description) => form && setForm({ ...form, description })} placeholder="Détail" style={styles.input} />
            {formError ? <Text style={styles.err}>{formError}</Text> : null}
            <View style={styles.row}>
              <GoldBtn compact label={saving ? 'Enregistrement…' : 'Enregistrer'} onPress={() => void save()} />
              <GoldBtn compact variant="ghost" label="Fermer" onPress={() => setForm(null)} />
            </View>
          </View>
        </View>
      </Modal>

    </HotelShell>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { backgroundColor: Palette.white, borderRadius: Radius.card, borderWidth: 1, borderColor: Palette.gold, overflow: 'hidden' },
  photoWrap: { position: 'relative' },
  photo: { width: '100%', aspectRatio: 4 / 3, backgroundColor: 'rgba(20,22,34,0.04)', alignItems: 'center', justifyContent: 'center' },
  off: { opacity: 0.55 },
  body: { padding: 12, gap: 6 },
  actions: { flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, color: Palette.ink, fontWeight: '800' },
  price: { color: Palette.ink, fontWeight: '800' },
  meta: { color: Palette.ink, opacity: 0.65, fontSize: 12 },
  desc: { color: Palette.ink, fontSize: 13 },
  empty: { color: Palette.ink, opacity: 0.65 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(20,22,34,0.28)', padding: 16 },
  fill: { ...StyleSheet.absoluteFill },
  sheet: { width: '100%', maxWidth: 460, maxHeight: '90%', gap: 10, padding: 16, borderRadius: Radius.card, backgroundColor: Palette.white, borderWidth: 1, borderColor: Palette.gold },
  sheetTitle: { color: Palette.ink, fontWeight: '800', fontSize: 18 },
  picker: { height: 140, borderRadius: 16, borderWidth: 1, borderColor: Palette.gold, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', gap: 6 },
  preview: { ...StyleSheet.absoluteFill },
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { borderWidth: 1, borderColor: 'rgba(20,22,34,0.14)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: Palette.ink },
  err: { color: Palette.ink, fontWeight: '700', backgroundColor: 'rgba(212,175,55,0.2)', padding: 8, borderRadius: 10 },
});
