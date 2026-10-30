import { type ReactNode, useEffect } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Palette } from '@/constants/theme';

export function SideDrawer({
  open,
  onClose,
  side = 'left',
  width: widthProp,
  children,
}: {
  open: boolean;
  onClose: () => void;
  side?: 'left' | 'right';
  width?: number;
  children: ReactNode;
}) {
  const { width: screen } = useWindowDimensions();
  const panelWidth = widthProp ?? Math.min(320, Math.max(screen - 56, 260));
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, {
      duration: 280,
      easing: Easing.out(Easing.cubic),
    });
  }, [open, progress]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: progress.value * 0.5,
  }));

  const panelStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: side === 'left' ? (1 - progress.value) * -panelWidth : (1 - progress.value) * panelWidth,
      },
    ],
  }));

  return (
    <View style={[StyleSheet.absoluteFill, styles.layer, { pointerEvents: open ? 'auto' : 'none' }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <Animated.View style={[styles.overlay, overlayStyle]} />
      </Pressable>
      <Animated.View
        style={[
          styles.panel,
          { width: panelWidth },
          side === 'left' ? { left: 0 } : { right: 0 },
          panelStyle,
        ]}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    zIndex: 50,
    overflow: 'hidden',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Palette.ink,
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: Palette.ink,
    overflow: 'hidden',
  },
});
