import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { AppIcon, type BoxIconName } from '@/components/box-icon';
import { BrandMark } from '@/components/brand/brand-mark';
import { GoldBtn } from '@/components/hotel/kit';
import { VisitContact } from '@/components/visit/visit-contact';
import { visitGutter, VisitKicker, VisitSection, VisitTitle } from '@/components/visit/visit-kit';
import { useVisitScroll } from '@/components/visit/visit-scroll';
import { VisitReviews } from '@/components/visit/visit-reviews';
import { Breakpoints, Fonts, Palette } from '@/constants/theme';
import { Brand } from '@/constants/config';
import type { VisitPayload } from '@/hooks/use-visit';

const FALLBACK_HERO = 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=1800&q=80';
const ABOUT_IMAGE = 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=1600&q=80';
const SERVICE_IMAGE = 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1600&q=80';

const ORBIT_ITEMS: { icon: BoxIconName; label: string }[] = [
  { icon: 'bed', label: 'Chambres' },
  { icon: 'restaurant', label: 'Restaurant' },
  { icon: 'coffee', label: 'Bar' },
  { icon: 'time', label: 'Réception' },
  { icon: 'key', label: 'Parking' },
  { icon: 'wifi', label: 'Wi-Fi' },
];

function ServiceCard({ item }: { item: { icon: BoxIconName; title: string; text: string } }) {
  const [hover, setHover] = useState(false);
  return (
    <Pressable
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={[styles.service, hover && styles.serviceHover]}>
      <View style={styles.featureIcon}><AppIcon name={item.icon} size={18} color={Palette.ink} /></View>
      <View style={styles.serviceCopy}>
        <Text style={styles.serviceTitle}>{item.title}</Text>
        <Text style={styles.serviceText}>{item.text}</Text>
      </View>
    </Pressable>
  );
}

function HeroOrbit({ size }: { size: number }) {
  const reduced = useReducedMotion();
  const spin = useSharedValue(0);
  const logo = Math.round(size * 0.42);
  const chip = 52;
  const radius = size / 2 - chip / 2 - 4;

  useEffect(() => {
    if (reduced) return;
    spin.value = withRepeat(withTiming(360, { duration: 22000, easing: Easing.linear }), -1, false);
  }, [reduced, spin]);

  const orbitStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  const counterStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${-spin.value}deg` }] }));

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={[{ width: size, height: size }, orbitStyle]}>
        {ORBIT_ITEMS.map((item, index) => {
          const angle = (index / ORBIT_ITEMS.length) * Math.PI * 2 - Math.PI / 2;
          const left = size / 2 + radius * Math.cos(angle) - chip / 2;
          const top = size / 2 + radius * Math.sin(angle) - chip / 2;
          return (
            <Animated.View key={item.label} style={[{ position: 'absolute', left, top, width: chip, alignItems: 'center' }, counterStyle]}>
              <View style={styles.orbitChip}>
                <AppIcon name={item.icon} size={13} color={Palette.ink} />
              </View>
              <Text style={styles.orbitLabel}>{item.label}</Text>
            </Animated.View>
          );
        })}
      </Animated.View>
      <View style={[styles.orbitLogo, { width: logo, height: logo, borderRadius: logo / 2, left: (size - logo) / 2, top: (size - logo) / 2 }]}>
        <BrandMark size={logo} />
      </View>
    </View>
  );
}

export function VisitHome({ data }: { data: VisitPayload }) {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const desktop = width >= Breakpoints.desktop;
  const gutter = visitGutter(width);
  const reduced = useReducedMotion();
  const visitScroll = useVisitScroll();
  const params = useLocalSearchParams<{ section?: string }>();
  const company = data.company;
  const hotel = company?.name || Brand.name;
  const photos = data.rooms.map((row) => row.photo).filter(Boolean) as string[];
  const hero = photos[0] || FALLBACK_HERO;
  const aboutPhoto = ABOUT_IMAGE;
  const servicePhoto = SERVICE_IMAGE;
  const scale = useSharedValue(1);
  const heroH = desktop ? Math.max(Math.min(height * 0.86, 780), 560) : Math.max(Math.min(height * 0.7, 520), 400);
  const heroPad = desktop ? 40 : 16;

  useEffect(() => {
    if (reduced) return;
    scale.value = withRepeat(withTiming(1.08, { duration: 24000, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [reduced, scale]);

  useEffect(() => {
    const section = Array.isArray(params.section) ? params.section[0] : String(params.section || '');
    if (!section) return;
    visitScroll.to(section, !reduced);
  }, [params.section, reduced, visitScroll]);

  const ken = useAnimatedStyle(() => ({ transform: [{ scale: reduced ? 1 : scale.value }] }));
  const place = 'Bertoua, Cameroun';

  return (
    <View>
      <View style={[styles.hero, desktop ? { height: heroH } : { minHeight: heroH }, !desktop && styles.heroMobile]}>
        <Animated.View style={[styles.heroMedia, ken]}>
          <Image source={{ uri: hero }} style={styles.photo} contentFit="cover" />
        </Animated.View>
        <LinearGradient colors={['rgba(20,22,34,0.18)', 'rgba(20,22,34,0.55)', 'rgba(20,22,34,0.88)'] as const} style={StyleSheet.absoluteFill} />
        <View style={[styles.heroInner, { paddingHorizontal: heroPad, minHeight: desktop ? heroH : undefined }, desktop && styles.heroInnerWide, !desktop && styles.heroInnerMobile]}>
          <View style={[styles.heroCopy, !desktop && styles.heroCopyMobile]}>
            <Text style={[styles.kicker, !desktop && styles.centerText]}>Hôtel 4 étoiles</Text>
            <Text style={[styles.heroTitle, { fontSize: desktop ? 52 : 28, lineHeight: desktop ? 58 : 34 }, !desktop && styles.centerText]}>
              {hotel}
            </Text>
            <View style={[styles.goldLine, !desktop && styles.goldLineCenter]} />
            <Text style={[styles.heroLead, !desktop && styles.centerText]}>
              Bienvenue chez {hotel}, une adresse où le raffinement rencontre l’art de l’hospitalité. Pensé pour celles et ceux qui apprécient le confort, l’élégance et la qualité du service, notre établissement vous ouvre les portes d’un univers chaleureux et distingué, où chaque détail contribue à votre bien-être.
            </Text>
            <Text style={[styles.heroPlace, !desktop && styles.centerText]}>{place}</Text>
            <View style={[styles.heroActions, desktop && styles.heroActionsStart]}>
              <GoldBtn
                label="Découvrir notre hôtel"
                onPress={() => {
                  if (Platform.OS === 'web') visitScroll.to('apropos', !reduced);
                  else router.push({ pathname: '/welcome', params: { section: 'apropos' } });
                }}
              />
              <GoldBtn label="Réserver un séjour" variant="ghost" onPress={() => router.push('/browse')} />
            </View>
          </View>
          <View style={[styles.heroVisual, !desktop && styles.heroVisualMobile]}>
            <HeroOrbit size={desktop ? 236 : 200} />
          </View>
        </View>
      </View>

      <VisitSection id="apropos">
        <VisitKicker>À propos</VisitKicker>
        <VisitTitle>L’art de recevoir</VisitTitle>
        <View style={styles.goldLineCenter} />
        <View style={[styles.split, !desktop && styles.splitStack]}>
          {desktop ? (
            <View style={[styles.photoFrame, styles.mediaSide, { height: 340 }]}>
              <Image source={{ uri: aboutPhoto }} style={styles.photoFill} contentFit="cover" />
            </View>
          ) : null}
          <View style={[styles.copyCol, desktop && styles.copyColWide]}>
            <Text style={styles.drop}>
              Au cœur d’un cadre où élégance et sérénité se rencontrent, {hotel} allie raffinement, confort et excellence du service. Plus qu’une destination, une adresse de distinction.
            </Text>
            <Text style={styles.aboutBody}>
              Dès l’arrivée, l’atmosphère invite à la détente : chambres d’intimité, table soignée, équipe attentive. Chaque détail est pensé pour que le séjour soit calme, précis et mémorable.
            </Text>
            <Text style={styles.aboutBody}>
              Notre ambition est une hospitalité sincère : vous sentir attendu, respecté, et vraiment chez vous, le temps d’une nuit ou d’un séjour plus long.
            </Text>
            <View style={styles.quoteBox}>
              <Text style={styles.signature}>{hotel}, le privilège de se sentir attendu, le plaisir de se sentir chez soi.</Text>
            </View>
          </View>
        </View>
        {!desktop ? (
          <View style={[styles.photoFrame, { height: 200 }]}>
            <Image source={{ uri: aboutPhoto }} style={styles.photoFill} contentFit="cover" />
          </View>
        ) : null}
      </VisitSection>

      <VisitSection id="services" ink>
        <VisitKicker light>Nos services</VisitKicker>
        <VisitTitle light>Nos engagements</VisitTitle>
        <View style={[styles.serviceRow, !desktop && styles.serviceRowMobile]}>
          <View style={styles.serviceGrid}>
            {[
              { icon: 'star' as BoxIconName, title: 'Prestige 4 étoiles', text: 'Un cadre soigné et des prestations de standing.' },
              { icon: 'bell' as BoxIconName, title: 'Accueil personnalisé', text: 'Une équipe disponible, discrète et professionnelle.' },
              { icon: 'bed' as BoxIconName, title: 'Confort', text: 'Chambres accueillantes, literie et équipements choisis pour le repos.' },
              { icon: 'restaurant' as BoxIconName, title: 'Gastronomie', text: 'Une cuisine soignée, un service élégant.' },
              { icon: 'briefcase' as BoxIconName, title: 'Affaires & loisirs', text: 'Un cadre adapté aux séjours professionnels comme personnels.' },
              { icon: 'key' as BoxIconName, title: 'Parking', text: 'Un parking sécurisé à votre disposition pendant tout le séjour.' },
            ].map((item) => (
              <ServiceCard key={item.title} item={item} />
            ))}
          </View>
          <View style={[styles.photoFrame, styles.servicePhoto, !desktop && styles.servicePhotoMobile, { height: desktop ? 360 : 200 }]}>
            <Image source={{ uri: servicePhoto }} style={styles.photoFill} contentFit="cover" />
          </View>
        </View>
      </VisitSection>

      <VisitSection id="avis">
        <VisitKicker>Témoignages</VisitKicker>
        <VisitTitle>Ils ont séjourné ici</VisitTitle>
        <VisitReviews reviews={data.reviews} />
      </VisitSection>

      <VisitContact company={company} id="contact" />

      <View style={[styles.cta, { paddingHorizontal: gutter }]}>
        <Text style={styles.ctaKicker}>Votre séjour</Text>
        <Text style={styles.ctaTitle}>Réservez votre séjour.</Text>
        <View style={styles.heroActions}>
          <GoldBtn compact={!desktop} tiny={width < Breakpoints.tablet} label="S’inscrire" onPress={() => router.push('/register')} />
          <GoldBtn compact={!desktop} tiny={width < Breakpoints.tablet} label="Connexion" variant="ink" onPress={() => router.push('/login')} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { width: '100%', overflow: 'hidden', justifyContent: 'center', position: 'relative' },
  heroMobile: { justifyContent: 'center' },
  heroMedia: { ...StyleSheet.absoluteFill, zIndex: 0 },
  photo: { width: '100%', height: '100%' },
  heroInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28, paddingTop: 48, paddingBottom: 48, zIndex: 2, position: 'relative' },
  heroInnerWide: { paddingTop: 80, paddingBottom: 80, paddingRight: 28 },
  heroInnerMobile: { flexDirection: 'column', alignItems: 'center', gap: 20, paddingTop: 28, paddingBottom: 28 },
  heroVisual: { flexShrink: 0, marginLeft: 48, alignItems: 'flex-end' },
  heroVisualMobile: { width: '100%', marginLeft: 0, alignItems: 'center', justifyContent: 'center' },
  orbitLogo: { position: 'absolute', overflow: 'hidden', borderWidth: 3, borderColor: Palette.gold, backgroundColor: Palette.ink, alignItems: 'center', justifyContent: 'center' },
  orbitChip: { width: 28, height: 28, borderRadius: 14, backgroundColor: Palette.gold, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Palette.white },
  orbitLabel: { color: Palette.white, fontSize: 9, fontWeight: '800', marginTop: 3, textAlign: 'center' },
  heroCopy: { flex: 1, gap: 12, minWidth: 0, maxWidth: 560, justifyContent: 'center' },
  heroCopyMobile: { width: '100%', maxWidth: '100%', flexGrow: 0, alignItems: 'center' },
  heroActionsStart: { justifyContent: 'flex-start' },
  kicker: { color: Palette.gold, fontWeight: '800', letterSpacing: 3, textTransform: 'uppercase', fontSize: 12 },
  heroTitle: { color: Palette.white, fontWeight: '800', fontFamily: Fonts.serif },
  goldLine: { width: 76, height: 3, backgroundColor: Palette.gold, borderRadius: 99 },
  heroLead: { color: Palette.white, opacity: 0.92, fontSize: 15, lineHeight: 23, maxWidth: 560 },
  heroPlace: { color: Palette.gold, fontWeight: '700', letterSpacing: 0.4 },
  centerText: { textAlign: 'center' },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6, justifyContent: 'center' },
  goldLineCenter: { width: 72, height: 3, backgroundColor: Palette.gold, borderRadius: 99, alignSelf: 'center', marginBottom: 8 },
  split: { flexDirection: 'row', alignItems: 'flex-start', gap: 22, marginTop: 8 },
  splitStack: { flexDirection: 'column' },
  photoFrame: { borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: Palette.gold, backgroundColor: Palette.ink, width: '100%', height: 200, marginTop: 16 },
  photoFill: { width: '100%', height: '100%' },
  mediaSide: { flexGrow: 1, flexBasis: 320, maxWidth: 440, marginTop: 0, height: 340 },
  copyCol: { gap: 14, minWidth: 0, width: '100%' },
  copyColWide: { flexGrow: 1, flexBasis: 280, justifyContent: 'center' },
  serviceRow: { flexDirection: 'row', alignItems: 'stretch', gap: 14, width: '100%', marginTop: 8 },
  serviceRowMobile: { flexDirection: 'column' },
  serviceGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 10, minWidth: 0 },
  servicePhoto: { width: '38%', maxWidth: 420, minWidth: 132, marginTop: 0, flexShrink: 0, alignSelf: 'stretch' },
  servicePhotoMobile: { width: '100%', maxWidth: '100%', minWidth: 0, marginTop: 4 },
  drop: { color: Palette.ink, fontSize: 17, lineHeight: 28, fontWeight: '600' },
  aboutBody: { color: Palette.ink, opacity: 0.78, fontSize: 16, lineHeight: 26 },
  quoteBox: { borderLeftWidth: 3, borderLeftColor: Palette.gold, paddingLeft: 16, paddingVertical: 6, marginBottom: 8, backgroundColor: Palette.white },
  signature: { color: Palette.ink, fontWeight: '800', fontSize: 17, lineHeight: 26, fontFamily: Fonts.serif },
  featureIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: Palette.gold, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  service: { backgroundColor: Palette.white, borderRadius: 16, padding: 12, gap: 6, flexDirection: 'column', width: '47%', flexGrow: 0, flexShrink: 0, ...Platform.select({ web: { transition: 'transform 180ms ease, box-shadow 180ms ease' } as object, default: {} }) },
  serviceHover: { transform: [{ translateY: -4 }], ...Platform.select({ web: { boxShadow: '0 12px 28px rgba(212,175,55,0.4), 0 0 16px rgba(212,175,55,0.32)' } as object, default: {} }) },
  serviceCopy: { flex: 1, gap: 4 },
  serviceTitle: { color: Palette.ink, fontWeight: '800', fontSize: 15 },
  serviceText: { color: Palette.ink, opacity: 0.7, fontSize: 13, lineHeight: 19 },
  cta: { backgroundColor: Palette.white, paddingHorizontal: 40, paddingVertical: 56, alignItems: 'center', gap: 12 },
  ctaKicker: { color: Palette.ink, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase', fontSize: 11 },
  ctaTitle: { color: Palette.ink, fontSize: 30, lineHeight: 36, fontWeight: '800', textAlign: 'center', fontFamily: Fonts.serif },
});
