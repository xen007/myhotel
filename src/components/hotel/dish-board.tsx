import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { AppIcon } from '@/components/box-icon';
import { FilterBar } from '@/components/hotel/filter-bar';
import { HotelShell } from '@/components/hotel/hotel-shell';
import { ConfirmDialog, GoldBtn } from '@/components/hotel/kit';
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
  sold_qty?: number;
  order_count?: number;
  top_sold?: boolean;
  top_ordered?: boolean;
};

type Category = { id: number; name: string; kind: string; active?: number };

type Payload = { date: string; items: Dish[]; categories?: Category[] };

const EMPTY = { id: 0, name: '', category: '', price: '', description: '', photo: '' };

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
  const [catsOpen, setCatsOpen] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState<{ id: number; name: string } | null>(null);
  const [pendingCategory, setPendingCategory] = useState<Category | null>(null);
  const today = data?.date || '';
  const minCard = 400;
  const cols = Math.max(1, Math.min(3, Math.floor(Math.max(width - 48, minCard) / minCard)));
  const cardWidth = (cols === 1 ? '100%' : `${100 / cols - 1.6}%`) as `${number}%`;
  const kindKey = mode === 'drink' ? 'drink' : 'food';
  const categories = useMemo(
    () => (data?.categories ?? []).filter((row) => (mode === 'drink' ? row.kind === 'drink' : row.kind !== 'drink')),
    [data?.categories, mode],
  );
  const activeCategories = useMemo(() => categories.filter((row) => Number(row.active ?? 1) === 1), [categories]);
  const drinkNames = useMemo(() => {
    const named = (data?.categories ?? []).filter((row) => row.kind === 'drink').map((row) => row.name.toLowerCase());
    return new Set(named.length ? named : ['eau', 'jus', 'bière', 'biere', 'alcool', 'chaud', 'boisson']);
  }, [data?.categories]);

  const items = useMemo(() => {
    const rows = data?.items ?? [];
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const drink = drinkNames.has(String(row.category || '').toLowerCase());
      if (mode === 'drink' && !drink) return false;
      if (mode === 'food' && drink) return false;
      if (mode === 'daily') {
        const on = Number(row.of_day) === 1 && String(row.day_date || '').slice(0, 10) === today;
        if (!on) return false;
      }
      if ((mode === 'food' || mode === 'drink') && kind !== 'all' && row.category !== kind) return false;
      if (needle && !`${row.name} ${row.description || ''} ${row.category}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [data?.items, query, kind, mode, today, drinkNames]);

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
    if (!form.photo) {
      setFormError('Ajoutez une photo.');
      return;
    }
    if (!activeCategories.length) {
      setFormError('Créez d’abord une catégorie, puis publiez le plat.');
      return;
    }
    const category = form.category || activeCategories[0]?.name;
    if (!activeCategories.some((item) => item.name === category)) {
      setFormError('Choisissez une catégorie existante.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await pmsPost(token, 'restaurant/item', {
        id: form.id || undefined,
        name: form.name,
        category,
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

  async function toggleDay(dish: Dish, on: boolean) {
    if (!token) return;
    await pmsPost(token, 'restaurant/day', { id: dish.id, of_day: on ? 1 : 0 });
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
    setForm({ ...EMPTY, category: activeCategories[0]?.name || '' });
  }

  async function saveCategory() {
    if (!token || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      await pmsPost(token, 'restaurant/category', { name: categoryName, kind: kindKey });
      setCategoryName('');
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Création impossible.');
    } finally {
      setSaving(false);
    }
  }

  async function renameCategory() {
    if (!token || !editingCategory || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      await pmsPost(token, 'restaurant/category/update', { id: editingCategory.id, name: editingCategory.name });
      setEditingCategory(null);
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Modification impossible.');
    } finally {
      setSaving(false);
    }
  }

  async function removeCategory() {
    if (!token || !pendingCategory) return;
    try {
      await pmsPost(token, 'restaurant/category/delete', { id: pendingCategory.id });
      setPendingCategory(null);
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Suppression impossible.');
    }
  }

  async function toggleCategory(item: Category, active: boolean) {
    if (!token) return;
    await pmsPost(token, 'restaurant/category/active', { id: item.id, active: active ? 1 : 0 });
    await reload();
  }

  const filterStatuses =
    mode === 'daily'
      ? undefined
      : [{ id: 'all', label: 'Catégorie' }, ...activeCategories.map((item) => ({ id: item.name, label: item.name }))];

  return (
    <HotelShell
      title={title}
      loading={loading && !data}
      error={error}
      right={
        mode === 'daily' ? undefined : (
          <View style={styles.headBtns}>
            <GoldBtn compact icon="food-menu" label="Catégorie" variant="ghost" onPress={() => { setFormError(null); setCategoryName(''); setEditingCategory(null); setCatsOpen(true); }} />
            <GoldBtn compact icon="plus" label={mode === 'drink' ? 'Ajouter' : 'Publier'} onPress={openCreate} />
          </View>
        )
      }>
      <FilterBar
        query={query}
        onQuery={setQuery}
        queryPlaceholder={mode === 'drink' ? 'Rechercher une boisson...' : mode === 'daily' ? 'Rechercher au menu du jour...' : 'Rechercher...'}
        status={mode === 'daily' ? undefined : kind}
        onStatus={mode === 'daily' ? undefined : setKind}
        statuses={filterStatuses}
      />
      <View style={styles.grid}>
        {items.map((dish) => {
          const onDay = Number(dish.of_day) === 1 && String(dish.day_date || '').slice(0, 10) === today;
          const available = Number(dish.available ?? 1) === 1;
          const sold = Number(dish.sold_qty || 0);
          const ordered = Number(dish.order_count || 0);
          return (
            <View key={dish.id} style={[styles.card, { width: cardWidth }, !available && styles.off]}>
              <View style={styles.photoWrap}>
                {dish.photo ? (
                  <Image source={{ uri: dish.photo }} style={styles.photo} contentFit="cover" />
                ) : (
                  <View style={styles.photo}>
                    <AppIcon name={drinkNames.has(dish.category.toLowerCase()) ? 'coffee' : 'restaurant'} size={28} color={Palette.gold} />
                  </View>
                )}
              </View>
              <View style={styles.body}>
                <View style={styles.row}>
                  <Text style={styles.name} numberOfLines={1}>{dish.name}</Text>
                  <Text style={styles.price}>{money(dish.price)}</Text>
                </View>
                <Text style={styles.meta}>{dish.category}{onDay && mode !== 'daily' ? ' · Au menu du jour' : ''}{available ? '' : ' · Indisponible'}</Text>
                <View style={styles.stats}>
                  <Text style={styles.stat}>{sold} vendu{sold > 1 ? 's' : ''}</Text>
                  <Text style={styles.stat}>{ordered} commande{ordered > 1 ? 's' : ''}</Text>
                  {dish.top_sold ? <Text style={styles.statOn}>Plus vendu</Text> : null}
                  {dish.top_ordered ? <Text style={styles.statOn}>Plus commandé</Text> : null}
                </View>
                {dish.description ? <Text style={styles.desc} numberOfLines={2}>{dish.description}</Text> : null}
                <View style={styles.actions}>
                  {mode === 'daily' ? (
                    <>
                      <GoldBtn compact icon="edit" label="Modifier" variant="ghost" onPress={() => { setFormError(null); setForm({ id: dish.id, name: dish.name, category: dish.category, price: String(dish.price), description: dish.description || '', photo: dish.photo || '' }); }} />
                      <GoldBtn compact icon="x-circle" label="Annuler" variant="ghost" onPress={() => void toggleDay(dish, false)} />
                    </>
                  ) : (
                    <>
                      <GoldBtn compact icon="star" label="Menu du jour" variant={onDay ? 'gold' : 'ghost'} onPress={() => void toggleDay(dish, !onDay)} />
                      <GoldBtn compact icon="edit" label="Modifier" variant="ghost" onPress={() => { setFormError(null); setForm({ id: dish.id, name: dish.name, category: dish.category, price: String(dish.price), description: dish.description || '', photo: dish.photo || '' }); }} />
                      <GoldBtn compact icon={available ? 'hide' : 'show'} label={available ? 'Indisponible' : 'Disponible'} variant={available ? 'ghost' : 'ink'} onPress={() => void toggleAvailable(dish)} />
                    </>
                  )}
                </View>
              </View>
            </View>
          );
        })}
      </View>
      {!items.length ? <Text style={styles.empty}>{mode === 'drink' ? 'Aucune boisson.' : mode === 'daily' ? 'Aucun plat au menu du jour. Sélectionnez-les depuis Menu ou Boisson.' : 'Aucun plat ne correspond.'}</Text> : null}

      <Modal visible={!!form} transparent animationType="fade" onRequestClose={() => setForm(null)}>
        <View style={styles.overlay}>
          <Pressable style={styles.fill} onPress={() => setForm(null)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{form?.id ? 'Modifier' : mode === 'drink' ? 'Nouvelle boisson' : 'Nouveau plat'}</Text>
            <Pressable onPress={() => void pickPhoto()} style={styles.picker}>
              {form?.photo ? <Image source={{ uri: form.photo }} style={styles.preview} contentFit="cover" /> : <AppIcon name="plus" size={22} color={Palette.ink} />}
              <Text style={styles.meta}>{form?.photo ? 'Changer la photo' : 'Ajouter une photo'}</Text>
            </Pressable>
            <TextInput value={form?.name ?? ''} onChangeText={(name) => form && setForm({ ...form, name })} placeholder="Nom" style={styles.input} />
            <View style={styles.kinds}>
              {activeCategories.map((item) => (
                <GoldBtn key={item.id} tiny label={item.name} variant={form?.category === item.name ? 'gold' : 'ghost'} onPress={() => form && setForm({ ...form, category: item.name })} />
              ))}
              {!activeCategories.length ? <Text style={styles.err}>Créez une catégorie avant de publier.</Text> : null}
            </View>
            <TextInput value={form?.price ?? ''} onChangeText={(price) => form && setForm({ ...form, price })} placeholder="Prix" keyboardType="numeric" style={styles.input} />
            <TextInput value={form?.description ?? ''} onChangeText={(description) => form && setForm({ ...form, description })} placeholder="Détail" style={styles.input} />
            {formError && form ? <Text style={styles.err}>{formError}</Text> : null}
            <View style={styles.row}>
              <GoldBtn compact label={saving ? 'Enregistrement…' : 'Enregistrer'} onPress={() => void save()} />
              <GoldBtn compact variant="ghost" label="Fermer" onPress={() => setForm(null)} />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={catsOpen} transparent animationType="fade" onRequestClose={() => setCatsOpen(false)}>
        <View style={styles.overlay}>
          <Pressable style={styles.fill} onPress={() => setCatsOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.row}>
              <Text style={styles.sheetTitle}>Catégories</Text>
              <GoldBtn compact icon="x-circle" label="Fermer" variant="ghost" onPress={() => setCatsOpen(false)} />
            </View>
            <View style={styles.catForm}>
              <TextInput value={categoryName} onChangeText={setCategoryName} placeholder={mode === 'drink' ? 'Nouvelle catégorie (eau, jus…)' : 'Nouvelle catégorie (entrée, dessert…)'} style={[styles.input, styles.flex]} />
              <GoldBtn compact icon="plus" label={saving ? 'Ajout…' : 'Créer'} onPress={() => void saveCategory()} />
            </View>
            {formError && catsOpen ? <Text style={styles.err}>{formError}</Text> : null}
            <ScrollView style={styles.catScroll}>
              {categories.map((item) => {
                const inactive = Number(item.active ?? 1) !== 1;
                const editing = editingCategory?.id === item.id;
                const count = (data?.items ?? []).filter((dish) => String(dish.category || '').trim().toLowerCase() === item.name.trim().toLowerCase()).length;
                return (
                  <View key={item.id} style={styles.catRow}>
                    {editing ? (
                      <TextInput value={editingCategory?.name ?? ''} onChangeText={(name) => setEditingCategory({ id: item.id, name })} style={[styles.input, styles.flex]} />
                    ) : (
                      <Text style={[styles.name, styles.flex, inactive && styles.inactive]} numberOfLines={1}>
                        {item.name}{inactive ? ' · inactive' : ''} · {count}
                      </Text>
                    )}
                    {editing ? (
                      <GoldBtn compact icon="check-circle" label="OK" onPress={() => void renameCategory()} />
                    ) : (
                      <Pressable onPress={() => { setFormError(null); setEditingCategory({ id: item.id, name: item.name }); }} hitSlop={8}>
                        <AppIcon name="edit" size={14} color={Palette.ink} />
                      </Pressable>
                    )}
                    {inactive ? (
                      <GoldBtn compact label="Réactiver" variant="ghost" onPress={() => void toggleCategory(item, true)} />
                    ) : (
                      <Pressable onPress={() => setPendingCategory(item)} hitSlop={8}>
                        <AppIcon name="trash" size={14} color={Palette.ink} />
                      </Pressable>
                    )}
                  </View>
                );
              })}
              {!categories.length ? <Text style={styles.empty}>Aucune catégorie.</Text> : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ConfirmDialog
        visible={!!pendingCategory}
        title="Supprimer la catégorie"
        message={pendingCategory ? `Supprimer ${pendingCategory.name} ? Si elle est utilisée, elle sera seulement désactivée.` : ''}
        confirmLabel="Supprimer"
        confirmIcon="trash"
        onCancel={() => setPendingCategory(null)}
        onConfirm={() => void removeCategory()}
      />
    </HotelShell>
  );
}

const styles = StyleSheet.create({
  headBtns: { flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', gap: 8 },
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
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stat: { color: Palette.ink, opacity: 0.7, fontSize: 11, fontWeight: '700' },
  statOn: { color: Palette.ink, fontSize: 11, fontWeight: '800', backgroundColor: 'rgba(212,175,55,0.35)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  desc: { color: Palette.ink, fontSize: 13 },
  empty: { color: Palette.ink, opacity: 0.65 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(20,22,34,0.28)', padding: 16 },
  fill: { ...StyleSheet.absoluteFill },
  sheet: { width: '100%', maxWidth: 460, maxHeight: '90%', gap: 10, padding: 16, borderRadius: Radius.card, backgroundColor: Palette.white, borderWidth: 1, borderColor: Palette.gold },
  sheetTitle: { color: Palette.ink, fontWeight: '800', fontSize: 18, flex: 1 },
  picker: { height: 140, borderRadius: 16, borderWidth: 1, borderColor: Palette.gold, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', gap: 6 },
  preview: { ...StyleSheet.absoluteFill },
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { borderWidth: 1, borderColor: 'rgba(20,22,34,0.14)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: Palette.ink },
  err: { color: Palette.ink, fontWeight: '700', backgroundColor: 'rgba(212,175,55,0.2)', padding: 8, borderRadius: 10 },
  catForm: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catScroll: { maxHeight: 280 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  flex: { flex: 1, minWidth: 0 },
  inactive: { opacity: 0.5 },
});
