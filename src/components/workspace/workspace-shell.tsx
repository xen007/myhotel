import { Redirect, usePathname, useRouter, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/box-icon';
import { BrandMark } from '@/components/brand/brand-mark';
import { AppBar } from '@/components/nav/app-bar';
import { BottomTabBar } from '@/components/nav/bottom-tab-bar';
import { RightDrawer } from '@/components/nav/right-drawer';
import { NotificationsPanel } from '@/components/profile/notifications-panel';
import { ProfilePanel } from '@/components/profile/profile-panel';
import { Brand } from '@/constants/config';
import { CLIENT_LINKS, isStaffRole, linksFor, ROLE_LABEL } from '@/constants/roles';
import { Breakpoints, Palette } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useNotifications } from '@/hooks/use-notifications';

type Panel = 'profile' | 'notifications';

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, ready, logout } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = width >= Breakpoints.desktop;
  const [right, setRight] = useState<Panel | null>(null);
  const [panel, setPanel] = useState<Panel>('profile');
  const [menuOpen, setMenuOpen] = useState(false);
  const { items, unread, reload, mark, markAll } = useNotifications();
  const client = user?.role === 'client';
  const links = client ? CLIENT_LINKS : linksFor(user?.role);

  if (ready && !user) return <Redirect href="/welcome" />;
  if (ready && user && !isStaffRole(user.role) && !client) {
    return <Redirect href="/home" />;
  }

  function go(href: string) {
    setMenuOpen(false);
    setRight(null);
    router.push(href as Href);
  }

  async function signOut() {
    setMenuOpen(false);
    setRight(null);
    await logout();
    router.replace('/welcome');
  }

  const navItems = links.map((item) => {
    const active = pathname === item.href || (item.href !== '/home' && pathname.startsWith(item.href));
    return (
      <Pressable key={item.href} onPress={() => go(item.href)} style={[styles.navItem, active && styles.navItemOn]}>
        {client ? null : <AppIcon name={item.icon} size={20} color={active ? Palette.gold : Palette.white} />}
        <Text numberOfLines={1} style={[styles.navLabel, active && styles.navLabelOn]}>
          {item.label}
        </Text>
      </Pressable>
    );
  });

  const sidebar = (
    <View style={styles.sidebarInner}>
      <View style={styles.brandBlock}>
        <BrandMark size={40} />
        <View>
          <Text style={styles.brand}>{Brand.name}</Text>
          <Text style={styles.role}>{ROLE_LABEL[(user?.role as keyof typeof ROLE_LABEL) ?? 'client']}</Text>
        </View>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.navList}>
        {navItems}
      </ScrollView>
      <Pressable onPress={() => void signOut()} style={styles.logout}>
        <AppIcon name="log-out" size={18} color={Palette.ink} />
        <Text style={styles.logoutText}>Déconnexion</Text>
      </Pressable>
    </View>
  );

  const bar = (
    <AppBar
      showBrand={!isDesktop}
      actionsOnly={isDesktop && client}
      unread={unread}
      onNotifications={() => {
        void reload();
        setMenuOpen(false);
        setPanel('notifications');
        setRight((c) => (c === 'notifications' ? null : 'notifications'));
      }}
      onProfile={() => {
        setMenuOpen(false);
        setPanel('profile');
        setRight((c) => (c === 'profile' ? null : 'profile'));
      }}
      notificationsOpen={right === 'notifications'}
      profileOpen={right === 'profile'}
    />
  );

  const drawer = panel === 'notifications' ? (
          <NotificationsPanel
            embed={!isDesktop}
            items={items}
            unread={unread}
            onClose={() => setRight(null)}
            onRead={(id) => void mark(id)}
            onReadAll={() => void markAll()}
            onOpen={(href) => {
              setRight(null);
              if (href) go(href);
            }}
          />
        ) : (
          <ProfilePanel embed={!isDesktop} onClose={() => setRight(null)} />
        );

  const clientBar = (
    <View style={styles.clientBar}>
      <View style={styles.clientBrand}>
        <BrandMark size={32} />
        <Text style={styles.clientBrandName}>{Brand.name}</Text>
      </View>
      <View style={styles.clientGrow} />
      <View style={styles.clientNav}>
        {links.map((item) => {
          const active = pathname === item.href || (item.href !== '/home' && pathname.startsWith(item.href));
          return (
            <Pressable key={item.href} onPress={() => go(item.href)} style={[styles.clientLink, active && styles.clientLinkOn]}>
              <Text numberOfLines={1} style={[styles.clientLinkText, active && styles.clientLinkTextOn]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {bar}
    </View>
  );

  return (
    <View style={styles.screen}>
      <StatusBar style={isDesktop && !client ? 'light' : 'dark'} />
      {isDesktop && client ? (
        <View style={styles.clientDesktop}>
          {clientBar}
          <View style={styles.body}>{children}</View>
        </View>
      ) : isDesktop ? (
        <View style={styles.desktop}>
          <View style={styles.sidebar}>{sidebar}</View>
          <View style={styles.main}>
            {bar}
            <View style={styles.body}>{children}</View>
          </View>
        </View>
      ) : (
        <View style={styles.mobile}>
          <SafeAreaView edges={['top']} style={styles.mobileTop}>
            {bar}
          </SafeAreaView>
          <View style={styles.body}>{menuOpen ? <View style={styles.mobileMenu}>{sidebar}</View> : right ? drawer : children}</View>
          <BottomTabBar
            links={links}
            role={user?.role}
            pathname={pathname}
            menuOpen={menuOpen}
            onNavigate={go}
            onMenu={() => {
              setRight(null);
              setMenuOpen((v) => !v);
            }}
          />
        </View>
      )}
      {isDesktop ? (
      <RightDrawer open={right !== null} onClose={() => setRight(null)}>
        {drawer}
      </RightDrawer>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.white, overflow: 'hidden' },
  desktop: { flex: 1, flexDirection: 'row' },
  sidebar: {
    width: 248,
    backgroundColor: Palette.ink,
  },
  sidebarInner: {
    flex: 1,
    paddingTop: 16,
    paddingHorizontal: 12,
    paddingBottom: 16,
  },
  brandBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(212,175,55,0.22)',
    marginBottom: 12,
  },
  brand: { color: Palette.gold, fontWeight: '800', fontSize: 16, letterSpacing: 0.5 },
  role: { color: Palette.white, opacity: 0.65, fontSize: 12, marginTop: 2 },
  navList: { gap: 4, paddingBottom: 20 },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  navItemOn: { backgroundColor: 'rgba(212,175,55,0.16)' },
  navLabel: { color: Palette.white, fontSize: 14, fontWeight: '600', flex: 1 },
  navLabelOn: { color: Palette.gold, fontWeight: '800' },
  logout: {
    marginTop: 8,
    backgroundColor: Palette.gold,
    borderRadius: 16,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  logoutText: { color: Palette.ink, fontWeight: '800' },
  main: { flex: 1, backgroundColor: '#F6F7FA', minHeight: 0 },
  body: { flex: 1, minHeight: 0 },
  mobile: { flex: 1, backgroundColor: '#F6F7FA', minHeight: 0 },
  mobileTop: { backgroundColor: Palette.white },
  mobileMenu: { flex: 1, backgroundColor: Palette.ink, minHeight: 0 },
  clientDesktop: { flex: 1, backgroundColor: '#F6F7FA', minHeight: 0 },
  clientBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 16,
    backgroundColor: Palette.white,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(212,175,55,0.45)',
    minHeight: 64,
  },
  clientBrand: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  clientBrandName: { color: Palette.ink, fontWeight: '800', fontSize: 16, letterSpacing: 0.4 },
  clientGrow: { flex: 1, minWidth: 12 },
  clientNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, flexShrink: 1, flexWrap: 'wrap' },
  clientLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  clientLinkOn: { backgroundColor: Palette.gold },
  clientLinkText: { color: Palette.ink, fontSize: 13, fontWeight: '600' },
  clientLinkTextOn: { fontWeight: '800' },
});
