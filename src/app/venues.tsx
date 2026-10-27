import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { HotelShell, StatusBadge } from '@/components/hotel/hotel-shell';
import { Chips, Line, Panel } from '@/components/hotel/kit';
import { Palette } from '@/constants/theme';
import { usePms } from '@/hooks/use-pms';
import { money } from '@/lib/format';

type Venues = {
  venues: Array<{ name: string; type: string; area_m2: number; rate: number; status: string }>;
  bookings: Array<{
    venue_name: string;
    area_m2: number;
    client_name: string;
    start_at: string;
    status: string;
    amount: number;
    paid: number;
    currency: string;
  }>;
  payments: Array<{ amount: number; currency: string; at: string; method: string; booking_id: number }>;
};

export default function VenuesScreen() {
  const { data, error, loading, user, ready } = usePms<Venues>('venues');
  const [tab, setTab] = useState('espaces');
  if (ready && !user) return <Redirect href="/welcome" />;

  return (
    <HotelShell
      back
      title="Location des salles"
      loading={loading}
      error={error}>
      <Chips
        value={tab}
        onChange={setTab}
        options={[
          { id: 'espaces', label: 'Espaces' },
          { id: 'dossiers', label: 'Proformas / factures' },
          { id: 'reglements', label: 'Règlements' },
        ]}
      />
      {tab === 'espaces'
        ? data?.venues.map((v) => (
            <Panel key={v.name}>
              <Line
                icon="building"
                title={`${v.name} · ${v.area_m2} m²`}
                meta={`${v.type} · ${money(v.rate)}`}
                right={<StatusBadge label={v.status} tone={v.status === 'disponible' ? 'gold' : 'ink'} />}
              />
            </Panel>
          ))
        : null}
      {tab === 'dossiers'
        ? data?.bookings.map((b) => (
            <Panel key={b.client_name + b.start_at}>
              <Line
                icon="receipt"
                title={`${b.client_name} · ${b.venue_name}`}
                meta={`${b.start_at} · ${b.currency} · payé ${money(b.paid)} / ${money(b.amount)}`}
                right={<StatusBadge label={b.status} tone={b.status === 'paye' ? 'gold' : 'ink'} />}
              />
            </Panel>
          ))
        : null}
      {tab === 'reglements'
        ? data?.payments.map((p) => (
            <Panel key={p.at + p.amount}>
              <Line icon="wallet" title={`${p.method} · ${p.currency} ${p.amount}`} meta={p.at} />
            </Panel>
          ))
        : null}
      <Text style={{ color: Palette.white, opacity: 0.65 }}>Les règlements peuvent se faire en plusieurs tranches et devises (XAF, EUR…).</Text>
    </HotelShell>
  );
}
