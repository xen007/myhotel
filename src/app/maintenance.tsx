import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { HotelShell, StatusBadge } from '@/components/hotel/hotel-shell';
import { Chips, GoldBtn, Line, Panel } from '@/components/hotel/kit';
import { Palette } from '@/constants/theme';
import { usePms } from '@/hooks/use-pms';
import { pmsPost } from '@/lib/api';

type Maint = {
  orders: Array<{
    id: number;
    room_number: string | null;
    title: string;
    nature: string;
    urgency: string;
    status: string;
    assigned_to: string;
    opened_at: string;
    closed_at: string | null;
    validated_by: string | null;
    preventive: number;
    notes: string | null;
  }>;
  history: Array<{ nature: string; n: number }>;
};

export default function MaintenanceScreen() {
  const { data, error, loading, reload, token, user, ready } = usePms<Maint>('maintenance');
  const [tab, setTab] = useState('tickets');
  if (ready && !user) return <Redirect href="/welcome" />;

  return (
    <HotelShell
      back
      title="Service maintenance"
      loading={loading}
      error={error}>
      <Chips
        value={tab}
        onChange={setTab}
        options={[
          { id: 'tickets', label: 'Incidents' },
          { id: 'preventif', label: 'Préventif' },
          { id: 'histo', label: 'Analyse pannes' },
        ]}
      />
      {tab === 'tickets'
        ? data?.orders
            .filter((o) => !o.preventive)
            .map((o) => (
              <Panel key={o.id}>
                <Line
                  icon="cog"
                  title={`${o.room_number ?? 'Commun'} · ${o.title}`}
                  meta={`${o.nature} · ${o.assigned_to} · ${o.opened_at}`}
                  right={<StatusBadge label={o.urgency} tone={o.urgency === 'urgente' ? 'ink' : 'gold'} />}
                />
                {o.notes ? <Text style={{ color: Palette.ink }}>{o.notes}</Text> : null}
                {o.status !== 'clos' && token ? (
                  <GoldBtn
                    label="Clôturer + valider hiérarchie"
                    onPress={() =>
                      void pmsPost(token, 'maintenance/close', {
                        id: o.id,
                        room_number: o.room_number,
                        validated_by: 'Jean-Marc Yao',
                      }).then(reload)
                    }
                  />
                ) : (
                  <Text style={{ color: Palette.ink, opacity: 0.7 }}>Clos {o.closed_at} · {o.validated_by}</Text>
                )}
              </Panel>
            ))
        : null}
      {tab === 'preventif'
        ? data?.orders
            .filter((o) => o.preventive)
            .map((o) => (
              <Panel key={o.id}>
                <Line icon="time" title={o.title} meta={`${o.nature} · prévu ${o.opened_at}`} />
              </Panel>
            ))
        : null}
      {tab === 'histo'
        ? data?.history.map((h) => (
            <Panel key={h.nature}>
              <Line icon="bar-chart-alt-2" title={h.nature} meta={`${h.n} intervention(s)`} />
            </Panel>
          ))
        : null}
    </HotelShell>
  );
}
