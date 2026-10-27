import { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { AppIcon } from '@/components/box-icon';
import { PhotoCropModal } from '@/components/profile/photo-crop-modal';
import { UserAvatar } from '@/components/profile/user-avatar';
import { Palette } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

const MONTHS = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

function formatDate(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return value.slice(0, 10).split('-').reverse().join('/');
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return formatDate(value);
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${formatDate(value)} ${hh}:${min}`;
}

function monthCells(year: number, month: number, createdAt?: string | null) {
  const first = new Date(year, month, 1);
  const startWeekday = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const created = createdAt ? new Date(createdAt.replace(' ', 'T')) : today;
  const cells: Array<{ day: number | null; present: boolean; today: boolean }> = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push({ day: null, present: false, today: false });
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    const isToday =
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate();
    const afterJoin = date >= new Date(created.getFullYear(), created.getMonth(), created.getDate());
    const pastOrToday = date <= today;
    const recent = (today.getTime() - date.getTime()) / 86400000 <= 8;
    cells.push({
      day,
      present: afterJoin && pastOrToday && (recent || isToday),
      today: isToday,
    });
  }
  return cells;
}

type ModalKind = 'name' | 'password' | null;

export function ProfilePanel({ onClose, embed }: { onClose: () => void; embed?: boolean }) {
  const router = useRouter();
  const { user, logout, updateProfile, updatePassword } = useAuth();
  const [cursor, setCursor] = useState(() => new Date());
  const [modal, setModal] = useState<ModalKind>(null);
  const [name, setName] = useState(user?.full_name ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cropUri, setCropUri] = useState<string | null>(null);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const cells = useMemo(() => monthCells(year, month, user?.created_at), [year, month, user?.created_at]);

  function notify(message: string) {
    if (Platform.OS === 'web') globalThis.alert(message);
    else Alert.alert(message);
  }

  async function pickPhoto() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.9,
      });
      if (result.canceled || !result.assets[0]?.uri) return;
      setCropUri(result.assets[0].uri);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Impossible de choisir une photo.');
    }
  }

  async function saveCroppedPhoto(photo: string) {
    await updateProfile({ photo });
    setCropUri(null);
  }

  async function saveName() {
    setBusy(true);
    setError(null);
    try {
      await updateProfile({ full_name: name.trim() });
      setModal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function savePassword() {
    setError(null);
    if (newPassword.length < 8) {
      setError('Minimum 8 caractères.');
      return;
    }
    if (newPassword !== confirm) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    setBusy(true);
    try {
      await updatePassword({ current_password: currentPassword, new_password: newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
      setModal(null);
      notify('Mot de passe modifié.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.panel}>
      <SafeAreaView edges={embed ? [] : ['top']} style={styles.header}>
        <View>
          <Text style={styles.kicker}>Compte</Text>
          <Text style={styles.headerTitle}>Mon espace</Text>
        </View>
        <Pressable onPress={onClose} hitSlop={8}>
          <AppIcon name="x-circle" size={22} color={Palette.ink} />
        </Pressable>
      </SafeAreaView>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.avatarWrap}>
            <UserAvatar name={user?.full_name} photo={user?.photo} size={64} />
            <Pressable onPress={() => void pickPhoto()} style={styles.cam}>
              <AppIcon name="plus" size={14} color={Palette.white} />
            </Pressable>
          </View>
          <Text style={styles.name}>{user?.full_name}</Text>
          <Text style={styles.mail}>{user?.email}</Text>
          <View style={styles.badges}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Compte</Text>
            </View>
            <View style={[styles.badge, styles.badgeAlt]}>
              <Text style={styles.badgeTextAlt}>Actif</Text>
            </View>
          </View>
        </View>

        <View style={[styles.card, styles.block]}>
          <View style={styles.sectionRow}>
            <AppIcon name="bar-chart-alt-2" size={16} color={Palette.gold} />
            <Text style={styles.section}>Activité</Text>
          </View>
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Membre depuis</Text>
              <Text style={styles.statValue}>{formatDate(user?.created_at)}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Dernière connexion</Text>
              <Text style={styles.statValue}>{formatDateTime(user?.last_login)}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.card, styles.block]}>
          <View style={styles.sectionRow}>
            <AppIcon name="calendar" size={16} color={Palette.gold} />
            <Text style={styles.section}>Jours de visite</Text>
          </View>
          <View style={styles.calHead}>
            <Pressable onPress={() => setCursor(new Date(year, month - 1, 1))}>
              <AppIcon name="chevron-left" size={20} color={Palette.ink} />
            </Pressable>
            <Text style={styles.calTitle}>
              {MONTHS[month]} {year}
            </Text>
            <Pressable onPress={() => setCursor(new Date(year, month + 1, 1))}>
              <AppIcon name="chevron-right" size={20} color={Palette.ink} />
            </Pressable>
          </View>
          <View style={styles.legend}>
            <View style={[styles.dot, { backgroundColor: 'rgba(212,175,55,0.45)' }]} />
            <Text style={styles.legendText}>Présent</Text>
            <View style={[styles.dot, { backgroundColor: 'rgba(20,22,34,0.28)' }]} />
            <Text style={styles.legendText}>Absent</Text>
          </View>
          <View style={styles.week}>
            {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => (
              <Text key={d} style={styles.weekDay}>
                {d}
              </Text>
            ))}
          </View>
          <View style={styles.grid}>
            {cells.map((cell, index) => (
              <View key={index} style={styles.cellSlot}>
                {cell.day ? (
                  <View
                    style={[
                      styles.day,
                      { backgroundColor: cell.present ? Palette.gold : Palette.ink },
                      cell.today && styles.today,
                    ]}>
                    <Text style={[styles.dayText, { color: cell.present ? Palette.ink : Palette.white }]}>
                      {cell.day}
                    </Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.card, styles.block]}>
          <View style={styles.sectionRow}>
            <AppIcon name="cog" size={16} color={Palette.gold} />
            <Text style={styles.section}>Paramètres du compte</Text>
          </View>
          <Pressable
            style={styles.row}
            onPress={() => {
              setName(user?.full_name ?? '');
              setError(null);
              setModal('name');
            }}>
            <AppIcon name="edit" size={18} color={Palette.gold} />
            <View style={styles.rowCopy}>
              <Text style={styles.rowLabel}>Nom affiché</Text>
              <Text style={styles.rowValue}>{user?.full_name}</Text>
            </View>
            <AppIcon name="chevron-right" size={18} color={Palette.ink} />
          </Pressable>
          <View style={styles.row}>
            <AppIcon name="envelope" size={18} color={Palette.gold} />
            <View style={styles.rowCopy}>
              <Text style={styles.rowLabel}>Adresse e-mail</Text>
              <Text style={styles.rowValue}>{user?.email}</Text>
            </View>
          </View>
          <Pressable
            style={[styles.row, styles.rowLast]}
            onPress={() => {
              setCurrentPassword('');
              setNewPassword('');
              setConfirm('');
              setError(null);
              setModal('password');
            }}>
            <AppIcon name="lock-alt" size={18} color={Palette.gold} />
            <View style={styles.rowCopy}>
              <Text style={styles.rowLabel}>Mot de passe</Text>
              <Text style={styles.rowValue}>Modifier en toute sécurité</Text>
            </View>
            <AppIcon name="chevron-right" size={18} color={Palette.ink} />
          </Pressable>
        </View>

      </ScrollView>

      <SafeAreaView edges={embed ? [] : ['bottom']} style={styles.footer}>
        <Pressable onPress={onClose} style={styles.ghost}>
          <Text style={styles.ghostText}>Fermer</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            void (async () => {
              onClose();
              await logout();
              router.replace('/welcome');
            })();
          }}
          style={styles.logout}>
          <AppIcon name="log-out" size={16} color={Palette.ink} />
          <Text style={styles.logoutText}>Déconnexion</Text>
        </Pressable>
      </SafeAreaView>

      {cropUri ? (
        <PhotoCropModal uri={cropUri} onCancel={() => setCropUri(null)} onSave={saveCroppedPhoto} />
      ) : null}

      <Modal visible={modal !== null} transparent animationType="fade" onRequestClose={() => setModal(null)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>
              {modal === 'name' ? 'Nom affiché' : 'Sécurité du compte'}
            </Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {modal === 'name' ? (
              <TextInput value={name} onChangeText={setName} style={styles.input} placeholder="Nom" />
            ) : null}
            {modal === 'password' ? (
              <>
                <TextInput
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  secureTextEntry
                  style={styles.input}
                  placeholder="Ancien mot de passe"
                />
                <TextInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                  style={styles.input}
                  placeholder="Nouveau mot de passe"
                />
                <TextInput
                  value={confirm}
                  onChangeText={setConfirm}
                  secureTextEntry
                  style={styles.input}
                  placeholder="Confirmation"
                />
              </>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable onPress={() => setModal(null)} style={styles.cancel}>
                <Text style={styles.cancelText}>Annuler</Text>
              </Pressable>
              <Pressable
                disabled={busy}
                onPress={() => {
                  if (modal === 'name') void saveName();
                  if (modal === 'password') void savePassword();
                }}
                style={styles.save}>
                <Text style={styles.saveText}>Enregistrer</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    backgroundColor: Palette.white,
  },
  scroll: {
    flex: 1,
  },
  header: {
    backgroundColor: Palette.gold,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  kicker: {
    color: Palette.ink,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    lineHeight: 14,
  },
  headerTitle: {
    color: Palette.ink,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 20,
  },
  body: {
    padding: 16,
    gap: 12,
    paddingBottom: 32,
  },
  card: {
    borderWidth: 1,
    borderColor: 'rgba(20,22,34,0.08)',
    borderRadius: 18,
    padding: 16,
    backgroundColor: Palette.white,
    alignItems: 'center',
  },
  block: {
    alignItems: 'stretch',
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  avatarWrap: {
    marginBottom: 10,
  },
  cam: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Palette.white,
  },
  name: {
    color: Palette.ink,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },
  mail: {
    color: Palette.ink,
    opacity: 0.6,
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
  },
  badges: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  badge: {
    backgroundColor: Palette.gold,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeAlt: {
    backgroundColor: Palette.white,
    borderWidth: 1,
    borderColor: Palette.gold,
  },
  badgeText: {
    color: Palette.ink,
    fontWeight: '800',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  badgeTextAlt: {
    color: Palette.gold,
    fontWeight: '800',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  section: {
    color: Palette.ink,
    fontWeight: '800',
    fontSize: 12,
    lineHeight: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  stats: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  stat: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(20,22,34,0.08)',
    borderRadius: 12,
    padding: 10,
  },
  statLabel: {
    color: Palette.ink,
    opacity: 0.5,
    fontSize: 11,
  },
  statValue: {
    color: Palette.ink,
    fontWeight: '800',
    marginTop: 4,
    fontSize: 13,
    lineHeight: 16,
  },
  calHead: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  calTitle: {
    color: Palette.ink,
    fontWeight: '800',
    fontSize: 14,
    lineHeight: 18,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: Palette.ink,
    fontSize: 11,
    marginRight: 8,
  },
  week: {
    width: '100%',
    flexDirection: 'row',
  },
  weekDay: {
    width: '14.28%',
    textAlign: 'center',
    color: Palette.ink,
    opacity: 0.45,
    fontSize: 10,
    fontWeight: '700',
  },
  grid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cellSlot: {
    width: '14.28%',
    aspectRatio: 1,
    padding: 3,
  },
  day: {
    flex: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  today: {
    borderWidth: 2,
    borderColor: Palette.gold,
  },
  dayText: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '700',
  },
  row: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(20,22,34,0.06)',
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowCopy: {
    flex: 1,
  },
  rowLabel: {
    color: Palette.ink,
    opacity: 0.45,
    fontSize: 11,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  rowValue: {
    color: Palette.ink,
    fontWeight: '700',
    marginTop: 2,
    fontSize: 14,
    lineHeight: 18,
  },
  logout: {
    flex: 1,
    backgroundColor: Palette.gold,
    borderRadius: 12,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  logoutText: {
    color: Palette.ink,
    fontWeight: '800',
    fontSize: 14,
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(20,22,34,0.06)',
  },
  ghost: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.white,
  },
  ghostText: {
    color: Palette.ink,
    fontWeight: '800',
    fontSize: 14,
    lineHeight: 18,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(20,22,34,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modal: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: Palette.white,
    borderRadius: 22,
    padding: 20,
    gap: 10,
  },
  modalTitle: {
    color: Palette.ink,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  error: {
    color: Palette.ink,
    fontSize: 13,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: Palette.ink,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: Palette.ink,
    fontSize: 14,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  cancel: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    color: Palette.ink,
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 18,
  },
  save: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: {
    color: Palette.ink,
    fontWeight: '800',
    fontSize: 14,
    lineHeight: 18,
  },
});
