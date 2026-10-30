import { LinearGradient } from 'expo-linear-gradient';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { Palette, Radius } from '@/constants/theme';

export type GuestBadge = {
  guest_name: string;
  room_number: string;
  valid_from: string;
  valid_to: string;
  check_in_time?: string;
  check_out_time?: string;
  code: string;
  created_by?: string;
  created_at?: string;
  state?: 'actif' | 'expire' | 'annule' | string;
};

function prettyDate(value: string) {
  const [y, m, d] = String(value).slice(0, 10).split('-');
  if (!y || !m || !d) return value;
  return `${d}.${m}.${y}`;
}

function stateStamp(state?: string) {
  if (state === 'annule') return 'ANNULÉ';
  if (state === 'expire') return 'EXPIRÉ';
  return null;
}

export function GuestBadgeCard({ badge, width = 340 }: { badge: GuestBadge; width?: number }) {
  const height = Math.round(width / 1.586);
  const scale = width / 340;
  const pan = `•••• •••• •••• ${String(badge.room_number).replace(/\D/g, '').padStart(4, '0').slice(-4)}`;
  const stamp = stateStamp(badge.state);
  const muted = Boolean(stamp);

  return (
    <View style={[styles.stage, { width, height: height + 10 }]}>
      <View style={[styles.depth, { width, height, borderRadius: Radius.card * 0.7 }]} />
      <LinearGradient
        colors={muted ? ['#3a3b44', '#1c1d24', '#12131a'] : ['#2c3144', Palette.ink, '#0b0c12']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.card,
          {
            width,
            height,
            opacity: muted ? 0.82 : 1,
            transform: [{ perspective: 1100 }, { rotateY: '-12deg' }, { rotateX: '8deg' }, { rotateZ: '-1deg' }],
          },
        ]}>
        <LinearGradient
          colors={['rgba(212,175,55,0.28)', 'transparent', 'rgba(255,255,255,0.08)']}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.shine}
        />
        <View style={styles.hologram} />
        <View style={styles.top}>
          <View>
            <Text style={[styles.brand, { fontSize: 12 * scale, letterSpacing: 3 * scale }]}>MyHotel</Text>
            <Text style={[styles.product, { fontSize: 8 * scale }]}>Carte client</Text>
          </View>
          <View style={styles.contactless}>
            <View style={[styles.arc, { width: 16 * scale, height: 16 * scale, borderRadius: 8 * scale }]} />
            <View style={[styles.arc, { width: 22 * scale, height: 22 * scale, borderRadius: 11 * scale }]} />
            <View style={[styles.arc, { width: 28 * scale, height: 28 * scale, borderRadius: 14 * scale }]} />
          </View>
        </View>
        <View style={[styles.chip, { width: 42 * scale, height: 32 * scale }]}>
          <LinearGradient colors={['#F3E2A0', Palette.gold, '#8c7018']} style={StyleSheet.absoluteFill} />
          <View style={styles.chipGrid}>
            <View style={styles.chipLine} />
            <View style={[styles.chipLine, { width: '55%' }]} />
            <View style={styles.chipLine} />
          </View>
        </View>
        <Text style={[styles.pan, { fontSize: 18 * scale, letterSpacing: 2.2 * scale }]}>{pan}</Text>
        <View style={styles.bottom}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.label, { fontSize: 8 * scale }]}>Propriétaire</Text>
            <Text style={[styles.name, { fontSize: 14 * scale }]} numberOfLines={1}>
              {badge.guest_name.toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={[styles.label, { fontSize: 8 * scale }]}>Valide jusqu’au</Text>
            <Text style={[styles.valid, { fontSize: 12 * scale }]}>{prettyDate(badge.valid_to)}</Text>
          </View>
        </View>
        <View style={styles.foot}>
          <Text style={[styles.code, { fontSize: 10 * scale }]}>{badge.code}</Text>
          <Text style={[styles.room, { fontSize: 10 * scale }]}>CH. {badge.room_number}</Text>
        </View>
        {stamp ? (
          <View style={styles.stampWrap} pointerEvents="none">
            <Text style={[styles.stamp, { fontSize: 22 * scale }]}>{stamp}</Text>
          </View>
        ) : null}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  depth: {
    position: 'absolute',
    backgroundColor: '#05060a',
    transform: [{ translateX: 10 }, { translateY: 12 }],
    opacity: 0.45,
  },
  card: {
    borderRadius: Radius.card * 0.7,
    padding: 18,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.65)',
    overflow: 'hidden',
    shadowColor: Palette.ink,
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 8, height: 14 },
    elevation: 16,
  },
  shine: {
    ...StyleSheet.absoluteFill,
  },
  hologram: {
    position: 'absolute',
    right: -20,
    top: 36,
    width: 90,
    height: 220,
    backgroundColor: Palette.gold,
    opacity: 0.12,
    transform: [{ rotate: '24deg' }],
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  brand: {
    color: Palette.gold,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  product: {
    color: Palette.white,
    opacity: 0.55,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  contactless: {
    width: 36,
    height: 32,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  arc: {
    position: 'absolute',
    right: 0,
    borderWidth: 1.5,
    borderColor: Palette.gold,
    borderLeftColor: 'transparent',
    borderBottomColor: 'transparent',
    transform: [{ rotate: '-20deg' }],
  },
  chip: {
    borderRadius: 6,
    overflow: 'hidden',
    marginTop: 8,
  },
  chipGrid: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 6,
    gap: 4,
  },
  chipLine: {
    height: 2,
    width: '80%',
    backgroundColor: Palette.ink,
    opacity: 0.28,
    borderRadius: 1,
  },
  pan: {
    color: Palette.white,
    fontWeight: '700',
    marginTop: 10,
  },
  bottom: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  label: {
    color: Palette.gold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '800',
    marginBottom: 3,
  },
  name: {
    color: Palette.white,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  valid: {
    color: Palette.white,
    fontWeight: '700',
  },
  foot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  code: {
    color: Palette.gold,
    fontWeight: '700',
    letterSpacing: 1,
  },
  room: {
    color: Palette.white,
    opacity: 0.7,
    fontWeight: '800',
    letterSpacing: 1,
  },
  stampWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stamp: {
    color: Palette.gold,
    fontWeight: '800',
    letterSpacing: 4,
    transform: [{ rotate: '-18deg' }],
    opacity: 0.85,
    borderWidth: 2,
    borderColor: Palette.gold,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
});
