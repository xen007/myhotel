import { Image } from 'expo-image';
import { createElement, useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Palette } from '@/constants/theme';

export type GallerySlide = { kind: 'image' | 'video'; uri: string };

export function RoomGallery({
  slides,
  poster,
  wide,
}: {
  slides: GallerySlide[];
  poster?: string | null;
  wide: boolean;
}) {
  const [index, setIndex] = useState(0);
  const current = slides[index] ?? slides[0];

  useEffect(() => {
    setIndex(0);
  }, [slides.length, slides[0]?.uri]);

  if (!current) return null;

  const thumbs = (
    <ScrollView
      horizontal={!wide}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      style={wide ? styles.rail : undefined}
      contentContainerStyle={wide ? styles.railInner : styles.railRow}>
      {slides.map((slide, item) => {
        const active = item === index;
        return (
          <Pressable key={`${slide.kind}-${item}`} onPress={() => setIndex(item)} style={[styles.thumb, active && styles.thumbOn]}>
            <Image
              source={{ uri: slide.kind === 'image' ? slide.uri : poster || slide.uri }}
              style={styles.thumbImg}
              contentFit="cover"
              contentPosition="center"
            />
            {slide.kind === 'video' ? (
              <View style={styles.play}>
                <View style={styles.playTri} />
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );

  const stage = (
    <View style={[styles.stage, wide ? styles.stageWide : styles.stageNarrow]}>
      {current.kind === 'video' && Platform.OS === 'web'
        ? createElement('video', {
            src: current.uri,
            poster: poster || undefined,
            controls: true,
            playsInline: true,
            style: {
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center',
              background: '#ffffff',
              display: 'block',
            },
          })
        : (
          <Image
            source={{ uri: current.kind === 'image' ? current.uri : poster || '' }}
            style={styles.stageImg}
            contentFit="cover"
            contentPosition="center"
          />
        )}
      <View style={styles.count}>
        <Text style={styles.countText}>
          {current.kind === 'video' ? 'Vidéo' : 'Photo'} {index + 1}/{slides.length}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={[styles.gallery, wide && styles.galleryWide]}>
      {wide ? thumbs : null}
      {stage}
      {wide ? null : thumbs}
    </View>
  );
}

const styles = StyleSheet.create({
  gallery: { gap: 12, width: '100%', maxWidth: 760, alignSelf: 'center' },
  galleryWide: { flexDirection: 'row', alignItems: 'stretch' },
  rail: { width: 84, maxWidth: 84, maxHeight: 420, flexGrow: 0, flexShrink: 0, flexBasis: 84 },
  railInner: { gap: 8 },
  railRow: { gap: 8, paddingVertical: 2 },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(20,22,34,0.12)',
    backgroundColor: Palette.white,
  },
  thumbOn: { borderColor: Palette.gold },
  thumbImg: { width: '100%', height: '100%' },
  play: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20,22,34,0.28)',
  },
  playTri: {
    width: 0,
    height: 0,
    borderTopWidth: 7,
    borderBottomWidth: 7,
    borderLeftWidth: 12,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: Palette.white,
    marginLeft: 3,
  },
  stage: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    backgroundColor: Palette.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(20,22,34,0.1)',
    overflow: 'hidden',
    position: 'relative',
  },
  stageWide: { height: 420 },
  stageNarrow: { height: 280, width: '100%', flexBasis: 'auto' },
  stageImg: { width: '100%', height: '100%' },
  count: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    backgroundColor: 'rgba(20,22,34,0.78)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  countText: { color: Palette.white, fontSize: 11, fontWeight: '700' },
});
