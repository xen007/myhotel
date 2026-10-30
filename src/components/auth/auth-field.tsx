import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  Platform,
  useWindowDimensions,
  type KeyboardTypeOptions,
  type TextInputProps,
} from 'react-native';

import { AuthIcon, type AuthIconName } from '@/components/auth/auth-icons';
import { Palette } from '@/constants/theme';

type AuthFieldProps = {
  icon: AuthIconName;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoComplete?: TextInputProps['autoComplete'];
  textContentType?: TextInputProps['textContentType'];
  editable?: boolean;
  onSubmitEditing?: TextInputProps['onSubmitEditing'];
};

export function AuthField({
  icon,
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  autoCapitalize = 'none',
  autoComplete,
  textContentType,
  editable = true,
  onSubmitEditing,
}: AuthFieldProps) {
  const { height } = useWindowDimensions();
  const compact = height < 760;
  const [hidden, setHidden] = useState(Boolean(secureTextEntry));
  const [hover, setHover] = useState(false);

  return (
    <Pressable
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={[styles.wrap, compact && styles.wrapCompact, hover && styles.wrapHover]}>
      <AuthIcon name={icon} size={compact ? 18 : 22} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="rgba(20, 22, 34, 0.45)"
        secureTextEntry={hidden}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        textContentType={textContentType}
        editable={editable}
        returnKeyType={secureTextEntry || onSubmitEditing ? 'done' : 'next'}
        onSubmitEditing={onSubmitEditing}
        blurOnSubmit={Boolean(onSubmitEditing)}
        style={[styles.input, compact && styles.inputCompact, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as Record<string, string>) : null]}
      />
      {secureTextEntry ? (
        <Pressable onPress={() => setHidden((current) => !current)} hitSlop={10}>
          <AuthIcon name={hidden ? 'eye-off' : 'eye'} size={compact ? 18 : 22} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: 40,
    width: '100%',
    borderWidth: 1.5,
    borderColor: Palette.ink,
    borderRadius: 12,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Palette.white,
    gap: 8,
  },
  wrapCompact: {
    minHeight: 36,
    borderRadius: 10,
    paddingHorizontal: 8,
  },
  wrapHover: {
    borderColor: Palette.gold,
    ...Platform.select({
      web: { boxShadow: '0 0 0 3px rgba(212,175,55,0.28)' } as object,
      default: {},
    }),
  },
  input: {
    flex: 1,
    color: Palette.ink,
    fontSize: 15,
    paddingVertical: 10,
    minWidth: 0,
  },
  inputCompact: {
    fontSize: 14,
    paddingVertical: 8,
  },
});
