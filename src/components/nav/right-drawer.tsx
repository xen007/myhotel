import { type ReactNode, useEffect } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Breakpoints, Palette } from '@/constants/theme';

type RightDrawerProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  contained?: boolean;
};

export function RightDrawer({ open, onClose, children, contained }: RightDrawerProps) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= Breakpoints.desktop;
  const panelWidth = isDesktop ? Math.min(420, width - 24) : Math.min(width, 400);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, {
      duration: 280,
      easing: Easing.out(Easing.cubic),
    });
  }, [open, progress]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: progress.value * 0.46,
  }));

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - progress.value) * panelWidth }],
  }));

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        styles.layer,
        contained && styles.contained,
        { pointerEvents: open ? 'auto' : 'none', opacity: open ? 1 : 0, zIndex: open ? 40 : -1 },
      ]}
      accessibilityViewIsModal={open}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <Animated.View style={[styles.overlay, overlayStyle]} />
      </Pressable>
      <Animated.View style={[styles.panel, { width: panelWidth }, panelStyle]}>{children}</Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    zIndex: 30,
    overflow: 'hidden',
    ...Platform.select({
      web: { position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, clipPath: 'inset(0)' } as object,
      default: {},
    }),
  },
  contained: {
    ...Platform.select({
      web: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, clipPath: 'inset(0)' } as object,
      default: {},
    }),
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Palette.ink,
  },
  panel: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Palette.white,
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '-8px 0 24px rgba(20,22,34,0.22)' },
      default: { elevation: 16 },
    }),
  },
});
