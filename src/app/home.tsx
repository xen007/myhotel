import { Redirect, useRouter, type Href } from 'expo-router';
import { isStaffRole } from '@/constants/roles';
import { useAuth } from '@/context/auth-context';
import { HotelShell } from '@/components/hotel/hotel-shell';
import { GoldBtn } from '@/components/hotel/kit';
import { RoleDashboard, type DashPayload } from '@/components/hotel/role-dashboard';
import { pmsGet } from '@/lib/api';
import { money } from '@/lib/format';
import { deliverPdf } from '@/lib/pdf';
import { Palette } from '@/constants/theme';
import { AppBar } from '@/components/nav/app-bar';
import { RightDrawer } from '@/components/nav/right-drawer';
import { NotificationsPanel } from '@/components/profile/notifications-panel';
import { ProfilePanel } from '@/components/profile/profile-panel';
import { useNotifications } from '@/hooks/use-notifications';
import { usePms } from '@/hooks/use-pms';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Drawer = 'profile' | 'notifications' | null;

export default function HomeScreen() {
  const { user, ready } = useAuth();

  if (ready && !user) return <Redirect href="/welcome" />;
  if (ready && user && isStaffRole(user.role)) {
    return <StaffHome />;
  }
  return <ClientHome />;
}

function StaffHome() {
  const { user, token } = useAuth();
  const { data, error, loading } = usePms<DashPayload>('dashboard');
  const receptionist = user?.role === 'receptionist';
  return (
    <HotelShell
      title="Tableau de bord"
      loading={loading && !data}
      error={error}
      right={
        receptionist && token ? (
          <GoldBtn
            tiny
            icon="download"
            label="Mon rapport"
            onPress={() => void downloadReceptionDay(token, user?.full_name || 'Réception')}
          />
        ) : null
      }>
      {data ? <RoleDashboard data={data} role={user?.role} name={user?.full_name} /> : null}
    </HotelShell>
  );
}

async function downloadReceptionDay(token: string, name: string) {
  const today = new Date().toISOString().slice(0, 10);
  const [pos, office] = await Promise.all([
    pmsGet<{
      sales: {
        id: number;
        seller?: string | null;
        guest_name?: string | null;
        room_number?: string | null;
        total: number;
        at: string;
      }[];
    }>(token, 'pos'),
    pmsGet<{
      reservations: {
        guest_name: string;
        room_number: string;
        room_type?: string;
        check_in: string;
        check_out: string;
        status: string;
        total: number;
      }[];
    }>(token, 'front-office'),
  ]);
  const sales = (pos.sales || []).filter(
    (row) => (row.seller || '') === name && String(row.at || '').slice(0, 10) === today,
  );
  const stays = (office.reservations || []).filter((row) => {
    const arrival = String(row.check_in).slice(0, 10);
    const departure = String(row.check_out).slice(0, 10);
    return arrival === today || departure === today || row.status === 'en_cours';
  });
  const lines = [
    `Réceptionniste : ${name}`,
    `Journée : ${today}`,
    '',
    'Mes ventes',
    ...(sales.length
      ? sales.map(
          (row) =>
            `FAC-${String(row.id).padStart(5, '0')} · ${row.guest_name || 'Comptant'} · ch. ${row.room_number || '—'} · ${money(row.total)}`,
        )
      : ['Aucune vente enregistrée à votre nom aujourd’hui.']),
    '',
    'Séjours du jour',
    ...(stays.length
      ? stays.map(
          (row) =>
            `${row.guest_name} · ch. ${row.room_number}${row.room_type ? ` (${row.room_type})` : ''} · ${String(row.check_in).slice(0, 10)} → ${String(row.check_out).slice(0, 10)} · ${row.status} · ${money(row.total)}`,
        )
      : ['Aucun séjour à signaler.']),
  ];
  await deliverPdf(`rapport-${today}.pdf`, `Rapport journalier — ${name}`, lines, 'download');
}

function ClientHome() {
  const router = useRouter();
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [panel, setPanel] = useState<Exclude<Drawer, null>>('profile');
  const { items, unread, reload, mark, markAll } = useNotifications();

  return (
    <View style={styles.client}>
      <StatusBar style="dark" />
      <SafeAreaView edges={['top']} style={{ backgroundColor: Palette.white }}>
        <AppBar
          unread={unread}
          onNotifications={() => {
            void reload();
            setPanel('notifications');
            setDrawer((c) => (c === 'notifications' ? null : 'notifications'));
          }}
          onProfile={() => {
            setPanel('profile');
            setDrawer((c) => (c === 'profile' ? null : 'profile'));
          }}
          notificationsOpen={drawer === 'notifications'}
          profileOpen={drawer === 'profile'}
        />
      </SafeAreaView>
      <RightDrawer open={drawer !== null} onClose={() => setDrawer(null)}>
          {panel === 'notifications' ? (
            <NotificationsPanel
              items={items}
              unread={unread}
              onClose={() => setDrawer(null)}
              onRead={(id) => void mark(id)}
              onReadAll={() => void markAll()}
              onOpen={(href) => {
                setDrawer(null);
                if (href) router.push(href as Href);
              }}
            />
          ) : (
            <ProfilePanel onClose={() => setDrawer(null)} />
          )}
        </RightDrawer>
    </View>
  );
}

const styles = StyleSheet.create({
  client: { flex: 1, backgroundColor: Palette.white },
});
