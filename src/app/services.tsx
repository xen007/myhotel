import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppIcon, type BoxIconName } from '@/components/box-icon';
import { HotelShell } from '@/components/hotel/hotel-shell';
import { Palette, Radius } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { servicesRequest, type HotelService } from '@/lib/api';
import { money } from '@/lib/format';

export default function ServicesScreen() {
  const { user, ready, token } = useAuth();
  const [services, setServices] = useState<HotelService[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await servicesRequest(token);
        if (!cancelled) setServices(data);
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
    <HotelShell
      back
      title="Services de l’hôtel"
      loading={loading}
      error={error}>
      {services.map((service) => (
        <View key={service.id} style={styles.card}>
          <View style={styles.icon}>
            <AppIcon name={service.icon as BoxIconName} size={22} color={Palette.ink} />
          </View>
          <View style={styles.body}>
            <Text style={styles.name}>{service.name}</Text>
            <Text style={styles.desc}>{service.description}</Text>
          </View>
          <Text style={styles.price}>{service.price > 0 ? money(service.price) : 'Inclus'}</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: Palette.gold,
  },
  icon: {
    width: 46,
    height: 46,
    borderRadius: 14,
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
  desc: {
    color: Palette.ink,
    opacity: 0.7,
    fontSize: 13,
  },
  price: {
    color: Palette.gold,
    fontWeight: '800',
  },
});
