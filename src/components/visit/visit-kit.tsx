import { type ReactNode, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useVisitScroll } from '@/components/visit/visit-scroll';
import { Breakpoints, Fonts, Palette } from '@/constants/theme';

export function visitGutter(width: number) {
  if (width >= 1400) return 64;
  if (width >= Breakpoints.desktop) return 40;
  if (width >= Breakpoints.tablet) return 24;
  return 16;
}

export function VisitKicker({ children, light }: { children: ReactNode; light?: boolean }) {
  return <Text style={[styles.kicker, light && styles.kickerLight]}>{children}</Text>;
}

export function VisitTitle({ children, light }: { children: ReactNode; light?: boolean }) {
  const { width } = useWindowDimensions();
  const compact = width < Breakpoints.tablet;
  return (
    <Text style={[styles.title, compact && styles.titleCompact, light && styles.titleLight]}>
      {children}
    </Text>
  );
}

export function VisitLead({ children, light, article }: { children: ReactNode; light?: boolean; article?: boolean }) {
  return <Text style={[styles.lead, light && styles.leadLight, article && styles.leadArticle]}>{children}</Text>;
}

export function VisitSection({
  children,
  delay: _delay = 0,
  ink,
  id,
  compact,
  wide,
}: {
  children: ReactNode;
  delay?: number;
  ink?: boolean;
  id?: string;
  compact?: boolean;
  wide?: boolean;
}) {
  const { width } = useWindowDimensions();
  const gutter = visitGutter(width);
  const scroll = useVisitScroll();
  return (
    <View
      nativeID={id}
      collapsable={false}
      {...(Platform.OS === 'web' && id ? ({ id } as object) : {})}
      onLayout={(event) => {
        if (id) scroll.register(id, event.nativeEvent.layout.y);
      }}
      style={[
        styles.section,
        { paddingHorizontal: compact ? Math.max(16, gutter - 12) : wide ? gutter + 8 : gutter },
        ink && styles.sectionInk,
        compact && styles.sectionCompact,
        wide && styles.sectionWide,
        id ? styles.anchor : null,
      ]}>
      {children}
    </View>
  );
}

export function VisitCard({ children }: { children: ReactNode }) {
  const [hover, setHover] = useState(false);
  return (
    <Pressable
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={[styles.card, hover && styles.cardHover]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  kicker: {
    color: Palette.gold,
    fontWeight: '800',
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    fontSize: 15,
    textAlign: 'center',
    width: '100%',
  },
  kickerLight: { color: Palette.gold },
  title: {
    color: Palette.ink,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    fontFamily: Fonts.serif,
    textAlign: 'center',
    width: '100%',
    marginBottom: 4,
  },
  titleCompact: { fontSize: 22, lineHeight: 28 },
  titleLight: { color: Palette.white },
  lead: {
    color: Palette.ink,
    opacity: 0.72,
    fontSize: 16,
    lineHeight: 26,
    maxWidth: 680,
    textAlign: 'center',
    alignSelf: 'center',
    width: '100%',
  },
  leadArticle: {
    textAlign: 'left',
    maxWidth: 760,
    fontSize: 17,
    lineHeight: 28,
    opacity: 0.82,
  },
  leadLight: { color: Palette.white, opacity: 0.86 },
  section: { paddingVertical: 40, gap: 14, backgroundColor: Palette.white, width: '100%' },
  sectionInk: { backgroundColor: Palette.ink },
  sectionCompact: { paddingVertical: 28 },
  sectionWide: { paddingVertical: 40 },
  anchor: Platform.select({ web: { scrollMarginTop: 88 } as object, default: {} }),
  card: {
    backgroundColor: Palette.white,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.55)',
    borderRadius: 22,
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 18px 40px rgba(20,22,34,0.08)', transition: 'transform 180ms ease, box-shadow 180ms ease' } as object,
      default: { elevation: 3 },
    }),
  },
  cardHover: {
    transform: [{ translateY: -4 }],
    ...Platform.select({
      web: { boxShadow: '0 16px 36px rgba(212,175,55,0.35), 0 0 18px rgba(212,175,55,0.28)' } as object,
      default: { elevation: 8 },
    }),
  },
});
