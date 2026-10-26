import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Redirect } from 'expo-router';
import { createElement, useMemo, useState } from 'react';
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
import { pmsPost } from '@/lib/api';
import { prettyDate, prettyStamp } from '@/lib/format';

type Product = {
  id: number;
  name: string;
  kind?: string | null;
  unit?: string;
  stock: number;
  min_stock: number;
  cost: number;
  price: number;
  warehouse_id?: number | null;
  warehouse?: string | null;
  lot?: string | null;
  expires_at?: string | null;
  photo?: string | null;
};

type Warehouse = { id: number; name: string; kind?: string };

type Move = {
  id: number;
  product_name: string;
  type: string;
  qty: number;
  at: string;
  dest?: string | null;
  actor?: string | null;
  note?: string | null;
};

type Payload = { products: Product[]; warehouses?: Warehouse[]; moves?: Move[] };

type FormState = {
  id?: number;
  name: string;
  kind: 'vente' | 'interne';
  warehouse_id: string;
  lot: string;
  stock: string;
  min_stock: string;
  cost: string;
  price: string;
  expires_at: string;
  photo: string;
};

const emptyForm = (warehouseId = ''): FormState => ({
  name: '',
  kind: 'vente',
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
  const [warehouseName, setWarehouseName] = useState<string | null>(null);
  const [issue, setIssue] = useState<{ product: Product; qty: string; taken_by: string; note: string } | null>(null);

  const canManage = user?.role === 'manager' || user?.role === 'owner';
  const products = useMemo(() => data?.products ?? [], [data?.products]);
  const warehouses = useMemo(() => data?.warehouses ?? [], [data?.warehouses]);
  const moves = useMemo(() => (data?.moves ?? []).filter((row) => row.type === 'sortie'), [data?.moves]);
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
    const first = warehouses[0];
    setForm(emptyForm(first ? String(first.id) : ''));
  }

  function openEdit(item: Product) {
    setFormError(null);
    setForm({
      id: item.id,
      name: item.name,
      kind: isInterne(item) ? 'interne' : 'vente',
      warehouse_id: item.warehouse_id ? String(item.warehouse_id) : warehouses[0] ? String(warehouses[0].id) : '',
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
    setSaving(true);
    setFormError(null);
    try {
      await pmsPost(token, 'products', {
        id: form.id,
        name: form.name.trim(),
        kind: form.kind,
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
    const name = warehouseName?.trim() ?? '';
    if (!name) {
      setFormError('Indiquez le nom du magasin.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const created = await pmsPost<{ id: number }>(token, 'warehouses', { name });
      setWarehouseName(null);
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

  async function saveIssue() {
    if (!token || !issue || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      await pmsPost(token, 'stock/issue', {
        product_id: issue.product.id,
        qty: Number(issue.qty || 0),
        taken_by: issue.taken_by.trim(),
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

  if (ready && !user) return <Redirect href="/welcome" />;
  if (ready && !canManage) return <Redirect href="/home" />;

  return (
    <HotelShell
      title="Gestion des stocks"
      loading={loading && !data}
      error={error}
      right={
        <>
          <GoldBtn compact icon="plus" label="Créer magasin" variant="ghost" onPress={() => { setFormError(null); setWarehouseName(''); }} />
          <GoldBtn compact icon="plus" label="Ajouter" onPress={openCreate} />
        </>
      }>
      <View style={styles.storeList}>
        {warehouses.map((item) => (
          <View key={item.id} style={styles.storeChip}>
            <Text style={styles.storeName} numberOfLines={1}>{item.name}</Text>
            <Pressable style={[styles.iconBtn, styles.iconDanger]} onPress={() => setPendingWarehouse(item)} hitSlop={6}>
              <AppIcon name="trash" size={14} color={Palette.white} />
            </Pressable>
          </View>
        ))}
      </View>
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
                      {out ? 'URGENCE · rupture' : low ? 'Stock bas' : `Lot : ${lotLabel(item)}`}
                      {item.expires_at ? ` · exp. ${prettyDate(String(item.expires_at))}` : ''}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.td, styles.colUse, styles.cellText]} numberOfLines={1}>
                  {item.warehouse || (isInterne(item) ? 'Magasin' : 'Accueil')}
                </Text>
                <View style={[styles.td, styles.colNum, styles.numCell]}>
                  <Text style={[styles.num, (out || low) && styles.numLow]}>{qty(Number(item.stock))}</Text>
                </View>
                <Text style={[styles.td, styles.colNum, styles.num]}>{qty(Number(item.min_stock))}</Text>
                <Text style={[styles.td, styles.colPrice, styles.num]}>{qty(Number(item.cost))}</Text>
                <Text style={[styles.td, styles.colPrice, styles.num]}>{isInterne(item) ? '—' : qty(Number(item.price))}</Text>
                <View style={[styles.td, styles.colActions, styles.actionRow]}>
                  {isInterne(item) ? (
                    <Pressable style={styles.iconBtn} onPress={() => { setFormError(null); setIssue({ product: item, qty: '1', taken_by: '', note: '' }); }}>
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
              <View>
                <Text style={styles.kicker}>Gestion des stocks</Text>
                <Text style={styles.sheetTitle}>{form?.id ? 'Modifier le produit' : 'Nouveau produit'}</Text>
              </View>
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
                    {warehouses.length ? (
                      Platform.OS === 'web' ? (
                        createElement(
                          'select',
                          {
                            value: form.warehouse_id,
                            onChange: (event: { target: { value: string } }) =>
                              setForm({ ...form, warehouse_id: event.target.value }),
                            style: webDate,
                          },
                          warehouses.map((item) =>
                            createElement('option', { key: item.id, value: String(item.id) }, item.name),
                          ),
                        )
                      ) : (
                        <FilterSelect
                          value={form.warehouse_id}
                          onChange={(warehouse_id) => setForm({ ...form, warehouse_id })}
                          options={warehouses.map((item) => ({ id: String(item.id), label: item.name }))}
                        />
                      )
                    ) : (
                      <Text style={styles.photoHint}>—</Text>
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

      <ConfirmDialog
        visible={!!issue}
        title={`Sortie magasin · ${issue?.product.name ?? ''}`}
        message=""
        confirmLabel={saving ? 'Enregistrement…' : 'Valider la sortie'}
        confirmIcon="log-out"
        confirmVariant="gold"
        onCancel={() => {
          setIssue(null);
          setFormError(null);
        }}
        onConfirm={() => void saveIssue()}>
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

      <ConfirmDialog
        visible={warehouseName !== null}
        title="Nouveau magasin"
        message=""
        confirmLabel={saving ? 'Enregistrement…' : 'Créer'}
        confirmIcon="plus"
        onCancel={() => {
          setWarehouseName(null);
          setFormError(null);
        }}
        onConfirm={() => void saveWarehouse()}>
        {formError && warehouseName !== null ? <Text style={styles.inlineError}>{formError}</Text> : null}
        <TextInput
          value={warehouseName ?? ''}
          onChangeText={setWarehouseName}
          placeholder="Nom du magasin"
          style={styles.input}
        />
      </ConfirmDialog>

      <ConfirmDialog
        visible={!!pendingWarehouse}
        title="Supprimer le magasin"
        message={pendingWarehouse ? `${pendingWarehouse.name} ?` : ''}
        confirmLabel="Supprimer"
        confirmIcon="trash"
        confirmVariant="ink"
        onCancel={() => setPendingWarehouse(null)}
        onConfirm={() => void removeWarehouse()}
      />

      <ConfirmDialog
        visible={!!pendingDelete}
        title="Supprimer le produit"
        message={`Supprimer ${pendingDelete?.name ?? ''} ?`}
        confirmLabel="Supprimer"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void remove()}
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
  storeName: { color: Palette.ink, fontWeight: '800', maxWidth: 160 },
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
