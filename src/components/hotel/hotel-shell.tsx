import { type ReactNode } from 'react';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { AppIcon, type BoxIconName } from '@/components/box-icon';
import { GoldBtn } from '@/components/hotel/kit';
import { WorkspaceShell } from '@/components/workspace/workspace-shell';
import { Breakpoints, Palette, Radius } from '@/constants/theme';

type HotelShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  back?: boolean;
  onBack?: () => void;
  right?: ReactNode;
  loading?: boolean;
  error?: string | null;
  fill?: boolean;
  hideHeading?: boolean;
  edgeToEdge?: boolean;
};

export function HotelShell({ title, subtitle, children, back, onBack, right, loading, error, fill, hideHeading, edgeToEdge }: HotelShellProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= Breakpoints.desktop;
  const heading = hideHeading ? null : (
        <View style={styles.heading}>
          {back ? (
            <GoldBtn
              icon="chevron-left"
              label="Retour"
              variant="ghost"
              compact
              onPress={() => (onBack ? onBack() : router.back())}
            />
          ) : null}
          <View style={styles.headingCopy}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {right ? <View style={styles.headingRight}>{right}</View> : null}
        </View>
  );
  const body = loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={Palette.gold} size="large" />
          </View>
        ) : error ? (
          <View style={styles.errorBox}>
            <AppIcon name="error-circle" color={Palette.gold} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          children
        );

  return (
    <WorkspaceShell>
      {fill ? (
        <View style={[styles.flex, styles.fillPad, !isDesktop && styles.fillPadMobile, edgeToEdge && styles.fillBleed]}>
          {heading}
          <View style={styles.flex}>{body}</View>
        </View>
      ) : (
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, !isDesktop && styles.contentMobile]}
        showsVerticalScrollIndicator={false}>
        {heading}
        {body}
      </ScrollView>
      )}
    </WorkspaceShell>
  );
}

export function StatusBadge({
  label,
  tone = 'gold',
}: {
  label: string;
  tone?: 'gold' | 'ink' | 'muted';
}) {
  return (
    <View
      style={[
        styles.badge,
        tone === 'ink' && styles.badgeInk,
        tone === 'muted' && styles.badgeMuted,
      ]}>
      <Text
        style={[
          styles.badgeText,
          tone === 'ink' && styles.badgeTextInk,
          tone === 'muted' && styles.badgeTextMuted,
        ]}>
        {label}
      </Text>
    </View>
  );
}

export function ModuleCard({
  icon,
  title,
  hint,
  count,
  onPress,
  width,
}: {
  icon: BoxIconName;
  title: string;
  hint: string;
  count?: string;
  onPress: () => void;
  width: number;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.module, { width }]}>
      <View style={styles.moduleIcon}>
        <AppIcon name={icon} size={26} color={Palette.ink} />
      </View>
      {count ? <Text style={styles.moduleCount}>{count}</Text> : null}
      <Text style={styles.moduleTitle}>{title}</Text>
      <Text style={styles.moduleHint}>{hint}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    minHeight: 0,
  },
  fillPad: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'column',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 10,
  },
  fillPadMobile: {
    paddingBottom: 4,
    paddingHorizontal: 10,
    minHeight: 0,
  },
  fillBleed: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    gap: 0,
    minHeight: 0,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 14,
  },
  contentMobile: {
    paddingBottom: 28,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 4,
    flexWrap: 'nowrap',
  },
  headingCopy: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
  },
  headingRight: {
    marginLeft: 'auto',
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: 8,
  },
  title: {
    color: Palette.ink,
    fontSize: 22,
    fontWeight: '800',
  },
  subtitle: {
    color: Palette.ink,
    opacity: 0.55,
    fontSize: 13,
    marginTop: 4,
  },
  center: {
    paddingVertical: 80,
    alignItems: 'center',
  },
  errorBox: {
    borderWidth: 1,
    borderColor: Palette.gold,
    borderRadius: Radius.input,
    padding: 16,
    gap: 8,
    backgroundColor: 'rgba(212, 175, 55, 0.08)',
  },
  errorText: {
    color: Palette.ink,
    fontSize: 14,
  },
  badge: {
    backgroundColor: Palette.gold,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeInk: {
    backgroundColor: Palette.ink,
    borderWidth: 1,
    borderColor: Palette.gold,
  },
  badgeMuted: {
    backgroundColor: 'rgba(20,22,34,0.08)',
  },
  badgeText: {
    color: Palette.ink,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  badgeTextInk: {
    color: Palette.gold,
  },
  badgeTextMuted: {
    color: Palette.ink,
  },
  module: {
    backgroundColor: Palette.white,
    borderRadius: 22,
    padding: 12,
    minHeight: 112,
    borderWidth: 1,
    borderColor: Palette.gold,
  },
  moduleIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  moduleCount: {
    color: Palette.gold,
    fontSize: 20,
    fontWeight: '800',
  },
  moduleTitle: {
    color: Palette.ink,
    fontSize: 17,
    fontWeight: '800',
    marginTop: 4,
  },
  moduleHint: {
    color: Palette.ink,
    opacity: 0.65,
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
  },
});
