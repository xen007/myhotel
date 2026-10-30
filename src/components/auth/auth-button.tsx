import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { ShineSweep } from '@/components/motion/shine';
import { Palette } from '@/constants/theme';

type Variant = 'gold' | 'ink' | 'outline' | 'ghost';

type AuthButtonProps = PressableProps & {
  label: string;
  loading?: boolean;
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
};

export function AuthButton({
  label,
  loading,
  variant = 'gold',
  disabled,
  style,
  ...rest
}: AuthButtonProps) {
  const [hover, setHover] = useState(false);
  const isDisabled = disabled || loading;
  const labelColor = variant === 'gold' || variant === 'outline' || variant === 'ghost' ? Palette.ink : Palette.white;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        hover && !isDisabled && !pressed && styles.hover,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
      {...rest}>
      <ShineSweep play={!isDisabled && hover} />
      {loading ? (
        <ActivityIndicator color={labelColor} />
      ) : (
        <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    width: '100%',
    overflow: 'hidden',
  },
  gold: {
    backgroundColor: Palette.gold,
  },
  ink: {
    backgroundColor: Palette.ink,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Palette.ink,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  hover: {
    ...Platform.select({
      web: { boxShadow: '0 0 18px rgba(212,175,55,0.55)', transform: [{ translateY: -1 }] } as object,
      default: {},
    }),
  },
  pressed: {
    opacity: 0.86,
  },
  disabled: {
    opacity: 0.55,
  },
});
