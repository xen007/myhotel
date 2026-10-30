import { type ReactNode, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon, type BoxIconName } from '@/components/box-icon';
import { ShineSweep } from '@/components/motion/shine';
import { Palette } from '@/constants/theme';

export function Chips({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <View style={styles.chips}>
      {options.map((opt) => (
        <GoldBtn
          key={opt.id}
          compact
          label={opt.label}
          variant={value === opt.id ? 'gold' : 'ghost'}
          onPress={() => onChange(opt.id)}
        />
      ))}
    </View>
  );
}

export function Panel({ children }: { children: ReactNode }) {
  return <View style={styles.panel}>{children}</View>;
}

export function Line({
  title,
  meta,
  right,
  icon,
}: {
  title: string;
  meta?: string;
  right?: ReactNode;
  icon?: BoxIconName;
}) {
  return (
    <View style={styles.line}>
      {icon ? (
        <View style={styles.icon}>
          <AppIcon name={icon} size={18} color={Palette.ink} />
        </View>
      ) : null}
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function GoldBtn({
  label,
  onPress,
  variant = 'gold',
  icon,
  compact,
  tiny,
  block,
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant?: 'gold' | 'ghost' | 'ink';
  icon?: BoxIconName;
  compact?: boolean;
  tiny?: boolean;
  block?: boolean;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const tone = variant === 'ink' ? styles.btnInk : variant === 'ghost' ? styles.btnGhost : styles.btnGold;
  const textTone = variant === 'ink' ? styles.btnInkText : styles.btnText;
  const iconColor = variant === 'ink' ? Palette.gold : Palette.ink;
  const size = tiny ? 'tiny' : compact ? 'compact' : 'normal';

  return (
    <Pressable
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      disabled={disabled}
      onPress={(event) => {
        event.stopPropagation();
        if (disabled) return;
        onPress();
      }}
      style={({ pressed }) => [
        styles.btn,
        size === 'compact' && styles.btnCompact,
        size === 'tiny' && styles.btnTiny,
        tone,
        !disabled && hover && !pressed && styles.btnHover,
        !disabled && pressed && styles.btnPress,
        block && styles.btnBlock,
        disabled && styles.btnDisabled,
        size === 'tiny' && Platform.OS === 'web' ? ({ whiteSpace: 'nowrap' } as object) : null,
      ]}>
      <ShineSweep play={!disabled && hover} />
      {icon ? <AppIcon name={icon} size={size === 'tiny' ? 12 : size === 'compact' ? 14 : 16} color={iconColor} /> : null}
      <Text
        style={[
          styles.btnText,
          size === 'compact' && styles.btnTextSm,
          size === 'tiny' && styles.btnTextTiny,
          textTone,
          block && styles.btnTextBlock,
        ]}
        numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ConfirmDialog({
  visible,
  title,
  message,
  children,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  confirmIcon = 'trash',
  confirmVariant = 'ink',
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmIcon?: BoxIconName;
  confirmVariant?: 'gold' | 'ghost' | 'ink';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.overlay, { pointerEvents: 'box-none' }]}>
        <Pressable style={styles.overlayFill} onPress={onCancel} />
        <View style={styles.dialog}>
          <View style={styles.alertIcon}>
            <AppIcon name="error-circle" size={32} color={Palette.ink} />
          </View>
          <Text style={styles.dialogTitle}>{title}</Text>
          {message ? <Text style={styles.dialogMsg}>{message}</Text> : null}
          {children ? <View style={styles.dialogBody}>{children}</View> : null}
          <View style={styles.dialogActions}>
            <GoldBtn compact icon="x-circle" label={cancelLabel} variant="ghost" onPress={onCancel} />
            <GoldBtn compact icon={confirmIcon} label={confirmLabel} variant={confirmVariant} onPress={onConfirm} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  panel: {
    backgroundColor: Palette.white,
    borderRadius: 18,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(20,22,34,0.06)',
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: Palette.ink,
    fontWeight: '800',
    fontSize: 14,
  },
  meta: {
    color: Palette.ink,
    opacity: 0.65,
    fontSize: 12,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: 4,
    flexShrink: 0,
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 5px 8px rgba(20,22,34,0.22)', transition: 'transform 180ms ease, box-shadow 180ms ease' } as object,
      default: {
        shadowColor: Palette.ink,
        shadowOpacity: 0.22,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 5 },
        elevation: 6,
      },
    }),
  },
  btnGold: {
    backgroundColor: Palette.gold,
    borderBottomColor: '#8c7018',
  },
  btnInk: {
    backgroundColor: Palette.ink,
    borderBottomColor: '#000',
  },
  btnGhost: {
    backgroundColor: Palette.white,
    borderWidth: 1,
    borderColor: Palette.gold,
    borderBottomColor: Palette.gold,
  },
  btnHover: {
    transform: [{ translateY: -2 }],
    ...Platform.select({
      web: { boxShadow: '0 8px 18px rgba(212,175,55,0.55), 0 0 18px rgba(212,175,55,0.45)' },
      default: { shadowOpacity: 0.34, shadowRadius: 12 },
    }),
  },
  btnPress: {
    transform: [{ translateY: 3 }],
    borderBottomWidth: 1,
    ...Platform.select({
      web: { boxShadow: '0 1px 2px rgba(20,22,34,0.08)' },
      default: { shadowOpacity: 0.08, shadowOffset: { width: 0, height: 1 } },
    }),
  },
  btnDisabled: {
    backgroundColor: 'rgba(20,22,34,0.12)',
    borderColor: 'rgba(20,22,34,0.16)',
    borderBottomColor: 'rgba(20,22,34,0.28)',
    ...Platform.select({
      web: { boxShadow: 'none' },
      default: { shadowOpacity: 0, elevation: 0 },
    }),
  },
  btnCompact: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderBottomWidth: 3,
    borderRadius: 12,
    alignSelf: 'flex-start',
    flexShrink: 0,
  },
  btnTiny: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderBottomWidth: 2,
    borderRadius: 9,
    gap: 3,
    alignSelf: 'flex-start',
    flexShrink: 0,
  },
  btnBlock: {
    flex: 1,
    alignSelf: 'stretch',
    flexShrink: 1,
    minWidth: 0,
    paddingHorizontal: 6,
  },
  btnTextBlock: {
    flexShrink: 1,
    minWidth: 0,
  },
  btnTextSm: {
    fontSize: 12,
  },
  btnTextTiny: {
    fontSize: 10,
  },
  btnText: {
    color: Palette.ink,
    fontWeight: '800',
    fontSize: 13,
  },
  btnInkText: {
    color: Palette.gold,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 22,
  },
  overlayFill: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(20,22,34,0.55)' },
  dialog: {
    zIndex: 2,
    width: 340,
    maxWidth: '92%',
    backgroundColor: Palette.white,
    borderRadius: 18,
    paddingVertical: 28,
    paddingHorizontal: 24,
    gap: 12,
    borderWidth: 1,
    borderColor: Palette.gold,
    alignItems: 'center',
    ...Platform.select({
      web: { boxShadow: '0 14px 28px rgba(20,22,34,0.3)' },
      default: {
        shadowColor: Palette.ink,
        shadowOpacity: 0.3,
        shadowRadius: 28,
        shadowOffset: { width: 0, height: 14 },
        elevation: 20,
      },
    }),
  },
  alertIcon: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: Palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    borderBottomWidth: 4,
    borderBottomColor: '#8c7018',
  },
  dialogTitle: { color: Palette.ink, fontWeight: '800', fontSize: 20, textAlign: 'center' },
  dialogMsg: { color: Palette.ink, opacity: 0.7, lineHeight: 20, textAlign: 'center' },
  dialogBody: { width: '100%', gap: 10 },
  dialogActions: { flexDirection: 'row', flexWrap: 'nowrap', gap: 10, marginTop: 8, justifyContent: 'center' },
});
