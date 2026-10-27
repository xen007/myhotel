import { Redirect } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppIcon, type BoxIconName } from '@/components/box-icon';
import { HotelShell } from '@/components/hotel/hotel-shell';
import { Palette, Radius } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { equipmentRequest, type EquipmentItem } from '@/lib/api';

export default function EquipmentScreen() {
  const { user, ready, token } = useAuth();
  const [items, setItems] = useState<EquipmentItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await equipmentRequest(token);
        if (!cancelled) setItems(data);
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

  const groups = useMemo(() => {
    const map = new Map<string, EquipmentItem[]>();
    for (const item of items) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return [...map.entries()];
  }, [items]);

  if (ready && !user) return <Redirect href="/welcome" />;

  return (
    <HotelShell
      back
      title="Équipements & mobilier"
      loading={loading}
      error={error}>
      {groups.map(([category, list]) => (
        <View key={category} style={styles.group}>
          <Text style={styles.category}>{category}</Text>
          {list.map((item) => (
            <View key={item.id} style={styles.row}>
              <View style={styles.icon}>
                <AppIcon name={item.icon as BoxIconName} size={20} color={Palette.ink} />
              </View>
              <View style={styles.copy}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>
                  Stock {item.quantity} · Installé dans {item.rooms_count ?? 0} chambre(s)
                </Text>
              </View>
            </View>
          ))}
        </View>
      ))}
    </HotelShell>
  );
}

const styles = StyleSheet.create({
  group: {
    backgroundColor: Palette.white,
    borderRadius: Radius.card,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: Palette.gold,
  },
  category: {
    color: Palette.ink,
    fontWeight: '800',
    fontSize: 16,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
  },
  name: {
    color: Palette.ink,
    fontWeight: '700',
  },
  meta: {
    color: Palette.ink,
    opacity: 0.65,
    fontSize: 12,
    marginTop: 2,
  },
});
