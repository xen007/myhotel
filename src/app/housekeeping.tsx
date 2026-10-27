import { Image } from 'expo-image';
import { Redirect } from 'expo-router';
import { useMemo, useState } from 'react';
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
import { FilterBar } from '@/components/hotel/filter-bar';
import { HotelShell, StatusBadge } from '@/components/hotel/hotel-shell';
import { ConfirmDialog, GoldBtn } from '@/components/hotel/kit';
import { Breakpoints, Palette } from '@/constants/theme';
import { usePms } from '@/hooks/use-pms';
import { pmsPost } from '@/lib/api';
import { hkStatusLabel, prettyStamp } from '@/lib/format';

type HkAgent = { name: string; email?: string | null; user_id?: number | null; source?: string };
type HkIssue = {
  id: number;
  room_number: string;
  task_id?: number | null;
  reporter: string;
  category: string;
  description: string;
  status: string;
  at: string;
  resolved_at?: string | null;
  resolved_by?: string | null;
};
type HkCrew = { agent_name: string; user_id?: number | null; is_lead: number };
type HkTask = {
  id: number;
  room_number: string;
  attendant: string;
  lead_name?: string | null;
  priority: string;
  status: string;
  eta_minutes?: number;
  started_at?: string | null;
  finished_at?: string | null;
  due_at?: string | null;
  notes?: string | null;
  crew?: HkCrew[];
  helpers?: string[];
  issues?: HkIssue[];
  synthetic?: boolean;
};
type HkRoom = { id: number; number: string; type: string; floor: number; status: string; photo?: string };
type Payload = {
  tasks: HkTask[];
  issues: HkIssue[];
  agents: HkAgent[];
  rooms: HkRoom[];
  agent_stats?: { today: number; total: number };
};

type ModalKind = 'claim' | null;

function statusTone(status: string): 'gold' | 'ink' | 'muted' {
  if (status === 'non_prise' || status === 'urgente' || status === 'maintenance') return 'gold';
  if (status === 'en_cours') return 'ink';
  return 'muted';
}

function openStatus(status: string) {
  return status !== 'pret' && status !== 'termine' && status !== 'controle';
}

function cardStatus(task: HkTask, room?: HkRoom) {
  if (room?.status === 'maintenance' || task.status === 'maintenance') return 'maintenance';
  return task.status;
}

export default function HousekeepingScreen() {
  const { data, error, loading, reload, token, user, ready } = usePms<Payload>('housekeeping');
  const { width, height } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [modal, setModal] = useState<ModalKind>(null);
  const [issueRoom, setIssueRoom] = useState<string | null>(null);
  const [active, setActive] = useState<HkTask | null>(null);
  const [helpers, setHelpers] = useState<string[]>([]);
  const [agentQuery, setAgentQuery] = useState('');
  const [issueText, setIssueText] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [historyRoom, setHistoryRoom] = useState<string | null>(null);

  const tasks = useMemo(() => data?.tasks ?? [], [data?.tasks]);
  const rooms = useMemo(() => data?.rooms ?? [], [data?.rooms]);
  const agents = data?.agents ?? [];
  const issues = useMemo(() => data?.issues ?? [], [data?.issues]);
  const role = user?.role;
  const isAgent = role === 'housekeeping';
  const canClaim = isAgent || role === 'manager' || role === 'owner';
  const canReport = isAgent || role === 'receptionist' || role === 'manager' || role === 'owner';
  const canHistory = role === 'manager' || role === 'owner' || isAgent;

  const roomMap = useMemo(() => {
    const map = new Map<string, HkRoom>();
    rooms.forEach((room) => map.set(room.number, room));
    return map;
  }, [rooms]);

  const historyEntries = useMemo(() => {
    if (!historyRoom) return [];
    return tasks
      .filter((task) => task.room_number === historyRoom && (task.started_at || task.finished_at || task.status === 'pret'))
      .sort((a, b) => String(b.started_at || b.finished_at || '').localeCompare(String(a.started_at || a.finished_at || '')));
  }, [tasks, historyRoom]);

  const cards = useMemo(() => {
    const openRooms = new Set(
      tasks.filter((task) => openStatus(task.status)).map((task) => task.room_number),
    );
    const extra: HkTask[] = rooms
      .filter((room) => {
        if (openRooms.has(room.number)) return false;
        if (room.status === 'nettoyage') return true;
        if (room.status === 'maintenance') return !isAgent;
        return false;
      })
      .map((room) => ({
        id: -room.id,
        room_number: room.number,
        attendant: '',
        lead_name: null,
        priority: 'normale',
        status: room.status === 'maintenance' ? 'maintenance' : 'non_prise',
        synthetic: true,
        crew: [],
        helpers: [],
        issues: issues.filter((item) => item.room_number === room.number),
      }));
    return [...tasks, ...extra];
  }, [tasks, rooms, issues, isAgent]);

  const visible = useMemo(() => {
    return cards.filter((task) => {
      const room = roomMap.get(task.room_number);
      const lead = task.lead_name || task.attendant;
      const crew = (task.crew ?? []).map((row) => row.agent_name).join(' ');
      const hay = `${task.room_number} ${room?.type ?? ''} ${lead} ${crew}`.toLowerCase();
      if (query.trim() && !hay.includes(query.trim().toLowerCase())) return false;
      const status = cardStatus(task, room);
      if (status === 'pret' || task.status === 'pret' || task.status === 'termine' || task.status === 'controle') {
        return false;
      }
      if (isAgent && (status === 'maintenance' || room?.status === 'maintenance')) return false;
      if (filter === 'all') return true;
      if (filter === 'urgente') return task.priority === 'urgente' && openStatus(task.status);
      if (filter === 'maintenance') return status === 'maintenance';
      return status === filter;
    });
  }, [cards, roomMap, query, filter, isAgent]);

  function openModal(kind: ModalKind, task: HkTask) {
    setActive(task);
    setHelpers([]);
    setAgentQuery('');
    setFormError(null);
    setModal(kind);
  }

  function closeModal() {
    setModal(null);
    setActive(null);
    setFormError(null);
  }

  function toggleHelper(name: string) {
    if (name === user?.full_name) return;
    setHelpers((current) => (current.includes(name) ? current.filter((item) => item !== name) : [...current, name]));
  }

  function onCrew(task: HkTask) {
    const names = [task.lead_name, task.attendant, ...(task.helpers ?? []), ...(task.crew ?? []).map((row) => row.agent_name)];
    return names.filter(Boolean).includes(user?.full_name);
  }

  function canMarkReady(task: HkTask) {
    return role === 'manager' || role === 'owner' || onCrew(task);
  }

  async function claim() {
    if (!token || !active || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      await pmsPost(token, 'housekeeping/claim', {
        task_id: active.synthetic ? undefined : active.id,
        room_number: active.room_number,
        helpers,
      });
      closeModal();
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Impossible de résoudre.');
    } finally {
      setSaving(false);
    }
  }

  async function saveIssue() {
    if (!token || !issueRoom || saving) return;
    if (!issueText.trim()) {
      setFormError('Décrivez le problème constaté.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await pmsPost(token, 'housekeeping/issue', {
        room_number: issueRoom,
        description: issueText.trim(),
      });
      setIssueRoom(null);
      setIssueText('');
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Signalement impossible.');
    } finally {
      setSaving(false);
    }
  }

  async function markReady(task: HkTask) {
    if (!token) return;
    const room = roomMap.get(task.room_number);
    if (task.synthetic || room?.status === 'maintenance') {
      if (!room || (role !== 'manager' && role !== 'owner')) return;
      await pmsPost(token, 'rooms/status', { id: room.id, status: 'disponible' });
    } else {
      await pmsPost(token, 'housekeeping/status', {
        task_id: task.id,
        room_number: task.room_number,
        task_status: 'pret',
      });
    }
    await reload();
  }

  if (ready && !user) return <Redirect href="/welcome" />;
  if (ready && user?.role === 'receptionist') return <Redirect href="/home" />;

  const isDesktop = width >= Breakpoints.desktop;
  const phone = Math.min(width, height) < 600;
  const cols = phone ? 1 : isDesktop ? 4 : width >= 900 ? 3 : 2;
  const available = (isDesktop ? width - 248 : width) - 36;
  const cardWidth = Math.max(148, Math.floor((available - (cols - 1) * 10) / cols));
  const agentHits = agents.filter((agent) => {
    if (agent.name === user?.full_name) return false;
    if (!agentQuery.trim()) return true;
    return agent.name.toLowerCase().includes(agentQuery.trim().toLowerCase());
  });

  return (
    <HotelShell title="Sales" loading={loading && !data} error={error}>
      <FilterBar
        query={query}
        onQuery={setQuery}
        queryPlaceholder="Rechercher une chambre..."
        status={filter}
        onStatus={setFilter}
        statuses={[
          { id: 'all', label: 'Tous' },
          { id: 'urgente', label: 'Urgence' },
          { id: 'non_prise', label: 'Non pris en charge' },
          { id: 'en_cours', label: 'En cours' },
          ...(isAgent ? [] : [{ id: 'maintenance', label: 'Maintenance' }]),
        ]}
      />

      <View style={styles.grid}>
        {visible.map((task) => {
          const room = roomMap.get(task.room_number);
          const status = cardStatus(task, room);
          const lead = task.lead_name || task.attendant;
          const helpersNames = (task.helpers ?? []).filter(Boolean);
          return (
            <View key={`${task.id}-${task.room_number}`} style={[styles.card, { width: cardWidth }]}>
              <View style={styles.photoWrap}>
                <Image source={{ uri: room?.photo }} style={styles.photo} contentFit="cover" />
                {canHistory ? (
                  <Pressable style={styles.photoBtn} onPress={() => setHistoryRoom(task.room_number)}>
                    <AppIcon name="time" size={16} color={Palette.ink} />
                  </Pressable>
                ) : null}
              </View>
              <View style={styles.body}>
                <View style={styles.head}>
                  <Text style={styles.number}>{task.room_number}</Text>
                  <StatusBadge label={task.priority === 'urgente' ? 'Urgence' : (hkStatusLabel[status] ?? status)} tone={task.priority === 'urgente' ? 'ink' : statusTone(status)} />
                </View>
                <Text style={styles.type} numberOfLines={1}>{room?.type ?? 'Chambre'}</Text>
                {task.notes ? <Text style={styles.time} numberOfLines={2}>{task.notes}</Text> : null}
                {status === 'non_prise' ? (
                  <Text style={styles.meta} numberOfLines={1}>Étage {room?.floor ?? '—'} · En attente</Text>
                ) : lead ? (
                  <Text style={styles.meta} numberOfLines={1}>
                    {lead}
                    {helpersNames.length ? ` · ${helpersNames.length} éq.` : ' · seul'}
                  </Text>
                ) : (
                  <Text style={styles.meta}>Étage {room?.floor ?? '—'}</Text>
                )}
                {task.started_at ? (
                  <Text style={styles.time} numberOfLines={1}>{prettyStamp(task.started_at)}</Text>
                ) : null}
                <View style={styles.actions}>
                  {canClaim && status === 'non_prise' ? (
                    <GoldBtn block tiny icon="check-circle" label="Résoudre" onPress={() => openModal('claim', task)} />
                  ) : null}
                  {canReport && status !== 'pret' ? (
                    <GoldBtn
                      block
                      tiny
                      icon="error-circle"
                      label="Signaler"
                      variant="ghost"
                      onPress={() => {
                        setIssueText('');
                        setFormError(null);
                        setIssueRoom(task.room_number);
                      }}
                    />
                  ) : null}
                  {status === 'en_cours' && canMarkReady(task) ? (
                    <GoldBtn block tiny icon="check-circle" label="Prête" onPress={() => void markReady(task)} />
                  ) : null}
                  {(role === 'manager' || role === 'owner') && status === 'maintenance' ? (
                    <GoldBtn block tiny icon="check-circle" label="Prête" onPress={() => void markReady(task)} />
                  ) : null}
                </View>
              </View>
            </View>
          );
        })}
      </View>
      {!visible.length ? <Text style={styles.empty}>Aucune chambre dans ce filtre.</Text> : null}

      <ConfirmDialog
        visible={!!issueRoom}
        title="Signalement"
        message={`Chambre ${issueRoom ?? ''} — décrivez le problème constaté.`}
        confirmLabel={saving ? 'Envoi…' : 'Envoyer'}
        confirmIcon="error-circle"
        confirmVariant="ink"
        onCancel={() => {
          setIssueRoom(null);
          setIssueText('');
          setFormError(null);
        }}
        onConfirm={() => void saveIssue()}>
        {formError ? <Text style={styles.formError}>{formError}</Text> : null}
        <TextInput
          value={issueText}
          onChangeText={setIssueText}
          placeholder="Décrivez le problème"
          multiline
          style={styles.area}
        />
      </ConfirmDialog>

      <Modal visible={modal !== null} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={styles.overlay} pointerEvents="box-none">
          <Pressable style={styles.overlayFill} onPress={closeModal} />
          <View style={[styles.sheet, styles.sheetSquare]}>
            <View style={styles.sheetHead}>
              <View style={styles.alertIcon}>
                <AppIcon name="group" size={28} color={Palette.ink} />
              </View>
              <Text style={styles.sheetTitle}>Résoudre · {active?.room_number}</Text>
              <Pressable onPress={closeModal} hitSlop={12} style={styles.close}>
                <AppIcon name="x-circle" size={22} color={Palette.ink} />
              </Pressable>
            </View>
            {formError ? <Text style={styles.formError}>{formError}</Text> : null}
            <Pressable
              onPress={() => setHelpers([])}
              style={[styles.agentRow, helpers.length === 0 && styles.agentOn]}>
              <View>
                <Text style={styles.agentName}>Je travaille seul</Text>
                <Text style={styles.meta}>{user?.full_name}</Text>
              </View>
              {helpers.length === 0 ? <AppIcon name="check-circle" size={18} color={Palette.ink} /> : null}
            </Pressable>
            <TextInput
              value={agentQuery}
              onChangeText={setAgentQuery}
              placeholder="Rechercher un agent…"
              style={styles.search}
            />
            <ScrollView
              style={[
                styles.agentList,
                Platform.OS === 'web' ? ({ overflowY: 'scroll', scrollbarWidth: 'thin' } as object) : null,
              ]}
              contentContainerStyle={styles.agentListInner}
              nestedScrollEnabled
              persistentScrollbar
              showsVerticalScrollIndicator>
              {agentHits.map((agent) => {
                const on = helpers.includes(agent.name);
                return (
                  <Pressable key={agent.name} onPress={() => toggleHelper(agent.name)} style={[styles.agentRow, on && styles.agentOn]}>
                    <Text style={styles.agentName}>{agent.name}</Text>
                    {on ? <AppIcon name="check-circle" size={18} color={Palette.ink} /> : null}
                  </Pressable>
                );
              })}
              {!agentHits.length ? <Text style={styles.empty}>Aucun agent ne correspond.</Text> : null}
            </ScrollView>
            <GoldBtn
              icon="check-circle"
              label={saving ? 'Enregistrement…' : helpers.length ? `Confirmer · ${helpers.length + 1} pers.` : 'Confirmer · seul'}
              onPress={() => void claim()}
            />
          </View>
        </View>
      </Modal>
      <Modal visible={!!historyRoom} transparent animationType="fade" onRequestClose={() => setHistoryRoom(null)}>
        <View style={styles.overlay} pointerEvents="box-none">
          <Pressable style={styles.overlayFill} onPress={() => setHistoryRoom(null)} />
          <View style={[styles.sheet, styles.historySheet]}>
            <View style={styles.sheetHead}>
              <View style={styles.alertIcon}>
                <AppIcon name="time" size={28} color={Palette.ink} />
              </View>
              <Text style={styles.sheetTitle}>Historique · Chambre {historyRoom}</Text>
              <Pressable onPress={() => setHistoryRoom(null)} hitSlop={12} style={styles.close}>
                <AppIcon name="x-circle" size={22} color={Palette.ink} />
              </Pressable>
            </View>
            <ScrollView style={styles.historyList} contentContainerStyle={styles.historyInner} nestedScrollEnabled>
              {historyEntries.map((task) => {
                const helpersNames = (task.helpers ?? []).filter(Boolean);
                const done = task.status === 'pret' || task.status === 'termine';
                return (
                  <View key={task.id} style={styles.historyCard}>
                    <View style={styles.historyTop}>
                      <Text style={styles.agentName}>{task.lead_name || task.attendant || '—'}</Text>
                      <StatusBadge label={hkStatusLabel[task.status] ?? task.status} tone={done ? 'muted' : 'ink'} />
                    </View>
                    <Text style={styles.time}>Prise en charge : {prettyStamp(task.started_at)}</Text>
                    <Text style={styles.time}>Chambre prête : {task.finished_at ? prettyStamp(task.finished_at) : 'pas encore'}</Text>
                    <Text style={styles.meta}>
                      {helpersNames.length ? `Équipe : ${helpersNames.join(', ')}` : task.started_at ? 'Seul' : '—'}
                    </Text>
                  </View>
                );
              })}
              {!historyEntries.length ? <Text style={styles.empty}>Aucun passage enregistré pour cette chambre.</Text> : null}
            </ScrollView>
            <GoldBtn icon="x-circle" label="Fermer" variant="ghost" onPress={() => setHistoryRoom(null)} />
          </View>
        </View>
      </Modal>
    </HotelShell>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    backgroundColor: Palette.white,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(20,22,34,0.08)',
  },
  photoWrap: { position: 'relative' },
  photo: { width: '100%', aspectRatio: 16 / 9, backgroundColor: Palette.ink },
  photoBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 3,
    borderBottomColor: Palette.ink,
  },
  body: { padding: 10, gap: 3 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  number: { color: Palette.ink, fontSize: 16, fontWeight: '800' },
  type: { color: Palette.ink, fontWeight: '700', opacity: 0.75, fontSize: 12 },
  meta: { color: Palette.ink, opacity: 0.55, fontSize: 11 },
  time: { color: Palette.gold, fontWeight: '700', fontSize: 11 },
  actions: { flexDirection: 'row', alignItems: 'stretch', gap: 8, marginTop: 8 },
  empty: { color: Palette.ink, opacity: 0.6 },
  overlay: { ...StyleSheet.absoluteFill, justifyContent: 'center', alignItems: 'center', padding: 22 },
  overlayFill: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(20,22,34,0.55)' },
  sheet: {
    zIndex: 2,
    width: 420,
    maxWidth: '92%',
    maxHeight: '88%',
    backgroundColor: Palette.white,
    borderRadius: 18,
    paddingVertical: 22,
    paddingHorizontal: 20,
    gap: 10,
    borderWidth: 1,
    borderColor: Palette.gold,
  },
  sheetSquare: { alignItems: 'stretch' },
  sheetHead: { alignItems: 'center', gap: 8 },
  alertIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: Palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 4,
    borderBottomColor: '#8c7018',
  },
  sheetTitle: { color: Palette.ink, fontWeight: '800', fontSize: 18, textAlign: 'center' },
  close: { position: 'absolute', right: 0, top: 0 },
  agentList: {
    maxHeight: 240,
    minHeight: 120,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(20,22,34,0.10)',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingTop: 6,
  },
  agentListInner: { paddingRight: 4, paddingBottom: 8 },
  search: {
    borderWidth: 1,
    borderColor: 'rgba(20,22,34,0.12)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Palette.ink,
    marginBottom: 8,
    height: 40,
  },
  agentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(20,22,34,0.08)',
    marginBottom: 8,
  },
  agentOn: { backgroundColor: 'rgba(212,175,55,0.18)', borderColor: Palette.gold },
  agentName: { color: Palette.ink, fontWeight: '800' },
  area: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: 'rgba(20,22,34,0.14)',
    borderRadius: 14,
    padding: 12,
    color: Palette.ink,
    textAlignVertical: 'top',
    width: '100%',
  },
  formError: { color: Palette.ink, fontWeight: '700', backgroundColor: 'rgba(212,175,55,0.18)', padding: 10, borderRadius: 12 },
  historySheet: { width: 520, maxHeight: '90%', alignItems: 'stretch' },
  historyList: { maxHeight: 360, minHeight: 80 },
  historyInner: { gap: 8, paddingBottom: 8 },
  historyCard: {
    borderWidth: 1,
    borderColor: Palette.gold,
    borderRadius: 14,
    padding: 12,
    gap: 4,
    backgroundColor: 'rgba(212,175,55,0.08)',
  },
  historyTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
});
