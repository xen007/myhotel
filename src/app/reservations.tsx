import { Redirect, useRouter, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { createElement, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
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

import { AppIcon, type BoxIconName } from '@/components/box-icon';
import { GuestBadgeCard, type GuestBadge } from '@/components/hotel/guest-badge-card';
import { FilterBar } from '@/components/hotel/filter-bar';
import { HotelShell, StatusBadge } from '@/components/hotel/hotel-shell';
import { ConfirmDialog, GoldBtn } from '@/components/hotel/kit';
import { Breakpoints, Palette, Radius } from '@/constants/theme';
import { usePms } from '@/hooks/use-pms';
import { pmsGet, pmsPost, type CompanyProfile } from '@/lib/api';
import { hkStatusLabel, money, prettyStamp, prettyWhen, reservationStatusLabel, reservationTone } from '@/lib/format';
import { downloadReservationReport, printGuestBadges, printReservationReport } from '@/lib/print';

type Occupant = {
  first_name: string;
  last_name: string;
  phone: string;
  document_id: string;
};

type StayInfo = {
  name: string;
  phone?: string | null;
  check_in: string;
  check_out: string;
  check_in_time?: string;
  check_out_time?: string;
};

type RoomRow = {
  id: number;
  number: string;
  type: string;
  status: string;
  price_night: number;
  photo?: string;
  video?: string | null;
  capacity?: number;
  floor?: number;
  description?: string;
  maintenance_level?: string | null;
  bucket?: 'disponible' | 'occupee' | 'entretien';
  hk_status?: string | null;
  hk_eta?: number;
  hk_attendant?: string | null;
  occupant?: StayInfo | null;
  next_stay?: StayInfo | null;
  next_free_date?: string;
  next_free_time?: string;
};

type StayRow = {
  id: number;
  guest_name: string;
  guest_phone?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  document_id?: string | null;
  room_number: string;
  room_type: string;
  check_in: string;
  check_out: string;
  check_in_time?: string;
  check_out_time?: string;
  status: string;
  total: number;
  list_total?: number | null;
  discount_amount?: number | null;
  discount_reason?: string | null;
  occupants?: Occupant[];
};

type RoomIssue = {
  id: number;
  room_number: string;
  reporter: string;
  category?: string | null;
  description: string;
  status: string;
  at: string;
};

type FrontOffice = {
  rooms: RoomRow[];
  reservations: StayRow[];
  issues?: RoomIssue[];
};

const LIGHT_CATEGORY = 'Maintenance faible';

function isLightMaintenance(room: RoomRow) {
  return room.status === 'maintenance' && room.maintenance_level === 'legere';
}

function isGraveMaintenance(room: RoomRow) {
  return room.status === 'maintenance' && room.maintenance_level !== 'legere';
}

function isOutOfService(room: RoomRow) {
  return room.status === 'hors_service';
}

function typeMeta(name: string, capacity: number): { icon: BoxIconName } {
  const key = name.toLowerCase();
  if (key.includes('luxe') || key.includes('deluxe')) return { icon: 'star' };
  if (key.includes('eco')) return { icon: 'bed' };
  if (key.includes('président') || key.includes('president')) return { icon: 'credit-card' };
  if (key.includes('suite')) return { icon: 'grid-alt' };
  if (key.includes('famil') || capacity >= 4) return { icon: 'group' };
  if (key.includes('maintenance')) return { icon: 'cog' };
  return { icon: 'bed' };
}

function TypeCard({
  name,
  icon,
  total,
  free,
  busy,
  hk,
  from,
  width,
  onPress,
}: {
  name: string;
  icon: BoxIconName;
  total: number;
  free: number;
  busy: number;
  hk: number;
  from: number;
  width: number;
  onPress: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={({ pressed }) => [
        styles.typeCard,
        { width },
        hover && !pressed && styles.typeCardHover,
        pressed && styles.typeCardPress,
      ]}>
      <View style={styles.typeCount}>
        <Text style={styles.typeCountText}>{total}</Text>
      </View>
      <View style={styles.typeIcon}>
        <AppIcon name={icon} size={16} color={Palette.ink} />
      </View>
      <Text style={styles.typeName} numberOfLines={1}>
        {name}
      </Text>
      <Text style={styles.typeStats}>
        {free} libres · {busy} occupées
      </Text>
      <Text style={styles.typeStats}>
        {hk} entretien
      </Text>
      <Text style={styles.typePrice} numberOfLines={1}>
        {new Intl.NumberFormat('fr-FR').format(from)} FCFA
      </Text>
    </Pressable>
  );
}

function emptyPerson(): Occupant {
  return { first_name: '', last_name: '', phone: '', document_id: '' };
}

function ymd(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return ymd(date);
}

function stamp(date: string, time: string) {
  return `${date} ${time.slice(0, 5)}`;
}

function addMinutes(value: string, minutes: number) {
  const [date, time] = value.split(' ');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time || '00:00').split(':').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1, hh || 0, (mm || 0) + minutes);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function stayClash(start: string, end: string, busyStart: string, busyEnd: string) {
  return start < addMinutes(busyEnd, 60) && busyStart < addMinutes(end, 60);
}

function nightsBetween(start: string, end: string) {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms)) return 1;
  return Math.max(1, Math.round(ms / 86400000));
}

function parseAmount(value: string) {
  const amount = Number(value.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(amount) ? amount : 0;
}

function StayAmount({ row }: { row: StayRow }) {
  return <Text style={styles.total}>{money(row.total)}</Text>;
}

  function Field({
  label,
  value,
  onChange,
  type = 'text',
  compact = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'tel' | 'date' | 'time' | 'number';
  compact?: boolean;
}) {
  return (
    <View style={[styles.field, compact && styles.fieldCompact]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {Platform.OS === 'web' && (type === 'date' || type === 'time')
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
              placeholder={type === 'date' ? 'AAAA-MM-JJ' : type === 'time' ? 'HH:MM' : label}
              keyboardType={type === 'tel' ? 'phone-pad' : type === 'number' ? 'numeric' : 'default'}
              style={styles.input}
            />
          )}
    </View>
  );
}

const webInput = {
  border: '1px solid rgba(20,22,34,0.14)',
  borderRadius: 16,
  padding: '12px 14px',
  color: Palette.ink,
  fontSize: 15,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  background: Palette.white,
} as const;

export default function ReservationsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { data, error, loading, reload, token, user, ready } = usePms<FrontOffice>('front-office');
  const [view, setView] = useState('chambres');
  const [type, setType] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [roomQuery, setRoomQuery] = useState('');
  const [query, setQuery] = useState('');
  const [stayStatus, setStayStatus] = useState('all');
  const [booking, setBooking] = useState<RoomRow | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [step, setStep] = useState<'form' | 'badges'>('form');
  const [formError, setFormError] = useState<string | null>(null);
  const [guest, setGuest] = useState<Occupant>(emptyPerson);
  const [companions, setCompanions] = useState<Occupant[]>([]);
  const [checkIn, setCheckIn] = useState(ymd());
  const [checkOut, setCheckOut] = useState(addDays(ymd(), 1));
  const [checkInTime, setCheckInTime] = useState('14:00');
  const [checkOutTime, setCheckOutTime] = useState('12:00');
  const [seekIn, setSeekIn] = useState(ymd());
  const [seekOut, setSeekOut] = useState(addDays(ymd(), 1));
  const [seekInTime, setSeekInTime] = useState('14:00');
  const [seekOutTime, setSeekOutTime] = useState('12:00');
  const [seekOn, setSeekOn] = useState(false);
  const [seekError, setSeekError] = useState<string | null>(null);
  const [discount, setDiscount] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [badges, setBadges] = useState<GuestBadge[]>([]);
  const [saving, setSaving] = useState(false);
  const [badgeBusy, setBadgeBusy] = useState<number | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [pendingCancel, setPendingCancel] = useState<StayRow | null>(null);
  const [signalRoom, setSignalRoom] = useState<string | null>(null);
  const [pendingBadge, setPendingBadge] = useState<StayRow | null>(null);
  const [previewBadges, setPreviewBadges] = useState<GuestBadge[]>([]);
  const [company, setCompany] = useState<CompanyProfile | null>(null);

  useEffect(() => {
    if (!token) return;
    void pmsGet<CompanyProfile>(token, 'company').then(setCompany).catch(() => undefined);
  }, [token]);

  const rooms = data?.rooms ?? [];
  const stays = data?.reservations ?? [];
  const issues = data?.issues ?? [];
  const types = useMemo(() => {
    const map = new Map<string, RoomRow[]>();
    rooms.forEach((room) => {
      if (isLightMaintenance(room)) return;
      const list = map.get(room.type) ?? [];
      list.push(room);
      map.set(room.type, list);
    });
    const catalog = Array.from(map.entries()).map(([name, list]) => ({
      name,
      rooms: list,
      photo: list.find((r) => r.photo)?.photo,
      from: Math.min(...list.map((r) => r.price_night)),
      free: list.filter((r) => r.bucket === 'disponible' && !isGraveMaintenance(r)).length,
      busy: list.filter((r) => r.bucket === 'occupee').length,
      hk: list.filter((r) => r.bucket === 'entretien').length,
      capacity: Math.max(...list.map((r) => r.capacity ?? 1)),
    }));
    const light = rooms.filter(isLightMaintenance);
    if (light.length) {
      catalog.push({
        name: LIGHT_CATEGORY,
        rooms: light,
        photo: light.find((r) => r.photo)?.photo,
        from: Math.min(...light.map((r) => r.price_night)),
        free: light.filter((r) => r.bucket !== 'occupee').length,
        busy: light.filter((r) => r.bucket === 'occupee').length,
        hk: 0,
        capacity: Math.max(...light.map((r) => r.capacity ?? 1)),
      });
    }
    return catalog;
  }, [rooms]);

  if (ready && !user) return <Redirect href="/welcome" />;

  const isDesktop = width >= Breakpoints.desktop;
  const isMobile = width < Breakpoints.tablet;
  const isGerant = user?.role === 'manager' || user?.role === 'owner';
  const canDiscount = user?.role === 'receptionist' || isGerant;
  const contentW = Math.max(320, (isDesktop ? width - 248 : width) - 40);
  const tableWidth = isMobile ? contentW : Math.max(contentW, contentW < 1000 ? 1000 : contentW);
  const typeCols = isDesktop ? 4 : width >= Breakpoints.tablet ? 3 : 2;
  const typeAvailable = (isDesktop ? width - 248 : width) - 36;
  const typeCardWidth = Math.min(200, Math.max(148, Math.floor((typeAvailable - (typeCols - 1) * 12) / typeCols)));
  const roomCols = isDesktop ? 3 : width >= Breakpoints.tablet ? 2 : 1;
  const roomCardWidth = Math.max(160, Math.floor((typeAvailable - (roomCols - 1) * 16) / roomCols));

  const ofType = rooms.filter((room) =>
    type === LIGHT_CATEGORY ? isLightMaintenance(room) : room.type === type && !isLightMaintenance(room),
  );
  const filtered = ofType
    .filter((room) => {
      const hay = `${room.number} ${room.type} ${room.occupant?.name ?? ''}`.toLowerCase();
      if (roomQuery.trim() && !hay.includes(roomQuery.trim().toLowerCase())) return false;
      if (statusFilter === 'all') return true;
      if (statusFilter === 'disponible') return room.bucket === 'disponible';
      if (statusFilter === 'occupee') return room.bucket === 'occupee';
      if (statusFilter === 'entretien') return room.bucket === 'entretien';
      if (statusFilter === 'maintenance') return room.status === 'maintenance' || room.hk_status === 'maintenance';
      return true;
    })
    .sort((a, b) => {
      const rank = (row: RoomRow) => (row.bucket === 'disponible' ? 0 : row.bucket === 'entretien' ? 1 : 2);
      return rank(a) - rank(b) || a.number.localeCompare(b.number, 'fr');
    });
  const slotStart = stamp(seekIn, seekInTime);
  const slotEnd = stamp(seekOut, seekOutTime);
  const visibleRooms = seekOn ? filtered.filter((room) => roomFits(room, slotStart, slotEnd)) : filtered;
  const visibleStays = stays.filter((row) => {
    const hay = `${row.guest_name} ${row.room_number} ${row.guest_phone ?? ''} ${row.document_id ?? ''}`.toLowerCase();
    if (query.trim() && !hay.includes(query.trim().toLowerCase())) return false;
    if (stayStatus !== 'all' && row.status !== stayStatus) return false;
    return true;
  });
  const capacity = Math.max(1, booking?.capacity ?? 1);

  function roomFits(room: RoomRow, start: string, end: string) {
    if (isGraveMaintenance(room) || isOutOfService(room)) return false;
    const ready = stamp(room.next_free_date || ymd(), room.next_free_time || '00:00');
    if (start < ready) return false;
    return !stays.some((row) => {
      if (String(row.room_number) !== String(room.number)) return false;
      if (row.status === 'annulee' || row.status === 'terminee') return false;
      return stayClash(
        start,
        end,
        stamp(String(row.check_in).slice(0, 10), row.check_in_time || '14:00'),
        stamp(String(row.check_out).slice(0, 10), row.check_out_time || '12:00'),
      );
    });
  }

  function runSeek() {
    if (stamp(seekOut, seekOutTime) <= stamp(seekIn, seekInTime)) {
      setSeekError('Le départ doit être après l’arrivée.');
      setSeekOn(false);
      return;
    }
    setSeekError(null);
    setSeekOn(true);
  }

  function openBook(room: RoomRow) {
    const freeDate = room.next_free_date || ymd();
    const freeTime = room.next_free_time || '14:00';
    const wanted = stamp(seekIn, seekInTime);
    const useSeek = seekOn && wanted >= stamp(freeDate, freeTime);
    const arrivalTime = freeTime > '14:00' ? freeTime : '14:00';
    setEditingId(null);
    setSavedId(null);
    setStep('form');
    setFormError(null);
    setBooking(room);
    setGuest(emptyPerson());
    setCompanions([]);
    setCheckIn(useSeek ? seekIn : freeDate);
    setCheckInTime(useSeek ? seekInTime : arrivalTime);
    setCheckOut(useSeek ? seekOut : addDays(freeDate, 1));
    setCheckOutTime(useSeek ? seekOutTime : '12:00');
    setDiscount('');
    setDiscountReason('');
    setBadges([]);
  }

  function openEdit(row: StayRow) {
    const room = rooms.find((item) => item.number === row.room_number) ?? null;
    const names = String(row.guest_name || '').trim().split(/\s+/);
    setEditingId(row.id);
    setSavedId(row.id);
    setStep('form');
    setFormError(null);
    setBooking(room);
    setGuest({
      first_name: row.first_name || names.slice(1).join(' ') || names[0] || '',
      last_name: row.last_name || names[0] || '',
      phone: row.guest_phone || '',
      document_id: row.document_id || '',
    });
    const extra = (row.occupants ?? []).filter((person) => !('is_primary' in person) || Number((person as Occupant & { is_primary?: number }).is_primary) !== 1);
    setCompanions(
      extra.length
        ? extra.map((person) => ({
            first_name: person.first_name,
            last_name: person.last_name,
            phone: person.phone,
            document_id: person.document_id,
          }))
        : [],
    );
    setCheckIn(row.check_in.slice(0, 10));
    setCheckOut(row.check_out.slice(0, 10));
    setCheckInTime((row.check_in_time || '14:00').slice(0, 5));
    setCheckOutTime((row.check_out_time || '12:00').slice(0, 5));
    setDiscount(Number(row.discount_amount || 0) > 0 ? String(row.discount_amount) : '');
    setDiscountReason(row.discount_reason || '');
    setBadges([]);
    if (!room) setFormError('Chambre introuvable pour cette réservation.');
  }

  function closeModal() {
    setBooking(null);
    setEditingId(null);
    setSavedId(null);
    setStep('form');
    setFormError(null);
    setBadges([]);
    setDiscount('');
    setDiscountReason('');
    setSaving(false);
  }

  async function confirm() {
    if (!booking || saving) return;
    if (!token) {
      setFormError('Session expirée. Reconnectez-vous.');
      return;
    }
    setFormError(null);
    if (!guest.last_name.trim() || !guest.first_name.trim() || !guest.phone.trim() || !guest.document_id.trim()) {
      setFormError('Renseignez nom, prénom, téléphone et numéro de CNI.');
      return;
    }
    if (!checkIn || !checkOut || !checkInTime || !checkOutTime) {
      setFormError('Indiquez la date et l’heure d’arrivée et de départ.');
      return;
    }
    if (stamp(checkOut, checkOutTime) <= stamp(checkIn, checkInTime)) {
      setFormError('La date et l’heure de départ doivent être après l’arrivée.');
      return;
    }
    if (!editingId) {
      const start = stamp(checkIn, checkInTime);
      const end = stamp(checkOut, checkOutTime);
      const free = stamp(booking.next_free_date || ymd(), booking.next_free_time || '14:00');
      if (start < free) {
        setFormError(`Cette chambre est libre à partir du ${prettyWhen(booking.next_free_date || ymd(), booking.next_free_time)}. Le séjour commence 1 h après la libération.`);
        return;
      }
      if (!roomFits(booking, start, end)) {
        setFormError('Ce créneau chevauche un autre séjour. Laissez 1 h après chaque départ.');
        return;
      }
    }
    const stayNights = nightsBetween(checkIn, checkOut);
    const listTotal = stayNights * Number(booking.price_night || 0);
    const reduction = canDiscount ? parseAmount(discount) : 0;
    if (reduction < 0 || reduction > listTotal) {
      setFormError('La réduction doit rester entre 0 et le tarif du séjour.');
      return;
    }
    const extra = companions.filter((row) => row.first_name.trim() && row.last_name.trim());
    for (const row of extra) {
      if (!row.phone.trim() || !row.document_id.trim()) {
        setFormError('Chaque occupant doit avoir un téléphone et une CNI.');
        return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        first_name: guest.first_name.trim(),
        last_name: guest.last_name.trim(),
        guest_name: `${guest.first_name.trim()} ${guest.last_name.trim()}`,
        phone: guest.phone.trim(),
        document_id: guest.document_id.trim(),
        room_number: booking.number,
        check_in: checkIn,
        check_out: checkOut,
        check_in_time: checkInTime,
        check_out_time: checkOutTime,
        companions: extra,
        source: 'reservation',
        ...(canDiscount
          ? { discount_amount: reduction, discount_reason: discountReason.trim() }
          : {}),
      };
      const res = editingId
        ? await pmsPost<{ id: number }>(token, `reservations/${editingId}/update`, payload)
        : await pmsPost<{ id: number }>(token, 'reservations', payload);
      setSavedId(res.id ?? editingId);
      setView('sejours');
      await reload();
      if (isGerant) {
        setStep('badges');
      } else {
        closeModal();
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Impossible d’enregistrer.');
    } finally {
      setSaving(false);
    }
  }

  async function generateBadges() {
    if (!token || !savedId || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await pmsPost<{ badges: GuestBadge[] }>(token, `reservations/${savedId}/badges`);
      setBadges(res.badges ?? []);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Impossible de générer les badges.');
    } finally {
      setSaving(false);
    }
  }

  async function issueStayBadges(id: number) {
    if (!token || badgeBusy) return;
    setBadgeBusy(id);
    setListError(null);
    try {
      const res = await pmsPost<{ badges: GuestBadge[] }>(token, `reservations/${id}/badges`);
      setPreviewBadges(res.badges ?? []);
      setPendingBadge(null);
      await reload();
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Impossible de générer les badges.');
    } finally {
      setBadgeBusy(null);
    }
  }

  function StayActions({ row }: { row: StayRow }) {
    return (
      <View style={styles.actionBtns}>
        <Pressable
          style={styles.iconBtn}
          accessibilityLabel="Imprimer le reçu"
          onPress={() => printReservationReport(row, company ?? {}, reservationStatusLabel[row.status] ?? row.status)}>
          <AppIcon name="printer" size={18} color={Palette.ink} />
        </Pressable>
        {isGerant ? (
          <Pressable
            style={styles.iconBtn}
            accessibilityLabel="Télécharger le reçu PDF"
            onPress={() => downloadReservationReport(row, company ?? {}, reservationStatusLabel[row.status] ?? row.status)}>
            <AppIcon name="download" size={18} color={Palette.ink} />
          </Pressable>
        ) : null}
        {isGerant && row.status !== 'annulee' ? (
          <Pressable
            style={styles.iconBtn}
            accessibilityLabel="Générer le badge"
            disabled={badgeBusy === row.id}
            onPress={() => setPendingBadge(row)}>
            <AppIcon name="id-card" size={18} color={Palette.ink} />
          </Pressable>
        ) : null}
        {row.status !== 'annulee' ? (
          <Pressable style={styles.iconBtn} accessibilityLabel="Modifier" onPress={() => openEdit(row)}>
            <AppIcon name="edit" size={18} color={Palette.ink} />
          </Pressable>
        ) : null}
        {row.status !== 'annulee' && token ? (
          isGerant ? (
            <Pressable
              style={[styles.iconBtn, styles.iconDanger]}
              accessibilityLabel="Annuler la réservation"
              onPress={() => setPendingCancel(row)}>
              <AppIcon name="x-circle" size={18} color={Palette.white} />
            </Pressable>
          ) : (
            <GoldBtn tiny icon="x-circle" label="Annuler" variant="ghost" onPress={() => setPendingCancel(row)} />
          )
        ) : null}
      </View>
    );
  }

  return (
    <>
      <HotelShell
        title="Réservations"
        loading={loading && !data}
        error={error}
        back={Boolean(type && view === 'chambres')}
        onBack={() => {
          setType(null);
          setSeekOn(false);
          setSeekError(null);
        }}
        right={
          <View style={styles.tabs}>
            <GoldBtn
              tiny
              label="Chambres"
              variant={view === 'chambres' ? 'gold' : 'ghost'}
              onPress={() => {
                setView('chambres');
                setType(null);
                setSeekOn(false);
                setSeekError(null);
              }}
            />
            <GoldBtn
              tiny
              label="Liste réservation"
              variant={view === 'sejours' ? 'gold' : 'ghost'}
              onPress={() => setView('sejours')}
            />
          </View>
        }>
        {view === 'sejours' ? (
          <>
            <FilterBar
              query={query}
              onQuery={setQuery}
              queryPlaceholder="Rechercher client, chambre..."
              status={stayStatus}
              onStatus={setStayStatus}
              statuses={[
                { id: 'all', label: 'Tous' },
                { id: 'confirmee', label: 'Confirmée' },
                { id: 'en_cours', label: 'En cours' },
                { id: 'terminee', label: 'Terminée' },
                { id: 'annulee', label: 'Annulée' },
              ]}
            />
            {listError ? <Text style={styles.formError}>{listError}</Text> : null}
            {isMobile ? (
              <View style={styles.stayList}>
                {visibleStays.map((row) => (
                  <View key={row.id} style={styles.stayCard}>
                    <View style={styles.stayCardHead}>
                      <View style={styles.flex}>
                        <Text style={styles.clientName}>{row.guest_name}</Text>
                        <Text style={styles.lot}>{row.guest_phone || row.document_id || '—'}</Text>
                      </View>
                      <StatusBadge
                        label={reservationStatusLabel[row.status] ?? row.status}
                        tone={reservationTone[row.status] ?? 'gold'}
                      />
                    </View>
                    <Text style={styles.stayLine}>
                      Ch. {row.room_number} · {row.room_type}
                    </Text>
                    <Text style={styles.stayLine}>
                      {prettyWhen(row.check_in, row.check_in_time)} → {prettyWhen(row.check_out, row.check_out_time)}
                    </Text>
                    <StayAmount row={row} />
                    <StayActions row={row} />
                  </View>
                ))}
              </View>
            ) : (
            <ScrollView horizontal={contentW < 1000} showsHorizontalScrollIndicator={contentW < 1000}>
              <View style={[styles.table, { width: tableWidth, minWidth: tableWidth }]}>
                <View style={[styles.tr, styles.th]}>
                  <Text style={[styles.td, styles.colClient, styles.thText]}>Client</Text>
                  <Text style={[styles.td, styles.colRoom, styles.thText]}>Chambre</Text>
                  <Text style={[styles.td, styles.colType, styles.thText]}>Type</Text>
                  <Text style={[styles.td, styles.colDate, styles.thText]}>Arrivée</Text>
                  <Text style={[styles.td, styles.colDate, styles.thText]}>Départ</Text>
                  <Text style={[styles.td, styles.colStatus, styles.thText]}>Statut</Text>
                  <Text style={[styles.td, styles.colTotal, styles.thText]}>Total</Text>
                  <Text style={[styles.td, styles.colActions, styles.thText]}>Action</Text>
                </View>
                {visibleStays.map((row, index) => (
                  <View key={row.id} style={[styles.tr, index % 2 ? styles.trAlt : null]}>
                    <View style={[styles.td, styles.colClient]}>
                      <Text style={styles.clientName} numberOfLines={1}>{row.guest_name}</Text>
                      <Text style={styles.lot} numberOfLines={1}>{row.guest_phone || row.document_id || '—'}</Text>
                    </View>
                    <Text style={[styles.td, styles.colRoom]}>{row.room_number}</Text>
                    <Text style={[styles.td, styles.colType]} numberOfLines={1}>{row.room_type}</Text>
                    <Text style={[styles.td, styles.colDate]}>{prettyWhen(row.check_in, row.check_in_time)}</Text>
                    <Text style={[styles.td, styles.colDate]}>{prettyWhen(row.check_out, row.check_out_time)}</Text>
                    <View style={[styles.td, styles.colStatus]}>
                      <StatusBadge
                        label={reservationStatusLabel[row.status] ?? row.status}
                        tone={reservationTone[row.status] ?? 'gold'}
                      />
                    </View>
                    <View style={[styles.td, styles.colTotal]}>
                      <StayAmount row={row} />
                    </View>
                    <View style={[styles.td, styles.colActions]}>
                      <StayActions row={row} />
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
            )}
            {!visibleStays.length ? <Text style={styles.empty}>Aucune réservation ne correspond.</Text> : null}
          </>
        ) : (
          <>
            {!type ? (
          <View style={styles.typeList}>
            {types.map((item) => {
              const meta = typeMeta(item.name, item.capacity);
              return (
                <TypeCard
                  key={item.name}
                  name={item.name}
                  icon={meta.icon}
                  total={item.rooms.length}
                  free={item.free}
                  busy={item.busy}
                  hk={item.hk}
                  from={item.from}
                  width={typeCardWidth}
                  onPress={() => {
                    setType(item.name);
                    setStatusFilter('all');
                    setRoomQuery('');
                  }}
                />
              );
            })}
          </View>
        ) : (
          <>
            <View style={styles.categoryTools}>
              <FilterBar
                query={roomQuery}
                onQuery={setRoomQuery}
                queryPlaceholder="Rechercher une chambre..."
                status={statusFilter}
                onStatus={setStatusFilter}
                statuses={[
                  { id: 'all', label: 'Tous' },
                  { id: 'disponible', label: 'Disponible' },
                  { id: 'occupee', label: 'Occupée' },
                  { id: 'entretien', label: 'Entretien' },
                  { id: 'maintenance', label: 'Maintenance' },
                ]}
              />
              <View style={styles.seekInline}>
                <Text style={styles.seekTitle}>Rechercher une disponibilité</Text>
                <View style={styles.formGrid}>
                  <Field compact label="Arrivée — date" type="date" value={seekIn} onChange={setSeekIn} />
                  <Field compact label="Arrivée — heure" type="time" value={seekInTime} onChange={setSeekInTime} />
                  <Field compact label="Départ — date" type="date" value={seekOut} onChange={setSeekOut} />
                  <Field compact label="Départ — heure" type="time" value={seekOutTime} onChange={setSeekOutTime} />
                </View>
                <View style={styles.seekActions}>
                  <GoldBtn compact icon="search" label="Chercher" onPress={runSeek} />
                  {seekOn ? (
                    <GoldBtn compact icon="x-circle" label="Effacer" variant="ghost" onPress={() => { setSeekOn(false); setSeekError(null); }} />
                  ) : null}
                </View>
                {seekError ? <Text style={styles.formError}>{seekError}</Text> : null}
                {seekOn ? (
                  <Text style={styles.seekHint}>
                    {visibleRooms.length} chambre{visibleRooms.length > 1 ? 's' : ''} libre{visibleRooms.length > 1 ? 's' : ''} · {prettyWhen(seekIn, seekInTime)} → {prettyWhen(seekOut, seekOutTime)}
                  </Text>
                ) : null}
              </View>
            </View>
            <View style={styles.roomGrid}>
              {visibleRooms.map((room) => (
                <RoomCard
                  key={room.id}
                  room={room}
                  width={roomCardWidth}
                  issueCount={issues.filter((item) => item.room_number === room.number && item.status !== 'resolue').length}
                  onBook={() => openBook(room)}
                  onDetails={() => router.push(`/rooms/${room.id}` as Href)}
                  onIssues={() => setSignalRoom(room.number)}
                />
              ))}
            </View>
            {!visibleRooms.length ? (
              <Text style={styles.empty}>
                {seekOn ? 'Aucune chambre libre sur ce créneau. Le séjour commence 1 h après la libération.' : 'Aucune chambre dans ce filtre.'}
              </Text>
            ) : null}
          </>
        )}
          </>
        )}
      </HotelShell>

      <Modal visible={!!signalRoom} animationType="fade" transparent onRequestClose={() => setSignalRoom(null)}>
        <View style={styles.overlay}>
          <Pressable style={styles.overlayFill} onPress={() => setSignalRoom(null)} />
          <View style={styles.signalSheet}>
            <View style={styles.signalHead}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.signalKicker}>Entretien</Text>
                <Text style={styles.signalTitle}>Chambre {signalRoom}</Text>
              </View>
              <Pressable onPress={() => setSignalRoom(null)} hitSlop={10}>
                <AppIcon name="x-circle" size={22} color={Palette.ink} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.signalList}>
              {issues
                .filter((item) => item.room_number === signalRoom)
                .map((item) => {
                  const resolved = item.status === 'resolue';
                  const waiting = item.status === 'en_attente';
                  return (
                    <View key={item.id} style={styles.signalRow}>
                      <View style={[styles.signalRail, resolved ? styles.signalRailDone : waiting ? styles.signalRailWait : styles.signalRailOpen]} />
                      <View style={styles.signalCopy}>
                        <Text style={styles.signalName} numberOfLines={1}>{item.category || 'Signalement'}</Text>
                        <Text style={styles.signalDesc} numberOfLines={2}>{item.description}</Text>
                        <Text style={styles.signalMeta}>
                          {item.reporter} · {prettyStamp(item.at)} · {resolved ? 'Résolu' : waiting ? 'En attente' : 'Ouvert'}
                        </Text>
                      </View>
                      <AppIcon
                        name={resolved ? 'check-circle' : waiting ? 'time' : 'error-circle'}
                        size={20}
                        color={resolved ? Palette.ink : Palette.gold}
                      />
                    </View>
                  );
                })}
              {!issues.some((item) => item.room_number === signalRoom) ? (
                <View style={styles.signalRow}>
                  <View style={[styles.signalRail, styles.signalRailDone]} />
                  <Text style={styles.signalName}>Aucun signalement</Text>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={!!booking} animationType="fade" transparent onRequestClose={closeModal}>
        <View style={styles.overlay}>
          <Pressable style={styles.overlayFill} onPress={closeModal} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap} pointerEvents="box-none">
          <View style={styles.sheet}>
            <ScrollView contentContainerStyle={styles.sheetInner} showsVerticalScrollIndicator={false}>
              <View style={styles.sheetHead}>
                <View>
                  <Text style={styles.sheetKicker}>Réservation</Text>
                  <Text style={styles.sheetTitle}>
                    {editingId ? 'Modifier' : 'Réservation'} · Chambre {booking?.number}
                  </Text>
                  <Text style={styles.meta}>
                    {money(booking?.price_night ?? 0)} / nuit · {capacity} pers. max
                  </Text>
                </View>
                <Pressable onPress={closeModal} hitSlop={12}>
                  <AppIcon name="x-circle" size={24} color={Palette.ink} />
                </Pressable>
              </View>

              {booking?.occupant ? (
                <View style={styles.notice}>
                  <Text style={styles.noticeTitle}>Occupée maintenant</Text>
                  <Text style={styles.meta}>
                    {booking.occupant.name} · libère le {prettyWhen(booking.occupant.check_out, booking.occupant.check_out_time)}
                  </Text>
                </View>
              ) : null}
              {booking?.hk_status && booking.hk_status !== 'pret' ? (
                <View style={styles.notice}>
                  <Text style={styles.noticeTitle}>Entretien · {hkStatusLabel[booking.hk_status] ?? booking.hk_status}</Text>
                  <Text style={styles.meta}>
                    {booking.hk_attendant ? `${booking.hk_attendant} · ` : ''}
                    {booking.hk_eta ? `ETA ${booking.hk_eta} min` : 'En intervention'}
                  </Text>
                </View>
              ) : null}
              <Text style={styles.goldLine}>
                Prochain séjour possible : {prettyWhen(booking?.next_free_date || ymd(), booking?.next_free_time)} · 1 h après la libération
              </Text>

              {formError ? <Text style={styles.formError}>{formError}</Text> : null}

              {step === 'badges' ? (
                <View style={styles.badgeWrap}>
                  <Text style={styles.sectionTitle}>Réservation enregistrée</Text>
                  <Text style={styles.meta}>
                    {guest.first_name} {guest.last_name} · ch. {booking?.number} · {prettyWhen(checkIn, checkInTime)} →{' '}
                    {prettyWhen(checkOut, checkOutTime)}
                  </Text>
                  {!badges.length ? (
                    <GoldBtn icon="id-card" label={saving ? 'Génération…' : 'Générer les badges'} onPress={() => void generateBadges()} />
                  ) : (
                    <>
                      <Text style={styles.meta}>Cartes nominatives à imprimer pour chaque occupant.</Text>
                      <View style={styles.badgeRow}>
                        {badges.map((badge) => (
                          <GuestBadgeCard key={badge.code} badge={badge} />
                        ))}
                      </View>
                      <GoldBtn icon="receipt" label="Imprimer les badges" onPress={() => printGuestBadges(badges, company ?? {})} />
                    </>
                  )}
                  <GoldBtn icon="x-circle" label="Fermer" variant="ghost" onPress={closeModal} />
                </View>
              ) : (
                <>
                  <Text style={styles.sectionTitle}>Client titulaire</Text>
                  <View style={styles.formGrid}>
                    <Field label="Nom" value={guest.last_name} onChange={(last_name) => setGuest({ ...guest, last_name })} />
                    <Field label="Prénom" value={guest.first_name} onChange={(first_name) => setGuest({ ...guest, first_name })} />
                    <Field label="Téléphone" type="tel" value={guest.phone} onChange={(phone) => setGuest({ ...guest, phone })} />
                    <Field
                      label="N° carte nationale d’identité"
                      value={guest.document_id}
                      onChange={(document_id) => setGuest({ ...guest, document_id })}
                    />
                  </View>

                  <Text style={styles.sectionTitle}>Date et heure</Text>
                  <View style={styles.formGrid}>
                    <Field label="Arrivée — date" type="date" value={checkIn} onChange={setCheckIn} />
                    <Field label="Arrivée — heure" type="time" value={checkInTime} onChange={setCheckInTime} />
                    <Field label="Départ — date" type="date" value={checkOut} onChange={setCheckOut} />
                    <Field label="Départ — heure" type="time" value={checkOutTime} onChange={setCheckOutTime} />
                  </View>

                  {capacity > 1 ? (
                    <>
                      <Text style={styles.sectionTitle}>Autres personnes dans la chambre</Text>
                      <Text style={styles.meta}>
                        Capacité {capacity} · {companions.length} accompagnant{companions.length > 1 ? 's' : ''} / {capacity - 1}
                      </Text>
                      {companions.map((row, index) => (
                        <View key={index} style={styles.companion}>
                          <Text style={styles.compTitle}>Occupant {index + 2}</Text>
                          <View style={styles.formGrid}>
                            <Field
                              label="Nom"
                              value={row.last_name}
                              onChange={(last_name) =>
                                setCompanions(companions.map((item, i) => (i === index ? { ...item, last_name } : item)))
                              }
                            />
                            <Field
                              label="Prénom"
                              value={row.first_name}
                              onChange={(first_name) =>
                                setCompanions(companions.map((item, i) => (i === index ? { ...item, first_name } : item)))
                              }
                            />
                            <Field
                              label="Téléphone"
                              type="tel"
                              value={row.phone}
                              onChange={(phone) =>
                                setCompanions(companions.map((item, i) => (i === index ? { ...item, phone } : item)))
                              }
                            />
                            <Field
                              label="N° CNI"
                              value={row.document_id}
                              onChange={(document_id) =>
                                setCompanions(companions.map((item, i) => (i === index ? { ...item, document_id } : item)))
                              }
                            />
                          </View>
                        </View>
                      ))}
                      {companions.length < capacity - 1 ? (
                        <GoldBtn
                          compact
                          icon="plus"
                          variant="ghost"
                          label="Ajouter un occupant"
                          onPress={() => setCompanions([...companions, emptyPerson()])}
                        />
                      ) : null}
                    </>
                  ) : null}

                  {canDiscount && booking ? (
                    <View style={styles.discountBox}>
                      <Text style={styles.sectionTitle}>Réduction</Text>
                      <View style={styles.formGrid}>
                        <Field label="Montant de la réduction" type="number" value={discount} onChange={setDiscount} />
                        <Field label="Motif" value={discountReason} onChange={setDiscountReason} />
                      </View>
                    </View>
                  ) : null}

                  <GoldBtn
                    icon={editingId ? 'edit' : 'check-circle'}
                    label={saving ? 'Enregistrement…' : editingId ? 'Enregistrer les modifications' : 'Confirmer la réservation'}
                    onPress={() => void confirm()}
                  />
                </>
              )}
            </ScrollView>
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
      <ConfirmDialog
        visible={Boolean(pendingCancel)}
        title="Annuler la réservation ?"
        message={
          pendingCancel
            ? `Souhaitez-vous vraiment annuler le séjour de ${pendingCancel.guest_name} (ch. ${pendingCancel.room_number}) ?`
            : ''
        }
        cancelLabel="Retour"
        confirmLabel="Confirmer l’annulation"
        confirmIcon="x-circle"
        onCancel={() => setPendingCancel(null)}
        onConfirm={() => {
          if (!token || !pendingCancel) return;
          const id = pendingCancel.id;
          setPendingCancel(null);
          void pmsPost(token, `reservations/${id}/cancel`).then(reload);
        }}
      />
      <ConfirmDialog
        visible={Boolean(pendingBadge)}
        title="Générer un nouveau badge ?"
        message={
          pendingBadge
            ? `Un nouveau badge sera créé pour ${pendingBadge.guest_name}. L’ancien badge de ce séjour sera annulé et restera visible dans l’historique.`
            : ''
        }
        cancelLabel="Retour"
        confirmLabel="Générer"
        confirmIcon="id-card"
        confirmVariant="gold"
        onCancel={() => setPendingBadge(null)}
        onConfirm={() => {
          if (pendingBadge) void issueStayBadges(pendingBadge.id);
        }}
      />
      <Modal visible={previewBadges.length > 0} transparent animationType="fade" onRequestClose={() => setPreviewBadges([])}>
        <View style={styles.overlay}>
          <Pressable style={styles.overlayFill} onPress={() => setPreviewBadges([])} />
          <View style={styles.sheet}>
            <ScrollView contentContainerStyle={styles.sheetInner}>
              <Text style={styles.sheetTitle}>Badges générés</Text>
              <Text style={styles.meta}>Les anciens badges de ce séjour sont désormais annulés.</Text>
              <View style={styles.badgeRow}>
                {previewBadges.map((badge) => (
                  <GuestBadgeCard key={badge.code} badge={badge} width={280} />
                ))}
              </View>
              <GoldBtn icon="receipt" label="Imprimer les badges" onPress={() => printGuestBadges(previewBadges, company ?? {})} />
              <GoldBtn
                icon="id-card"
                label="Voir l’historique"
                variant="ghost"
                onPress={() => {
                  setPreviewBadges([]);
                  router.push('/badges' as Href);
                }}
              />
              <GoldBtn icon="x-circle" label="Fermer" variant="ghost" onPress={() => setPreviewBadges([])} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function roomTone(room: RoomRow): 'gold' | 'ink' | 'muted' {
  if (room.status === 'maintenance' || room.hk_status === 'maintenance') return 'muted';
  if (room.bucket === 'disponible') return 'gold';
  if (room.bucket === 'occupee') return 'ink';
  return 'muted';
}

function roomInHk(room: RoomRow) {
  return (
    room.status === 'maintenance' ||
    room.status === 'nettoyage' ||
    room.hk_status === 'en_cours' ||
    room.hk_status === 'non_prise' ||
    room.hk_status === 'maintenance'
  );
}

function roomBucketLabel(room: RoomRow) {
  if (isOutOfService(room)) return 'Hors service';
  if (isLightMaintenance(room)) return 'Maintenance faible';
  if (isGraveMaintenance(room) || room.hk_status === 'maintenance') return 'Maintenance grave';
  if (room.bucket === 'occupee' && roomInHk(room)) return 'Occupée · Entretien';
  if (room.bucket === 'disponible') return 'Disponible';
  if (room.bucket === 'occupee') return 'Occupée';
  return 'Entretien';
}

function LineBtn({
  icon,
  label,
  onPress,
  disabled,
  gold,
  badge,
}: {
  icon: BoxIconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  gold?: boolean;
  badge?: number;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[styles.lineBtn, gold ? styles.lineBtnGold : styles.lineBtnGhost, disabled && styles.lineBtnOff]}>
      <AppIcon name={icon} size={13} color={Palette.ink} />
      <Text style={styles.lineBtnText} numberOfLines={1}>
        {label}
      </Text>
      {badge ? (
        <View style={styles.lineBadge}>
          <Text style={styles.lineBadgeText}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function RoomCard({
  room,
  width,
  issueCount,
  onBook,
  onDetails,
  onIssues,
}: {
  room: RoomRow;
  width: number;
  issueCount: number;
  onBook: () => void;
  onDetails: () => void;
  onIssues: () => void;
}) {
  const label = roomBucketLabel(room);
  return (
    <View style={[styles.roomCard, { width }]}>
      <Pressable onPress={onDetails} style={styles.roomPhotoWrap}>
        <Image source={{ uri: room.photo }} style={styles.roomPhoto} contentFit="cover" />
        <View style={[styles.roomFlag, room.bucket === 'disponible' ? styles.roomFlagFree : styles.roomFlagBusy]}>
          <Text style={[styles.roomFlagText, room.bucket === 'disponible' && styles.roomFlagTextFree]}>{label}</Text>
        </View>
      </Pressable>
      <View style={styles.roomBody}>
        <View style={styles.roomHead}>
          <Text style={styles.roomNumber}>{room.number}</Text>
          <StatusBadge label={label} tone={roomTone(room)} />
        </View>
        <Text style={styles.roomType}>{isLightMaintenance(room) ? LIGHT_CATEGORY : room.type}</Text>
        {room.occupant ? (
          <Text style={styles.roomMeta} numberOfLines={1}>
            Occupée · {room.occupant.name} · jusqu’au {prettyWhen(room.occupant.check_out, room.occupant.check_out_time)}
          </Text>
        ) : roomInHk(room) ? (
          <Text style={styles.roomMeta}>
            {isGraveMaintenance(room) ? 'Maintenance grave' : isLightMaintenance(room) ? room.type : 'Entretien'} · étage {room.floor ?? '—'}
          </Text>
        ) : (
          <Text style={styles.roomMeta}>
            Étage {room.floor ?? '—'} · {room.capacity ?? 2} pers.
          </Text>
        )}
        <Text style={styles.roomPrice}>{money(room.price_night)} / nuit</Text>
        <View style={styles.roomActions}>
          <LineBtn
            icon="calendar"
            label={isGraveMaintenance(room) || isOutOfService(room) ? 'Fermée' : 'Réserver'}
            disabled={isGraveMaintenance(room) || isOutOfService(room)}
            onPress={onBook}
          />
          <LineBtn icon="error-circle" label="Signalement" badge={issueCount} gold={issueCount > 0} onPress={onIssues} />
          <LineBtn icon="show" label="Voir" onPress={onDetails} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', gap: 8 },
  typeList: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  typeCard: {
    position: 'relative',
    backgroundColor: Palette.white,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: Palette.gold,
    borderBottomWidth: 4,
    borderBottomColor: Palette.ink,
    shadowColor: Palette.ink,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  typeCardHover: {
    transform: [{ translateY: -3 }],
    shadowOpacity: 0.28,
    shadowRadius: 12,
  },
  typeCardPress: {
    transform: [{ translateY: 2 }],
    borderBottomWidth: 2,
    shadowOpacity: 0.08,
  },
  typeIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
    borderBottomWidth: 3,
    borderBottomColor: Palette.ink,
  },
  typeCount: {
    position: 'absolute',
    top: 10,
    right: 10,
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  typeCountText: { color: Palette.gold, fontWeight: '800', fontSize: 12 },
  typeName: { color: Palette.ink, fontWeight: '800', fontSize: 15, paddingRight: 28 },
  typeStats: { color: Palette.ink, opacity: 0.55, fontSize: 11, lineHeight: 15 },
  typePrice: { color: Palette.gold, fontWeight: '800', fontSize: 13 },
  roomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  roomCard: {
    backgroundColor: Palette.white,
    borderRadius: Radius.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(20,22,34,0.08)',
  },
  issueCard: {
    gap: 6,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Palette.gold,
    backgroundColor: Palette.white,
  },
  issueTitle: { color: Palette.ink, fontWeight: '800', fontSize: 15 },
  roomPhotoWrap: { position: 'relative' },
  roomPhoto: { width: '100%', aspectRatio: 4 / 3, backgroundColor: Palette.ink },
  roomFlag: {
    position: 'absolute',
    top: 10,
    right: 10,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    maxWidth: '80%',
  },
  roomFlagFree: { backgroundColor: Palette.gold },
  roomFlagBusy: { backgroundColor: Palette.ink },
  roomFlagText: { color: Palette.white, fontWeight: '800', fontSize: 11 },
  roomFlagTextFree: { color: Palette.ink },
  roomBody: { padding: 14, gap: 5 },
  roomHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  empty: { color: Palette.ink, opacity: 0.6 },
  roomNumber: { color: Palette.ink, fontSize: 20, fontWeight: '800' },
  roomType: { color: Palette.ink, fontWeight: '700', opacity: 0.75 },
  roomMeta: { color: Palette.ink, opacity: 0.55, fontSize: 12 },
  roomPrice: { color: Palette.gold, fontWeight: '800', fontSize: 14, marginTop: 2 },
  roomActions: { flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'stretch', gap: 6, marginTop: 8 },
  lineBtn: {
    flex: 1,
    minWidth: 0,
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 10,
    paddingHorizontal: 6,
  },
  lineBtnGold: { backgroundColor: Palette.gold },
  lineBtnGhost: { backgroundColor: Palette.white, borderWidth: 1, borderColor: 'rgba(20,22,34,0.16)' },
  lineBtnOff: { opacity: 0.4 },
  lineBtnText: { color: Palette.ink, fontWeight: '800', fontSize: 12, flexShrink: 1 },
  lineBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: Palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineBadgeText: { color: Palette.gold, fontSize: 10, fontWeight: '800' },
  signalSheet: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '80%',
    alignSelf: 'center',
    backgroundColor: Palette.white,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Palette.gold,
    padding: 16,
    gap: 12,
    zIndex: 2,
  },
  signalHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  signalKicker: { color: Palette.gold, fontWeight: '800', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  signalTitle: { color: Palette.ink, fontWeight: '800', fontSize: 22 },
  signalList: { gap: 10, paddingBottom: 4 },
  signalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 72,
    borderRadius: 16,
    backgroundColor: Palette.white,
    borderWidth: 1,
    borderColor: 'rgba(20,22,34,0.08)',
    overflow: 'hidden',
    paddingRight: 14,
  },
  signalRail: { width: 6, alignSelf: 'stretch' },
  signalRailOpen: { backgroundColor: Palette.ink },
  signalRailWait: { backgroundColor: Palette.gold },
  signalRailDone: { backgroundColor: Palette.gold },
  signalCopy: { flex: 1, minWidth: 0, paddingVertical: 12, gap: 2 },
  signalName: { color: Palette.ink, fontWeight: '800', fontSize: 16 },
  signalDesc: { color: Palette.ink, opacity: 0.75, fontSize: 13, lineHeight: 18 },
  signalMeta: { color: Palette.ink, opacity: 0.5, fontSize: 12, marginTop: 2 },
  meta: { color: Palette.ink, opacity: 0.58, fontSize: 13 },
  goldLine: { color: Palette.gold, fontWeight: '800', fontSize: 13 },
  sectionTitle: { color: Palette.ink, fontWeight: '800', fontSize: 18 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6 },
  backText: { color: Palette.ink, fontWeight: '800' },
  stayHead: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stayName: { color: Palette.ink, fontWeight: '800', fontSize: 16 },
  flex: { flex: 1, minWidth: 0 },
  stayList: { gap: 12 },
  stayCard: {
    backgroundColor: Palette.white,
    borderRadius: 18,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(20,22,34,0.08)',
  },
  stayCardHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  stayLine: { color: Palette.ink, opacity: 0.7, fontSize: 13 },
  table: { borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(20,22,34,0.08)' },
  tr: { flexDirection: 'row', alignItems: 'center', backgroundColor: Palette.white, paddingVertical: 12, paddingHorizontal: 12 },
  trAlt: { backgroundColor: 'rgba(20,22,34,0.03)' },
  th: { backgroundColor: 'rgba(20,22,34,0.04)' },
  thText: { color: Palette.ink, opacity: 0.55, fontWeight: '800', fontSize: 11, textTransform: 'uppercase' },
  td: { paddingRight: 10 },
  colClient: { flexGrow: 1.6, flexShrink: 1, flexBasis: 160, minWidth: 140 },
  colRoom: { width: 86, color: Palette.ink, fontWeight: '700', fontSize: 14 },
  colType: { flexGrow: 1, flexShrink: 1, flexBasis: 110, minWidth: 90, color: Palette.ink, fontSize: 13 },
  colDate: { flexGrow: 1.1, flexShrink: 1, flexBasis: 140, minWidth: 128, color: Palette.ink, fontSize: 13 },
  colStatus: { width: 118 },
  colTotal: { width: 110 },
  colActions: { minWidth: 260, width: 280, flexGrow: 0, flexShrink: 0 },
  clientName: { color: Palette.ink, fontWeight: '800', fontSize: 15 },
  lot: { color: Palette.ink, opacity: 0.5, fontSize: 12, marginTop: 2 },
  total: { color: Palette.ink, fontWeight: '800', fontSize: 14 },
  actionBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconDanger: { backgroundColor: Palette.ink },
  formError: { color: Palette.ink, fontWeight: '700', backgroundColor: 'rgba(212,175,55,0.18)', padding: 10, borderRadius: 12 },
  overlay: { flex: 1, justifyContent: 'center', padding: 18 },
  overlayFill: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(20,22,34,0.55)', zIndex: 0 },
  sheetWrap: { zIndex: 2, width: '100%', maxHeight: '92%' },
  sheet: {
    maxHeight: '92%',
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
    backgroundColor: Palette.white,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Palette.gold,
    overflow: 'hidden',
    zIndex: 2,
  },
  sheetInner: { padding: 20, gap: 12 },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  sheetKicker: { color: Palette.gold, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', fontSize: 11 },
  sheetTitle: { color: Palette.ink, fontSize: 22, fontWeight: '800' },
  notice: {
    borderWidth: 1,
    borderColor: Palette.gold,
    borderRadius: 16,
    padding: 12,
    gap: 4,
    backgroundColor: 'rgba(212,175,55,0.08)',
  },
  noticeTitle: { color: Palette.ink, fontWeight: '800' },
  formGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  discountBox: {
    gap: 8,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Palette.gold,
    backgroundColor: 'rgba(212,175,55,0.12)',
  },
  field: { gap: 6, minWidth: 240, flexGrow: 1, flexBasis: 240 },
  fieldCompact: { minWidth: 140, flexBasis: 140 },
  categoryTools: {
    gap: 10,
    padding: 10,
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(20,22,34,0.08)',
    backgroundColor: Palette.white,
  },
  seekInline: { gap: 8 },
  fieldLabel: { color: Palette.ink, fontWeight: '700', fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(20,22,34,0.14)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Palette.ink,
  },
  companion: {
    borderWidth: 1,
    borderColor: 'rgba(20,22,34,0.08)',
    borderRadius: 18,
    padding: 12,
    gap: 8,
  },
  compTitle: { color: Palette.ink, fontWeight: '800' },
  badgeWrap: { gap: 14 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, paddingVertical: 8 },
  seek: {
    gap: 10,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Palette.gold,
    backgroundColor: Palette.white,
    marginBottom: 12,
  },
  seekTitle: { color: Palette.ink, fontWeight: '800', fontSize: 16 },
  seekActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  seekHint: { color: Palette.ink, fontWeight: '700', marginBottom: 8 },
});
