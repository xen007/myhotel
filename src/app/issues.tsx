import { Redirect } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { AppIcon } from '@/components/box-icon';
import { FilterBar } from '@/components/hotel/filter-bar';
import { HotelShell, StatusBadge } from '@/components/hotel/hotel-shell';
import { GoldBtn } from '@/components/hotel/kit';
import { Breakpoints, Palette } from '@/constants/theme';
import { usePms } from '@/hooks/use-pms';
import { pmsPost } from '@/lib/api';
import { prettyStamp } from '@/lib/format';

type Issue = {
  id: number;
  room_number: string;
  reporter: string;
  description: string;
  category?: string | null;
  status: string;
  at: string;
  resolved_at?: string | null;
  resolved_by?: string | null;
};

type Payload = { issues: Issue[]; open: number };

function badgeFor(status: string) {
  if (status === 'en_attente') return { label: 'En attente', tone: 'ink' as const };
  if (status === 'resolue') return { label: 'Résolu', tone: 'muted' as const };
  return { label: 'Ouvert', tone: 'gold' as const };
}

export default function IssuesScreen() {
  const { data, error, loading, reload, token, user, ready } = usePms<Payload>('issues');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('ouverte');
  const [saving, setSaving] = useState<number | null>(null);

  const isManager = user?.role === 'manager' || user?.role === 'owner';
  const isAgent = user?.role === 'housekeeping';
  const { width } = useWindowDimensions();
  const isDesktop = width >= Breakpoints.desktop;
  const cols = width >= Breakpoints.tablet ? 3 : 1;
  const available = (isDesktop ? width - 248 : width) - 36;
  const cardWidth = Math.max(160, Math.floor((available - (cols - 1) * 10) / cols));
  const issues = useMemo(() => data?.issues ?? [], [data?.issues]);
  const visible = useMemo(() => {
    return issues.filter((item) => {
      const hay = `${item.room_number} ${item.reporter} ${item.description}`.toLowerCase();
      if (query.trim() && !hay.includes(query.trim().toLowerCase())) return false;
      if (filter === 'all') return true;
      return item.status === filter;
    });
  }, [issues, query, filter]);

  async function setStatus(item: Issue, status: 'ouverte' | 'en_attente' | 'resolue') {
    if (!token || saving || !isManager) return;
    setSaving(item.id);
    try {
      await pmsPost(token, 'housekeeping/issue/resolve', { id: item.id, status });
      await reload();
    } finally {
      setSaving(null);
    }
  }

  if (ready && !user) return <Redirect href="/welcome" />;
  const canRead = user?.role === 'manager' || user?.role === 'owner' || user?.role === 'housekeeping' || user?.role === 'receptionist';
  if (ready && user && !canRead) {
    return <Redirect href="/home" />;
  }

  return (
    <HotelShell
      title={isAgent ? 'Mes signalements' : 'Signalements'}
      loading={loading && !data}
      error={error}>
      <FilterBar
        query={query}
        onQuery={setQuery}
        queryPlaceholder="Chambre, détail, agent..."
        status={filter}
        onStatus={setFilter}
        statuses={[
          { id: 'ouverte', label: 'Ouverts' },
          { id: 'en_attente', label: 'En attente' },
          { id: 'resolue', label: 'Résolus' },
          { id: 'all', label: 'Tous' },
        ]}
      />
      <View style={styles.list}>
        {visible.map((item) => {
          const waiting = item.status === 'en_attente';
          const resolved = item.status === 'resolue';
          const badge = badgeFor(item.status);
          return (
            <View key={item.id} style={[styles.card, resolved && styles.cardDone, { width: cardWidth }]}>
              <View style={styles.top}>
                <View style={styles.roomBadge}>
                  <Text style={styles.roomNo}>{item.room_number}</Text>
                </View>
                <View style={styles.copy}>
                  {item.category ? <Text style={styles.category}>{item.category}</Text> : null}
                  <Text style={styles.title} numberOfLines={2}>
                    {item.description}
                  </Text>
                  <Text style={styles.meta}>
                    {isAgent ? `Envoyé ${prettyStamp(item.at)}` : `${item.reporter} · ${prettyStamp(item.at)}`}
                  </Text>
                  {resolved && item.resolved_at ? (
                    <Text style={styles.done}>
                      Clôturé {prettyStamp(item.resolved_at)}
                      {item.resolved_by ? ` par ${item.resolved_by}` : ''}
                    </Text>
                  ) : null}
                </View>
                <StatusBadge label={badge.label} tone={badge.tone} />
              </View>
              {isManager ? (
                <View style={styles.actions}>
                  {!resolved ? (
                    <GoldBtn
                      tiny
                      icon="time"
                      label={saving === item.id && waiting ? '…' : 'En attente'}
                      variant={waiting ? 'gold' : 'ghost'}
                      onPress={() => void setStatus(item, waiting ? 'ouverte' : 'en_attente')}
                    />
                  ) : null}
                  <GoldBtn
                    tiny
                    icon={resolved ? 'error-circle' : 'check-circle'}
                    label={saving === item.id ? '…' : resolved ? 'Rouvrir' : 'Résoudre'}
                    variant={resolved ? 'ghost' : 'gold'}
                    onPress={() => void setStatus(item, resolved ? 'ouverte' : 'resolue')}
                  />
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
      {!visible.length ? (
        <View style={styles.emptyBox}>
          <AppIcon name="error-circle" size={28} color={Palette.gold} />
          <Text style={styles.empty}>
            {isAgent ? 'Vous n’avez encore envoyé aucun signalement.' : 'Aucun signalement dans ce filtre.'}
          </Text>
        </View>
      ) : null}
    </HotelShell>
  );
}

const styles = StyleSheet.create({
  list: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    gap: 12,
    backgroundColor: Palette.white,
    borderRadius: 18,
    padding: 14,
    paddingBottom: 16,
    borderWidth: 1,
    borderColor: Palette.gold,
  },
  cardDone: { borderColor: 'rgba(20,22,34,0.08)', opacity: 0.92 },
  top: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  roomBadge: {
    minWidth: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: Palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  roomNo: { color: Palette.ink, fontWeight: '800', fontSize: 16 },
  copy: { flex: 1, minWidth: 0, gap: 4, paddingRight: 4 },
  category: { color: Palette.gold, fontWeight: '800', fontSize: 12 },
  title: { color: Palette.ink, fontWeight: '700', fontSize: 15, lineHeight: 20 },
  meta: { color: Palette.ink, opacity: 0.5, fontSize: 12 },
  done: { color: Palette.gold, fontWeight: '700', fontSize: 12 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 2,
  },
  emptyBox: { alignItems: 'center', gap: 8, paddingVertical: 28 },
  empty: { color: Palette.ink, opacity: 0.6, textAlign: 'center' },
});
