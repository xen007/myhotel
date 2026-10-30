import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { AppIcon } from '@/components/box-icon';
import { FilterBar } from '@/components/hotel/filter-bar';
import { GoldBtn } from '@/components/hotel/kit';
import { VisitSection } from '@/components/visit/visit-kit';
import { Breakpoints, Palette } from '@/constants/theme';
import { useVisitCart } from '@/context/visit-cart';
import { money } from '@/lib/format';
import type { VisitDish } from '@/hooks/use-visit';

export function VisitMenu({
  dishes,
  categories,
}: {
  dishes: VisitDish[];
  categories: { id?: number; name: string; kind: string }[];
}) {
  const cart = useVisitCart();
  const { width } = useWindowDimensions();
  const cols = width >= Breakpoints.desktop ? 3 : width >= Breakpoints.tablet ? 2 : 1;
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const foodNames = useMemo(() => new Set(categories.filter((row) => row.kind === 'food').map((row) => row.name)), [categories]);
  const drinkNames = useMemo(() => new Set(categories.filter((row) => row.kind === 'drink').map((row) => row.name)), [categories]);
  const cats = categories.filter((row) => dishes.some((dish) => dish.category === row.name));
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return dishes.filter((dish) => {
      if (kind === 'kind:food' && !foodNames.has(dish.category)) return false;
      if (kind === 'kind:drink' && !drinkNames.has(dish.category)) return false;
      if (kind !== 'all' && !kind.startsWith('kind:') && dish.category !== kind) return false;
      if (!needle) return true;
      return [dish.name, dish.description, dish.category].join(' ').toLowerCase().includes(needle);
    });
  }, [dishes, drinkNames, foodNames, kind, query]);
  const groups = useMemo(() => {
    const map = new Map<string, VisitDish[]>();
    shown.forEach((dish) => {
      const list = map.get(dish.category) ?? [];
      list.push(dish);
      map.set(dish.category, list);
    });
    const order = cats.map((row) => row.name);
    return [...map.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  }, [cats, shown]);

  return (
    <VisitSection>
      <FilterBar
        query={query}
        onQuery={setQuery}
        queryPlaceholder="Rechercher un plat..."
        category={kind}
        onCategory={setKind}
        categories={[
          { id: 'all', label: 'Catégorie' },
          { id: 'kind:food', label: 'Menu' },
          { id: 'kind:drink', label: 'Boissons' },
          ...cats.map((item) => ({ id: item.name, label: item.name })),
        ]}
      />
      {groups.map(([category, list]) => (
        <View key={category} style={styles.block}>
          <Text style={styles.cat}>{category}</Text>
          <View style={styles.grid}>
            {list.map((dish) => (
              <View key={dish.id} style={[styles.card, { width: cols === 1 ? '100%' : cols === 2 ? '48%' : '31.5%' }]}>
                {dish.photo ? <Image source={{ uri: dish.photo }} style={styles.photo} contentFit="cover" /> : (
                  <View style={[styles.photo, styles.photoEmpty]}><AppIcon name="restaurant" size={22} color={Palette.gold} /></View>
                )}
                <View style={styles.body}>
                  <Text style={styles.name}>{dish.name}</Text>
                  {dish.description ? <Text style={styles.meta} numberOfLines={2}>{dish.description}</Text> : null}
                  <Text style={styles.price}>{money(dish.price)}</Text>
                  <GoldBtn
                    tiny
                    block
                    icon="cart"
                    label="Ajouter"
                    onPress={() => {
                      cart.add({ source: 'menu', id: dish.id, name: dish.name, price: dish.price, photo: dish.photo });
                    }}
                  />
                </View>
              </View>
            ))}
          </View>
        </View>
      ))}
      {!shown.length ? <Text style={styles.meta}>{dishes.length ? 'Aucun plat ne correspond à la recherche.' : 'La carte sera publiée par le restaurant.'}</Text> : null}
    </VisitSection>
  );
}

const styles = StyleSheet.create({
  block: { gap: 10, marginTop: 8 },
  cat: { color: Palette.ink, fontWeight: '800', fontSize: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { borderWidth: 1, borderColor: Palette.gold, borderRadius: 20, overflow: 'hidden', backgroundColor: Palette.white },
  photo: { width: '100%', height: 160, backgroundColor: 'rgba(20,22,34,0.06)' },
  photoEmpty: { alignItems: 'center', justifyContent: 'center' },
  body: { padding: 12, gap: 6 },
  name: { color: Palette.ink, fontWeight: '800' },
  meta: { color: Palette.ink, opacity: 0.62, fontSize: 13 },
  price: { color: Palette.gold, fontWeight: '800' },
});
