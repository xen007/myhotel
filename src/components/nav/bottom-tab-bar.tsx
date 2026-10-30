import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/box-icon';
import { Hamburger } from '@/components/nav/hamburger';
import { Palette } from '@/constants/theme';
import type { WorkspaceLink } from '@/constants/roles';

const TAB_ORDER = [
  '/home',
  '/schedule',
  '/reservations',
  '/pos',
  '/messages',
  '/housekeeping',
  '/issues',
  '/rooms',
  '/stock',
];

const RECEPTION_TABS = ['/home', '/reservations', '/pos', '/messages'];
const RESTAURANT_TABS = ['/home', '/daily', '/orders', '/service'];
const CLIENT_TABS = ['/home', '/table', '/note', '/clean', '/desk'];
const VISITOR_TABS = ['/welcome', '/browse', '/carte', '/reviews', '/about'];

const RECEPTION_LABEL: Record<string, string> = {
  '/home': 'Accueil',
  '/reservations': 'Réservation',
  '/pos': 'Vente',
  '/messages': 'Messagerie',
};

const SHORT_LABEL: Record<string, string> = {
  '/home': 'Accueil',
  '/schedule': 'Planning',
  '/housekeeping': 'Sales',
  '/messages': 'Msg.',
  '/issues': 'Signal.',
  '/reservations': 'Réserv.',
  '/rooms': 'Chambres',
  '/pos': 'Ventes',
  '/stock': 'Économat',
  '/restaurant': 'Restaurant',
  '/service': 'Vente',
  '/orders': 'Commandes',
  '/daily': 'Du jour',
  '/drinks': 'Boisson',
  '/kitchen': 'Stock',
  '/browse': 'Chambres',
  '/table': 'Resto',
  '/stay': 'Historique',
  '/note': 'Note',
  '/clean': 'Nettoyage',
  '/desk': 'Messagerie',
  '/welcome': 'Accueil',
  '/about': 'À propos',
  '/prestations': 'Services',
  '/reviews': 'Avis',
  '/carte': 'Resto',
};

export function BottomTabBar({
  links,
  pathname,
  onNavigate,
  onMenu,
  menuOpen,
  role,
}: {
  links: WorkspaceLink[];
  pathname: string;
  onNavigate: (href: string) => void;
  onMenu: () => void;
  menuOpen: boolean;
  role?: string | null;
}) {
  const insets = useSafeAreaInsets();
  const order = role === 'receptionist' ? RECEPTION_TABS : role === 'restaurant' ? RESTAURANT_TABS : role === 'client' ? CLIENT_TABS : role === 'visitor' ? VISITOR_TABS : TAB_ORDER;
  const tabs = order.map((href) => links.find((item) => item.href === href)).filter(Boolean).slice(0, role === 'client' || role === 'visitor' ? 5 : 4) as WorkspaceLink[];

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.bar}>
        {tabs.map((item) => {
          const active = pathname === item.href || (item.href !== '/home' && pathname.startsWith(item.href));
          return (
            <Pressable key={item.href} onPress={() => onNavigate(item.href)} style={styles.tab}>
              <View style={[styles.iconWrap, active && styles.iconWrapOn, !active && styles.iconWrapOff]}>
                <AppIcon name={item.icon} size={22} color={active ? Palette.ink : Palette.ink} />
              </View>
              <Text numberOfLines={1} style={[styles.label, active && styles.labelOn]}>
                {role === 'receptionist' ? (RECEPTION_LABEL[item.href] ?? item.label) : role === 'restaurant' || role === 'client' ? (SHORT_LABEL[item.href] ?? item.label) : (SHORT_LABEL[item.href] ?? item.label)}
              </Text>
            </Pressable>
          );
        })}
        <Pressable onPress={onMenu} style={styles.tab}>
          <View style={[styles.iconWrap, menuOpen && styles.iconWrapOn, !menuOpen && styles.iconWrapOff]}>
            <Hamburger color={Palette.ink} size={22} />
          </View>
          <Text numberOfLines={1} style={[styles.label, menuOpen && styles.labelOn]}>
            Menu
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: Palette.white,
    borderTopWidth: 1,
    borderTopColor: 'rgba(212,175,55,0.35)',
    ...Platform.select({
      web: { boxShadow: '0 -4px 16px rgba(20,22,34,0.12)' },
      default: {
        shadowColor: Palette.ink,
        shadowOpacity: 0.12,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: -4 },
      },
    }),
    elevation: 18,
    zIndex: 20,
    overflow: 'visible',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingTop: 10,
    minHeight: 62,
    overflow: 'visible',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingBottom: 4,
  },
  iconWrap: {
    width: 36,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapOn: {
    backgroundColor: Palette.gold,
  },
  iconWrapOff: {
    opacity: 0.45,
  },
  label: {
    color: Palette.ink,
    opacity: 0.5,
    fontSize: 9,
    fontWeight: '700',
  },
  labelOn: {
    opacity: 1,
    color: Palette.ink,
    fontWeight: '800',
  },
});
