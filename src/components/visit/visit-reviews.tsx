import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { AppIcon } from '@/components/box-icon';
import { Breakpoints, Palette } from '@/constants/theme';
import type { VisitReview } from '@/hooks/use-visit';

const SHOWCASE: VisitReview[] = [
  { id: -1, guest_name: 'Amina D.', rating: 5, comment: 'Accueil précis, chambre impeccable, petit-déjeuner servi sans attendre. On revient.', at: '2026-09-14' },
  { id: -2, guest_name: 'Jean-Paul K.', rating: 5, comment: 'Calme véritable, literie soignée, équipe discrète. Un 4 étoiles qui tient sa promesse.', at: '2026-08-22' },
  { id: -3, guest_name: 'Mariam T.', rating: 4, comment: 'La table suit le standing de la maison. Service attentif, départ géré sans fuss.', at: '2026-07-03' },
  { id: -4, guest_name: 'Kouamé S.', rating: 5, comment: 'Arrivée tardive, clé prête, sourire juste. Les détails font le séjour.', at: '2026-06-18' },
];

function Card({ item }: { item: VisitReview }) {
  return (
    <View style={styles.card}>
      <Text style={styles.stars}>{'★'.repeat(Math.max(1, Math.min(5, Number(item.rating) || 5)))}</Text>
      <Text style={styles.quote} numberOfLines={5}>“{item.comment}”</Text>
      <View style={styles.who}>
        <View style={styles.avatar}>
          <Text style={styles.initial}>{(item.guest_name || 'H').slice(0, 1)}</Text>
        </View>
        <View>
          <Text style={styles.author}>{item.guest_name}</Text>
          {item.at ? <Text style={styles.when}>{String(item.at).slice(0, 10)}</Text> : null}
        </View>
      </View>
    </View>
  );
}

export function VisitReviews({ reviews }: { reviews: VisitReview[] }) {
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const pair = true;
  const list = useMemo(() => {
    const source = reviews.length ? reviews : SHOWCASE;
    const seen = new Set<string>();
    return source.filter((row) => {
      const key = `${row.id}-${row.guest_name}-${row.comment}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [reviews]);
  const [index, setIndex] = useState(0);
  const visible = pair ? 2 : 1;
  const first = list[index % Math.max(list.length, 1)];
  const second = list[(index + 1) % Math.max(list.length, 1)];

  const go = useCallback((next: number) => {
    if (!list.length) return;
    setIndex((next + list.length) % list.length);
  }, [list.length]);

  useEffect(() => {
    if (reduced || list.length < 2) return;
    const timer = setInterval(() => go(index + 1), 4800);
    return () => clearInterval(timer);
  }, [go, index, list.length, reduced]);

  if (!first) return null;

  return (
    <View style={styles.cover}>
      <View key={index} style={[styles.row, width < Breakpoints.tablet && styles.rowSingle]}>
        <Card item={first} />
        {pair && second && list.length > 1 ? <Card item={second} /> : null}
      </View>
      {list.length > visible ? (
        <View style={styles.controls}>
          <Pressable onPress={() => go(index - 1)} style={styles.arrow} accessibilityLabel="Avis précédent">
            <AppIcon name="chevron-left" size={18} color={Palette.ink} />
          </Pressable>
          <View style={styles.dots}>
            {list.map((row, i) => (
              <Pressable key={`${row.id}-${i}`} onPress={() => go(i)} style={[styles.dot, i === index && styles.dotOn]} />
            ))}
          </View>
          <Pressable onPress={() => go(index + 1)} style={styles.arrow} accessibilityLabel="Avis suivant">
            <AppIcon name="chevron-right" size={18} color={Palette.ink} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    width: '100%',
    backgroundColor: 'rgba(212,175,55,0.18)',
    borderRadius: 28,
    padding: 18,
    gap: 16,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.45)',
    overflow: 'hidden',
    zIndex: 1,
    position: 'relative',
  },
  row: { flexDirection: 'row', gap: 14, width: '100%' },
  rowSingle: { flexDirection: 'column' },
  card: {
    flex: 1,
    backgroundColor: Palette.ink,
    borderRadius: 22,
    padding: 22,
    gap: 12,
    minHeight: 210,
    justifyContent: 'space-between',
  },
  stars: { color: Palette.gold, letterSpacing: 3, fontSize: 16 },
  quote: { color: Palette.white, fontSize: 16, lineHeight: 24, fontWeight: '600' },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: Palette.gold, alignItems: 'center', justifyContent: 'center' },
  initial: { color: Palette.ink, fontWeight: '800', fontSize: 16 },
  author: { color: Palette.white, fontWeight: '800' },
  when: { color: Palette.gold, fontSize: 12, marginTop: 2 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 },
  arrow: { width: 40, height: 40, borderRadius: 20, backgroundColor: Palette.gold, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(20,22,34,0.18)' },
  dotOn: { width: 22, backgroundColor: Palette.gold },
});
