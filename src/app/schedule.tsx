import { createElement, useMemo, useState } from 'react';
import { Redirect } from 'expo-router';
import {
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
import { HotelShell, StatusBadge } from '@/components/hotel/hotel-shell';
import { ConfirmDialog, GoldBtn } from '@/components/hotel/kit';
import { ROLE_LABEL, type StaffRole } from '@/constants/roles';
import { Breakpoints, Palette, Radius } from '@/constants/theme';
import { usePms } from '@/hooks/use-pms';
import { pmsPost } from '@/lib/api';
import { prettyDate } from '@/lib/format';

type Person = { id: number; full_name: string; role: string };
type Shift = { id: number; staff_name: string; day: string; start_hour: string; end_hour: string; task?: string | null };
type Job = { id: number; title: string; assignee: string; day: string; status: string; notes?: string | null };
type HkTask = { id: number; room_number: string; attendant: string; status: string; priority: string };
type Payload = { staff: Person[]; shifts: Shift[]; jobs?: Job[]; tasks?: HkTask[] };

const HOURS = Array.from({ length: 18 }, (_, i) => {
  const value = `${String(i + 6).padStart(2, '0')}:00`;
  return { id: value, label: value };
});

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function mondayOf(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  copy.setDate(copy.getDate() + (day === 0 ? -6 : 1 - day));
  return copy;
}

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(base: Date, count: number) {
  const next = new Date(base);
  next.setDate(base.getDate() + count);
  return next;
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function jobTone(status: string): 'gold' | 'ink' | 'muted' {
  if (status === 'a_faire') return 'gold';
  if (status === 'en_cours') return 'ink';
  return 'muted';
}

function jobLabel(status: string) {
  if (status === 'en_cours') return 'En cours';
  if (status === 'fait') return 'Faite';
  return 'À faire';
}

export default function ScheduleScreen() {
  const { data, error, loading, reload, token, user, ready } = usePms<Payload>('schedule');
  const { width } = useWindowDimensions();
  const [anchor, setAnchor] = useState(() => mondayOf(new Date()));
  const [query, setQuery] = useState('');
  const [shift, setShift] = useState<{ staff_name: string; day: string; start_hour: string; end_hour: string; task: string } | null>(null);
  const [job, setJob] = useState<{ title: string; assignee: string; day: string; notes: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingShift, setPendingShift] = useState<Shift | null>(null);

  const canManage = user?.role === 'manager' || user?.role === 'owner';
  const isDesktop = width >= Breakpoints.desktop;
  const isMobile = width < Breakpoints.tablet;
  const staff = data?.staff ?? [];
  const shifts = data?.shifts ?? [];
  const jobs = data?.jobs ?? [];
  const hk = data?.tasks ?? [];
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => iso(addDays(anchor, i))), [anchor]);

  const people = useMemo(() => {
    const q = query.trim().toLowerCase();
    return staff.filter((person) => !q || person.full_name.toLowerCase().includes(q) || person.role.toLowerCase().includes(q));
  }, [staff, query]);

  function shiftAt(name: string, day: string) {
    return shifts.find((row) => row.staff_name === name && row.day === day) || null;
  }

  function openShift(person: Person, day: string) {
    const existing = shiftAt(person.full_name, day);
    setFormError(null);
    setShift({
      staff_name: person.full_name,
      day,
      start_hour: existing?.start_hour || '08:00',
      end_hour: existing?.end_hour || '16:00',
      task: existing?.task || '',
    });
  }

  async function saveShift() {
    if (!token || !shift || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      const existing = shiftAt(shift.staff_name, shift.day);
      await pmsPost(token, 'shifts', { ...shift, id: existing?.id });
      setShift(null);
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  async function removeShift() {
    if (!token || !pendingShift) return;
    await pmsPost(token, 'shifts/delete', { id: pendingShift.id });
    setPendingShift(null);
    await reload();
  }

  async function saveJob() {
    if (!token || !job || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      await pmsPost(token, 'work-tasks', job);
      setJob(null);
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Création impossible.');
    } finally {
      setSaving(false);
    }
  }

  async function setJobStatus(item: Job, status: string) {
    if (!token) return;
    await pmsPost(token, 'work-tasks/status', { id: item.id, status });
    await reload();
  }

  if (ready && !user) return <Redirect href="/welcome" />;
  if (ready && user && !canManage && user.role !== 'receptionist' && user.role !== 'housekeeping') {
    return <Redirect href="/home" />;
  }

  const weekLabel = `${prettyDate(days[0])} — ${prettyDate(days[6])}`;
  const mine = (value?: string | null) =>
    String(value || '').trim().toLowerCase() === String(user?.full_name || '').trim().toLowerCase();
  const myShifts = shifts.filter((row) => mine(row.staff_name));
  const myJobs = jobs.filter((row) => mine(row.assignee));
  const myRooms = hk.filter((row) => mine(row.attendant));

  if (ready && !canManage) {
    return (
      <HotelShell title="Mon planning" loading={loading && !data} error={error}>
        <View style={[styles.weekBar, isMobile && styles.weekBarMobile]}>
          {isMobile ? (
            <Pressable onPress={() => setAnchor(addDays(anchor, -7))} hitSlop={8} style={styles.weekNav}>
              <AppIcon name="chevron-left" size={18} color={Palette.ink} />
            </Pressable>
          ) : (
            <GoldBtn tiny icon="chevron-left" label="Semaine" variant="ghost" onPress={() => setAnchor(addDays(anchor, -7))} />
          )}
          <View style={styles.weekCopy}>
            {isMobile ? null : <Text style={styles.weekKicker}>Semaine</Text>}
            <Text
              numberOfLines={1}
              style={[styles.weekLabel, isMobile && styles.weekLabelMobile, Platform.OS === 'web' ? ({ whiteSpace: 'nowrap' } as object) : null]}>
              {weekLabel}
            </Text>
          </View>
          {isMobile ? (
            <Pressable onPress={() => setAnchor(addDays(anchor, 7))} hitSlop={8} style={styles.weekNav}>
              <AppIcon name="chevron-right" size={18} color={Palette.ink} />
            </Pressable>
          ) : (
            <GoldBtn tiny icon="chevron-right" label="Suivante" variant="ghost" onPress={() => setAnchor(addDays(anchor, 7))} />
          )}
        </View>

        <View style={styles.panel}>
          <View style={styles.panelHead}>
            <Text style={styles.panelTitle}>Mon emploi du temps</Text>
            <Text style={styles.panelCount}>{myShifts.filter((row) => days.includes(String(row.day).slice(0, 10))).length}</Text>
          </View>
          {days.map((day, index) => {
            const cell = myShifts.find((row) => String(row.day).slice(0, 10) === day);
            return (
              <View key={day} style={styles.mineDay}>
                <View style={styles.mineWhen}>
                  <Text style={styles.name}>{WEEKDAYS[index]}</Text>
                  <Text style={styles.role}>{prettyDate(day)}</Text>
                </View>
                {cell ? (
                  <View style={styles.jobCopy}>
                    <Text style={styles.name}>
                      {String(cell.start_hour).slice(0, 5)}–{String(cell.end_hour).slice(0, 5)}
                    </Text>
                    <Text style={styles.role}>{cell.task || 'Service'}</Text>
                  </View>
                ) : (
                  <Text style={styles.role}>Repos</Text>
                )}
              </View>
            );
          })}
        </View>

        <View style={styles.panel}>
          <View style={styles.panelHead}>
            <Text style={styles.panelTitle}>Mes tâches</Text>
            <Text style={styles.panelCount}>{myJobs.length}</Text>
          </View>
          {myJobs.map((item) => (
            <View key={item.id} style={styles.job}>
              <View style={styles.jobCopy}>
                <Text style={styles.name}>{item.title}</Text>
                <Text style={styles.role}>{prettyDate(item.day)}</Text>
                {item.notes ? <Text style={styles.note}>{item.notes}</Text> : null}
              </View>
              <StatusBadge label={jobLabel(item.status)} tone={jobTone(item.status)} />
              {item.status !== 'fait' ? (
                <GoldBtn
                  tiny
                  label={item.status === 'a_faire' ? 'Démarrer' : 'Terminer'}
                  onPress={() => void setJobStatus(item, item.status === 'a_faire' ? 'en_cours' : 'fait')}
                />
              ) : null}
            </View>
          ))}
          {!myJobs.length ? <Text style={styles.empty}>Aucune tâche à effectuer.</Text> : null}
        </View>

        {myRooms.length ? (
          <View style={styles.panel}>
            <View style={styles.panelHead}>
              <Text style={styles.panelTitle}>Chambres à traiter</Text>
              <Text style={styles.panelCount}>{myRooms.length}</Text>
            </View>
            {myRooms.map((task) => (
              <View key={task.id} style={styles.job}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{task.room_number}</Text>
                </View>
                <View style={styles.jobCopy}>
                  <Text style={styles.name}>Chambre {task.room_number}</Text>
                  <Text style={styles.role}>{task.status}</Text>
                </View>
                <StatusBadge label={task.priority === 'urgente' ? 'Urgence' : 'Statut'} tone={task.priority === 'urgente' ? 'gold' : 'muted'} />
              </View>
            ))}
          </View>
        ) : null}
      </HotelShell>
    );
  }

  return (
    <HotelShell
      title="Planning"
      loading={loading && !data}
      error={error}
      right={
        <>
          <GoldBtn compact icon="plus" variant="ghost" label="Tâche" onPress={() => {
            setFormError(null);
            setJob({ title: '', assignee: staff[0]?.full_name || '', day: iso(new Date()), notes: '' });
          }} />
          <GoldBtn compact icon="plus" label="Horaire" onPress={() => {
            setFormError(null);
            setShift({
              staff_name: staff[0]?.full_name || '',
              day: iso(new Date()),
              start_hour: '08:00',
              end_hour: '16:00',
              task: '',
            });
          }} />
        </>
      }>
      <View style={[styles.weekBar, isMobile && styles.weekBarMobile]}>
        {isMobile ? (
          <Pressable onPress={() => setAnchor(addDays(anchor, -7))} hitSlop={8} style={styles.weekNav}>
            <AppIcon name="chevron-left" size={18} color={Palette.ink} />
          </Pressable>
        ) : (
          <GoldBtn tiny icon="chevron-left" label="Semaine" variant="ghost" onPress={() => setAnchor(addDays(anchor, -7))} />
        )}
        <View style={styles.weekCopy}>
          {isMobile ? null : <Text style={styles.weekKicker}>Semaine</Text>}
          <Text
            numberOfLines={1}
            style={[styles.weekLabel, isMobile && styles.weekLabelMobile, Platform.OS === 'web' ? ({ whiteSpace: 'nowrap' } as object) : null]}>
            {weekLabel}
          </Text>
        </View>
        {isMobile ? (
          <Pressable onPress={() => setAnchor(addDays(anchor, 7))} hitSlop={8} style={styles.weekNav}>
            <AppIcon name="chevron-right" size={18} color={Palette.ink} />
          </Pressable>
        ) : (
          <GoldBtn tiny icon="chevron-right" label="Suivante" variant="ghost" onPress={() => setAnchor(addDays(anchor, 7))} />
        )}
      </View>
      <FilterBar query={query} onQuery={setQuery} queryPlaceholder="Rechercher un employé..." />

      <View style={styles.board}>
        <View style={styles.boardHead}>
          <Text style={styles.boardTitle}>Horaires de la semaine</Text>
          <Text style={styles.boardMeta}>{people.length} employé{people.length > 1 ? 's' : ''}</Text>
        </View>
        <ScrollView horizontal={!isDesktop} showsHorizontalScrollIndicator={!isDesktop}>
          <View style={[styles.table, { minWidth: isDesktop ? '100%' : 860, width: isDesktop ? '100%' : 860 }]}>
            <View style={[styles.tr, styles.th]}>
              <Text style={[styles.td, styles.colName, styles.thText]}>Employé</Text>
              {days.map((day, index) => (
                <View key={day} style={[styles.td, styles.colDay]}>
                  <Text style={styles.dayName}>{WEEKDAYS[index]}</Text>
                  <Text style={styles.thText}>{prettyDate(day).slice(0, 5)}</Text>
                </View>
              ))}
            </View>
            {people.map((person, index) => (
              <View key={person.id} style={[styles.tr, index % 2 ? styles.trAlt : null]}>
                <View style={[styles.td, styles.colName, styles.personCell]}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials(person.full_name)}</Text>
                  </View>
                  <View style={styles.personCopy}>
                    <Text style={styles.name} numberOfLines={1}>{person.full_name}</Text>
                    <Text style={styles.role} numberOfLines={1}>{ROLE_LABEL[person.role as StaffRole] || person.role}</Text>
                  </View>
                </View>
                {days.map((day) => {
                  const cell = shiftAt(person.full_name, day);
                  return (
                    <Pressable key={`${person.id}-${day}`} style={[styles.td, styles.colDay]} onPress={() => openShift(person, day)}>
                      {cell ? (
                        <View style={styles.shiftChip}>
                          <Text style={styles.shiftHour}>{String(cell.start_hour).slice(0, 5)}–{String(cell.end_hour).slice(0, 5)}</Text>
                          <Text style={styles.shiftTask} numberOfLines={1}>{cell.task || 'Service'}</Text>
                        </View>
                      ) : (
                        <Text style={styles.emptyCell}>+</Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
        {!people.length ? <Text style={styles.empty}>Aucun employé ne correspond.</Text> : null}
      </View>

      <View style={styles.split}>
        <View style={styles.panel}>
          <View style={styles.panelHead}>
            <Text style={styles.panelTitle}>Tâches planifiées</Text>
            <Text style={styles.panelCount}>{jobs.length}</Text>
          </View>
          {jobs.map((item) => (
            <View key={item.id} style={styles.job}>
              <View style={styles.jobCopy}>
                <Text style={styles.name}>{item.title}</Text>
                <Text style={styles.role}>{item.assignee} · {prettyDate(item.day)}</Text>
                {item.notes ? <Text style={styles.note}>{item.notes}</Text> : null}
              </View>
              <StatusBadge label={jobLabel(item.status)} tone={jobTone(item.status)} />
              <View style={styles.jobActions}>
                {item.status !== 'fait' ? (
                  <GoldBtn tiny label={item.status === 'a_faire' ? 'Démarrer' : 'Terminer'} onPress={() => void setJobStatus(item, item.status === 'a_faire' ? 'en_cours' : 'fait')} />
                ) : null}
              </View>
            </View>
          ))}
          {!jobs.length ? <Text style={styles.empty}>Aucune tâche planifiée.</Text> : null}
        </View>
        <View style={styles.panel}>
          <View style={styles.panelHead}>
            <Text style={styles.panelTitle}>Chambres en cours</Text>
            <Text style={styles.panelCount}>{hk.length}</Text>
          </View>
          {hk.map((task) => (
            <View key={task.id} style={styles.job}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{task.room_number}</Text>
              </View>
              <View style={styles.jobCopy}>
                <Text style={styles.name}>Chambre {task.room_number}</Text>
                <Text style={styles.role}>{task.attendant || 'Non prise'} · {task.status}</Text>
              </View>
              <StatusBadge label={task.priority === 'urgente' ? 'Urgence' : 'Statut'} tone={task.priority === 'urgente' ? 'gold' : 'muted'} />
            </View>
          ))}
          {!hk.length ? <Text style={styles.empty}>Aucune chambre ouverte à l’entretien.</Text> : null}
        </View>
      </View>

      <ConfirmDialog
        visible={!!shift}
        title="Planifier un horaire"
        message={`${shift?.staff_name ?? ''} · ${shift ? prettyDate(shift.day) : ''}`}
        confirmLabel={saving ? 'Enregistrement…' : 'Enregistrer'}
        confirmIcon="check-circle"
        confirmVariant="gold"
        onCancel={() => { setShift(null); setFormError(null); }}
        onConfirm={() => void saveShift()}>
        {formError && shift ? <Text style={styles.formError}>{formError}</Text> : null}
        {shift ? (
          <View style={styles.fields}>
            <View style={styles.field}>
              <Text style={styles.label}>Employé</Text>
              <FilterSelect
                value={shift.staff_name}
                onChange={(staff_name) => setShift({ ...shift, staff_name })}
                options={staff.map((person) => ({ id: person.full_name, label: person.full_name }))}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Jour</Text>
              {Platform.OS === 'web'
                ? createElement('input', {
                    type: 'date',
                    value: shift.day,
                    onChange: (event: { target: { value: string } }) => setShift({ ...shift, day: event.target.value }),
                    style: webDate,
                  })
                : <TextInput value={shift.day} onChangeText={(day) => setShift({ ...shift, day })} style={styles.input} />}
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Début</Text>
              <FilterSelect value={shift.start_hour} onChange={(start_hour) => setShift({ ...shift, start_hour })} options={HOURS} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Fin</Text>
              <FilterSelect value={shift.end_hour} onChange={(end_hour) => setShift({ ...shift, end_hour })} options={HOURS} />
            </View>
            <View style={styles.fieldWide}>
              <Text style={styles.label}>Tâche / poste</Text>
              <TextInput value={shift.task} onChangeText={(task) => setShift({ ...shift, task })} placeholder="Réception matin, étages…" style={styles.input} />
            </View>
            {shiftAt(shift.staff_name, shift.day) ? (
              <GoldBtn compact icon="trash" label="Retirer cet horaire" variant="ink" onPress={() => {
                const current = shiftAt(shift.staff_name, shift.day);
                setShift(null);
                if (current) setPendingShift(current);
              }} />
            ) : null}
          </View>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        visible={!!job}
        title="Nouvelle tâche"
        message=""
        confirmLabel={saving ? 'Enregistrement…' : 'Créer'}
        confirmIcon="check-circle"
        confirmVariant="gold"
        onCancel={() => { setJob(null); setFormError(null); }}
        onConfirm={() => void saveJob()}>
        {formError && job ? <Text style={styles.formError}>{formError}</Text> : null}
        {job ? (
          <View style={styles.fields}>
            <View style={styles.fieldWide}>
              <Text style={styles.label}>Tâche</Text>
              <TextInput value={job.title} onChangeText={(title) => setJob({ ...job, title })} placeholder="Contrôle linge, clôture caisse…" style={styles.input} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Employé</Text>
              <FilterSelect
                value={job.assignee}
                onChange={(assignee) => setJob({ ...job, assignee })}
                options={staff.map((person) => ({ id: person.full_name, label: person.full_name }))}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Jour</Text>
              {Platform.OS === 'web'
                ? createElement('input', {
                    type: 'date',
                    value: job.day,
                    onChange: (event: { target: { value: string } }) => setJob({ ...job, day: event.target.value }),
                    style: webDate,
                  })
                : <TextInput value={job.day} onChangeText={(day) => setJob({ ...job, day })} style={styles.input} />}
            </View>
            <View style={styles.fieldWide}>
              <Text style={styles.label}>Note</Text>
              <TextInput value={job.notes} onChangeText={(notes) => setJob({ ...job, notes })} placeholder="Précisions (facultatif)" style={styles.input} />
            </View>
          </View>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        visible={!!pendingShift}
        title="Retirer l’horaire"
        message={`Supprimer le service de ${pendingShift?.staff_name ?? ''} le ${pendingShift ? prettyDate(pendingShift.day) : ''} ?`}
        confirmLabel="Supprimer"
        onCancel={() => setPendingShift(null)}
        onConfirm={() => void removeShift()}
      />
    </HotelShell>
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
  weekBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: Palette.white,
    borderRadius: 18,
    padding: 10,
    borderWidth: 1,
    borderColor: Palette.gold,
    flexWrap: 'nowrap',
  },
  weekBarMobile: { paddingVertical: 6, paddingHorizontal: 8, gap: 4 },
  weekNav: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    backgroundColor: 'rgba(20,22,34,0.04)',
  },
  weekCopy: { alignItems: 'center', flex: 1, minWidth: 0 },
  weekKicker: { color: Palette.ink, opacity: 0.45, fontWeight: '800', fontSize: 11, textTransform: 'uppercase' },
  weekLabel: { color: Palette.ink, fontWeight: '800', fontSize: 16, textAlign: 'center', width: '100%' },
  weekLabelMobile: { fontSize: 11, letterSpacing: -0.2 },
  board: {
    backgroundColor: Palette.white,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Palette.gold,
  },
  boardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Palette.ink,
  },
  boardTitle: { color: Palette.gold, fontWeight: '800', fontSize: 16 },
  boardMeta: { color: Palette.white, opacity: 0.7, fontWeight: '700', fontSize: 12 },
  table: {
    overflow: 'hidden',
    backgroundColor: Palette.white,
  },
  tr: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(20,22,34,0.06)',
  },
  trAlt: { backgroundColor: 'rgba(212,175,55,0.08)' },
  th: { backgroundColor: 'rgba(212,175,55,0.18)' },
  thText: { color: Palette.ink, opacity: 0.55, fontWeight: '800', fontSize: 11, textTransform: 'uppercase' },
  td: { paddingVertical: 10, paddingHorizontal: 8 },
  colName: { width: 168, flexShrink: 0 },
  colDay: { flex: 1, minWidth: 92, justifyContent: 'center', alignItems: 'center' },
  dayName: { color: Palette.ink, fontWeight: '800', fontSize: 12, marginBottom: 2 },
  personCell: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  personCopy: { flex: 1, minWidth: 0 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: Palette.ink,
  },
  avatarText: { color: Palette.ink, fontWeight: '800', fontSize: 11 },
  name: { color: Palette.ink, fontWeight: '800', fontSize: 13 },
  role: { color: Palette.ink, opacity: 0.5, fontSize: 11, marginTop: 2 },
  shiftChip: {
    backgroundColor: Palette.gold,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 3,
    borderBottomColor: Palette.ink,
    width: '100%',
  },
  shiftHour: { color: Palette.ink, fontWeight: '800', fontSize: 11 },
  shiftTask: { color: Palette.ink, opacity: 0.7, fontSize: 10 },
  emptyCell: { color: Palette.ink, opacity: 0.25, fontWeight: '800', textAlign: 'center' },
  split: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  panel: {
    flexGrow: 1,
    flexBasis: 280,
    backgroundColor: Palette.white,
    borderRadius: Radius.card,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: Palette.gold,
  },
  panelHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(212,175,55,0.45)',
    marginBottom: 4,
  },
  panelTitle: { color: Palette.ink, fontWeight: '800', fontSize: 15 },
  panelCount: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    color: Palette.ink,
    fontWeight: '800',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 24,
    overflow: 'hidden',
    paddingHorizontal: 8,
  },
  job: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  jobCopy: { flex: 1, minWidth: 0 },
  jobActions: { flexShrink: 0 },
  note: { color: Palette.ink, opacity: 0.55, fontSize: 12 },
  empty: { color: Palette.ink, opacity: 0.6, padding: 12 },
  mineDay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(20,22,34,0.06)',
  },
  mineWhen: { width: 110 },
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  field: { minWidth: 140, flexGrow: 1, flexBasis: 140, gap: 6 },
  fieldWide: { minWidth: '100%', gap: 6 },
  label: { color: Palette.ink, fontWeight: '700', fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(20,22,34,0.14)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Palette.ink,
  },
  formError: { color: Palette.ink, fontWeight: '700', backgroundColor: 'rgba(212,175,55,0.18)', padding: 10, borderRadius: 12 },
});
