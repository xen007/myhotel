import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { HotelShell, StatusBadge } from '@/components/hotel/hotel-shell';
import { Chips, Line, Panel } from '@/components/hotel/kit';
import { Palette } from '@/constants/theme';
import { usePms } from '@/hooks/use-pms';
import { money } from '@/lib/format';

type Assets = {
  assets: Array<{
    id: number;
    name: string;
    kind: string;
    category: string;
    value: number;
    method: string;
    life_years: number;
    assigned_to: string;
    status: string;
    acquired_at: string;
  }>;
  events: Array<{ asset_name: string; type: string; at: string; note: string; amount: number | null }>;
};

function annuity(value: number, years: number, method: string) {
  if (!years) return 0;
  if (method === 'degressif') return Math.round((value * 2) / years);
  return Math.round(value / years);
}

export default function AssetsScreen() {
  const { data, error, loading, user, ready } = usePms<Assets>('assets');
  const [tab, setTab] = useState('fiches');
  if (ready && !user) return <Redirect href="/welcome" />;

  return (
    <HotelShell
      back
      title="Immobilisations"
      loading={loading}
      error={error}>
      <Chips
        value={tab}
        onChange={setTab}
        options={[
          { id: 'fiches', label: 'Fiches' },
          { id: 'amort', label: 'Amortissement' },
          { id: 'suivi', label: 'Suivi' },
        ]}
      />
      {tab === 'fiches'
        ? data?.assets.map((a) => (
            <Panel key={a.id}>
              <Line
                icon="key"
                title={a.name}
                meta={`${a.kind} · ${a.category} · ${a.assigned_to} · acquis ${a.acquired_at}`}
                right={<StatusBadge label={a.status} tone={a.status === 'actif' ? 'gold' : 'muted'} />}
              />
              <Text style={{ color: Palette.gold, fontWeight: '800' }}>{money(a.value)}</Text>
            </Panel>
          ))
        : null}
      {tab === 'amort'
        ? data?.assets.map((a) => (
            <Panel key={a.id}>
              <Line
                icon="bar-chart-alt-2"
                title={a.name}
                meta={`${a.method === 'lineaire' ? 'Linéaire' : 'Dégressif'} · ${a.life_years} ans · dotation ${money(annuity(a.value, a.life_years, a.method))}/an`}
              />
            </Panel>
          ))
        : null}
      {tab === 'suivi'
        ? data?.events.map((e) => (
            <Panel key={e.at + e.asset_name}>
              <Line icon="cog" title={`${e.asset_name} · ${e.type}`} meta={`${e.at} · ${e.note}`} right={e.amount ? <Text style={{ color: Palette.gold, fontWeight: '800' }}>{money(e.amount)}</Text> : null} />
            </Panel>
          ))
        : null}
    </HotelShell>
  );
}
