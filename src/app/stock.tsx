import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Redirect } from 'expo-router';
import { createElement, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { AppIcon } from '@/components/box-icon';
import { FilterBar, FilterSelect } from '@/components/hotel/filter-bar';
import { HotelShell } from '@/components/hotel/hotel-shell';
import { ConfirmDialog, GoldBtn } from '@/components/hotel/kit';
import { Breakpoints, Palette, Radius } from '@/constants/theme';
import { usePms } from '@/hooks/use-pms';
import { pmsPost, roomsRequest } from '@/lib/api';
import { money, prettyDate, prettyStamp } from '@/lib/format';

type Product = {
  id: number;
  name: string;
  kind?: string | null;
  unit?: string;
  stock: number;
  min_stock: number;
  cost: number;
  price: number;
  category?: string | null;
  warehouse_id?: number | null;
  warehouse?: string | null;
  lot?: string | null;
  expires_at?: string | null;
  photo?: string | null;
};

type Warehouse = { id: number; name: string; kind?: string; active?: number };
type Category = { id: number; name: string; active?: number };

type Move = {
  id: number;
  product_name: string;
  warehouse?: string | null;
  type: string;
  qty: number;
  at: string;
  dest?: string | null;
  actor?: string | null;
  note?: string | null;
  taken_by?: string | null;
  cancelled_at?: string | null;
};

type StaffPick = { name: string; email?: string | null; role?: string };

type Payload = { products: Product[]; warehouses?: Warehouse[]; categories?: Category[]; moves?: Move[]; staff?: StaffPick[] };

function pickStaff(people: StaffPick[], name: string, email: string, query: string) {
  if (name) {
    const exact = people.find((person) => person.name === name && (!email || (person.email || '') === email));
    if (exact) return exact;
  }
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const hits = people.filter(
    (person) => person.name.toLowerCase().startsWith(q) || (person.email || '').toLowerCase().startsWith(q),
  );
  return hits.length === 1 ? hits[0] : null;
}

type FormState = {
  id?: number;
  name: string;
  kind: 'vente' | 'interne';
  category: string;
  warehouse_id: string;
  lot: string;
  stock: string;
  min_stock: string;
  cost: string;
  price: string;
  expires_at: string;
  photo: string;
};

const emptyForm = (warehouseId = '', category = ''): FormState => ({
  name: '',
  kind: 'vente',
  category,
  warehouse_id: warehouseId,
  lot: '',
  stock: '0',
  min_stock: '0',
  cost: '0',
  price: '0',
  expires_at: '',
  photo: '',
});

function qty(value: number) {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(value);
}

function lotLabel(item: Product) {
  return item.lot?.trim() || `LOT-${String(item.id).padStart(3, '0')}`;
}

function isInterne(item: Product) {
  return item.kind === 'interne';
}

async function toStoredUri(asset: ImagePicker.ImagePickerAsset) {
  if (asset.base64) {
    const mime = asset.mimeType || 'image/jpeg';
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

export default function StockScreen() {
  const { data, error, loading, reload, token, user, ready } = usePms<Payload>('stock');
  const { width } = useWindowDimensions();
  const [pendingWarehouse, setPendingWarehouse] = useState<Warehouse | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [warehouse, setWarehouse] = useState('all');
  const [status, setStatus] = useState('all');
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null);
  const [warehouseName, setWarehouseName] = useState('');
  const [storesOpen, setStoresOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [editingStore, setEditingStore] = useState<{ id: number; name: string } | null>(null);
  const [editingCategory, setEditingCategory] = useState<{ id: number; name: string } | null>(null);
  const [pendingCategory, setPendingCategory] = useState<Category | null>(null);
  const [issue, setIssue] = useState<{ product: Product; qty: string; taken_by: string; taken_email: string; note: string; room_number: string } | null>(null);
  const [staffQuery, setStaffQuery] = useState('');
  const [rooms, setRooms] = useState<{ number: string }[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyQuery, setHistoryQuery] = useState('');
  const [pendingMove, setPendingMove] = useState<Move | null>(null);

  const canManage = user?.role === 'manager' || user?.role === 'owner';

  useEffect(() => {
    if (!token) return;
    void roomsRequest(token)
      .then((list) => setRooms(list.map((room) => ({ number: room.number }))))
      .catch(() => setRooms([]));
  }, [token]);
  const products = useMemo(() => data?.products ?? [], [data?.products]);
  const warehouses = useMemo(() => data?.warehouses ?? [], [data?.warehouses]);
  const categories = useMemo(() => data?.categories ?? [], [data?.categories]);
  const activeWarehouses = useMemo(() => warehouses.filter((item) => Number(item.active ?? 1) === 1), [warehouses]);
  const activeCategories = useMemo(() => categories.filter((item) => Number(item.active ?? 1) === 1), [categories]);
  const moves = useMemo(
    () => (data?.moves ?? []).filter((row) => ['sortie', 'service', 'perte', 'casse', 'perime'].includes(row.type)),
    [data?.moves],
  );
  const people = useMemo(() => {
    const seen = new Set<string>();
    return (data?.staff ?? []).filter((person) => {
      const key = `${person.name}|${person.email ?? ''}`;
      if (!person.name || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [data?.staff]);
  const staffMatches = useMemo(() => {
    const q = staffQuery.trim().toLowerCase();
    if (!q) return people;
    return people.filter(
      (person) => person.name.toLowerCase().startsWith(q) || (person.email || '').toLowerCase().startsWith(q),
    );
  }, [people, staffQuery]);
  const historyRows = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    return moves.filter((row) => {
      if (!q) return true;
      const who = row.taken_by || row.note || '';
      return `${row.product_name} ${row.warehouse ?? ''} ${row.dest ?? ''} ${who}`.toLowerCase().includes(q);
    });
  }, [moves, historyQuery]);
  const ruptureCount = products.filter((item) => Number(item.stock) <= 0).length;

  const visible = useMemo(() => {
    return products.filter((item) => {
      const hay = `${item.name} ${item.lot ?? ''} ${item.warehouse ?? ''}`.toLowerCase();
      if (query.trim() && !hay.includes(query.trim().toLowerCase())) return false;
      if (warehouse !== 'all' && String(item.warehouse_id ?? '') !== warehouse) return false;
      if (status === 'vente') return !isInterne(item);
      if (status === 'interne') return isInterne(item);
      if (status === 'rupture') return Number(item.stock) <= 0;
      if (status === 'low') return Number(item.stock) > 0 && Number(item.stock) <= Number(item.min_stock);
      return true;
    });
  }, [products, query, warehouse, status]);

  const isDesktop = width >= Breakpoints.desktop;
  const tableMin = 980;

  function openCreate() {
    setFormError(null);
    const first = activeWarehouses[0];
    const category = activeCategories[0];
    setForm(emptyForm(first ? String(first.id) : '', category ? category.name : ''));
  }

  function openEdit(item: Product) {
    setFormError(null);
    setForm({
      id: item.id,
      name: item.name,
      kind: isInterne(item) ? 'interne' : 'vente',
      category: item.category || '',
      warehouse_id: item.warehouse_id ? String(item.warehouse_id) : activeWarehouses[0] ? String(activeWarehouses[0].id) : '',
      lot: item.lot || '',
      stock: String(item.stock ?? 0),
      min_stock: String(item.min_stock ?? 0),
      cost: String(item.cost ?? 0),
      price: String(item.price ?? 0),
      expires_at: item.expires_at ? String(item.expires_at).slice(0, 10) : '',
      photo: item.photo || '',
    });
  }

  async function pickPhoto() {
    if (!form) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.55,
        base64: true,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if ((asset.fileSize || 0) > 6_000_000) {
        setFormError('La photo dépasse 6 Mo. Compressez-la puis réessayez.');
        return;
      }
      setForm({ ...form, photo: await toStoredUri(asset) });
      setFormError(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Import impossible.');
    }
  }

  async function save() {
    if (!token || !form || saving) return;
    if (!form.name.trim()) {
      setFormError('Indiquez le nom du produit.');
      return;
    }
    if (!form.warehouse_id) {
      setFormError('Choisissez le magasin où se trouve le produit.');
      return;
    }
    if (!form.category.trim()) {
      setFormError('Choisissez une catégorie.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await pmsPost(token, 'products', {
        id: form.id,
        name: form.name.trim(),
        kind: form.kind,
        category: form.category.trim(),
        warehouse_id: Number(form.warehouse_id),
        lot: form.lot.trim(),
        stock: Number(form.stock || 0),
        min_stock: Number(form.min_stock || 0),
        cost: Number(form.cost || 0),
        price: form.kind === 'interne' ? 0 : Number(form.price || 0),
        expires_at: form.expires_at.trim(),
        photo: form.photo || null,
      });
      setForm(null);
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!token || !pendingDelete) return;
    await pmsPost(token, 'products/delete', { id: pendingDelete.id });
    setPendingDelete(null);
    await reload();
  }

  async function saveWarehouse() {
    if (!token || saving) return;
    const name = warehouseName.trim();
    if (!name) {
      setFormError('Indiquez le nom du magasin.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const created = await pmsPost<{ id: number }>(token, 'warehouses', { name });
      setWarehouseName('');
      if (form && created?.id) {
        setForm({ ...form, warehouse_id: String(created.id) });
      }
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Création impossible.');
    } finally {
      setSaving(false);
    }
  }

  async function removeWarehouse() {
    if (!token || !pendingWarehouse) return;
    try {
      await pmsPost(token, 'warehouses/delete', { id: pendingWarehouse.id });
      setPendingWarehouse(null);
      setListError(null);
      await reload();
    } catch (err) {
      setPendingWarehouse(null);
      setListError(err instanceof Error ? err.message : 'Suppression impossible.');
    }
  }

  function storeUsed(item: Warehouse) {
    return products.some((product) => Number(product.warehouse_id) === item.id)
      || moves.some((move) => String(move.warehouse || '').trim().toLowerCase() === item.name.trim().toLowerCase());
  }

  function categoryUsed(item: Category) {
    return products.some((product) => String(product.category || '').trim().toLowerCase() === item.name.trim().toLowerCase());
  }

  async function renameStore() {
    if (!token || !editingStore || saving) return;
    const name = editingStore.name.trim();
    if (!name) {
      setFormError('Indiquez le nom du magasin.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await pmsPost(token, 'warehouses/update', { id: editingStore.id, name });
      setEditingStore(null);
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Modification impossible.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleStore(item: Warehouse, active: boolean) {
    if (!token) return;
    try {
      await pmsPost(token, 'warehouses/active', { id: item.id, active: active ? 1 : 0 });
      setListError(null);
      await reload();
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Modification impossible.');
    }
  }

  async function saveCategory() {
    if (!token || saving) return;
    const name = categoryName.trim();
    if (!name) {
      setFormError('Indiquez le nom de la catégorie.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const created = await pmsPost<{ id: number }>(token, 'categories', { name });
      setCategoryName('');
      if (form && created?.id) {
        const next = categories.find((item) => item.id === created.id)?.name || name;
        setForm({ ...form, category: next });
      }
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Création impossible.');
    } finally {
      setSaving(false);
    }
  }

  async function renameCategory() {
    if (!token || !editingCategory || saving) return;
    const name = editingCategory.name.trim();
    if (!name) {
      setFormError('Indiquez le nom de la catégorie.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await pmsPost(token, 'categories/update', { id: editingCategory.id, name });
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
      await pmsPost(token, 'categories/delete', { id: pendingCategory.id });
      setPendingCategory(null);
      setListError(null);
      await reload();
    } catch (err) {
      setPendingCategory(null);
      setListError(err instanceof Error ? err.message : 'Suppression impossible.');
    }
  }

  async function toggleCategory(item: Category, active: boolean) {
    if (!token) return;
    try {
      await pmsPost(token, 'categories/active', { id: item.id, active: active ? 1 : 0 });
      setListError(null);
      await reload();
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Modification impossible.');
    }
  }

  async function saveIssue() {
    if (!token || !issue || saving) return;
    if (!issue.room_number.trim()) {
      setFormError('Indiquez la chambre de destination.');
      return;
    }
    const person = pickStaff(people, issue.taken_by, issue.taken_email, staffQuery);
    if (!person) {
      setFormError('Choisissez un personnel enregistré.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await pmsPost(token, 'stock/issue', {
        product_id: issue.product.id,
        qty: Number(issue.qty || 0),
        taken_by: person.name,
        taken_email: person.email || '',
        room_number: issue.room_number.trim(),
        note: issue.note.trim(),
      });
      setIssue(null);
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Sortie impossible.');
    } finally {
      setSaving(false);
    }
  }

  async function cancelMove() {
    if (!token || !pendingMove) return;
    try {
      await pmsPost(token, 'stock/issue/cancel', { id: pendingMove.id });
      setPendingMove(null);
      setListError(null);
      await reload();
    } catch (err) {
      setPendingMove(null);
      setListError(err instanceof Error ? err.message : 'Annulation impossible.');
    }
  }

  const storeOptions = form
    ? warehouses.filter((item) => Number(item.active ?? 1) === 1 || String(item.id) === form.warehouse_id)
    : activeWarehouses;
  const categoryOptions = form
    ? categories.filter((item) => Number(item.active ?? 1) === 1 || item.name === form.category)
    : activeCategories;

  if (ready && !user) return <Redirect href="/welcome" />;
  if (ready && !canManage) return <Redirect href="/home" />;

  return (
    <HotelShell
      title="Économat"
      loading={loading && !data}
      error={error}
      right={
        <>
          <GoldBtn compact icon="cabinet" label="Magasin" variant="ghost" onPress={() => { setFormError(null); setWarehouseName(''); setEditingStore(null); setStoresOpen(true); }} />
          <GoldBtn compact icon="food-menu" label="Catégorie" variant="ghost" onPress={() => { setFormError(null); setCategoryName(''); setEditingCategory(null); setCategoriesOpen(true); }} />
          <GoldBtn compact icon="time" label="Historique" variant="ghost" onPress={() => { setHistoryQuery(''); setHistoryOpen(true); }} />
          <GoldBtn compact icon="plus" label="Ajouter" onPress={openCreate} />
        </>
      }>
      {listError ? <Text style={styles.inlineError}>{listError}</Text> : null}

      {ruptureCount > 0 ? (
        <Pressable onPress={() => setStatus('rupture')} style={styles.banner}>
          <AppIcon name="error-circle" size={18} color={Palette.ink} />
          <Text style={styles.bannerText}>
            {ruptureCount} produit{ruptureCount > 1 ? 's' : ''} en rupture de stock
          </Text>
        </Pressable>
      ) : null}

      <FilterBar
        query={query}
        onQuery={setQuery}
        queryPlaceholder="Rechercher un produit..."
        stackSearch
        category={warehouse}
        onCategory={setWarehouse}
        categories={[
          { id: 'all', label: 'Tous les magasins' },
          ...warehouses.map((item) => ({ id: String(item.id), label: item.name })),
        ]}
        status={status}
        onStatus={setStatus}
        statuses={[
          { id: 'all', label: 'Tous' },
          { id: 'vente', label: 'Accueil' },
          { id: 'interne', label: 'Magasin' },
          { id: 'rupture', label: 'Rupture' },
          { id: 'low', label: 'Stock bas' },
        ]}
      />

      <ScrollView horizontal={!isDesktop} showsHorizontalScrollIndicator={!isDesktop}>
        <View style={[styles.table, { minWidth: isDesktop ? '100%' : tableMin, width: isDesktop ? '100%' : tableMin }]}>
          <View style={[styles.tr, styles.th]}>
            <Text style={[styles.td, styles.colName, styles.thText]}>Nom</Text>
            <Text style={[styles.td, styles.colUse, styles.thText]}>Magasin</Text>
            <Text style={[styles.td, styles.colNum, styles.thText, styles.num]}>Stock</Text>
            <Text style={[styles.td, styles.colNum, styles.thText, styles.num]}>Min</Text>
            <Text style={[styles.td, styles.colPrice, styles.thText, styles.num]}>Prix achat</Text>
            <Text style={[styles.td, styles.colPrice, styles.thText, styles.num]}>Prix vente</Text>
            <View style={[styles.td, styles.colActions]} />
          </View>
          {visible.map((item, index) => {
            const out = Number(item.stock) <= 0;
            const low = !out && Number(item.stock) <= Number(item.min_stock);
            return (
              <View key={item.id} style={[styles.tr, index % 2 ? styles.trAlt : null, out && styles.trUrgent]}>
                <View style={[styles.td, styles.colName, styles.nameCell]}>
                  {item.photo ? (
                    <Image source={{ uri: item.photo }} style={styles.thumb} contentFit="cover" />
                  ) : (
                    <View style={styles.thumbEmpty}>
                      <AppIcon name="cabinet" size={16} color={Palette.ink} />
                    </View>
                  )}
                  <View style={styles.nameCopy}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.lot} numberOfLines={1}>
                      {item.category ? `${item.category} · ` : ''}
                      {out ? 'Rupture' : low ? 'Stock bas' : `Lot ${lotLabel(item)}`}
                      {item.expires_at ? ` · exp. ${prettyDate(String(item.expires_at))}` : ''}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.td, styles.colUse]} numberOfLines={1}>{item.warehouse || '—'}</Text>
                <Text style={[styles.td, styles.colNum, styles.num, out && styles.numLow]}>{qty(Number(item.stock))}</Text>
                <Text style={[styles.td, styles.colNum, styles.num]}>{qty(Number(item.min_stock))}</Text>
                <Text style={[styles.td, styles.colPrice, styles.num]}>{money(Number(item.cost))}</Text>
                <Text style={[styles.td, styles.colPrice, styles.num]}>{money(Number(item.price))}</Text>
                <View style={[styles.td, styles.colActions, styles.actionRow]}>
                  {item.kind === 'interne' ? (
                    <Pressable style={styles.iconBtn} onPress={() => { setFormError(null); setStaffQuery(''); setIssue({ product: item, qty: '1', taken_by: '', taken_email: '', note: '', room_number: '' }); }}>
                      <AppIcon name="log-out" size={15} color={Palette.ink} />
                    </Pressable>
                  ) : null}
                  <Pressable style={styles.iconBtn} onPress={() => openEdit(item)}>
                    <AppIcon name="edit" size={15} color={Palette.ink} />
                  </Pressable>
                  <Pressable style={[styles.iconBtn, styles.iconDanger]} onPress={() => setPendingDelete(item)}>
                    <AppIcon name="trash" size={15} color={Palette.white} />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
      {!visible.length ? <Text style={styles.empty}>Aucun produit ne correspond.</Text> : null}
      {moves.length ? (
        <View style={styles.moves}>
          <Text style={styles.movesTitle}>Dernières sorties magasin</Text>
          {moves.slice(0, 8).map((row) => (
            <Text key={row.id} style={styles.moveLine}>
              {row.product_name} · {qty(Number(row.qty))} · {row.dest || '—'} · {prettyStamp(row.at)}
            </Text>
          ))}
        </View>
      ) : null}

      <Modal visible={!!form} transparent animationType="fade" onRequestClose={() => setForm(null)}>
        <View style={styles.overlay} pointerEvents="box-none">
          <Pressable style={styles.overlayFill} onPress={() => setForm(null)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{form?.id ? 'Modifier le produit' : 'Nouveau produit'}</Text>
              <Pressable onPress={() => setForm(null)} hitSlop={12}>
                <AppIcon name="x-circle" size={22} color={Palette.ink} />
              </Pressable>
            </View>
            {formError && form ? <Text style={styles.formError}>{formError}</Text> : null}
            {form ? (
              <ScrollView contentContainerStyle={styles.sheetInner} showsVerticalScrollIndicator={false}>
                <View style={styles.kindRow}>
                  <GoldBtn
                    compact
                    label="Vente accueil"
                    variant={form.kind === 'vente' ? 'gold' : 'ghost'}
                    onPress={() => setForm({ ...form, kind: 'vente' })}
                  />
                  <GoldBtn
                    compact
                    label="Magasin interne"
                    variant={form.kind === 'interne' ? 'gold' : 'ghost'}
                    onPress={() => setForm({ ...form, kind: 'interne' })}
                  />
                </View>
                <View style={styles.fields}>
                  <View style={styles.field}>
                    <Text style={styles.label}>Magasin</Text>
                    {storeOptions.length ? (
                      Platform.OS === 'web' ? (
                        createElement(
                          'select',
                          {
                            value: form.warehouse_id,
                            onChange: (event: { target: { value: string } }) =>
                              setForm({ ...form, warehouse_id: event.target.value }),
                            style: webDate,
                          },
                          storeOptions.map((item) =>
                            createElement('option', { key: item.id, value: String(item.id) }, item.name),
                          ),
                        )
                      ) : (
                        <FilterSelect
                          value={form.warehouse_id}
                          onChange={(warehouse_id) => setForm({ ...form, warehouse_id })}
                          options={storeOptions.map((item) => ({ id: String(item.id), label: item.name }))}
                        />
                      )
                    ) : (
                      <Text style={styles.photoHint}>Créez un magasin</Text>
                    )}
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.label}>Catégorie</Text>
                    {categoryOptions.length ? (
                      <FilterSelect
                        fill
                        value={form.category}
                        onChange={(category) => setForm({ ...form, category })}
                        options={categoryOptions.map((item) => ({ id: item.name, label: item.name }))}
                      />
                    ) : (
                      <Text style={styles.photoHint}>Créez une catégorie</Text>
                    )}
                  </View>
                  <Field label="Nom" value={form.name} onChange={(name) => setForm({ ...form, name })} />
                  <Field label="Lot (facultatif)" value={form.lot} onChange={(lot) => setForm({ ...form, lot })} />
                  <View style={styles.field}>
                    <Text style={styles.label}>Date d’expiration (facultatif)</Text>
                    {Platform.OS === 'web'
                      ? createElement('input', {
                          type: 'date',
                          value: form.expires_at,
                          onChange: (event: { target: { value: string } }) =>
                            setForm({ ...form, expires_at: event.target.value }),
                          style: webDate,
                        })
                      : (
                        <TextInput
                          value={form.expires_at}
                          onChangeText={(expires_at) => setForm({ ...form, expires_at })}
                          placeholder="AAAA-MM-JJ"
                          style={styles.input}
                        />
                      )}
                  </View>
                  <Field label="Stock" value={form.stock} onChange={(stock) => setForm({ ...form, stock })} keyboard="numeric" />
                  <Field label="Stock min" value={form.min_stock} onChange={(min_stock) => setForm({ ...form, min_stock })} keyboard="numeric" />
                  <Field label="Prix d’achat" value={form.cost} onChange={(cost) => setForm({ ...form, cost })} keyboard="numeric" />
                  {form.kind === 'vente' ? (
                    <Field label="Prix de vente" value={form.price} onChange={(price) => setForm({ ...form, price })} keyboard="numeric" />
                  ) : null}
                </View>
                <View style={styles.photoRow}>
                  {form.photo ? (
                    <View style={styles.photoWrap}>
                      <Image source={{ uri: form.photo }} style={styles.photo} contentFit="cover" />
                      <Pressable style={styles.removePhoto} onPress={() => setForm({ ...form, photo: '' })}>
                        <AppIcon name="trash" size={14} color={Palette.white} />
                      </Pressable>
                    </View>
                  ) : (
                    <View style={styles.photoEmpty}>
                      <AppIcon name="cabinet" size={22} color={Palette.ink} />
                    </View>
                  )}
                  <GoldBtn compact icon="plus" label={form.photo ? 'Changer la photo' : 'Ajouter une photo'} onPress={() => void pickPhoto()} />
                </View>
                <View style={styles.sheetActions}>
                  <GoldBtn compact icon="x-circle" label="Annuler" variant="ghost" onPress={() => setForm(null)} />
                  <GoldBtn compact icon="check-circle" label={saving ? 'Enregistrement…' : 'Enregistrer'} onPress={() => void save()} />
                </View>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal visible={historyOpen} transparent animationType="fade" onRequestClose={() => setHistoryOpen(false)}>
        <View style={styles.overlay} pointerEvents="box-none">
          <Pressable style={styles.overlayFill} onPress={() => setHistoryOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Historique des sorties</Text>
              <Pressable onPress={() => setHistoryOpen(false)} hitSlop={10}>
                <AppIcon name="x-circle" size={22} color={Palette.ink} />
              </Pressable>
            </View>
            <TextInput
              value={historyQuery}
              onChangeText={setHistoryQuery}
              placeholder="Produit, chambre, personnel..."
              style={styles.input}
            />
            <ScrollView style={{ maxHeight: 460 }} horizontal>
              <View style={[styles.table, { minWidth: 820 }]}>
                <View style={[styles.tr, styles.th]}>
                  <Text style={[styles.td, styles.colName, styles.thText]}>Produit</Text>
                  <Text style={[styles.td, styles.colUse, styles.thText]}>Chambre</Text>
                  <Text style={[styles.td, styles.colUse, styles.thText]}>Personnel</Text>
                  <Text style={[styles.td, styles.colNum, styles.thText, styles.num]}>Qté</Text>
                  <Text style={[styles.td, styles.colPrice, styles.thText]}>Date</Text>
                  <View style={[styles.td, styles.colActions]} />
                </View>
                {historyRows.map((row, index) => {
                  const cancelled = Boolean(row.cancelled_at);
                  return (
                    <View key={row.id} style={[styles.tr, index % 2 ? styles.trAlt : null, cancelled && styles.trCancelled]}>
                      <View style={[styles.td, styles.colName]}>
                        <Text style={styles.name} numberOfLines={1}>{row.product_name}</Text>
                        <Text style={styles.lot} numberOfLines={1}>{row.warehouse || 'Magasin'}{row.note ? ` · ${row.note}` : ''}</Text>
                      </View>
                      <Text style={[styles.td, styles.colUse, styles.cellText]} numberOfLines={1}>{row.dest || '—'}</Text>
                      <Text style={[styles.td, styles.colUse, styles.cellText]} numberOfLines={1}>{row.taken_by || row.note || '—'}</Text>
                      <Text style={[styles.td, styles.colNum, styles.num]}>{qty(Number(row.qty))}</Text>
                      <Text style={[styles.td, styles.colPrice, styles.cellText]}>{prettyStamp(row.at)}</Text>
                      <View style={[styles.td, styles.colActions, styles.actionRow]}>
                        {cancelled ? (
                          <Text style={styles.lot}>Annulée</Text>
                        ) : (
                          <Pressable style={[styles.iconBtn, styles.iconDanger]} onPress={() => setPendingMove(row)}>
                            <AppIcon name="x-circle" size={15} color={Palette.white} />
                          </Pressable>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
              {!historyRows.length ? <Text style={styles.empty}>Aucune sortie interne.</Text> : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ConfirmDialog
        visible={!!issue}
        title={`Sortie magasin · ${issue?.product.name ?? ''}`}
        message=""
        confirmLabel="Sortir"
        confirmIcon="log-out"
        onCancel={() => {
          setIssue(null);
          setFormError(null);
        }}
        onConfirm={() => void saveIssue()}>
        {Platform.OS === 'web' ? (
          createElement(
            'select',
            {
              value: issue?.room_number ?? '',
              onChange: (event: { target: { value: string } }) =>
                setIssue(issue ? { ...issue, room_number: event.target.value } : issue),
              style: webDate,
            },
            createElement('option', { value: '' }, 'Chambre de destination'),
            rooms.map((room) => createElement('option', { key: room.number, value: room.number }, `Chambre ${room.number}`)),
          )
        ) : (
          <FilterSelect
            value={issue?.room_number || ''}
            onChange={(room_number) => setIssue(issue ? { ...issue, room_number } : issue)}
            options={[{ id: '', label: 'Chambre de destination' }, ...rooms.map((room) => ({ id: room.number, label: `Chambre ${room.number}` }))]}
          />
        )}
        <TextInput
          value={staffQuery}
          onChangeText={(value) => {
            setStaffQuery(value);
            const hit = pickStaff(people, '', '', value);
            setIssue(issue ? { ...issue, taken_by: hit?.name || '', taken_email: hit?.email || '' } : issue);
          }}
          placeholder="Début du nom ou de l’e-mail"
          style={styles.input}
        />
        {Platform.OS === 'web' ? (
          createElement(
            'select',
            {
              value: issue?.taken_email || issue?.taken_by || '',
              onChange: (event: { target: { value: string } }) => {
                const key = event.target.value;
                const person = staffMatches.find((item) => (item.email || item.name) === key) ?? people.find((item) => (item.email || item.name) === key);
                if (!person) {
                  setIssue(issue ? { ...issue, taken_by: '', taken_email: '' } : issue);
                  return;
                }
                setStaffQuery(person.name);
                setIssue(issue ? { ...issue, taken_by: person.name, taken_email: person.email || '' } : issue);
              },
              style: webDate,
            },
            createElement('option', { value: '' }, 'Personnel'),
            staffMatches.map((person) =>
              createElement(
                'option',
                { key: `${person.name}-${person.email || ''}`, value: person.email || person.name },
                person.email ? `${person.name} · ${person.email}` : person.name,
              ),
            ),
          )
        ) : (
          <View style={styles.suggest}>
            {staffMatches.slice(0, 8).map((person) => (
              <Pressable
                key={`${person.name}-${person.email || ''}`}
                style={styles.suggestRow}
                onPress={() => {
                  setStaffQuery(person.name);
                  setIssue(issue ? { ...issue, taken_by: person.name, taken_email: person.email || '' } : issue);
                }}>
                <Text style={styles.suggestName}>{person.name}</Text>
                {person.email ? <Text style={styles.suggestMail}>{person.email}</Text> : null}
              </Pressable>
            ))}
          </View>
        )}
        {formError && issue ? <Text style={styles.inlineError}>{formError}</Text> : null}
        <TextInput
          value={issue?.taken_by ?? ''}
          onChangeText={(taken_by) => setIssue(issue ? { ...issue, taken_by } : issue)}
          placeholder="Qui récupère ? (agent, étage…)"
          style={styles.input}
        />
        <TextInput
          value={issue?.qty ?? ''}
          onChangeText={(next) => setIssue(issue ? { ...issue, qty: next } : issue)}
          placeholder="Quantité"
          keyboardType="numeric"
          style={styles.input}
        />
        <TextInput
          value={issue?.note ?? ''}
          onChangeText={(note) => setIssue(issue ? { ...issue, note } : issue)}
          placeholder="Motif (facultatif)"
          style={styles.input}
        />
      </ConfirmDialog>

      <Modal visible={storesOpen} transparent animationType="fade" onRequestClose={() => setStoresOpen(false)}>
        <View style={styles.overlay}>
          <Pressable style={styles.overlayFill} onPress={() => setStoresOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Magasins</Text>
              <GoldBtn compact icon="x-circle" label="Fermer" variant="ghost" onPress={() => setStoresOpen(false)} />
            </View>
            <View style={styles.storeForm}>
              <TextInput value={warehouseName} onChangeText={setWarehouseName} placeholder="Nouveau magasin" style={styles.input} />
              <GoldBtn compact icon="plus" label={saving ? 'Ajout…' : 'Créer'} onPress={() => void saveWarehouse()} />
            </View>
            {formError && storesOpen ? <Text style={styles.inlineError}>{formError}</Text> : null}
            <ScrollView style={styles.storeScroll}>
              {warehouses.map((item) => {
                const inactive = Number(item.active ?? 1) !== 1;
                const editing = editingStore?.id === item.id;
                return (
                  <View key={item.id} style={styles.storeRow}>
                    {editing ? (
                      <TextInput
                        value={editingStore.name}
                        onChangeText={(name) => setEditingStore({ id: item.id, name })}
                        style={[styles.input, styles.storeName]}
                      />
                    ) : (
                      <Text style={[styles.storeName, inactive && styles.inactive]} numberOfLines={1}>
                        {item.name}{inactive ? ' · inactif' : ''}
                      </Text>
                    )}
                    {editing ? (
                      <GoldBtn compact icon="check-circle" label="OK" onPress={() => void renameStore()} />
                    ) : (
                      <Pressable style={styles.iconBtn} onPress={() => { setFormError(null); setEditingStore({ id: item.id, name: item.name }); }} hitSlop={8}>
                        <AppIcon name="edit" size={14} color={Palette.ink} />
                      </Pressable>
                    )}
                    {inactive ? (
                      <GoldBtn compact label="Réactiver" variant="ghost" onPress={() => void toggleStore(item, true)} />
                    ) : (
                      <Pressable style={[styles.iconBtn, styles.iconDanger]} onPress={() => setPendingWarehouse(item)} hitSlop={8}>
                        <AppIcon name="trash" size={14} color={Palette.white} />
                      </Pressable>
                    )}
                  </View>
                );
              })}
              {!warehouses.length ? <Text style={styles.empty}>Aucun magasin.</Text> : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={categoriesOpen} transparent animationType="fade" onRequestClose={() => setCategoriesOpen(false)}>
        <View style={styles.overlay}>
          <Pressable style={styles.overlayFill} onPress={() => setCategoriesOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Catégories</Text>
              <GoldBtn compact icon="x-circle" label="Fermer" variant="ghost" onPress={() => setCategoriesOpen(false)} />
            </View>
            <View style={styles.storeForm}>
              <TextInput value={categoryName} onChangeText={setCategoryName} placeholder="Nouvelle catégorie" style={styles.input} />
              <GoldBtn compact icon="plus" label={saving ? 'Ajout…' : 'Créer'} onPress={() => void saveCategory()} />
            </View>
            {formError && categoriesOpen ? <Text style={styles.inlineError}>{formError}</Text> : null}
            <ScrollView style={styles.storeScroll}>
              {categories.map((item) => {
                const inactive = Number(item.active ?? 1) !== 1;
                const editing = editingCategory?.id === item.id;
                const count = products.filter((product) => String(product.category || '').trim().toLowerCase() === item.name.trim().toLowerCase()).length;
                return (
                  <View key={item.id} style={styles.storeRow}>
                    {editing ? (
                      <TextInput
                        value={editingCategory.name}
                        onChangeText={(name) => setEditingCategory({ id: item.id, name })}
                        style={[styles.input, styles.storeName]}
                      />
                    ) : (
                      <Text style={[styles.storeName, inactive && styles.inactive]} numberOfLines={1}>
                        {item.name}{inactive ? ' · inactive' : ''} · {count}
                      </Text>
                    )}
                    {editing ? (
                      <GoldBtn compact icon="check-circle" label="OK" onPress={() => void renameCategory()} />
                    ) : (
                      <Pressable style={styles.iconBtn} onPress={() => { setFormError(null); setEditingCategory({ id: item.id, name: item.name }); }} hitSlop={8}>
                        <AppIcon name="edit" size={14} color={Palette.ink} />
                      </Pressable>
                    )}
                    {inactive ? (
                      <GoldBtn compact label="Réactiver" variant="ghost" onPress={() => void toggleCategory(item, true)} />
                    ) : (
                      <Pressable style={[styles.iconBtn, styles.iconDanger]} onPress={() => setPendingCategory(item)} hitSlop={8}>
                        <AppIcon name="trash" size={14} color={Palette.white} />
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
        visible={!!pendingWarehouse}
        title={pendingWarehouse && storeUsed(pendingWarehouse) ? 'Désactiver le magasin' : 'Supprimer le magasin'}
        message={pendingWarehouse ? (storeUsed(pendingWarehouse) ? `${pendingWarehouse.name} a déjà des produits ou des mouvements. Il sera désactivé, pas effacé.` : `Supprimer le magasin ${pendingWarehouse.name} ?`) : ''}
        confirmLabel={pendingWarehouse && storeUsed(pendingWarehouse) ? 'Désactiver' : 'Supprimer'}
        confirmIcon="trash"
        onCancel={() => setPendingWarehouse(null)}
        onConfirm={() => void removeWarehouse()}
      />
      <ConfirmDialog
        visible={!!pendingCategory}
        title={pendingCategory && categoryUsed(pendingCategory) ? 'Désactiver la catégorie' : 'Supprimer la catégorie'}
        message={pendingCategory ? (categoryUsed(pendingCategory) ? `${pendingCategory.name} est utilisée par des produits. Elle sera désactivée.` : `Supprimer la catégorie ${pendingCategory.name} ?`) : ''}
        confirmLabel={pendingCategory && categoryUsed(pendingCategory) ? 'Désactiver' : 'Supprimer'}
        confirmIcon="trash"
        onCancel={() => setPendingCategory(null)}
        onConfirm={() => void removeCategory()}
      />

      <ConfirmDialog
        visible={!!pendingDelete}
        title="Supprimer le produit"
        message={`Supprimer ${pendingDelete?.name ?? ''} ?`}
        confirmLabel="Supprimer"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void remove()}
      />
      <ConfirmDialog
        visible={!!pendingMove}
        title="Annuler la sortie"
        message={pendingMove ? `Annuler la sortie de ${pendingMove.product_name} et remettre la quantité en stock ?` : ''}
        confirmLabel="Annuler la sortie"
        onCancel={() => setPendingMove(null)}
        onConfirm={() => void cancelMove()}
      />
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

const webDate = {
  border: '1px solid rgba(20,22,34,0.14)',
  borderRadius: 16,
  padding: '12px 14px',
  color: Palette.ink,
  background: Palette.white,
  width: '100%',
  fontSize: 14,
  outline: 'none',
} as const;

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Palette.gold,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 4,
    borderBottomColor: Palette.ink,
  },
  bannerText: { color: Palette.ink, fontWeight: '800', fontSize: 14 },
  table: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(20,22,34,0.08)',
    backgroundColor: Palette.white,
  },
  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Palette.white,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(20,22,34,0.06)',
  },
  trAlt: { backgroundColor: 'rgba(212,175,55,0.08)' },
  trUrgent: { borderLeftWidth: 4, borderLeftColor: Palette.ink },
  th: { backgroundColor: 'rgba(20,22,34,0.03)', borderBottomColor: 'rgba(20,22,34,0.10)' },
  thText: { color: Palette.ink, opacity: 0.55, fontWeight: '800', fontSize: 11, textTransform: 'uppercase' },
  td: { paddingRight: 8 },
  trCancelled: { opacity: 0.45 },
  suggest: { gap: 4, maxHeight: 180 },
  suggestRow: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(20,22,34,0.04)',
  },
  suggestName: { color: Palette.ink, fontWeight: '700' },
  suggestMail: { color: Palette.ink, opacity: 0.55, fontSize: 12 },
  cellText: { color: Palette.ink, fontSize: 13, fontWeight: '700' },
  colName: { flex: 1.6, minWidth: 200 },
  colUse: { width: 140 },
  colNum: { width: 78 },
  colPrice: { width: 100 },
  colActions: { width: 118 },
  nameCell: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: { width: 36, height: 36, borderRadius: 10, backgroundColor: Palette.ink },
  thumbEmpty: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameCopy: { flex: 1, minWidth: 0 },
  numCell: { alignItems: 'flex-end' },
  name: { color: Palette.ink, fontWeight: '800', fontSize: 14 },
  lot: { color: Palette.ink, opacity: 0.5, fontSize: 11, marginTop: 1 },
  num: { color: Palette.ink, fontWeight: '800', textAlign: 'right' },
  numLow: { color: Palette.gold },
  actionRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 6 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconDanger: { backgroundColor: Palette.ink },
  storeList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  storeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Palette.white,
    borderWidth: 1,
    borderColor: Palette.gold,
    borderRadius: 14,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
  },
  storeName: { color: Palette.ink, fontWeight: '800', flex: 1 },
  inactive: { opacity: 0.45 },
  storeForm: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  storeScroll: { maxHeight: 280 },
  storeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(20,22,34,0.08)' },
  empty: { color: Palette.ink, opacity: 0.6, marginTop: 8 },
  moves: { gap: 4, marginTop: 8 },
  movesTitle: { color: Palette.ink, fontWeight: '800', fontSize: 16, marginBottom: 4 },
  moveLine: { color: Palette.ink, opacity: 0.7, fontSize: 13 },
  overlay: { flex: 1, justifyContent: 'center', padding: 18 },
  overlayFill: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(20,22,34,0.55)' },
  sheet: {
    zIndex: 2,
    maxHeight: '92%',
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
    backgroundColor: Palette.white,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Palette.gold,
    overflow: 'hidden',
  },
  sheetHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
  },
  kicker: { color: Palette.gold, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', fontSize: 11 },
  sheetTitle: { color: Palette.ink, fontSize: 22, fontWeight: '800' },
  sheetInner: { paddingHorizontal: 20, paddingBottom: 20, gap: 14 },
  kindRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  field: { minWidth: 160, flexGrow: 1, flexBasis: 160, gap: 6 },
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
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  photoWrap: { width: 92, height: 92, borderRadius: 16, overflow: 'hidden', backgroundColor: Palette.ink },
  photo: { width: '100%', height: '100%' },
  removePhoto: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoEmpty: {
    width: 92,
    height: 92,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(20,22,34,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: 'rgba(212,175,55,0.12)',
  },
  photoHint: { color: Palette.ink, opacity: 0.55, fontSize: 10, fontWeight: '700' },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  formError: {
    color: Palette.ink,
    fontWeight: '700',
    backgroundColor: 'rgba(212,175,55,0.18)',
    padding: 10,
    borderRadius: 12,
    marginHorizontal: 20,
  },
  inlineError: {
    color: Palette.ink,
    fontWeight: '700',
    backgroundColor: 'rgba(212,175,55,0.18)',
    padding: 10,
    borderRadius: 12,
  },
});
