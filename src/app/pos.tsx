import { Image } from 'expo-image';
import { Redirect } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { AppIcon } from '@/components/box-icon';
import { FilterBar } from '@/components/hotel/filter-bar';
import { HotelShell } from '@/components/hotel/hotel-shell';
import { GoldBtn } from '@/components/hotel/kit';
import { SaleHistory, type HistorySale } from '@/components/hotel/sale-history';
import { Breakpoints, Palette, Radius } from '@/constants/theme';
import { usePms } from '@/hooks/use-pms';
import { pmsGet, pmsPost, type CompanyProfile } from '@/lib/api';
import { money, prettyStamp } from '@/lib/format';
import { downloadSaleInvoice, printSaleInvoice, type SaleInvoice } from '@/lib/print';

type Product = {
  id: number;
  name: string;
  stock: number;
  price: number;
  photo?: string | null;
  kind?: string | null;
};

type Sale = SaleInvoice & {
  outlet?: string | null;
  item?: string | null;
  on_account?: number | null;
  settled_at?: string | null;
};

type Inhouse = { reservation_id: number; room_number: string; guest_name: string };

type Payload = { products: Product[]; sales: Sale[]; inhouse?: Inhouse[] };

export default function PosScreen() {
  const { data, error, loading, reload, token, user, ready } = usePms<Payload>('pos');
  const { width } = useWindowDimensions();
  const [productQuery, setProductQuery] = useState('');
  const [query, setQuery] = useState('');
  const [range, setRange] = useState('today');
  const [cart, setCart] = useState<Record<number, number>>({});
  const [guest, setGuest] = useState('');
  const [room, setRoom] = useState('');
  const [onAccount, setOnAccount] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [invoice, setInvoice] = useState<SaleInvoice | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [invoicesOpen, setInvoicesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const products = useMemo(() => data?.products ?? [], [data?.products]);
  const sales = useMemo(() => data?.sales ?? [], [data?.sales]);
  const inhouse = useMemo(() => data?.inhouse ?? [], [data?.inhouse]);
  const openNotes = useMemo(
    () => sales.filter((row) => Number(row.on_account) === 1 && !row.settled_at),
    [sales],
  );
  const today = new Date().toISOString().slice(0, 10);
  const isDesktop = width >= Breakpoints.desktop;
  const tableMin = 980;

  useEffect(() => {
    if (!token) return;
    void pmsGet<CompanyProfile>(token, 'company').then(setCompany).catch(() => undefined);
  }, [token]);

  const visibleProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return products;
    return products.filter((item) => item.name.toLowerCase().includes(q));
  }, [products, productQuery]);

  const visibleSales = useMemo(() => {
    return sales.filter((row) => {
      const day = String(row.at || '').slice(0, 10);
      if (range === 'today' && day !== today) return false;
      const hay = `${row.seller ?? ''} ${row.guest_name ?? ''} ${row.room_number ?? ''} ${(row.items ?? []).map((item) => item.product_name).join(' ')} FAC-${String(row.id).padStart(5, '0')}`.toLowerCase();
      if (query.trim() && !hay.includes(query.trim().toLowerCase())) return false;
      return true;
    });
  }, [sales, query, range, today]);

  const lines = useMemo(() => {
    return Object.entries(cart)
      .map(([id, qty]) => {
        const product = products.find((item) => item.id === Number(id));
        if (!product || qty <= 0) return null;
        return { product, qty };
      })
      .filter(Boolean) as { product: Product; qty: number }[];
  }, [cart, products]);

  const cartTotal = lines.reduce((sum, line) => sum + line.qty * Number(line.product.price || 0), 0);
  const cartCount = lines.reduce((sum, line) => sum + line.qty, 0);
  const historyRows = useMemo<HistorySale[]>(() => sales.map((row) => ({
    id: row.id,
    ref: `FAC-${String(row.id).padStart(5, '0')}`,
    at: row.at,
    seller: row.seller || 'Réception',
    total: Number(row.total || 0),
    pay: Number(row.on_account) === 1 ? 'Sur la note' : 'Espèces',
    status: Number(row.on_account) === 1 ? (row.settled_at ? 'Réglée' : 'Note ouverte') : 'Encaissée',
    guest: row.guest_name || 'Comptant',
    room: row.room_number || '',
    items: (row.items ?? []).map((item) => ({ name: item.product_name, qty: Number(item.qty || 0), price: Number(item.price || 0) })),
  })), [sales]);

  function add(product: Product) {
    if (Number(product.stock) <= 0) return;
    setCart((current) => {
      const next = (current[product.id] || 0) + 1;
      if (next > Number(product.stock)) return current;
      return { ...current, [product.id]: next };
    });
  }

  function dec(id: number) {
    setCart((current) => {
      const next = { ...current };
      const value = (next[id] || 0) - 1;
      if (value <= 0) delete next[id];
      else next[id] = value;
      return next;
    });
  }

  async function checkout() {
    if (!token || saving || !lines.length) return;
    if (onAccount && !room.trim()) {
      setFormError('Choisissez la chambre occupée. Le nom du client suit la chambre.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const sale = await pmsPost<SaleInvoice>(token, 'pos/sale', {
        guest_name: guest.trim(),
        room_number: room.trim(),
        on_account: onAccount,
        items: lines.map((line) => ({ product_id: line.product.id, qty: line.qty })),
      });
      setCart({});
      setGuest('');
      setRoom('');
      setOnAccount(false);
      setCartOpen(false);
      setInvoice(sale);
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Vente impossible.');
    } finally {
      setSaving(false);
    }
  }

  async function settle(id: number) {
    if (!token || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      await pmsPost(token, 'pos/settle', { id });
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Règlement impossible.');
    } finally {
      setSaving(false);
    }
  }

  if (ready && !user) return <Redirect href="/welcome" />;

  return (
    <HotelShell
      title="Vente"
      loading={loading && !data}
      error={error}
      right={
        <View style={styles.titleTools}>
          <Pressable
            accessibilityLabel="Panier"
            onPress={() => {
              setCartOpen((open) => !open);
              setInvoicesOpen(false);
              setNotesOpen(false);
            }}
            style={styles.cartBtn}>
            <AppIcon name="cart" size={20} color={Palette.ink} />
            {cartCount > 0 ? (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cartCount}</Text>
              </View>
            ) : null}
          </Pressable>
          <GoldBtn
            compact
            icon="time"
            label="Historique"
            variant={historyOpen ? 'gold' : 'ghost'}
            onPress={() => {
              setHistoryOpen(true);
              setInvoicesOpen(false);
              setCartOpen(false);
              setNotesOpen(false);
            }}
          />
          <GoldBtn
            compact
            icon="receipt"
            label="Factures"
            variant={invoicesOpen ? 'gold' : 'ghost'}
            onPress={() => {
              setInvoicesOpen((open) => !open);
              setCartOpen(false);
              setNotesOpen(false);
            }}
          />
          <GoldBtn
            compact
            icon="bed"
            label={openNotes.length ? `Notes ${openNotes.length}` : 'Notes'}
            variant={notesOpen ? 'gold' : 'ghost'}
            onPress={() => {
              setNotesOpen((open) => !open);
              setCartOpen(false);
              setInvoicesOpen(false);
            }}
          />
        </View>
      }>
      <View style={styles.shop}>
        <View style={styles.catalogCol}>
          <FilterBar query={productQuery} onQuery={setProductQuery} queryPlaceholder="Rechercher un produit..." />
          <View style={styles.catalog}>
            {visibleProducts.map((item) => {
              const inCart = cart[item.id] || 0;
              const empty = Number(item.stock) <= 0;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => add(item)}
                  disabled={empty}
                  style={[styles.product, empty && styles.productOff, inCart ? styles.productOn : null]}>
                  {item.photo ? (
                    <Image source={{ uri: item.photo }} style={styles.thumb} contentFit="cover" />
                  ) : (
                    <View style={styles.thumbEmpty}>
                      <AppIcon name="cabinet" size={16} color={Palette.ink} />
                    </View>
                  )}
                  <View style={styles.productCopy}>
                    <Text style={styles.productName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.productMeta}>
                      {empty ? 'Rupture' : `${item.stock} en stock`} · {money(Number(item.price))}
                    </Text>
                  </View>
                  {inCart ? <Text style={styles.qtyBadge}>{inCart}</Text> : null}
                </Pressable>
              );
            })}
          </View>
          {!visibleProducts.length ? <Text style={styles.empty}>Aucun produit ne correspond.</Text> : null}
        </View>
      </View>

      <Modal visible={cartOpen} transparent animationType="fade" onRequestClose={() => setCartOpen(false)}>
        <View style={styles.overlay}>
          <Pressable style={styles.overlayFill} onPress={() => setCartOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.section}>Panier</Text>
              <GoldBtn compact icon="x-circle" label="Fermer" variant="ghost" onPress={() => setCartOpen(false)} />
            </View>
            <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetBody}>
              {lines.map((line) => (
                <View key={line.product.id} style={styles.cartRow}>
                  <View style={styles.cartCopy}>
                    <Text style={styles.cartName} numberOfLines={1}>
                      {line.product.name}
                    </Text>
                    <Text style={styles.cartPrice}>{money(line.qty * Number(line.product.price))}</Text>
                  </View>
                  <View style={styles.stepper}>
                    <Pressable onPress={() => dec(line.product.id)} style={styles.stepBtn}>
                      <Text style={styles.stepLabel}>−</Text>
                    </Pressable>
                    <Text style={styles.stepQty}>{line.qty}</Text>
                    <Pressable onPress={() => add(line.product)} style={styles.stepBtn}>
                      <Text style={styles.stepLabel}>+</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
              {!lines.length ? <Text style={styles.empty}>Sélectionnez un produit pour l’ajouter.</Text> : null}
              <View style={styles.modeRow}>
                <Pressable onPress={() => setOnAccount(false)} style={[styles.modeBtn, !onAccount && styles.modeOn]}>
                  <Text style={styles.modeLabel}>Encaisser</Text>
                </Pressable>
                <Pressable onPress={() => setOnAccount(true)} style={[styles.modeBtn, onAccount && styles.modeOn]}>
                  <Text style={styles.modeLabel}>Sur la note</Text>
                </Pressable>
              </View>
              {onAccount ? (
                <View style={styles.roomPicks}>
                  {inhouse.map((stay) => {
                    const active = String(room) === String(stay.room_number);
                    return (
                      <Pressable
                        key={stay.reservation_id}
                        onPress={() => {
                          setRoom(String(stay.room_number));
                          setGuest(stay.guest_name);
                        }}
                        style={[styles.roomPick, active && styles.roomPickOn]}>
                        <Text style={styles.roomPickNo}>Ch. {stay.room_number}</Text>
                        <Text style={styles.roomPickName} numberOfLines={1}>{stay.guest_name}</Text>
                      </Pressable>
                    );
                  })}
                  {!inhouse.length ? <Text style={styles.empty}>Aucun client en séjour pour le moment.</Text> : null}
                </View>
              ) : (
                <>
                  <TextInput value={guest} onChangeText={setGuest} placeholder="Client (facultatif)" style={styles.input} />
                  <TextInput value={room} onChangeText={setRoom} placeholder="Chambre (facultatif)" style={styles.input} />
                </>
              )}
              {formError ? <Text style={styles.formError}>{formError}</Text> : null}
              <View style={styles.payRow}>
                <Text style={styles.payTotal}>{money(cartTotal)}</Text>
                <GoldBtn
                  compact
                  icon={onAccount ? 'bed' : 'wallet'}
                  label={saving ? 'Enregistrement…' : onAccount ? 'Porter sur la note' : 'Encaisser'}
                  onPress={() => void checkout()}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={!!invoice} transparent animationType="fade" onRequestClose={() => setInvoice(null)}>
        <View style={styles.overlay}>
          <Pressable style={styles.overlayFill} onPress={() => setInvoice(null)} />
          <View style={styles.sheet}>
            <Text style={styles.section}>Facture FAC-{invoice ? String(invoice.id).padStart(5, '0') : ''}</Text>
            <View style={styles.invoiceActions}>
              <GoldBtn compact icon="printer" label="Imprimer" onPress={() => invoice && printSaleInvoice(invoice, company ?? {})} />
              <GoldBtn compact icon="download" label="Télécharger PDF" variant="ghost" onPress={() => invoice && downloadSaleInvoice(invoice, company ?? {})} />
              <GoldBtn compact icon="x-circle" label="Fermer" variant="ghost" onPress={() => setInvoice(null)} />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={notesOpen} transparent animationType="fade" onRequestClose={() => setNotesOpen(false)}>
        <View style={styles.overlay}>
          <Pressable style={styles.overlayFill} onPress={() => setNotesOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.section}>Notes à régler au départ</Text>
              <GoldBtn compact icon="x-circle" label="Fermer" variant="ghost" onPress={() => setNotesOpen(false)} />
            </View>
            <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetBody}>
              {openNotes.map((row) => (
                <View key={row.id} style={styles.noteRow}>
                  <View style={styles.cartCopy}>
                    <Text style={styles.cartName}>Ch. {row.room_number || '—'} · {row.guest_name || 'Client'}</Text>
                    <Text style={styles.cartPrice}>{money(row.total)} · {prettyStamp(row.at)}</Text>
                  </View>
                  <GoldBtn compact icon="wallet" label="Régler" onPress={() => void settle(row.id)} />
                </View>
              ))}
              {!openNotes.length ? <Text style={styles.empty}>Aucune note ouverte. Les produits portés sur une chambre apparaissent ici jusqu’au règlement.</Text> : null}
              {formError ? <Text style={styles.formError}>{formError}</Text> : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={invoicesOpen} transparent animationType="fade" onRequestClose={() => setInvoicesOpen(false)}>
        <View style={styles.overlay}>
          <Pressable style={styles.overlayFill} onPress={() => setInvoicesOpen(false)} />
          <View style={[styles.sheet, styles.sheetWide]}>
            <View style={styles.sheetHead}>
              <Text style={styles.section}>Factures</Text>
              <GoldBtn compact icon="x-circle" label="Fermer" variant="ghost" onPress={() => setInvoicesOpen(false)} />
            </View>
            <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetBody}>
              <FilterBar
                query={query}
                onQuery={setQuery}
                queryPlaceholder="Rechercher une facture..."
                status={range}
                onStatus={setRange}
                statuses={[
                  { id: 'today', label: 'Aujourd’hui' },
                  { id: 'all', label: 'Toutes' },
                ]}
              />
              <ScrollView horizontal={!isDesktop} showsHorizontalScrollIndicator={!isDesktop}>
                <View style={[styles.table, { minWidth: isDesktop ? '100%' : tableMin, width: isDesktop ? '100%' : tableMin }]}>
                  <View style={[styles.tr, styles.th]}>
                    <Text style={[styles.td, styles.colRef, styles.thText]}>Facture</Text>
                    <Text style={[styles.td, styles.colClient, styles.thText]}>Client</Text>
                    <Text style={[styles.td, styles.colRoom, styles.thText]}>Chambre</Text>
                    <Text style={[styles.td, styles.colItems, styles.thText]}>Articles</Text>
                    <Text style={[styles.td, styles.colPrice, styles.thText, styles.num]}>Total</Text>
                    <Text style={[styles.td, styles.colDate, styles.thText]}>Date</Text>
                    <View style={[styles.td, styles.colActions]} />
                  </View>
                  {visibleSales.map((row, index) => (
                    <View key={row.id} style={[styles.tr, index % 2 ? styles.trAlt : null]}>
                      <Text style={[styles.td, styles.colRef, styles.cellStrong]}>FAC-{String(row.id).padStart(5, '0')}</Text>
                      <Text style={[styles.td, styles.colClient, styles.cellText]} numberOfLines={1}>
                        {row.guest_name || 'Comptant'}
                      </Text>
                      <Text style={[styles.td, styles.colRoom, styles.cellText]}>{row.room_number || '—'}</Text>
                      <Text style={[styles.td, styles.colItems, styles.cellText]} numberOfLines={1}>
                        {(row.items ?? []).map((item) => `${item.product_name} ×${item.qty}`).join(', ') || '—'}
                      </Text>
                      <Text style={[styles.td, styles.colPrice, styles.num, styles.cellStrong]}>{money(row.total)}</Text>
                      <Text style={[styles.td, styles.colDate, styles.cellMeta]}>{prettyStamp(row.at)}</Text>
                      <View style={[styles.td, styles.colActions, styles.actionRow]}>
                        <Pressable style={styles.iconBtn} onPress={() => printSaleInvoice(row, company ?? {})}>
                          <AppIcon name="printer" size={15} color={Palette.ink} />
                        </Pressable>
                        <Pressable style={[styles.iconBtn, styles.iconGhost]} onPress={() => downloadSaleInvoice(row, company ?? {})}>
                          <AppIcon name="download" size={15} color={Palette.ink} />
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>
              {!visibleSales.length ? <Text style={styles.empty}>Aucune facture dans ce filtre.</Text> : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <SaleHistory visible={historyOpen} rows={historyRows} onClose={() => setHistoryOpen(false)} />
    </HotelShell>
  );
}

const styles = StyleSheet.create({
  titleTools: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  cartBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: Palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadgeText: { color: Palette.gold, fontSize: 10, fontWeight: '800' },
  shop: { gap: 12 },
  catalogCol: { flex: 1, minWidth: 0, gap: 8 },
  catalog: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  product: {
    width: 220,
    flexGrow: 1,
    flexBasis: 200,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Palette.white,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: Palette.gold,
  },
  productOn: { borderBottomWidth: 3, borderBottomColor: Palette.ink },
  productOff: { opacity: 0.45, borderColor: 'rgba(20,22,34,0.12)' },
  thumb: { width: 40, height: 40, borderRadius: 10, backgroundColor: Palette.ink },
  thumbEmpty: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productCopy: { flex: 1, minWidth: 0 },
  productName: { color: Palette.ink, fontWeight: '800', fontSize: 13 },
  productMeta: { color: Palette.ink, opacity: 0.55, fontSize: 11 },
  qtyBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: Palette.ink,
    color: Palette.gold,
    textAlign: 'center',
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 6,
    lineHeight: 24,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  overlayFill: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(20,22,34,0.55)',
  },
  sheet: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '86%',
    backgroundColor: Palette.white,
    borderRadius: Radius.card,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: Palette.gold,
    zIndex: 2,
  },
  sheetWide: { maxWidth: 980 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sheetScroll: { flexGrow: 0 },
  sheetBody: { gap: 8, paddingBottom: 4 },
  section: { color: Palette.ink, fontWeight: '800', fontSize: 16 },
  cartRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  cartCopy: { flex: 1, minWidth: 0, gap: 2 },
  cartName: { color: Palette.ink, fontWeight: '700' },
  cartPrice: { color: Palette.gold, fontWeight: '800', fontSize: 12 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Palette.gold,
    borderRadius: 10,
    overflow: 'hidden',
  },
  stepBtn: {
    width: 32,
    height: 32,
    backgroundColor: Palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: { color: Palette.ink, fontWeight: '800', fontSize: 16, lineHeight: 18 },
  stepQty: { minWidth: 28, textAlign: 'center', color: Palette.ink, fontWeight: '800' },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(20,22,34,0.14)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Palette.ink,
  },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeBtn: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(20,22,34,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.white,
  },
  modeOn: { backgroundColor: 'rgba(212,175,55,0.35)', borderColor: Palette.gold },
  modeLabel: { color: Palette.ink, fontWeight: '800', fontSize: 13 },
  roomPicks: { gap: 8 },
  roomPick: {
    borderWidth: 1,
    borderColor: 'rgba(20,22,34,0.12)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Palette.white,
  },
  roomPickOn: { borderColor: Palette.gold, backgroundColor: 'rgba(212,175,55,0.18)' },
  roomPickNo: { color: Palette.ink, fontWeight: '800' },
  roomPickName: { color: Palette.ink, fontSize: 12, marginTop: 2 },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(20,22,34,0.08)',
  },
  payRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 4 },
  payTotal: { color: Palette.ink, fontWeight: '800', fontSize: 22 },
  invoiceActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
  th: { backgroundColor: 'rgba(20,22,34,0.03)', borderBottomColor: 'rgba(20,22,34,0.10)' },
  thText: { color: Palette.ink, opacity: 0.55, fontWeight: '800', fontSize: 11, textTransform: 'uppercase' },
  td: { paddingRight: 8 },
  cellText: { color: Palette.ink, fontSize: 13, fontWeight: '600' },
  cellStrong: { color: Palette.ink, fontSize: 13, fontWeight: '800' },
  cellMeta: { color: Palette.ink, opacity: 0.55, fontSize: 12 },
  colRef: { width: 110 },
  colClient: { flex: 1, minWidth: 110 },
  colRoom: { width: 80 },
  colItems: { flex: 1.4, minWidth: 160 },
  colPrice: { width: 110 },
  colDate: { width: 140 },
  colActions: { width: 86 },
  num: { textAlign: 'right' },
  actionRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 6 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGhost: { backgroundColor: 'rgba(212,175,55,0.35)' },
  empty: { color: Palette.ink, opacity: 0.6 },
  formError: { color: Palette.ink, fontWeight: '700', backgroundColor: 'rgba(212,175,55,0.18)', padding: 10, borderRadius: 12 },
});
