import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/box-icon';
import { HotelShell } from '@/components/hotel/hotel-shell';
import { Palette, Radius } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { guestsRequest, type Guest } from '@/lib/api';

export default function GuestsScreen() {
  const { user, ready, token } = useAuth();
  const [guests, setGuests] = useState<Guest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await guestsRequest(token);
        if (!cancelled) setGuests(data);
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
    <HotelShell back title="Clients" loading={loading} error={error}>
      <View style={styles.list}>
        {guests.map((guest) => (
          <View key={guest.id} style={styles.card}>
            <View style={styles.avatar}>
              <AppIcon name="user-circle" size={28} color={Palette.ink} />
            </View>
            <View style={styles.body}>
              <Text style={styles.name}>{guest.full_name}</Text>
              <Text style={styles.meta}>
                {guest.nationality} · {guest.email}
              </Text>
              <Text style={styles.meta}>{guest.phone}</Text>
              {guest.notes ? <Text style={styles.notes}>{guest.notes}</Text> : null}
            </View>
          </View>
        ))}
      </View>
    </HotelShell>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 12,
  },
  card: {
    backgroundColor: Palette.white,
    borderRadius: Radius.card,
    padding: 16,
    flexDirection: 'row',
    gap: 12,
    borderWidth: 1,
    borderColor: Palette.gold,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
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
    fontSize: 16,
  },
  meta: {
    color: Palette.ink,
    opacity: 0.7,
    fontSize: 13,
  },
  notes: {
    color: Palette.ink,
    marginTop: 4,
    fontSize: 13,
  },
});
