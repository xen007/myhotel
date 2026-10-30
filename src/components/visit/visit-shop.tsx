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
import type { VisitProduct } from '@/hooks/use-visit';

export function VisitShop({ products }: { products: VisitProduct[] }) {
  const cart = useVisitCart();
  const { width } = useWindowDimensions();
  const cols = width >= Breakpoints.desktop ? 3 : width >= Breakpoints.tablet ? 2 : 1;
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const cats = useMemo(() => [...new Set(products.map((item) => item.category).filter(Boolean))], [products]);
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter((item) => {
      if (kind !== 'all' && item.category !== kind) return false;
      if (!needle) return true;
      return [item.name, item.category].join(' ').toLowerCase().includes(needle);
    });
  }, [kind, products, query]);

  return (
    <VisitSection>
      <FilterBar
        query={query}
        onQuery={setQuery}
        queryPlaceholder="Rechercher un produit..."
        category={kind}
        onCategory={setKind}
        categories={[{ id: 'all', label: 'Catégorie' }, ...cats.map((item) => ({ id: item, label: item }))]}
      />
      <View style={styles.grid}>
        {shown.map((item) => (
          <View key={item.id} style={[styles.card, { width: cols === 1 ? '100%' : cols === 2 ? '48%' : '31.5%' }]}>
            {item.photo ? <Image source={{ uri: item.photo }} style={styles.photo} contentFit="cover" /> : (
              <View style={[styles.photo, styles.empty]}><AppIcon name="cart" size={22} color={Palette.gold} /></View>
            )}
            <View style={styles.body}>
              <Text style={styles.cat}>{item.category}</Text>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.price}>{money(item.price)}</Text>
              <GoldBtn
                tiny
                block
                icon="cart"
                label="Au panier"
                onPress={() => {
                  cart.add({ source: 'shop', id: item.id, name: item.name, price: item.price, photo: item.photo });
                }}
              />
            </View>
          </View>
        ))}
      </View>
      {!shown.length ? <Text style={styles.meta}>{products.length ? 'Aucun produit ne correspond à la recherche.' : 'Aucun produit n’est proposé à la vente pour le moment.'}</Text> : null}
    </VisitSection>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { borderWidth: 1, borderColor: Palette.gold, borderRadius: 20, overflow: 'hidden', backgroundColor: Palette.white },
  photo: { width: '100%', height: 180, backgroundColor: 'rgba(20,22,34,0.06)' },
  empty: { alignItems: 'center', justifyContent: 'center' },
  body: { padding: 12, gap: 6 },
  cat: { color: Palette.gold, fontWeight: '800', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  name: { color: Palette.ink, fontWeight: '800' },
  meta: { color: Palette.ink, opacity: 0.62, fontSize: 13 },
  price: { color: Palette.ink, fontWeight: '800' },
});
