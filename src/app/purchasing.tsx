import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { HotelShell, StatusBadge } from '@/components/hotel/hotel-shell';
import { Chips, Line, Panel } from '@/components/hotel/kit';
import { Palette } from '@/constants/theme';
import { usePms } from '@/hooks/use-pms';
import { money } from '@/lib/format';

type Buy = {
  products: Array<{ name: string; stock: number; min_stock: number; warehouse: string }>;
  to_order: Array<{ name: string; stock: number; min_stock: number }>;
  suppliers: Array<{ name: string; phone: string; email: string }>;
  orders: Array<{
    id: number;
    supplier: string;
    status: string;
    ordered_at: string;
    total: number;
    invoice_ref: string | null;
    paid: number;
  }>;
};

export default function PurchasingScreen() {
  const { data, error, loading, user, ready } = usePms<Buy>('purchasing');
  const [tab, setTab] = useState('seuils');
  if (ready && !user) return <Redirect href="/welcome" />;

  return (
    <HotelShell back title="Gestion des achats" loading={loading} error={error}>
      <Chips
        value={tab}
        onChange={setTab}
        options={[
          { id: 'seuils', label: 'À commander' },
          { id: 'commandes', label: 'Commandes / BL' },
          { id: 'fournisseurs', label: 'Fournisseurs' },
        ]}
      />
      {tab === 'seuils'
        ? data?.to_order.map((p) => (
            <Panel key={p.name}>
              <Line icon="error-circle" title={p.name} meta={`Stock ${p.stock} ≤ seuil ${p.min_stock}`} />
            </Panel>
          ))
        : null}
      {tab === 'commandes'
        ? data?.orders.map((o) => (
            <Panel key={o.id}>
              <Line
                icon="briefcase"
                title={`${o.supplier} · ${money(o.total)}`}
                meta={`${o.ordered_at} · ${o.invoice_ref ?? 'BL non facturé'}`}
                right={<StatusBadge label={o.paid ? 'Payée' : o.status} tone={o.paid ? 'gold' : 'ink'} />}
              />
            </Panel>
          ))
        : null}
      {tab === 'fournisseurs'
        ? data?.suppliers.map((s) => (
            <Panel key={s.name}>
              <Line icon="phone" title={s.name} meta={`${s.phone} · ${s.email}`} />
            </Panel>
          ))
        : null}
      <Text style={{ color: Palette.white, opacity: 0.6, fontSize: 12 }}>
        Un bon de livraison peut être transformé en facture fournisseur, puis réglé.
      </Text>
    </HotelShell>
  );
}
