import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { AppIcon, type BoxIconName } from '@/components/box-icon';
import { FilterBar } from '@/components/hotel/filter-bar';
import { HotelShell, StatusBadge } from '@/components/hotel/hotel-shell';
import { RoomMedia } from '@/components/hotel/room-media';
import { RoomStatsPanel } from '@/components/hotel/room-stats-panel';
import { Breakpoints, Palette, Radius } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { roomRequest, type Room } from '@/lib/api';
import { money, prettyWhen, reservationStatusLabel, reservationTone, roomStatusLabel } from '@/lib/format';

type MediaSlide = { kind: 'image' | 'video'; uri: string };

function statusTone(status: string): 'gold' | 'ink' | 'muted' {
  if (status === 'disponible') return 'gold';
  if (status === 'occupee' || status === 'reservee') return 'ink';
  return 'muted';
}

export default function RoomDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const narrow = width < Breakpoints.tablet;
  const { user, ready, token } = useAuth();
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [histStatus, setHistStatus] = useState('all');

  async function load() {
    if (!token || !id) return;
    try {
      const data = await roomRequest(token, String(id));
      setRoom(data);
      setMediaIndex(0);
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
  }, [id, token]);

  const visibleHistory = useMemo(() => {
    const rows = room?.history ?? [];
    return rows.filter((row) => {
      const hay = `${row.guest_name} ${row.guest_phone ?? ''}`.toLowerCase();
      if (query.trim() && !hay.includes(query.trim().toLowerCase())) return false;
      if (histStatus !== 'all' && row.status !== histStatus) return false;
      return true;
    });
  }, [room?.history, query, histStatus]);

  const slides = useMemo<MediaSlide[]>(() => {
    if (!room) return [];
    const photos = room.photos?.length ? room.photos : room.photo ? [room.photo] : [];
    const videos = room.videos?.length ? room.videos : room.video ? [room.video] : [];
    return [
      ...photos.map((uri) => ({ kind: 'image' as const, uri })),
      ...videos.map((uri) => ({ kind: 'video' as const, uri })),
    ];
  }, [room]);
  const current = slides[mediaIndex] ?? slides[0];
  const poster = room?.photos?.[0] ?? room?.photo ?? null;

  if (ready && !user) return <Redirect href="/welcome" />;

  return (
    <HotelShell
      back
      title={room ? `Chambre ${room.number}` : 'Chambre'}
      loading={loading}
      error={error}
      right={
        user?.role === 'receptionist' ? null : (
        <View style={styles.statIcon}>
          <AppIcon name="bar-chart-alt-2" size={18} color={Palette.ink} />
        </View>
        )
      }>
      {room ? (
        <View style={styles.wrap}>
          {current ? (
            <View style={styles.carousel}>
              <RoomMedia
                compact
                variant={current.kind}
                photo={current.kind === 'image' ? current.uri : poster}
                video={current.kind === 'video' ? current.uri : undefined}
              />
              {slides.length > 1 ? (
                <>
                  <Pressable
                    style={[styles.nav, styles.navLeft]}
                    onPress={() => setMediaIndex((i) => (i === 0 ? slides.length - 1 : i - 1))}>
                    <AppIcon name="chevron-left" size={18} color={Palette.ink} />
                  </Pressable>
                  <Pressable
                    style={[styles.nav, styles.navRight]}
                    onPress={() => setMediaIndex((i) => (i + 1) % slides.length)}>
                    <AppIcon name="chevron-right" size={18} color={Palette.ink} />
                  </Pressable>
                </>
              ) : null}
              <View style={styles.mediaBadge}>
                <Text style={styles.mediaBadgeText}>
                  {current.kind === 'video' ? 'Vidéo' : 'Photo'} {mediaIndex + 1}/{slides.length}
                </Text>
              </View>
              {slides.length > 1 ? (
                <View style={styles.dots}>
                  {slides.map((slide, index) => (
                    <Pressable
                      key={`${slide.kind}-${index}`}
                      onPress={() => setMediaIndex(index)}
                      style={[styles.dot, index === mediaIndex && styles.dotActive]}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
          <View style={styles.panel}>
            <View style={styles.row}>
              <Text style={styles.kicker}>{room.type}</Text>
              <StatusBadge label={roomStatusLabel[room.status] ?? room.status} tone={statusTone(room.status)} />
            </View>
            <Text style={styles.desc}>{room.description}</Text>
            <View style={styles.facts}>
              <Fact label="Étage" value={String(room.floor)} />
              <Fact label="Capacité" value={`${room.capacity} pers.`} />
              <Fact label="Tarif" value={`${money(room.price_night)} / nuit`} />
            </View>
            <Text style={styles.section}>Équipements</Text>
            <View style={styles.equipGrid}>
              {(room.equipment ?? []).map((item) => (
                <View key={item.id} style={styles.equip}>
                  <View style={styles.equipIcon}>
                    <AppIcon name={item.icon as BoxIconName} size={20} color={Palette.ink} />
                  </View>
                  <View>
                    <Text style={styles.equipName}>{item.name}</Text>
                    <Text style={styles.equipCat}>{item.category}</Text>
                  </View>
                </View>
              ))}
              {!(room.equipment ?? []).length ? <Text style={styles.desc}>Aucun équipement enregistré.</Text> : null}
            </View>
          </View>

          {user?.role !== 'receptionist' ? <RoomStatsPanel history={room.history ?? []} /> : null}

          <Text style={styles.section}>Historique des clients</Text>
          <FilterBar
            query={query}
            onQuery={setQuery}
            queryPlaceholder="Rechercher un client..."
            status={histStatus}
            onStatus={setHistStatus}
            statuses={[
              { id: 'all', label: 'Tous' },
              { id: 'confirmee', label: 'Confirmée' },
              { id: 'en_cours', label: 'En cours' },
              { id: 'terminee', label: 'Terminée' },
              { id: 'annulee', label: 'Annulée' },
            ]}
          />
          {narrow ? (
            <View style={styles.historyList}>
              {visibleHistory.map((row) => (
                <View key={row.id} style={styles.historyCard}>
                  <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.clientName}>{row.guest_name}</Text>
                      <Text style={styles.lot}>{row.guest_phone || '—'}</Text>
                    </View>
                    <StatusBadge
                      label={reservationStatusLabel[row.status] ?? row.status}
                      tone={reservationTone[row.status] ?? 'gold'}
                    />
                  </View>
                  <Text style={styles.desc}>
                    {prettyWhen(row.check_in, row.check_in_time)} → {prettyWhen(row.check_out, row.check_out_time)}
                  </Text>
                  <Text style={styles.factValue}>{money(row.total)}</Text>
                </View>
              ))}
            </View>
          ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator>
          <View style={styles.table}>
            <View style={[styles.tr, styles.th]}>
              <Text style={[styles.td, styles.tdText, styles.colClient, styles.thText]}>Client</Text>
              <Text style={[styles.td, styles.tdText, styles.colDate, styles.thText]}>Arrivée</Text>
              <Text style={[styles.td, styles.tdText, styles.colDate, styles.thText]}>Départ</Text>
              <Text style={[styles.td, styles.tdText, styles.colStatus, styles.thText]}>Statut</Text>
              <Text style={[styles.td, styles.tdText, styles.colTotal, styles.thText]}>Total</Text>
            </View>
            {visibleHistory.map((row, index) => (
              <View key={row.id} style={[styles.tr, index % 2 ? styles.trAlt : null]}>
                <View style={[styles.td, styles.colClient]}>
                  <Text style={styles.clientName}>{row.guest_name}</Text>
                  <Text style={styles.lot}>{row.guest_phone || '—'}</Text>
                </View>
                <Text style={[styles.td, styles.tdText, styles.colDate]}>{prettyWhen(row.check_in, row.check_in_time)}</Text>
                <Text style={[styles.td, styles.tdText, styles.colDate]}>{prettyWhen(row.check_out, row.check_out_time)}</Text>
                <View style={[styles.td, styles.colStatus]}>
                  <StatusBadge
                    label={reservationStatusLabel[row.status] ?? row.status}
                    tone={reservationTone[row.status] ?? 'gold'}
                  />
                </View>
                <Text style={[styles.td, styles.tdText, styles.colTotal, { fontWeight: '800' }]}>{money(row.total)}</Text>
              </View>
            ))}
          </View>
          </ScrollView>
          )}
          {!visibleHistory.length ? <Text style={styles.desc}>Aucun séjour ne correspond.</Text> : null}
        </View>
      ) : null}
    </HotelShell>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  carousel: { position: 'relative', maxWidth: 640, width: '100%', alignSelf: 'center' },
  nav: {
    position: 'absolute',
    top: 88,
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navLeft: { left: 10 },
  navRight: { right: 10 },
  mediaBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(20,22,34,0.72)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  mediaBadgeText: { color: Palette.white, fontSize: 11, fontWeight: '700' },
  dots: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  dotActive: { backgroundColor: Palette.gold, width: 16 },
  panel: {
    backgroundColor: Palette.white,
    borderRadius: Radius.card,
    padding: 22,
    gap: 12,
    borderWidth: 1,
    borderColor: Palette.gold,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: { color: Palette.ink, fontWeight: '800', fontSize: 16 },
  desc: { color: Palette.ink, opacity: 0.78, lineHeight: 22, fontSize: 15 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  fact: {
    flexGrow: 1,
    minWidth: 120,
    backgroundColor: 'rgba(20,22,34,0.05)',
    borderRadius: 14,
    padding: 12,
  },
  factLabel: { color: Palette.ink, opacity: 0.6, fontSize: 12 },
  factValue: { color: Palette.ink, fontWeight: '800', marginTop: 4 },
  section: { color: Palette.ink, fontWeight: '800', fontSize: 16, marginTop: 8 },
  equipGrid: { gap: 10 },
  equip: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  equipIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  equipName: { color: Palette.ink, fontWeight: '700' },
  equipCat: { color: Palette.ink, opacity: 0.6, fontSize: 12 },
  table: { minWidth: 720, backgroundColor: Palette.white, borderRadius: Radius.card, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(20,22,34,0.06)' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  th: { backgroundColor: 'rgba(20,22,34,0.05)' },
  trAlt: { backgroundColor: 'rgba(212,175,55,0.08)' },
  td: { paddingRight: 8 },
  tdText: { color: Palette.ink, fontSize: 13 },
  thText: { fontWeight: '800', fontSize: 12 },
  colClient: { flex: 1.4, minWidth: 120 },
  colDate: { flex: 1.2, minWidth: 110 },
  colStatus: { flex: 0.9, minWidth: 90 },
  colTotal: { flex: 0.8, minWidth: 80 },
  clientName: { color: Palette.ink, fontWeight: '700' },
  lot: { color: Palette.ink, opacity: 0.55, fontSize: 12 },
  historyList: { gap: 10 },
  historyCard: {
    backgroundColor: Palette.white,
    borderRadius: Radius.card,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(20,22,34,0.06)',
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: Palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
