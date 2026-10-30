import { type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';

import { AppIcon } from '@/components/box-icon';
import { BrandMark } from '@/components/brand/brand-mark';
import { Appear } from '@/components/motion/appear';
import { Brand } from '@/constants/config';
import { Breakpoints, Palette, Radius } from '@/constants/theme';

type AuthShellProps = {
  children: ReactNode;
};

export function AuthShell({ children }: AuthShellProps) {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const split = width >= Breakpoints.tablet;
  const compact = height < 760;

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/welcome');
  }

  const back = (
    <Pressable onPress={goBack} style={styles.back} accessibilityLabel="Retour">
      <AppIcon name="chevron-left" size={16} color={Palette.ink} />
    </Pressable>
  );

  if (split) {
    const cardH = Math.min(compact ? 520 : 560, Math.max(400, height - 40));
    return (
      <View style={styles.canvas}>
        <StatusBar style="light" />
        <KeyboardAvoidingView
          style={styles.kav}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Appear style={[styles.card, { height: cardH }]}>
            <View style={styles.brandPane}>
              {back}
              <View style={[styles.tab, styles.tabTop]} />
              <View style={[styles.tab, styles.tabBottom]} />
              <BrandMark size={compact ? 72 : 96} />
              <Text style={styles.brandName}>{Brand.name}</Text>
            </View>
            <View style={[styles.formPane, compact && styles.formPaneTight]}>{children}</View>
          </Appear>
        </KeyboardAvoidingView>
      </View>
    );
  }

  return (
    <View style={styles.mobileCanvas}>
      <StatusBar style="dark" />
      <SafeAreaView style={[styles.mobileHeader, compact && styles.mobileHeaderTight]} edges={['top']}>
        {back}
        <View style={styles.mobileTab} />
        <BrandMark size={compact ? 40 : 52} />
        <Text style={[styles.mobileBrand, compact && styles.mobileBrandSm]}>{Brand.name}</Text>
      </SafeAreaView>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Appear style={[styles.mobileForm, compact && styles.mobileFormTight]}>{children}</Appear>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  kav: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvas: {
    flex: 1,
    width: '100%',
    backgroundColor: Palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  card: {
    width: 820,
    maxWidth: '94%',
    flexDirection: 'row',
    backgroundColor: Palette.white,
    borderRadius: Radius.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Palette.gold,
    ...Platform.select({
      web: { boxShadow: '0 28px 70px rgba(20, 22, 34, 0.45)' },
      ios: {
        shadowColor: Palette.ink,
        shadowOpacity: 0.35,
        shadowRadius: 28,
        shadowOffset: { width: 0, height: 18 },
      },
      android: { elevation: 16 },
      default: {},
    }),
  },
  brandPane: {
    width: 240,
    backgroundColor: Palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    position: 'relative',
  },
  tab: {
    position: 'absolute',
    width: 22,
    height: 48,
    right: -11,
    backgroundColor: Palette.gold,
    borderRadius: 12,
    zIndex: 2,
  },
  tabTop: {
    top: 42,
  },
  tabBottom: {
    bottom: 42,
  },
  brandName: {
    color: Palette.ink,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  back: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Palette.white,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
    ...Platform.select({
      web: { boxShadow: '0 4px 10px rgba(20,22,34,0.16)' } as object,
      default: { elevation: 3 },
    }),
  },
  formPane: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Palette.white,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 14,
    gap: 8,
  },
  formPaneTight: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
  },
  mobileCanvas: {
    flex: 1,
    backgroundColor: Palette.white,
  },
  mobileHeader: {
    backgroundColor: Palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
    paddingBottom: 16,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    gap: 4,
    position: 'relative',
  },
  mobileHeaderTight: {
    paddingTop: 2,
    paddingBottom: 10,
    gap: 2,
  },
  mobileTab: {
    position: 'absolute',
    width: 40,
    height: 14,
    backgroundColor: Palette.gold,
    borderRadius: 10,
    bottom: -7,
    alignSelf: 'center',
  },
  mobileBrand: {
    color: Palette.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  mobileBrandSm: {
    fontSize: 16,
  },
  mobileForm: {
    flex: 1,
    backgroundColor: Palette.white,
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 6,
  },
  mobileFormTight: {
    paddingTop: 8,
    paddingBottom: 8,
    gap: 5,
  },
});
