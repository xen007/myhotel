import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { Palette } from '@/constants/theme';

export function ShineSweep({ play }: { play: boolean }) {
  const x = useSharedValue(-90);

  useEffect(() => {
    if (play) {
      x.value = -90;
      x.value = withRepeat(withTiming(220, { duration: 1100, easing: Easing.inOut(Easing.quad) }), -1, false);
    } else {
      x.value = -90;
    }
  }, [play, x]);

  const style = useAnimatedStyle(() => ({
    opacity: play ? 0.55 : 0,
    transform: [{ translateX: x.value }, { rotate: '18deg' }],
  }));

  return <Animated.View pointerEvents="none" style={[styles.bar, style]} />;
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: -8,
    bottom: -8,
    width: 28,
    backgroundColor: Palette.white,
  },
});
