import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Text, TextInput } from 'react-native';

import { HotelShell, StatusBadge } from '@/components/hotel/hotel-shell';
import { Chips, GoldBtn, Line, Panel } from '@/components/hotel/kit';
import { Palette } from '@/constants/theme';
import { usePms } from '@/hooks/use-pms';
import { pmsPost } from '@/lib/api';
import { money } from '@/lib/format';

type Fin = {
  sessions: Array<{
    register: string;
    cashier: string;
    opened_at: string;
    closed_at: string | null;
    opening_float: number;
    closing_amount: number | null;
    status: string;
  }>;
  lines: Array<{ type: string; label: string; amount: number; at: string }>;
  deposits: Array<{ guest_name: string; amount: number; status: string; at: string }>;
  allocations: Array<{ label: string; amount: number; period: string; method: string; target: string }>;
  invoices: Array<{ guest_name: string; amount: number; status: string; label: string }>;
};

export default function FinanceScreen() {
  const { data, error, loading, reload, token, user, ready } = usePms<Fin>('finance');
  const [tab, setTab] = useState('caisse');
  const [label, setLabel] = useState('Achat fournitures');
  const [amount, setAmount] = useState('15000');
  if (ready && !user) return <Redirect href="/welcome" />;

  return (
    <HotelShell
      back
      title="Finance"
      loading={loading}
      error={error}>
      <Chips
        value={tab}
        onChange={setTab}
        options={[
          { id: 'caisse', label: 'Caisses' },
          { id: 'brouillard', label: 'Brouillard' },
          { id: 'arrhes', label: 'Arrhes / dépôts' },
          { id: 'charges', label: 'Répartition charges' },
          { id: 'impayes', label: 'Clients insolvables' },
        ]}
      />
      {tab === 'caisse'
        ? data?.sessions.map((s) => (
            <Panel key={s.opened_at + s.register}>
              <Line
                icon="wallet"
                title={`${s.register} · ${s.cashier}`}
                meta={`Ouverte ${s.opened_at} · fond ${money(s.opening_float)}`}
                right={<StatusBadge label={s.status} tone={s.status === 'ouverte' ? 'gold' : 'muted'} />}
              />
              {s.closing_amount != null ? <Text style={{ color: Palette.ink }}>Clôture {money(s.closing_amount)}</Text> : null}
            </Panel>
          ))
        : null}
      {tab === 'brouillard' ? (
        <>
          <Panel>
            <Text style={{ color: Palette.ink, fontWeight: '800' }}>Enregistrer une dépense</Text>
            <TextInput value={label} onChangeText={setLabel} style={input} />
            <TextInput value={amount} onChangeText={setAmount} keyboardType="numeric" style={input} />
            <GoldBtn
              label="Comptabiliser"
              onPress={() => {
                if (!token) return;
                void pmsPost(token, 'cash/expense', { label, amount: Number(amount) })
                  .then(reload)
                  .catch((err) => {
                    const message = err instanceof Error ? err.message : 'Erreur';
                    if (Platform.OS === 'web') globalThis.alert(message);
                    else Alert.alert(message);
                  });
              }}
            />
          </Panel>
          {data?.lines.map((l) => (
            <Panel key={l.at + l.label}>
              <Line icon="receipt" title={`${l.type} · ${l.label}`} meta={l.at} right={<Text style={{ color: Palette.gold, fontWeight: '800' }}>{money(l.amount)}</Text>} />
            </Panel>
          ))}
        </>
      ) : null}
      {tab === 'arrhes'
        ? data?.deposits.map((d) => (
            <Panel key={d.at + d.guest_name}>
              <Line icon="lock-alt" title={`${d.guest_name} · ${money(d.amount)}`} meta={`${d.status} · ${d.at}`} />
            </Panel>
          ))
        : null}
      {tab === 'charges'
        ? data?.allocations.map((a) => (
            <Panel key={a.label}>
              <Line icon="bar-chart-alt-2" title={`${a.label} · ${money(a.amount)}`} meta={`${a.period} · ${a.method} · ${a.target}`} />
            </Panel>
          ))
        : null}
      {tab === 'impayes'
        ? data?.invoices
            .filter((i) => i.status !== 'payee')
            .map((i) => (
              <Panel key={i.label}>
                <Line icon="error-circle" title={`${i.guest_name} · ${money(i.amount)}`} meta={i.label} />
              </Panel>
            ))
        : null}
    </HotelShell>
  );
}

const input = {
  borderWidth: 1,
  borderColor: Palette.ink,
  borderRadius: 12,
  paddingHorizontal: 12,
  paddingVertical: 10,
  color: Palette.ink,
};
