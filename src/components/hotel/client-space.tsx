import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { createElement, useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { AppIcon, type BoxIconName } from '@/components/box-icon';
import { RoomGallery, type GallerySlide } from '@/components/hotel/room-gallery';
import { StatusBadge } from '@/components/hotel/hotel-shell';
import { GoldBtn } from '@/components/hotel/kit';
import { Breakpoints, Palette, Radius } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { usePms } from '@/hooks/use-pms';
import { pmsGet, pmsPost } from '@/lib/api';
import { money, prettyChatTime, prettyStamp, prettyWhen, roomStatusLabel } from '@/lib/format';

type Gear = { id: number; name: string; category: string; icon: string };

type Room = {
  id: number;
  number: string;
  type: string;
  floor?: number;
  status?: string;
  price_night: number;
  capacity?: number;
  photo?: string | null;
  video?: string | null;
  description?: string | null;
  equipment_count?: number;
  next_free_date?: string;
  next_free_time?: string;
  bookable?: boolean;
  photos?: string[];
  videos?: string[];
  equipment?: Gear[];
};

type Dish = { id: number; name: string; category: string; price: number; description?: string | null; photo?: string | null };
type Stay = {
  id: number;
  status: string;
  room_number: string;
  room_type?: string;
  room_photo?: string | null;
  check_in: string;
  check_out: string;
  check_in_time?: string;
  check_out_time?: string;
  total: number;
};
type Order = {
  id: number;
  reservation_id?: number | null;
  mode: string;
  pay: string;
  status: string;
  total: number;
  at: string;
  room_number?: string | null;
  items?: { name: string; qty: number; price?: number }[];
};
type DeskNote = { id: number; body: string; mine: boolean; at: string };
type Charge = { id: number; reservation_id: number; source: string; label: string; amount: number; at: string; settled_at?: string | null };
type Payload = { rooms: Room[]; menu: Dish[]; stays: Stay[]; here: Stay | null; orders: Order[]; cleaning?: boolean; charges?: Charge[] };

type TabId = (typeof TABS)[number]['id'];

const STAY_LABEL: Record<string, string> = {
  confirmee: 'Confirmé',
  en_cours: 'En séjour',
  terminee: 'Terminé',
  annulee: 'Annulé',
};

const TABS = [
  { id: 'rooms', label: 'Chambres', icon: 'bed' },
  { id: 'table', label: 'Restaurant', icon: 'restaurant' },
  { id: 'note', label: 'Note', icon: 'receipt' },
  { id: 'stay', label: 'Historique', icon: 'time' },
  { id: 'desk', label: 'Messagerie', icon: 'envelope' },
  { id: 'clean', label: 'Nettoyage', icon: 'droplet' },
] as const;

function slotStamp(date: string, time: string) {
  return `${String(date).slice(0, 10)} ${String(time).slice(0, 5)}`;
}

function ymd(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function DateTimeField({
  label,
  type,
  value,
  onChange,
}: {
  label: string;
  type: 'date' | 'time';
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.factLabel}>{label}</Text>
      {Platform.OS === 'web'
        ? createElement('input', {
            type,
            value,
            onChange: (event: { target: { value: string } }) => onChange(event.target.value),
            style: webInput,
          })
        : (
            <TextInput
              value={value}
              onChangeText={onChange}
              placeholder={type === 'date' ? 'AAAA-MM-JJ' : 'HH:MM'}
              style={styles.input}
            />
          )}
    </View>
  );
}

function roomTone(status: string): 'gold' | 'ink' | 'muted' {
  if (status === 'disponible') return 'gold';
  if (status === 'occupee' || status === 'reservee') return 'ink';
  return 'muted';
}

export function ClientSpace({ view, onCart }: { view?: TabId; onCart?: (cart: { count: number; open: () => void }) => void }) {
  const router = useRouter();
  const { token, user } = useAuth();
  const { width, height } = useWindowDimensions();
  const [tab, setTab] = useState<TabId>(view ?? 'rooms');
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [room, setRoom] = useState<Room | null>(null);
  const [visit, setVisit] = useState<Room | null>(null);
  const [visitLoading, setVisitLoading] = useState(false);
  const [phone, setPhone] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [checkIn, setCheckIn] = useState(ymd());
  const [checkOut, setCheckOut] = useState(ymd(new Date(Date.now() + 86400000)));
  const [checkInTime, setCheckInTime] = useState('14:00');
  const [checkOutTime, setCheckOutTime] = useState('12:00');
  const [cart, setCart] = useState<Record<number, number>>({});
  const [mode, setMode] = useState<'chambre' | 'salle'>('chambre');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [seekIn, setSeekIn] = useState(ymd());
  const [seekOut, setSeekOut] = useState(ymd(new Date(Date.now() + 86400000)));
  const [seekInTime, setSeekInTime] = useState('14:00');
  const [seekOutTime, setSeekOutTime] = useState('12:00');
  const [seekOn, setSeekOn] = useState(false);
  const [seekError, setSeekError] = useState<string | null>(null);
  const [dishQuery, setDishQuery] = useState('');
  const [dishKind, setDishKind] = useState('all');
  const [cartOpen, setCartOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [desk, setDesk] = useState<DeskNote[]>([]);
  const wide = width >= Breakpoints.tablet;
  const cols = width >= Breakpoints.desktop ? 4 : wide ? 3 : 2;

  async function load() {
    if (!token) return;
    const payload = await pmsGet<Payload>(token, 'guest');
    setData(payload);
  }

  useEffect(() => {
    if (!token) return;
    let alive = true;
    setLoading(true);
    load()
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'Espace client indisponible.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [token]);

  useEffect(() => {
    if (view) setTab(view);
  }, [view]);

  const menu = data?.menu ?? [];
  const dishKinds = useMemo(() => ['all', ...new Set(menu.map((dish) => dish.category))], [menu]);
  const groups = useMemo(() => {
    const needle = dishQuery.trim().toLowerCase();
    const map = new Map<string, Dish[]>();
    menu.forEach((dish) => {
      if (dishKind !== 'all' && dish.category !== dishKind) return;
      if (needle && !`${dish.name} ${dish.description || ''}`.toLowerCase().includes(needle)) return;
      const list = map.get(dish.category) ?? [];
      list.push(dish);
      map.set(dish.category, list);
    });
    const order = ['Entrée', 'Plat', 'Petit-déjeuner', 'Dessert', 'Eau', 'Jus', 'Bière', 'Alcool', 'Chaud', 'Boisson'];
    return [...map.entries()].sort((a, b) => {
      const left = order.indexOf(a[0]);
      const right = order.indexOf(b[0]);
      return (left < 0 ? 99 : left) - (right < 0 ? 99 : right);
    });
  }, [menu, dishQuery, dishKind]);
  const lines = menu.filter((dish) => (cart[dish.id] || 0) > 0).map((dish) => ({ dish, qty: cart[dish.id] }));
  const cartTotal = lines.reduce((sum, line) => sum + line.qty * Number(line.dish.price || 0), 0);
  const cartCount = lines.reduce((sum, line) => sum + line.qty, 0);

  useEffect(() => {
    if (!onCart) return;
    onCart({ count: cartCount, open: () => setCartOpen(true) });
  }, [cartCount, onCart]);
  const kinds = useMemo(() => ['all', ...new Set((data?.rooms ?? []).map((item) => item.type))], [data?.rooms]);
  const shownRooms = useMemo(() => {
    const q = query.trim().toLowerCase();
    const start = slotStamp(seekIn, seekInTime);
    return (data?.rooms ?? []).filter((item) => {
      if (kind !== 'all' && item.type !== kind) return false;
      if (q && !`${item.number} ${item.type}`.toLowerCase().includes(q)) return false;
      if (!seekOn) return true;
      if (!item.bookable) return false;
      const ready = slotStamp(item.next_free_date || '1970-01-01', item.next_free_time || '00:00');
      return start >= ready;
    });
  }, [data?.rooms, kind, query, seekOn, seekIn, seekInTime]);

  useEffect(() => {
    if (tab !== 'desk' || !token) return;
    let alive = true;
    pmsGet<{ messages: DeskNote[] }>(token, 'guest/messages')
      .then((payload) => {
        if (alive) setDesk(payload.messages);
      })
      .catch(() => {
        if (alive) setDesk([]);
      });
    return () => {
      alive = false;
    };
  }, [tab, token]);

  async function sendDesk() {
    if (!token || saving || draft.trim().length < 2) return;
    setSaving(true);
    setNotice(null);
    try {
      const payload = await pmsPost<{ messages: DeskNote[] }>(token, 'guest/message', { body: draft.trim() });
      setDesk(payload.messages);
      setDraft('');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Message impossible.');
    } finally {
      setSaving(false);
    }
  }

  async function askClean() {
    if (!token || saving || data?.cleaning) return;
    setSaving(true);
    setNotice(null);
    try {
      await pmsPost(token, 'guest/clean', {});
      setNotice('Demande envoyée.');
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Demande impossible.');
    } finally {
      setSaving(false);
    }
  }

  function runSeek() {
    if (slotStamp(seekOut, seekOutTime) <= slotStamp(seekIn, seekInTime)) {
      setSeekError('Le départ doit être après l’arrivée.');
      setSeekOn(false);
      return;
    }
    setSeekError(null);
    setSeekOn(true);
  }

  function reserve(item: Room) {
    if (!item.bookable) {
      setNotice('Indisponible.');
      return;
    }
    setNotice(null);
    if (seekOn) {
      setCheckIn(seekIn);
      setCheckOut(seekOut);
      setCheckInTime(seekInTime);
      setCheckOutTime(seekOutTime);
    }
    setRoom(item);
  }

  async function openVisit(item: Room) {
    if (!token) return;
    setVisit(item);
    setVisitLoading(true);
    setNotice(null);
    try {
      const detail = await pmsGet<Room>(token, `guest/room?id=${item.id}`);
      setVisit({ ...item, ...detail });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Chambre indisponible.');
      setVisit(null);
    } finally {
      setVisitLoading(false);
    }
  }

  const slides: GallerySlide[] = useMemo(() => {
    if (!visit) return [];
    const photos = visit.photos?.length ? visit.photos : visit.photo ? [visit.photo] : [];
    const videos = visit.videos?.length ? visit.videos : visit.video ? [visit.video] : [];
    return [
      ...photos.map((uri) => ({ kind: 'image' as const, uri })),
      ...videos.map((uri) => ({ kind: 'video' as const, uri })),
    ];
  }, [visit]);

  async function book() {
    if (!token || !room || saving) return;
    setSaving(true);
    setNotice(null);
    try {
      await pmsPost(token, 'guest/book', {
        phone,
        document_id: documentId,
        room_number: room.number,
        check_in: checkIn,
        check_out: checkOut,
        check_in_time: checkInTime,
        check_out_time: checkOutTime,
      });
      setRoom(null);
      setNotice('Réservation confirmée.');
      if (view) router.push('/stay');
      else setTab('stay');
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Réservation impossible.');
    } finally {
      setSaving(false);
    }
  }

  async function order() {
    if (!token || saving || !lines.length) return;
    setSaving(true);
    setNotice(null);
    try {
      const result = await pmsPost<{ id: number }>(token, 'guest/order', {
        mode,
        items: lines.map((line) => ({ id: line.dish.id, qty: line.qty })),
      });
      setCart({});
      setCartOpen(false);
      setNotice(mode === 'chambre' ? 'Ajouté à la note de la chambre.' : 'Commande envoyée. Vous réglerez en espèces au restaurant.');
      if (view) router.push('/note');
      else setTab('note');
      await load();
      return result;
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Commande impossible.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.flex}>
    <ScrollView style={styles.flex} contentContainerStyle={[styles.page, view ? styles.pageInShell : null, tab === 'desk' ? styles.pageDesk : null]}>
      {view ? null : (
        <>
          <View style={styles.helloRow}>
            <Text style={styles.hello}>Bonjour, {user?.full_name?.split(' ')[0]}</Text>
            {tab === 'table' ? (
              <Pressable accessibilityLabel="Panier" onPress={() => setCartOpen(true)} style={styles.cartBtn}>
                <AppIcon name="cart" size={18} color={Palette.ink} />
                {cartCount > 0 ? (
                  <View style={styles.cartBadge}>
                    <Text style={styles.cartBadgeText}>{cartCount}</Text>
                  </View>
                ) : null}
              </Pressable>
            ) : null}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {TABS.map((item) => (
              <Pressable key={item.id} onPress={() => { setVisit(null); setTab(item.id); }} style={[styles.tile, tab === item.id && styles.tileOn]}>
                <AppIcon name={item.icon as BoxIconName} size={18} color={Palette.ink} />
                <Text style={styles.tileText}>{item.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}
      {tab === 'rooms' && !visit ? (
        <View style={styles.search}>
          <AppIcon name="search" size={16} color={Palette.ink} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Chambre ou type" placeholderTextColor="rgba(20,22,34,0.45)" style={styles.searchInput} />
        </View>
      ) : null}
      {error ? <Text style={styles.notice}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {loading && !data ? <Text style={styles.lead}>Chargement…</Text> : null}

      {tab === 'rooms' && visit ? (
        <View style={styles.stack}>
          <GoldBtn compact icon="chevron-left" label="Retour" variant="ghost" onPress={() => setVisit(null)} />
          {visitLoading && !visit.photos ? <Text style={styles.lead}>Chargement…</Text> : null}
          {slides.length ? <RoomGallery slides={slides} poster={visit.photo} wide={wide} /> : null}
          <View style={styles.visit}>
            <View style={styles.row}>
              <Text style={styles.kicker}>{visit.type}</Text>
              <StatusBadge label={roomStatusLabel[visit.status || ''] ?? visit.status ?? ''} tone={roomTone(visit.status || '')} />
            </View>
            {visit.description ? <Text style={styles.desc}>{visit.description}</Text> : null}
            <View style={styles.facts}>
              <View style={styles.fact}><Text style={styles.factLabel}>Étage</Text><Text style={styles.factValue}>{visit.floor ?? '—'}</Text></View>
              <View style={styles.fact}><Text style={styles.factLabel}>Capacité</Text><Text style={styles.factValue}>{visit.capacity ?? 1} pers.</Text></View>
              <View style={styles.fact}><Text style={styles.factLabel}>Tarif</Text><Text style={styles.factValue}>{money(visit.price_night)} / nuit</Text></View>
            </View>
            <Text style={styles.kicker}>Équipements</Text>
            {(visit.equipment ?? []).map((item) => (
              <View key={item.id} style={styles.equip}>
                <View style={styles.equipIcon}><AppIcon name={item.icon as BoxIconName} size={18} color={Palette.ink} /></View>
                <View>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.meta}>{item.category}</Text>
                </View>
              </View>
            ))}
            {!(visit.equipment ?? []).length ? <Text style={styles.meta}>Aucun équipement.</Text> : null}
            <GoldBtn icon="calendar" label="Réserver" onPress={() => reserve(visit)} />
          </View>
        </View>
      ) : null}

      {tab === 'rooms' && !visit ? (
        <View style={styles.stack}>
          <View style={styles.seek}>
            <Text style={styles.kicker}>Rechercher une disponibilité</Text>
            <View style={styles.when}>
              <DateTimeField label="Arrivée — date" type="date" value={seekIn} onChange={setSeekIn} />
              <DateTimeField label="Arrivée — heure" type="time" value={seekInTime} onChange={setSeekInTime} />
              <DateTimeField label="Départ — date" type="date" value={seekOut} onChange={setSeekOut} />
              <DateTimeField label="Départ — heure" type="time" value={seekOutTime} onChange={setSeekOutTime} />
            </View>
            <View style={styles.row}>
              <GoldBtn compact icon="search" label="Chercher" onPress={runSeek} />
              {seekOn ? <GoldBtn compact icon="x-circle" label="Effacer" variant="ghost" onPress={() => { setSeekOn(false); setSeekError(null); }} /> : null}
            </View>
            {seekError ? <Text style={styles.notice}>{seekError}</Text> : null}
            {seekOn ? <Text style={styles.meta}>{shownRooms.length} chambre{shownRooms.length > 1 ? 's' : ''} libre{shownRooms.length > 1 ? 's' : ''} · {prettyWhen(seekIn, seekInTime)} → {prettyWhen(seekOut, seekOutTime)}</Text> : null}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {kinds.map((item) => (
              <Pressable key={item} onPress={() => setKind(item)} style={[styles.chip, kind === item && styles.chipOn]}>
                <Text style={styles.chipText}>{item === 'all' ? 'Tout' : item}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.grid}>
          {shownRooms.map((item) => (
            <View key={item.id} style={[styles.roomCard, { width: cols === 2 ? '48.5%' : cols === 3 ? '31.5%' : '23.5%' }, !item.bookable && styles.off]}>
              <Pressable onPress={() => void openVisit(item)}>
                <View style={styles.photoWrap}>
                  {item.photo ? <Image source={{ uri: item.photo }} style={styles.roomPhoto} contentFit="cover" /> : <View style={styles.roomPhoto} />}
                  {item.video ? <View style={styles.play}><Text style={styles.playText}>Vidéo</Text></View> : null}
                </View>
              </Pressable>
              <View style={styles.roomBody}>
                <View style={styles.row}>
                  <Text style={styles.number}>{item.number}</Text>
                  <StatusBadge label={roomStatusLabel[item.status || ''] ?? item.status ?? ''} tone={roomTone(item.status || '')} />
                </View>
                <Text style={styles.meta} numberOfLines={1}>{item.type}</Text>
                <Text style={styles.roomPrice}>{money(item.price_night)}</Text>
                <View style={styles.actions}>
                  <GoldBtn block tiny icon="show" label="Voir" onPress={() => void openVisit(item)} />
                  <GoldBtn block tiny icon="calendar" label="Réserver" onPress={() => reserve(item)} />
                </View>
              </View>
            </View>
          ))}
          </View>
          {!shownRooms.length ? <Text style={styles.meta}>{seekOn ? 'Aucune chambre libre sur ce créneau.' : 'Aucune chambre.'}</Text> : null}
        </View>
      ) : null}

      {tab === 'desk' ? (
        <View style={[styles.chat, { height: Math.max(160, height - 176) }]}>
          <View style={styles.chatHead}>
            <View style={styles.chatAvatar}><Text style={styles.chatAvatarText}>R</Text></View>
            <View style={styles.cartCopy}>
              <Text style={styles.name}>Réception</Text>
              <Text style={styles.meta}>Équipe de l’hôtel</Text>
            </View>
          </View>
          <ScrollView style={styles.chatScroll} contentContainerStyle={styles.chatBubbles}>
            {desk.map((note) => (
              <View key={note.id} style={[styles.bubbleWrap, note.mine && styles.bubbleWrapMine]}>
                <View style={[styles.bubble, note.mine ? styles.bubbleMine : styles.bubbleOther]}>
                  <Text style={[styles.bubbleText, note.mine && styles.bubbleTextMine]}>{note.body}</Text>
                  <Text style={[styles.bubbleTime, note.mine && styles.bubbleTimeMine]}>{prettyChatTime(note.at)}</Text>
                </View>
              </View>
            ))}
            {!desk.length ? <Text style={styles.meta}>Écrivez à la réception. Votre message apparaît ici.</Text> : null}
          </ScrollView>
          <View style={styles.composer}>
            <TextInput value={draft} onChangeText={setDraft} placeholder="Votre message..." placeholderTextColor="rgba(20,22,34,0.45)" style={styles.composerInput} multiline />
            <Pressable onPress={() => void sendDesk()} style={styles.send}>
              <AppIcon name="chevron-right" size={22} color={Palette.ink} />
            </Pressable>
          </View>
        </View>
      ) : null}

      {tab === 'clean' ? (
        <View style={styles.visit}>
          <Text style={styles.kicker}>{data?.here ? `Chambre ${data.here.room_number}` : 'Nettoyage'}</Text>
          {data?.here ? (
            <GoldBtn
              block
              disabled={!!data.cleaning || saving}
              icon="droplet"
              label={data.cleaning ? 'Votre demande a été reçue' : saving ? 'Envoi…' : 'Demander le nettoyage'}
              onPress={() => void askClean()}
            />
          ) : (
            <Text style={styles.meta}>Pendant le séjour.</Text>
          )}
        </View>
      ) : null}

      {tab === 'table' ? (
        <View style={styles.stack}>
          {!data?.here ? <Text style={styles.notice}>Le panier se prépare tout de suite. L’envoi s’ouvre à votre arrivée.</Text> : null}
          <View style={styles.search}>
            <AppIcon name="search" size={16} color={Palette.ink} />
            <TextInput value={dishQuery} onChangeText={setDishQuery} placeholder="Rechercher un plat..." placeholderTextColor="rgba(20,22,34,0.45)" style={styles.searchInput} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {dishKinds.map((item) => (
              <Pressable key={item} onPress={() => setDishKind(item)} style={[styles.chip, dishKind === item && styles.chipOn]}>
                <Text style={styles.chipText}>{item === 'all' ? 'Tout' : item}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {groups.map(([category, list]) => (
            <View key={category} style={styles.stack}>
              <Text style={styles.kicker}>{category}</Text>
              <View style={styles.grid}>
                {list.map((dish) => {
                  const qty = cart[dish.id] || 0;
                  return (
                    <View key={dish.id} style={[styles.roomCard, { width: cols === 2 ? '48.5%' : cols === 3 ? '31.5%' : '23.5%' }, qty ? styles.dishOn : null]}>
                      <View style={styles.photoWrap}>
                        {dish.photo ? <Image source={{ uri: dish.photo }} style={styles.dishPhoto} contentFit="cover" /> : <View style={styles.dishPhoto}><AppIcon name={['Eau', 'Jus', 'Bière', 'Alcool', 'Chaud', 'Boisson'].includes(dish.category) ? 'coffee' : 'restaurant'} size={22} color={Palette.gold} /></View>}
                        {qty ? <View style={styles.qtyBadge}><Text style={styles.qtyText}>{qty}</Text></View> : null}
                      </View>
                      <View style={styles.roomBody}>
                        <Text style={styles.type} numberOfLines={1}>{dish.name}</Text>
                        {dish.description ? <Text style={styles.meta} numberOfLines={2}>{dish.description}</Text> : null}
                        <Text style={styles.roomPrice}>{money(dish.price)}</Text>
                        <GoldBtn block tiny icon="cart" label={qty ? `Ajouter · ${qty}` : 'Ajouter'} onPress={() => setCart((current) => ({ ...current, [dish.id]: (current[dish.id] || 0) + 1 }))} />
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
          {!menu.length ? <Text style={styles.lead}>Le menu du jour n’est pas encore publié.</Text> : null}
          {menu.length && !groups.length ? <Text style={styles.meta}>Aucun plat ne correspond.</Text> : null}
        </View>
      ) : null}

      {tab === 'note' ? <ClientNote data={data} /> : null}

      {tab === 'stay' ? (
        <View style={styles.stack}>
          {(data?.stays ?? []).map((stay) => (
            <View key={stay.id} style={styles.history}>
              {stay.room_photo ? <Image source={{ uri: stay.room_photo }} style={styles.historyPhoto} contentFit="cover" /> : <View style={styles.historyPhoto} />}
              <View style={styles.cartCopy}>
                <Text style={styles.name}>Chambre {stay.room_number}</Text>
                <Text style={styles.meta}>{stay.room_type || 'Séjour'} · {prettyWhen(stay.check_in, stay.check_in_time)} → {prettyWhen(stay.check_out, stay.check_out_time)}</Text>
                <Text style={styles.meta}>{STAY_LABEL[stay.status] || stay.status} · {money(stay.total)}</Text>
              </View>
            </View>
          ))}
          {!data?.stays.length ? <Text style={styles.lead}>Aucun séjour pour ce compte.</Text> : null}
        </View>
      ) : null}

    </ScrollView>
      <Modal visible={cartOpen} transparent animationType="fade" onRequestClose={() => setCartOpen(false)}>
        <View style={styles.cartOverlay}>
          <Pressable style={styles.fill} onPress={() => setCartOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.helloRow}>
              <Text style={styles.name}>Panier</Text>
              <GoldBtn compact icon="x-circle" label="Fermer" variant="ghost" onPress={() => setCartOpen(false)} />
            </View>
            <ScrollView style={styles.cartList} contentContainerStyle={styles.stack}>
              {lines.map((line) => (
                <View key={line.dish.id} style={styles.cartRow}>
                  <View style={styles.cartCopy}>
                    <Text style={styles.type} numberOfLines={1}>{line.dish.name}</Text>
                    <Text style={styles.roomPrice}>{money(line.qty * Number(line.dish.price))}</Text>
                  </View>
                  <View style={styles.stepper}>
                    <Pressable onPress={() => setCart((current) => ({ ...current, [line.dish.id]: Math.max(0, (current[line.dish.id] || 0) - 1) }))} style={styles.stepBtn}>
                      <Text style={styles.stepText}>−</Text>
                    </Pressable>
                    <Text style={styles.stepQty}>{line.qty}</Text>
                    <Pressable onPress={() => setCart((current) => ({ ...current, [line.dish.id]: (current[line.dish.id] || 0) + 1 }))} style={styles.stepBtn}>
                      <Text style={styles.stepText}>+</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
              {!lines.length ? <Text style={styles.meta}>Touchez un plat pour l’ajouter.</Text> : null}
            </ScrollView>
            <View style={styles.tabs}>
              <Pressable onPress={() => setMode('chambre')} style={[styles.tab, mode === 'chambre' && styles.tabOn]}><Text style={styles.tabText}>Sur la note</Text></Pressable>
              <Pressable onPress={() => setMode('salle')} style={[styles.tab, mode === 'salle' && styles.tabOn]}><Text style={styles.tabText}>En salle · espèces</Text></Pressable>
            </View>
            {!data?.here ? <Text style={styles.notice}>La commande part à la réception dès que le séjour a commencé.</Text> : null}
            {notice ? <Text style={styles.notice}>{notice}</Text> : null}
            <View style={styles.helloRow}>
              <Text style={styles.price}>{money(cartTotal)}</Text>
              <GoldBtn
                compact
                icon={mode === 'chambre' ? 'bed' : 'wallet'}
                label={saving ? 'Envoi…' : !data?.here ? 'À l’arrivée' : mode === 'chambre' ? 'Ajouter à la note' : 'Commander'}
                onPress={() => {
                  if (!data?.here) {
                    setNotice('La commande s’envoie dès que le séjour a commencé.');
                    return;
                  }
                  void order();
                }}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!room} transparent animationType="fade" onRequestClose={() => setRoom(null)}>
        <View style={styles.overlay}>
          <Pressable style={styles.fill} onPress={() => setRoom(null)} />
          <View style={styles.sheet}>
            <Text style={styles.name}>Chambre {room?.number}</Text>
            <Text style={styles.meta}>{room?.type} · {money(room?.price_night || 0)} / nuit</Text>
            <TextInput value={phone} onChangeText={setPhone} placeholder="Téléphone" style={styles.input} />
            <TextInput value={documentId} onChangeText={setDocumentId} placeholder="Numéro de CNI" style={styles.input} />
            <View style={styles.when}>
              <DateTimeField label="Arrivée" type="date" value={checkIn} onChange={setCheckIn} />
              <DateTimeField label="Heure" type="time" value={checkInTime} onChange={setCheckInTime} />
              <DateTimeField label="Départ" type="date" value={checkOut} onChange={setCheckOut} />
              <DateTimeField label="Heure" type="time" value={checkOutTime} onChange={setCheckOutTime} />
            </View>
            <View style={styles.row}>
              <GoldBtn compact label={saving ? 'Réservation…' : 'Confirmer'} onPress={() => void book()} />
              <GoldBtn compact variant="ghost" label="Fermer" onPress={() => setRoom(null)} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function whenLabel(value?: string | null) {
  return prettyStamp(value);
}

function ClientNote({ data }: { data: Payload | null }) {
  const here = data?.here && data.here.status !== 'terminee' && data.here.status !== 'annulee' ? data.here : null;
  const orders = (data?.orders ?? []).filter((row) => row.pay === 'note' && row.status !== 'reglee' && (!here || !row.reservation_id || Number(row.reservation_id) === Number(here.id)));
  const charges = (data?.charges ?? []).filter((row) => {
    if (row.settled_at || row.source === 'hebergement') return false;
    if (here && Number(row.reservation_id) !== Number(here.id)) return false;
    if (row.source !== 'restaurant') return true;
    return !orders.some((order) => Number(order.reservation_id) === Number(row.reservation_id) && Math.abs(Number(order.total) - Number(row.amount)) < 1);
  });
  const lodging = here ? Number(here.total || 0) : 0;
  const extras = charges.reduce((sum, row) => sum + Number(row.amount || 0), 0) + orders.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const total = lodging + extras;
  const empty = !here && !charges.length && !orders.length;

  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Note à régler</Text>
      {empty ? <Text style={styles.meta}>Aucune facture ouverte. Les repas et boissons notés sur la chambre apparaissent ici.</Text> : null}
      {here ? (
        <View style={styles.line}>
          <View style={styles.cartCopy}>
            <Text style={styles.lineLabel}>Chambre {here.room_number} · hébergement</Text>
            <Text style={styles.meta}>{prettyWhen(here.check_in, here.check_in_time)} → {prettyWhen(here.check_out, here.check_out_time)}</Text>
          </View>
          <Text style={styles.lineValue}>{money(here.total)}</Text>
        </View>
      ) : null}
      {charges.map((row) => (
        <View key={row.id} style={styles.line}>
          <View style={styles.cartCopy}>
            <Text style={styles.lineLabel}>{row.label}</Text>
            <Text style={styles.meta}>{whenLabel(row.at)}</Text>
          </View>
          <Text style={styles.lineValue}>{money(row.amount)}</Text>
        </View>
      ))}
      {orders.map((row) => (
        <View key={row.id} style={styles.stack}>
          {(row.items ?? []).map((line, index) => (
            <View key={`${row.id}-${index}`} style={styles.line}>
              <View style={styles.cartCopy}>
                <Text style={styles.lineLabel}>{line.name} ×{line.qty}</Text>
                <Text style={styles.meta}>{whenLabel(row.at)}{row.room_number ? ` · Ch. ${row.room_number}` : ''}</Text>
              </View>
              <Text style={styles.lineValue}>{money(line.qty * Number(line.price || 0))}</Text>
            </View>
          ))}
          {!(row.items ?? []).length ? (
            <View style={styles.line}>
              <Text style={styles.lineLabel}>Restaurant</Text>
              <Text style={styles.lineValue}>{money(row.total)}</Text>
            </View>
          ) : null}
        </View>
      ))}
      {empty ? null : (
        <View style={styles.line}>
          <Text style={styles.totalLabel}>Total à payer</Text>
          <Text style={styles.totalValue}>{money(total)}</Text>
        </View>
      )}
    </View>
  );
}

export function ClientBoard() {
  const { user } = useAuth();
  const { data, error, loading } = usePms<Payload>('guest');
  const stays = data?.stays ?? [];
  const here = data?.here ?? null;
  const charges = (data?.charges ?? []).filter((row) => !row.settled_at && (!here || Number(row.reservation_id) === Number(here.id)));
  const extras = charges.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const note = here ? Number(here.total || 0) + extras : 0;
  const rooms = new Set(stays.map((row) => row.room_number)).size;
  const first = user?.full_name?.split(' ')[0] || 'vous';

  if (loading && !data) return <Text style={styles.lead}>Chargement…</Text>;
  if (error) return <Text style={styles.notice}>{error}</Text>;

  return (
    <View style={styles.board}>
      <Text style={styles.hello}>Bonjour, {first}</Text>
      <View style={styles.kpis}>
        <View style={styles.kpi}>
          <Text style={styles.kpiValue}>{stays.length}</Text>
          <Text style={styles.kpiLabel}>Historique</Text>
        </View>
        <View style={styles.kpi}>
          <Text style={styles.kpiValue}>{money(note)}</Text>
          <Text style={styles.kpiLabel}>{here ? 'Note ouverte' : 'Note'}</Text>
        </View>
        <View style={styles.kpi}>
          <Text style={styles.kpiValue}>{data?.orders.length ?? 0}</Text>
          <Text style={styles.kpiLabel}>Commandes</Text>
        </View>
        <View style={styles.kpi}>
          <Text style={styles.kpiValue}>{rooms}</Text>
          <Text style={styles.kpiLabel}>Chambres</Text>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Ma note</Text>
        {here ? (
          <>
            <View style={styles.line}>
              <Text style={styles.lineLabel}>Chambre {here.room_number} · {here.room_type || 'Séjour'}</Text>
              <Text style={styles.lineValue}>{money(here.total)}</Text>
            </View>
            {charges.map((row) => (
              <View key={row.id} style={styles.line}>
                <Text style={styles.lineLabel} numberOfLines={1}>{row.label}</Text>
                <Text style={styles.lineValue}>{money(row.amount)}</Text>
              </View>
            ))}
            <View style={styles.line}>
              <Text style={styles.totalLabel}>À régler</Text>
              <Text style={styles.totalValue}>{money(note)}</Text>
            </View>
          </>
        ) : (
          <Text style={styles.meta}>Aucune note ouverte. Elle apparaît dès qu’un séjour est en cours.</Text>
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Chambres déjà prises</Text>
        {stays.map((stay) => (
          <View key={stay.id} style={styles.history}>
            {stay.room_photo ? <Image source={{ uri: stay.room_photo }} style={styles.historyPhoto} contentFit="cover" /> : <View style={styles.historyPhoto} />}
            <View style={styles.cartCopy}>
              <Text style={styles.name}>Chambre {stay.room_number}</Text>
              <Text style={styles.meta}>{stay.room_type || 'Séjour'} · {prettyWhen(stay.check_in)} → {prettyWhen(stay.check_out)}</Text>
              <Text style={styles.meta}>{STAY_LABEL[stay.status] || stay.status} · {money(stay.total)}</Text>
            </View>
          </View>
        ))}
        {!stays.length ? <Text style={styles.meta}>Vous n’avez pas encore séjourné ici.</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { padding: 12, gap: 10, paddingBottom: 28 },
  pageInShell: { padding: 0 },
  pageDesk: { flexGrow: 1 },
  board: { gap: 12 },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpi: { flexGrow: 1, flexBasis: 120, minWidth: 120, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: Palette.gold, backgroundColor: Palette.white, gap: 2 },
  kpiValue: { color: Palette.ink, fontWeight: '800', fontSize: 16 },
  kpiLabel: { color: Palette.ink, opacity: 0.65, fontSize: 12, fontWeight: '700' },
  panel: { gap: 6, padding: 10, borderRadius: 16, borderWidth: 1, borderColor: Palette.gold, backgroundColor: Palette.white },
  panelTitle: { color: Palette.ink, fontWeight: '800', fontSize: 14 },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  lineLabel: { flex: 1, color: Palette.ink, fontSize: 14 },
  lineValue: { color: Palette.ink, fontWeight: '700' },
  totalLabel: { color: Palette.ink, fontWeight: '800' },
  totalValue: { color: Palette.ink, fontWeight: '800', fontSize: 16 },
  history: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  historyPhoto: { width: 64, height: 48, borderRadius: 10, backgroundColor: 'rgba(20,22,34,0.06)' },
  helloRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  hello: { color: Palette.ink, fontWeight: '800', fontSize: 18, flex: 1 },
  cartBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Palette.gold, alignItems: 'center', justifyContent: 'center' },
  cartBadge: { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: Palette.ink, alignItems: 'center', justifyContent: 'center' },
  cartBadgeText: { color: Palette.gold, fontSize: 10, fontWeight: '800' },
  dishOn: { borderColor: Palette.gold, borderBottomWidth: 3, borderBottomColor: Palette.ink },
  qtyBadge: { position: 'absolute', top: 8, right: 8, minWidth: 22, height: 22, borderRadius: 8, paddingHorizontal: 6, backgroundColor: Palette.ink, alignItems: 'center', justifyContent: 'center' },
  qtyText: { color: Palette.gold, fontSize: 11, fontWeight: '800' },
  cartRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  cartCopy: { flex: 1, minWidth: 0, gap: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Palette.gold, borderRadius: 10, overflow: 'hidden' },
  stepBtn: { width: 32, height: 32, backgroundColor: Palette.gold, alignItems: 'center', justifyContent: 'center' },
  stepQty: { minWidth: 28, textAlign: 'center', color: Palette.ink, fontWeight: '800' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(20,22,34,0.12)', backgroundColor: Palette.white, paddingHorizontal: 12 },
  searchInput: { flex: 1, color: Palette.ink, fontSize: 14, paddingVertical: 0 },
  rail: { gap: 8, paddingRight: 8 },
  tile: { width: 76, height: 64, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(20,22,34,0.08)', backgroundColor: Palette.white, alignItems: 'center', justifyContent: 'center', gap: 4 },
  tileOn: { borderColor: Palette.gold, backgroundColor: 'rgba(212,175,55,0.28)' },
  tileText: { color: Palette.ink, fontSize: 10, fontWeight: '800' },
  chips: { gap: 6 },
  chip: { height: 30, paddingHorizontal: 12, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(20,22,34,0.1)', backgroundColor: Palette.white, alignItems: 'center', justifyContent: 'center' },
  chipOn: { borderColor: Palette.gold, backgroundColor: 'rgba(212,175,55,0.35)' },
  chipText: { color: Palette.ink, fontSize: 12, fontWeight: '700' },
  seek: { gap: 8, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: Palette.gold, backgroundColor: Palette.white },
  chat: { flexGrow: 1, borderRadius: 18, borderWidth: 1, borderColor: Palette.gold, backgroundColor: Palette.white, overflow: 'hidden' },
  chatHead: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(20,22,34,0.08)' },
  chatAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Palette.gold, alignItems: 'center', justifyContent: 'center' },
  chatAvatarText: { color: Palette.ink, fontWeight: '800' },
  chatScroll: { flex: 1, minHeight: 0 },
  chatBubbles: { padding: 12, gap: 8 },
  bubbleWrap: { alignItems: 'flex-start' },
  bubbleWrapMine: { alignItems: 'flex-end' },
  bubble: { maxWidth: '82%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, gap: 4 },
  bubbleOther: { backgroundColor: Palette.white, borderWidth: 1, borderColor: 'rgba(20,22,34,0.1)' },
  bubbleMine: { backgroundColor: Palette.gold },
  bubbleText: { color: Palette.ink, fontSize: 14 },
  bubbleTextMine: { color: Palette.ink },
  bubbleTime: { color: Palette.ink, opacity: 0.55, fontSize: 11 },
  bubbleTimeMine: { opacity: 0.7 },
  composer: { flexShrink: 0, flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(20,22,34,0.08)' },
  composerInput: { flex: 1, minHeight: 40, maxHeight: 96, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(20,22,34,0.12)', paddingHorizontal: 12, paddingVertical: 8, color: Palette.ink },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: Palette.gold, alignItems: 'center', justifyContent: 'center' },
  lead: { color: Palette.ink, opacity: 0.7, lineHeight: 20 },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: { flex: 1, height: 36, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(20,22,34,0.12)', alignItems: 'center', justifyContent: 'center', backgroundColor: Palette.white },
  tabOn: { backgroundColor: 'rgba(212,175,55,0.35)', borderColor: Palette.gold },
  tabText: { color: Palette.ink, fontWeight: '800', fontSize: 13 },
  notice: { color: Palette.ink, fontWeight: '700', backgroundColor: 'rgba(212,175,55,0.18)', padding: 10, borderRadius: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { backgroundColor: Palette.white, borderRadius: Radius.card, borderWidth: 1, borderColor: Palette.gold, overflow: 'hidden' },
  pad: { padding: 12, gap: 4 },
  off: { opacity: 0.45 },
  photo: { width: '100%', height: 140, backgroundColor: 'rgba(20,22,34,0.06)' },
  roomCard: { backgroundColor: Palette.white, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(20,22,34,0.08)' },
  photoWrap: { position: 'relative' },
  roomPhoto: { width: '100%', aspectRatio: 1, backgroundColor: 'rgba(20,22,34,0.06)' },
  dishPhoto: { width: '100%', aspectRatio: 4 / 3, backgroundColor: 'rgba(20,22,34,0.06)', alignItems: 'center', justifyContent: 'center' },
  play: { position: 'absolute', top: 12, right: 12, backgroundColor: Palette.gold, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  playText: { color: Palette.ink, fontWeight: '800', fontSize: 11 },
  roomBody: { padding: 8, gap: 4 },
  number: { flex: 1, color: Palette.ink, fontSize: 15, fontWeight: '800' },
  type: { color: Palette.ink, fontWeight: '700' },
  roomPrice: { color: Palette.gold, fontWeight: '800', marginTop: 4, fontSize: 16 },
  actions: { flexDirection: 'row', alignItems: 'stretch', gap: 8, marginTop: 10 },
  visit: { backgroundColor: Palette.white, borderRadius: Radius.card, padding: 16, gap: 12, borderWidth: 1, borderColor: Palette.gold },
  kicker: { flex: 1, color: Palette.ink, fontWeight: '800', fontSize: 16 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fact: { flexGrow: 1, minWidth: 96, backgroundColor: 'rgba(20,22,34,0.05)', borderRadius: 14, padding: 12 },
  factLabel: { color: Palette.ink, opacity: 0.6, fontSize: 12 },
  factValue: { color: Palette.ink, fontWeight: '800', marginTop: 4 },
  equip: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  equipIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: Palette.gold, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 12, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, color: Palette.ink, fontWeight: '800' },
  price: { color: Palette.ink, fontWeight: '800' },
  meta: { color: Palette.ink, opacity: 0.65, fontSize: 12 },
  desc: { color: Palette.ink, fontSize: 13 },
  stack: { gap: 10 },
  dish: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 10, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(212,175,55,0.6)', backgroundColor: Palette.white },
  thumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: 'rgba(20,22,34,0.06)', alignItems: 'center', justifyContent: 'center' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: Palette.gold, borderRadius: 10, paddingHorizontal: 8, height: 32 },
  stepText: { color: Palette.ink, fontWeight: '800' },
  orderBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  overlay: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: 'rgba(20,22,34,0.28)' },
  cartOverlay: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 12, paddingBottom: 88, backgroundColor: 'rgba(20,22,34,0.28)' },
  fill: { ...StyleSheet.absoluteFill },
  sheet: { width: '100%', maxWidth: 440, maxHeight: '86%', gap: 8, padding: 16, borderRadius: 18, backgroundColor: Palette.white, borderWidth: 1, borderColor: Palette.gold },
  cartList: { flexGrow: 0, maxHeight: 280 },
  input: { borderWidth: 1, borderColor: 'rgba(20,22,34,0.14)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: Palette.ink },
  when: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  field: { gap: 4, minWidth: 120, flexGrow: 1, flexBasis: 120 },
});

const webInput = {
  border: '1px solid rgba(20,22,34,0.14)',
  borderRadius: 12,
  padding: '10px 12px',
  color: Palette.ink,
  fontSize: 14,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  background: Palette.white,
} as const;
