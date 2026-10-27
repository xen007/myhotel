import { Platform, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { createElement } from 'react';

import { Radius } from '@/constants/theme';

export function RoomMedia({
  photo,
  video,
  variant = 'image',
  compact,
  frame = 'compact',
}: {
  photo?: string | null;
  video?: string | null;
  variant?: 'image' | 'video';
  compact?: boolean;
  frame?: 'compact' | 'stage';
}) {
  const box = frame === 'stage' ? styles.stageBox : compact ? styles.compactBox : variant === 'video' ? styles.videoBox : styles.imageBox;
  if (variant === 'video' && video && Platform.OS === 'web') {
    return (
      <View style={box}>
        {createElement('video', {
          src: video,
          poster: photo || undefined,
          controls: true,
          playsInline: true,
          preload: 'metadata',
          style: {
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            background: '#141622',
            display: 'block',
          },
        })}
      </View>
    );
  }
  if (variant === 'video') {
    return photo ? <Image source={{ uri: photo }} style={box} contentFit="contain" /> : <View style={box} />;
  }
  if (!photo) return <View style={box} />;
  return <Image source={{ uri: photo }} style={box} contentFit="contain" />;
}

const styles = StyleSheet.create({
  videoBox: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: Radius.card,
    overflow: 'hidden',
    backgroundColor: '#141622',
  },
  imageBox: {
    width: '100%',
    minHeight: 180,
    height: 320,
    maxHeight: 480,
    borderRadius: Radius.card,
    overflow: 'hidden',
    backgroundColor: '#141622',
  },
  compactBox: {
    width: '100%',
    height: 210,
    maxWidth: 640,
    alignSelf: 'center',
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#141622',
  },
  stageBox: {
    width: '100%',
    height: 560,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#141622',
  },
});
