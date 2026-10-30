import { Redirect } from 'expo-router';
import { isStaffRole } from '@/constants/roles';
import { useAuth } from '@/context/auth-context';
import { HotelShell } from '@/components/hotel/hotel-shell';
import { GoldBtn } from '@/components/hotel/kit';
import { ClientSpace } from '@/components/hotel/client-space';
import { RoleDashboard, type DashPayload } from '@/components/hotel/role-dashboard';
import { pmsGet } from '@/lib/api';
import { money } from '@/lib/format';
import { deliverPdf, type PdfBrand, type PdfTable } from '@/lib/pdf';
import { usePms } from '@/hooks/use-pms';
import { useState } from 'react';

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
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const receptionist = user?.role === 'receptionist';
  return (
    <HotelShell
      title={user?.role === 'restaurant' ? 'Accueil' : 'Tableau de bord'}
      loading={loading && !data}
      error={error || reportError}
      right={
        receptionist && token ? (
          <GoldBtn
            tiny
            icon="download"
            label={reportBusy ? 'Préparation…' : 'Mon rapport'}
            onPress={() => {
              setReportBusy(true);
              setReportError(null);
              void downloadReceptionDay(token, user?.full_name || 'Réception')
                .catch((err) => setReportError(err instanceof Error ? err.message : 'Le rapport n’a pas pu être préparé.'))
                .finally(() => setReportBusy(false));
            }}
          />
        ) : null
      }>
      {data ? <RoleDashboard data={data} role={user?.role} name={user?.full_name} /> : null}
    </HotelShell>
  );
}

async function downloadReceptionDay(token: string, name: string) {
  const [day, company] = await Promise.all([
    pmsGet<{
      date: string;
      stays: {
        guest_name: string;
        room_number: string;
        room_type?: string;
        check_in: string;
        check_out: string;
        status: string;
        total: number;
      }[];
      sales: { id: number; seller?: string | null; guest_name?: string | null; room_number?: string | null; total: number }[];
      mine: { id: number; guest_name?: string | null; room_number?: string | null; total: number }[];
    }>(token, 'reports/reception'),
    pmsGet<PdfBrand>(token, 'company').catch(() => undefined),
  ]);
  const mine = day.mine || [];
  const sales = mine.length ? mine : day.sales || [];
  const tables: PdfTable[] = [
    {
      title: mine.length ? 'Mes ventes' : 'Ventes du jour',
      columns: ['Facture', 'Client', 'Chambre', 'Montant'],
      widths: [1.2, 2.2, 1, 1.3],
      rows: sales.length
        ? sales.map((row) => [
            `FAC-${String(row.id).padStart(5, '0')}`,
            row.guest_name || 'Comptant',
            row.room_number || '—',
            money(row.total),
          ])
        : [['—', 'Aucune vente', '—', '—']],
    },
    {
      title: 'Séjours du jour',
      columns: ['Client', 'Chambre', 'Type', 'Arrivée', 'Départ', 'Statut', 'Total'],
      widths: [2, 0.9, 1.3, 1.15, 1.15, 1.1, 1.3],
      rows: day.stays?.length
        ? day.stays.map((row) => [
            row.guest_name,
            row.room_number,
            row.room_type || '—',
            String(row.check_in).slice(0, 10),
            String(row.check_out).slice(0, 10),
            row.status,
            money(row.total),
          ])
        : [['Aucun séjour', '—', '—', '—', '—', '—', '—']],
    },
  ];
  await deliverPdf(
    `rapport-${day.date}.pdf`,
    `Rapport journalier — ${name}`,
    [`Réceptionniste : ${name}`, `Journée : ${day.date}`],
    'download',
    company,
    tables,
  );
}

function ClientHome() {
  return (
    <HotelShell title="Accueil" fill>
      <ClientSpace view="rooms" />
    </HotelShell>
  );
}
