import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/box-icon';
import { HotelShell, StatusBadge } from '@/components/hotel/hotel-shell';
import { Palette, Radius } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { invoicesRequest, type Invoice } from '@/lib/api';
import { invoiceStatusLabel, money } from '@/lib/format';

function tone(status: string): 'gold' | 'ink' | 'muted' {
  if (status === 'payee') return 'gold';
  if (status === 'en_attente') return 'ink';
  return 'muted';
}

export default function BillingScreen() {
  const { user, ready, token } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await invoicesRequest(token);
        if (!cancelled) setInvoices(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Chargement impossible.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (ready && !user) return <Redirect href="/welcome" />;

  return (
    <HotelShell back title="Facturation" loading={loading} error={error}>
      {invoices.map((invoice) => (
        <View key={invoice.id} style={styles.card}>
          <View style={styles.row}>
            <View style={styles.icon}>
              <AppIcon name="receipt" size={20} color={Palette.ink} />
            </View>
            <View style={styles.body}>
              <Text style={styles.name}>{invoice.guest_name}</Text>
              <Text style={styles.meta}>
                {invoice.label} · {invoice.issued_at}
              </Text>
            </View>
            <View style={styles.right}>
              <Text style={styles.amount}>{money(invoice.amount)}</Text>
              <StatusBadge label={invoiceStatusLabel[invoice.status] ?? invoice.status} tone={tone(invoice.status)} />
            </View>
          </View>
        </View>
      ))}
    </HotelShell>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Palette.white,
    borderRadius: Radius.card,
    padding: 16,
    borderWidth: 1,
    borderColor: Palette.gold,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 4,
  },
  name: {
    color: Palette.ink,
    fontWeight: '800',
  },
  meta: {
    color: Palette.ink,
    opacity: 0.65,
    fontSize: 12,
  },
  right: {
    alignItems: 'flex-end',
    gap: 6,
  },
  amount: {
    color: Palette.gold,
    fontWeight: '800',
  },
});
