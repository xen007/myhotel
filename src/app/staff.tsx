import { Redirect } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { AppIcon } from '@/components/box-icon';
import { FilterBar, FilterSelect } from '@/components/hotel/filter-bar';
import { HotelShell } from '@/components/hotel/hotel-shell';
import { ConfirmDialog, GoldBtn } from '@/components/hotel/kit';
import { ROLE_LABEL, type StaffRole } from '@/constants/roles';
import { Breakpoints, Palette } from '@/constants/theme';
import { usePms } from '@/hooks/use-pms';
import { pmsPost } from '@/lib/api';
import { prettyStamp, staffStatusLabel } from '@/lib/format';

type Employee = {
  id: number;
  full_name: string;
  email: string;
  phone?: string | null;
  role: string;
  status: string;
  photo?: string | null;
  last_login?: string | null;
  created_at?: string;
};

type Payload = { items: Employee[] };

type FormState = {
  id?: number;
  full_name: string;
  email: string;
  phone: string;
  role: string;
  password: string;
};

const ROLE_OPTIONS = [
  { id: 'receptionist', label: 'Réception' },
  { id: 'manager', label: 'Gérance' },
  { id: 'housekeeping', label: 'Sales' },
  { id: 'restaurant', label: 'Restaurant' },
];

const emptyForm: FormState = {
  full_name: '',
  email: '',
  phone: '',
  role: 'receptionist',
  password: '',
};

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export default function StaffScreen() {
  const { data, error, loading, reload, token, user, ready } = usePms<Payload>('employees');
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [form, setForm] = useState<FormState | null>(null);
  const [pendingBan, setPendingBan] = useState<Employee | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isOwner = user?.role === 'owner';
  const isDesktop = width >= Breakpoints.desktop;
  const tableMin = 980;
  const items = useMemo(() => data?.items ?? [], [data?.items]);

  const visible = useMemo(() => {
    return items.filter((item) => {
      const hay = `${item.full_name} ${item.email} ${item.phone ?? ''} ${item.role}`.toLowerCase();
      if (query.trim() && !hay.includes(query.trim().toLowerCase())) return false;
      if (roleFilter !== 'all' && item.role !== roleFilter) return false;
      return true;
    });
  }, [items, query, roleFilter]);

  function openCreate() {
    setFormError(null);
    setForm({ ...emptyForm });
  }

  function openEdit(item: Employee) {
    setFormError(null);
    setForm({
      id: item.id,
      full_name: item.full_name,
      email: item.email,
      phone: item.phone || '',
      role: item.role === 'owner' ? 'manager' : item.role,
      password: '',
    });
  }

  function canAct(item: Employee) {
    return item.id !== user?.id && item.role !== 'owner';
  }

  async function save() {
    if (!token || !form || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      if (form.id) {
        await pmsPost(token, 'employees/update', {
          id: form.id,
          full_name: form.full_name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          role: form.role,
          password: form.password,
        });
      } else {
        await pmsPost(token, 'employees', {
          full_name: form.full_name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          role: form.role,
          password: form.password,
        });
      }
      setForm(null);
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  async function applyBan() {
    if (!token || !pendingBan) return;
    const banned = pendingBan.status === 'banni';
    await pmsPost(token, banned ? 'employees/unban' : 'employees/ban', { id: pendingBan.id });
    setPendingBan(null);
    await reload();
  }

  if (ready && !user) return <Redirect href="/welcome" />;
  if (ready && !isOwner) return <Redirect href="/home" />;

  return (
    <HotelShell
      title="Personnel"
      loading={loading && !data}
      error={error}
      right={<GoldBtn compact icon="plus" label="Ajouter" onPress={openCreate} />}>
      <FilterBar
        query={query}
        onQuery={setQuery}
        queryPlaceholder="Rechercher un employé..."
        category={roleFilter}
        onCategory={setRoleFilter}
        categories={[{ id: 'all', label: 'Tous les rôles' }, ...ROLE_OPTIONS]}
      />

      <ScrollView horizontal={!isDesktop} showsHorizontalScrollIndicator={!isDesktop}>
        <View style={[styles.table, { minWidth: isDesktop ? '100%' : tableMin, width: isDesktop ? '100%' : tableMin }]}>
          <View style={[styles.tr, styles.th]}>
            <Text style={[styles.td, styles.colName, styles.thText]}>Nom</Text>
            <Text style={[styles.td, styles.colRole, styles.thText]}>Rôle</Text>
            <Text style={[styles.td, styles.colMail, styles.thText]}>E-mail</Text>
            <Text style={[styles.td, styles.colPhone, styles.thText]}>Téléphone</Text>
            <Text style={[styles.td, styles.colStatus, styles.thText]}>Statut</Text>
            <View style={[styles.td, styles.colActions]} />
          </View>
          {visible.map((item, index) => {
            const banned = item.status === 'banni';
            const locked = !canAct(item);
            return (
              <View key={item.id} style={[styles.tr, index % 2 ? styles.trAlt : null, banned && styles.trUrgent]}>
                <View style={[styles.td, styles.colName, styles.nameCell]}>
                  <View style={styles.thumbEmpty}>
                    <Text style={styles.thumbText}>{initials(item.full_name)}</Text>
                  </View>
                  <View style={styles.nameCopy}>
                    <Text style={styles.name} numberOfLines={1}>{item.full_name}</Text>
                    <Text style={styles.lot} numberOfLines={1}>
                      {banned
                        ? 'Compte banni'
                        : item.last_login
                          ? `Connexion ${prettyStamp(item.last_login)}`
                          : 'Jamais connecté'}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.td, styles.colRole, styles.cellText]} numberOfLines={1}>
                  {ROLE_LABEL[item.role as StaffRole] ?? item.role}
                </Text>
                <Text style={[styles.td, styles.colMail, styles.cellText]} numberOfLines={1}>{item.email}</Text>
                <Text style={[styles.td, styles.colPhone, styles.cellText]} numberOfLines={1}>{item.phone || '—'}</Text>
                <Text style={[styles.td, styles.colStatus, styles.cellText]} numberOfLines={1}>
                  {staffStatusLabel[item.status] ?? item.status}
                </Text>
                <View style={[styles.td, styles.colActions, styles.actionRow]}>
                  {locked ? (
                    <Text style={styles.locked}>—</Text>
                  ) : (
                    <>
                      <Pressable style={styles.iconBtn} onPress={() => openEdit(item)}>
                        <AppIcon name="edit" size={15} color={Palette.ink} />
                      </Pressable>
                      <Pressable style={styles.iconBtn} onPress={() => setPendingBan(item)}>
                        <AppIcon name={banned ? 'show' : 'hide'} size={15} color={Palette.ink} />
                      </Pressable>
                    </>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
      {!visible.length ? <Text style={styles.empty}>Aucun employé ne correspond.</Text> : null}

      <ConfirmDialog
        visible={!!form}
        title={form?.id ? 'Modifier l’employé' : 'Nouvel employé'}
        message={form?.id ? 'Mettez à jour le rôle, les coordonnées ou le mot de passe.' : 'Créez un compte d’accès avec un rôle défini.'}
        confirmLabel={saving ? 'Enregistrement…' : form?.id ? 'Enregistrer' : 'Créer'}
        confirmIcon="check-circle"
        confirmVariant="gold"
        onCancel={() => { setForm(null); setFormError(null); }}
        onConfirm={() => void save()}>
        {formError ? <Text style={styles.formError}>{formError}</Text> : null}
        {form ? (
          <View style={styles.fields}>
            <View style={styles.fieldWide}>
              <Text style={styles.label}>Nom complet</Text>
              <TextInput value={form.full_name} onChangeText={(full_name) => setForm({ ...form, full_name })} placeholder="Nom et prénom" style={styles.input} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>E-mail</Text>
              <TextInput
                value={form.email}
                onChangeText={(email) => setForm({ ...form, email })}
                placeholder="employe@gmail.com"
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.input}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Téléphone</Text>
              <TextInput value={form.phone} onChangeText={(phone) => setForm({ ...form, phone })} placeholder="Optionnel" keyboardType="phone-pad" style={styles.input} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Rôle</Text>
              <FilterSelect value={form.role} onChange={(role) => setForm({ ...form, role })} options={ROLE_OPTIONS} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>{form.id ? 'Nouveau mot de passe' : 'Mot de passe'}</Text>
              <TextInput
                value={form.password}
                onChangeText={(password) => setForm({ ...form, password })}
                placeholder={form.id ? 'Laisser vide pour conserver' : '8 caractères min.'}
                secureTextEntry
                style={styles.input}
              />
            </View>
          </View>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        visible={!!pendingBan}
        title={pendingBan?.status === 'banni' ? 'Réactiver l’employé' : 'Bannir l’employé'}
        message={
          pendingBan?.status === 'banni'
            ? `Réactiver ${pendingBan?.full_name ?? ''} ? Il pourra à nouveau se connecter.`
            : `Bannir ${pendingBan?.full_name ?? ''} ? Il ne pourra plus se connecter. Ses données restent conservées.`
        }
        confirmLabel={pendingBan?.status === 'banni' ? 'Réactiver' : 'Bannir'}
        confirmIcon={pendingBan?.status === 'banni' ? 'check-circle' : 'hide'}
        confirmVariant={pendingBan?.status === 'banni' ? 'gold' : 'ink'}
        onCancel={() => setPendingBan(null)}
        onConfirm={() => void applyBan()}
      />

    </HotelShell>
  );
}

const styles = StyleSheet.create({
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
  colName: { flex: 1.5, minWidth: 180 },
  colRole: { width: 110 },
  colMail: { flex: 1.2, minWidth: 160 },
  colPhone: { width: 130 },
  colStatus: { width: 88 },
  colActions: { width: 128 },
  nameCell: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumbEmpty: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbText: { color: Palette.ink, fontWeight: '800', fontSize: 11 },
  nameCopy: { flex: 1, minWidth: 0 },
  name: { color: Palette.ink, fontWeight: '800', fontSize: 14 },
  lot: { color: Palette.ink, opacity: 0.5, fontSize: 11, marginTop: 1 },
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
  locked: { color: Palette.ink, opacity: 0.35, fontWeight: '800' },
  empty: { color: Palette.ink, opacity: 0.6, marginTop: 8 },
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
