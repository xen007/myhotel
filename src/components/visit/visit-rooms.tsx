import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { createElement, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { AppIcon, type BoxIconName } from '@/components/box-icon';
import { FilterBar } from '@/components/hotel/filter-bar';
import { StatusBadge } from '@/components/hotel/hotel-shell';
import { GoldBtn } from '@/components/hotel/kit';
import { RoomGallery, type GallerySlide } from '@/components/hotel/room-gallery';
import { VisitKicker, VisitLead, VisitSection, VisitTitle } from '@/components/visit/visit-kit';
import { Breakpoints, Palette } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { visitGet } from '@/lib/api';
import { money, roomStatusLabel } from '@/lib/format';
import { saveVisitBook, saveVisitNext } from '@/lib/visit-intent';
import type { VisitRoom } from '@/hooks/use-visit';

type Detail = VisitRoom & { photos?: string[]; videos?: string[]; equipment?: { id: number; name: string; category: string; icon: string }[] };

function ymd(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function Field({ label, type, value, onChange }: { label: string; type: 'date' | 'time'; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {Platform.OS === 'web'
        ? createElement('input', { type, value, onChange: (e: { target: { value: string } }) => onChange(e.target.value), style: webInput })
        : <TextInput value={value} onChangeText={onChange} style={styles.input} />}
    </View>
  );
}

export function VisitRooms({ rooms }: { rooms: VisitRoom[] }) {
  const router = useRouter();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const desktop = width >= Breakpoints.desktop;
  const cols = width >= Breakpoints.desktop ? 3 : width >= Breakpoints.tablet ? 2 : 1;
  const [open, setOpen] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkIn, setCheckIn] = useState(ymd());
  const [checkOut, setCheckOut] = useState(ymd(new Date(Date.now() + 86400000)));
  const [checkInTime, setCheckInTime] = useState('14:00');
  const [checkOutTime, setCheckOutTime] = useState('12:00');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [status, setStatus] = useState('all');
  const types = useMemo(() => ['all', ...[...new Set(rooms.map((room) => room.type).filter(Boolean))]], [rooms]);
  const statuses = useMemo(() => ['all', ...[...new Set(rooms.map((room) => room.status).filter(Boolean))]], [rooms]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rooms.filter((room) => {
      if (kind !== 'all' && room.type !== kind) return false;
      if (status !== 'all' && room.status !== status) return false;
      if (!q) return true;
      return [room.number, room.type, room.description].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [rooms, query, kind, status]);

  const slides: GallerySlide[] = useMemo(() => {
    if (!open) return [];
    const photos = open.photos?.length ? open.photos : open.photo ? [open.photo] : [];
    const videos = open.videos?.length ? open.videos : open.video ? [open.video] : [];
    return [...photos.map((uri) => ({ kind: 'image' as const, uri })), ...videos.map((uri) => ({ kind: 'video' as const, uri }))];
  }, [open]);

  async function see(room: VisitRoom) {
    setLoading(true);
    try {
      const detail = await visitGet<Detail>(`visit/room?id=${room.id}`);
      setOpen({ ...room, ...detail });
    } catch {
      setOpen(room);
    } finally {
      setLoading(false);
    }
  }

  async function book(room: VisitRoom) {
    await saveVisitBook({
      roomId: room.id,
      roomNumber: room.number,
      checkIn,
      checkOut,
      checkInTime,
      checkOutTime,
    });
    await saveVisitNext('/home');
    if (user?.role === 'client') {
      router.push('/home');
      return;
    }
    router.push('/login');
  }

  if (open) {
    return (
      <VisitSection>
        <GoldBtn compact variant="ghost" icon="chevron-left" label="Toutes les chambres" onPress={() => setOpen(null)} />
        {slides.length ? <RoomGallery slides={slides} poster={open.photo} wide={desktop} /> : null}
        <VisitKicker>{open.type}</VisitKicker>
        <VisitTitle>Chambre {open.number}</VisitTitle>
        {open.description ? <VisitLead>{open.description}</VisitLead> : null}
        <View style={styles.facts}>
          <View style={styles.fact}><Text style={styles.factLabel}>Capacité</Text><Text style={styles.factValue}>{open.capacity ?? 1} pers.</Text></View>
          <View style={styles.fact}><Text style={styles.factLabel}>Étage</Text><Text style={styles.factValue}>{open.floor ?? '—'}</Text></View>
          <View style={styles.fact}><Text style={styles.factLabel}>Tarif</Text><Text style={styles.factValue}>{money(open.price_night)} / nuit</Text></View>
        </View>
        <Text style={styles.blockTitle}>Équipements</Text>
        {(open.equipment ?? []).map((item) => (
          <View key={item.id} style={styles.equip}>
            <View style={styles.equipIcon}><AppIcon name={item.icon as BoxIconName} size={18} color={Palette.ink} /></View>
            <View>
              <Text style={styles.equipName}>{item.name}</Text>
              <Text style={styles.meta}>{item.category}</Text>
            </View>
          </View>
        ))}
        {!(open.equipment ?? []).length ? <Text style={styles.meta}>Équipements communiqués à l’accueil.</Text> : null}
        <View style={styles.when}>
          <Field label="Arrivée" type="date" value={checkIn} onChange={setCheckIn} />
          <Field label="Heure" type="time" value={checkInTime} onChange={setCheckInTime} />
          <Field label="Départ" type="date" value={checkOut} onChange={setCheckOut} />
          <Field label="Heure" type="time" value={checkOutTime} onChange={setCheckOutTime} />
        </View>
        <GoldBtn label="Réserver" icon="calendar" onPress={() => void book(open)} />
      </VisitSection>
    );
  }

  return (
    <VisitSection>
      {loading ? <Text style={styles.meta}>Chargement…</Text> : null}
      <FilterBar
        query={query}
        onQuery={setQuery}
        queryPlaceholder="Chambre ou type"
        category={kind}
        onCategory={setKind}
        categories={types.map((item) => ({ id: item, label: item === 'all' ? 'Tous les types' : item }))}
        status={status}
        onStatus={setStatus}
        statuses={statuses.map((item) => ({ id: String(item), label: item === 'all' ? 'Tous les statuts' : roomStatusLabel[String(item)] ?? String(item) }))}
      />
      <View style={styles.grid}>
        {shown.map((room) => (
          <View key={room.id} style={[styles.card, { width: cols === 1 ? '100%' : cols === 2 ? '48%' : '31.5%' }]}>
            {room.photo ? <Image source={{ uri: room.photo }} style={styles.photo} contentFit="cover" /> : <View style={styles.photo} />}
            <View style={styles.body}>
              <View style={styles.row}>
                <Text style={styles.number}>Chambre {room.number}</Text>
                <StatusBadge label={roomStatusLabel[room.status || ''] ?? room.status ?? ''} tone={room.status === 'disponible' ? 'gold' : 'muted'} />
              </View>
              <Text style={styles.type}>{room.type}</Text>
              {room.description ? <Text style={styles.meta} numberOfLines={3}>{room.description}</Text> : null}
              <Text style={styles.meta}>{room.capacity ?? 1} personne{(room.capacity || 1) > 1 ? 's' : ''}</Text>
              <Text style={styles.price}>{money(room.price_night)} / nuit</Text>
              <View style={styles.row}>
                <GoldBtn block tiny icon="show" label="Voir les détails" onPress={() => void see(room)} />
                <GoldBtn block tiny icon="calendar" label="Réserver" onPress={() => void book(room)} />
              </View>
            </View>
          </View>
        ))}
      </View>
      {!shown.length ? <Text style={styles.meta}>Aucune chambre ne correspond à votre recherche.</Text> : null}
    </VisitSection>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  card: { borderWidth: 1, borderColor: Palette.gold, borderRadius: 22, overflow: 'hidden', backgroundColor: Palette.white },
  photo: { width: '100%', height: 200, backgroundColor: 'rgba(20,22,34,0.06)' },
  body: { padding: 14, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  number: { flex: 1, color: Palette.ink, fontWeight: '800', fontSize: 16 },
  type: { color: Palette.ink, fontWeight: '700' },
  meta: { color: Palette.ink, opacity: 0.62, fontSize: 13, lineHeight: 19 },
  price: { color: Palette.gold, fontWeight: '800', fontSize: 16 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fact: { flexGrow: 1, minWidth: 100, backgroundColor: 'rgba(20,22,34,0.04)', borderRadius: 14, padding: 12 },
  factLabel: { color: Palette.ink, opacity: 0.55, fontSize: 12 },
  factValue: { color: Palette.ink, fontWeight: '800', marginTop: 4 },
  blockTitle: { color: Palette.ink, fontWeight: '800', marginTop: 8 },
  equip: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  equipIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: Palette.gold, alignItems: 'center', justifyContent: 'center' },
  equipName: { color: Palette.ink, fontWeight: '700' },
  when: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  field: { gap: 4, minWidth: 120, flexGrow: 1 },
  fieldLabel: { color: Palette.ink, opacity: 0.6, fontSize: 12 },
  input: { borderWidth: 1, borderColor: 'rgba(20,22,34,0.14)', borderRadius: 12, padding: 10, color: Palette.ink },
});

const webInput = {
  border: '1px solid rgba(20,22,34,0.14)',
  borderRadius: 12,
  padding: '10px 12px',
  color: Palette.ink,
  fontSize: 14,
  width: '100%',
  boxSizing: 'border-box',
} as const;
