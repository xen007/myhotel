import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { usePathname, useRouter, type Href } from 'expo-router';
import { createElement, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';


import { AppIcon, type BoxIconName } from '@/components/box-icon';
import { BrandMark } from '@/components/brand/brand-mark';
import { GoldBtn } from '@/components/hotel/kit';
import { visitGutter } from '@/components/visit/visit-kit';
import { VisitScrollProvider, useVisitScroll } from '@/components/visit/visit-scroll';
import { ChevronUpMark, SocialMark } from '@/components/visit/visit-social';
import { Hamburger } from '@/components/nav/hamburger';
import { RightDrawer } from '@/components/nav/right-drawer';
import { Brand } from '@/constants/config';
import { Breakpoints, Palette } from '@/constants/theme';
import { useVisitCart } from '@/context/visit-cart';
import { useAuth } from '@/context/auth-context';
import { saveVisitNext } from '@/lib/visit-intent';
import { submitVisitCart } from '@/lib/visit-checkout';
import { money } from '@/lib/format';

export const VISIT_NAV = [
  { href: '/welcome', label: 'Accueil' },
  { href: '/browse', label: 'Nos chambres' },
  { href: '/welcome?section=services', label: 'Nos services' },
  { href: '/carte', label: 'Restaurant' },
  { href: '/boutique', label: 'Boutique' },
  { href: '/welcome?section=avis', label: 'Témoignages' },
  { href: '/welcome?section=contact', label: 'Contact' },
];

const VISIT_MENU: { href: string; label: string; icon: BoxIconName }[] = [
  { href: '/welcome', label: 'Accueil', icon: 'home' },
  { href: '/browse', label: 'Nos chambres', icon: 'bed' },
  { href: '/welcome?section=services', label: 'Nos services', icon: 'star' },
  { href: '/carte', label: 'Restaurant', icon: 'restaurant' },
  { href: '/boutique', label: 'Boutique', icon: 'cart' },
  { href: '/welcome?section=avis', label: 'Témoignages', icon: 'star' },
  { href: '/welcome?section=contact', label: 'Contact', icon: 'envelope' },
  { href: '/mentions', label: 'Mentions légales', icon: 'info-circle' },
  { href: '/confidentialite', label: 'Confidentialité', icon: 'lock-alt' },
  { href: '/conditions', label: 'Conditions générales', icon: 'food-menu' },
];

function pathOf(href: string) {
  return href.split('?')[0];
}

const MOBILE_TABS: { href: string; label: string; icon: BoxIconName }[] = [
  { href: '/welcome', label: 'Accueil', icon: 'home' },
  { href: '/browse', label: 'Chambres', icon: 'bed' },
  { href: '/carte', label: 'Restaurant', icon: 'restaurant' },
  { href: '/boutique', label: 'Boutique', icon: 'cart' },
];

export function VisitShell(props: { children: ReactNode; company?: { name?: string | null; slogan?: string | null; phone?: string | null; email?: string | null; address?: string | null; city?: string | null; website?: string | null } | null }) {
  const pageScroll = useRef<ScrollView>(null);
  const webBox = useRef<{ scrollTo: (opts: { top: number; behavior?: ScrollBehavior }) => void; scrollTop: number; getBoundingClientRect: () => { top: number } } | null>(null);
  return (
    <VisitScrollProvider scroller={pageScroll} webScroller={webBox}>
      <VisitShellFrame {...props} pageScroll={pageScroll} webBox={webBox} />
    </VisitScrollProvider>
  );
}

function VisitShellFrame({
  children,
  company,
  pageScroll,
  webBox,
}: {
  children: ReactNode;
  company?: { name?: string | null; slogan?: string | null; phone?: string | null; email?: string | null; address?: string | null; city?: string | null; website?: string | null } | null;
  pageScroll: RefObject<ScrollView | null>;
  webBox: RefObject<{ scrollTo: (opts: { top: number; behavior?: ScrollBehavior }) => void; scrollTop: number; getBoundingClientRect: () => { top: number } } | null>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const desktop = width >= Breakpoints.desktop;
  const { user, token } = useAuth();
  const cart = useVisitCart();
  const visitScroll = useVisitScroll();
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showTop, setShowTop] = useState(false);
  const year = new Date().getFullYear();
  const hotel = company?.name || Brand.name;
  const gutter = visitGutter(width);
  const insets = useSafeAreaInsets();

  function go(href: string) {
    setMenu(false);
    cart.setOpen(false);
    const [path, query] = href.split('?');
    const section = query ? new URLSearchParams(query).get('section') : null;
    const onHome = pathname === '/welcome' || pathname === '/';
    if (path === '/welcome' && onHome) {
      if (section) {
        visitScroll.to(section);
        router.setParams({ section });
        return;
      }
      if (Platform.OS === 'web') webBox.current?.scrollTo({ top: 0, behavior: 'smooth' });
      else pageScroll.current?.scrollTo({ y: 0, animated: true });
      router.setParams({ section: '' });
      return;
    }
    if (path === '/welcome' && section) {
      router.push({ pathname: '/welcome', params: { section } });
      return;
    }
    router.push((section ? { pathname: path, params: { section } } : href) as Href);
  }

  async function checkout() {
    setNotice(null);
    if (!user || !token) {
      await saveVisitNext(cart.lines.some((row) => row.source === 'shop') ? '/boutique' : '/carte');
      cart.setOpen(false);
      router.push('/login');
      return;
    }
    if (user.role !== 'client') {
      setNotice('Connectez-vous avec un compte client pour commander.');
      return;
    }
    if (!cart.lines.length) return;
    setBusy(true);
    try {
      await submitVisitCart(token, cart.lines);
      cart.clear();
      cart.setOpen(false);
      router.replace('/home');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Commande impossible.');
    } finally {
      setBusy(false);
    }
  }

  const nav = VISIT_NAV.map((item) => {
    const on = !item.href.includes('?') && pathname === pathOf(item.href);
    return (
      <Pressable key={item.label} onPress={() => go(item.href)} style={[styles.link, on && styles.linkOn]}>
        <Text style={[styles.linkText, on && styles.linkTextOn]} numberOfLines={1}>{item.label}</Text>
      </Pressable>
    );
  });

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <SafeAreaView edges={['top']} style={styles.top}>
        <View style={[styles.bar, { paddingHorizontal: gutter }]}>
          <Pressable onPress={() => go('/welcome')} style={[styles.brandRow, desktop && styles.brandRowDesk]}>
            <BrandMark size={width < 400 ? 28 : 36} />
            <Text style={[styles.brand, width < 400 && styles.brandSm]} numberOfLines={1}>
              {hotel}
            </Text>
          </Pressable>
          {desktop ? <View style={styles.navInline}>{nav}</View> : <View style={styles.grow} />}
          <View style={styles.actions}>
            <Pressable
              onPress={() => {
                setMenu(false);
                cart.setOpen(!cart.open);
              }}
              style={[styles.iconBtn, cart.open && styles.iconBtnOn]}
              accessibilityLabel="Panier">
              <AppIcon name="cart" size={20} color={Palette.ink} />
              {cart.count ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{cart.count > 9 ? '9+' : cart.count}</Text>
                </View>
              ) : null}
            </Pressable>
            <View style={styles.auth}>
              {user ? (
                <GoldBtn compact={desktop} tiny={!desktop} label={desktop ? 'Mon espace' : 'Espace'} onPress={() => go('/home')} />
              ) : (
                <>
                  <GoldBtn compact={desktop} tiny={!desktop} label="S’inscrire" onPress={() => go('/register')} />
                  <GoldBtn compact={desktop} tiny={!desktop} variant="ghost" label="Connexion" onPress={() => go('/login')} />
                </>
              )}
            </View>
          </View>
        </View>
      </SafeAreaView>

      <View style={styles.bodySlot}>
      {menu ? (
        <View style={styles.mobileMenu}>
          <View style={styles.menuBrand}>
            <BrandMark size={40} />
            <View>
              <Text style={styles.menuBrandName}>{hotel}</Text>
              <Text style={styles.menuBrandRole}>Menu</Text>
            </View>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.menuList}>
            {VISIT_MENU.map((item) => {
              const on = !item.href.includes('?') && pathname === pathOf(item.href);
              return (
                <Pressable key={item.label} onPress={() => go(item.href)} style={[styles.menuNavItem, on && styles.menuNavItemOn]}>
                  <AppIcon name={item.icon} size={20} color={on ? Palette.gold : Palette.white} />
                  <Text numberOfLines={1} style={[styles.menuNavLabel, on && styles.menuNavLabelOn]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable onPress={() => go(user ? '/home' : '/login')} style={styles.menuLogout}>
            <AppIcon name="user" size={18} color={Palette.ink} />
            <Text style={styles.menuLogoutText}>{user ? 'Mon espace' : 'Connexion'}</Text>
          </Pressable>
        </View>
      ) : (
      <>
      {createElement(
        Platform.OS === 'web' ? 'div' : ScrollView,
        (Platform.OS === 'web'
          ? {
              ref: (node: HTMLDivElement | null) => {
                webBox.current = node;
              },
              style: {
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                overflowX: 'hidden',
                backgroundColor: Palette.white,
                paddingBottom: desktop ? 0 : 8,
              },
              onScroll: (event: { currentTarget: { scrollTop: number } }) => setShowTop(event.currentTarget.scrollTop > 380),
            }
          : {
              ref: pageScroll,
              style: styles.body,
              contentContainerStyle: styles.scroll,
              showsVerticalScrollIndicator: false,
              onScroll: (event: { nativeEvent: { contentOffset: { y: number } } }) => setShowTop(event.nativeEvent.contentOffset.y > 380),
              scrollEventThrottle: 16,
            }) as never,
        children,
        (
        <View style={[styles.footer, { paddingHorizontal: gutter }]}>
          <View style={styles.footerGrid}>
            <View style={styles.footerBrand}>
              <View style={styles.brandRow}>
                <BrandMark size={40} />
                <Text style={styles.footerName}>{hotel}</Text>
              </View>
              <Text style={styles.footerCopy}>
                {company?.slogan || Brand.tagline}. Accueil, confort et table soignée.
              </Text>
              {company?.phone ? (
                <View style={styles.footFact}>
                  <View style={styles.footIcon}><AppIcon name="phone" size={16} color={Palette.ink} /></View>
                  <Text style={styles.footerCopy}>{company.phone}</Text>
                </View>
              ) : null}
              <View style={styles.footFact}>
                <View style={styles.footIcon}><AppIcon name="time" size={16} color={Palette.ink} /></View>
                <Text style={styles.footerCopy}>Réception 24h/24 7j/7</Text>
              </View>
              <View style={styles.footFact}>
                <View style={styles.footIcon}><AppIcon name="map" size={16} color={Palette.ink} /></View>
                <Text style={styles.footerCopy}>{[company?.address, 'Bertoua', 'Cameroun'].filter(Boolean).join(', ')}</Text>
              </View>
              {company?.email ? (
                <View style={styles.footFact}>
                  <View style={styles.footIcon}><AppIcon name="envelope" size={16} color={Palette.ink} /></View>
                  <Text style={styles.footerCopy}>{company.email}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.footerCol}>
              <Text style={styles.footerTitle}>Navigation</Text>
              <View style={styles.footerRule} />
              {VISIT_NAV.map((item) => (
                <Pressable key={item.label} onPress={() => go(item.href)} style={styles.footNav}>
                  <AppIcon name="chevron-right" size={14} color={Palette.gold} />
                  <Text style={styles.footerLink}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.footerCol}>
              <Text style={styles.footerTitle}>Séjour</Text>
              <View style={styles.footerRule} />
              <Pressable onPress={() => go('/browse')} style={styles.footNav}>
                <AppIcon name="chevron-right" size={14} color={Palette.gold} />
                <Text style={styles.footerLink}>Nos chambres</Text>
              </Pressable>
              <Pressable onPress={() => go('/welcome?section=services')} style={styles.footNav}>
                <AppIcon name="chevron-right" size={14} color={Palette.gold} />
                <Text style={styles.footerLink}>Nos services</Text>
              </Pressable>
              <Pressable onPress={() => go('/login')} style={styles.footNav}>
                <AppIcon name="chevron-right" size={14} color={Palette.gold} />
                <Text style={styles.footerLink}>Connexion</Text>
              </Pressable>
              <Pressable onPress={() => go('/register')} style={styles.footNav}>
                <AppIcon name="chevron-right" size={14} color={Palette.gold} />
                <Text style={styles.footerLink}>Inscription</Text>
              </Pressable>
            </View>
            <View style={styles.footerCol}>
              <Text style={styles.footerTitle}>Informations</Text>
              <View style={styles.footerRule} />
              <Pressable onPress={() => go('/mentions')} style={styles.footNav}>
                <AppIcon name="chevron-right" size={14} color={Palette.gold} />
                <Text style={styles.footerLink}>Mentions légales</Text>
              </Pressable>
              <Pressable onPress={() => go('/confidentialite')} style={styles.footNav}>
                <AppIcon name="chevron-right" size={14} color={Palette.gold} />
                <Text style={styles.footerLink}>Confidentialité</Text>
              </Pressable>
              <Pressable onPress={() => go('/conditions')} style={styles.footNav}>
                <AppIcon name="chevron-right" size={14} color={Palette.gold} />
                <Text style={styles.footerLink}>Conditions générales</Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.footerBottom}>
            <Text style={styles.copy} numberOfLines={1}>© {year} {hotel}. Tous droits réservés.</Text>
            <View style={styles.socials}>
              <Pressable
                onPress={() => {
                  const digits = String(company?.phone || '').replace(/\D/g, '');
                  void Linking.openURL(digits ? `https://wa.me/${digits}` : 'https://wa.me/');
                }}
                style={[styles.social, width < 760 && styles.socialSm]}
                accessibilityLabel="WhatsApp">
                <SocialMark name="whatsapp" size={width < 760 ? 12 : 16} />
              </Pressable>
              <Pressable onPress={() => void Linking.openURL('https://www.facebook.com/')} style={[styles.social, width < 760 && styles.socialSm]} accessibilityLabel="Facebook">
                <SocialMark name="facebook" size={width < 760 ? 12 : 16} />
              </Pressable>
              <Pressable onPress={() => void Linking.openURL('https://www.instagram.com/')} style={[styles.social, width < 760 && styles.socialSm]} accessibilityLabel="Instagram">
                <SocialMark name="instagram" size={width < 760 ? 12 : 16} />
              </Pressable>
              <Pressable onPress={() => void Linking.openURL('https://x.com/')} style={[styles.social, width < 760 && styles.socialSm]} accessibilityLabel="X">
                <SocialMark name="x" size={width < 760 ? 11 : 14} />
              </Pressable>
            </View>
          </View>
        </View>
        ),
      )}

      <RightDrawer contained open={cart.open} onClose={() => cart.setOpen(false)}>
        <View style={styles.cartPanel}>
          <View style={styles.cartHeader}>
            <View style={styles.cartHeaderCopy}>
              <View style={styles.cartTitleRow}>
                <Text style={styles.cartTitle}>Panier</Text>
                {cart.count ? (
                  <View style={styles.cartCount}><Text style={styles.cartCountText}>{cart.count}</Text></View>
                ) : null}
              </View>
            </View>
            <Pressable onPress={() => cart.setOpen(false)} hitSlop={8} accessibilityLabel="Fermer">
              <AppIcon name="x-circle" size={22} color={Palette.ink} />
            </Pressable>
          </View>
          <ScrollView style={styles.cartList} contentContainerStyle={styles.cartBody} showsVerticalScrollIndicator={false}>
            {cart.lines.map((line) => (
              <View key={`${line.source}-${line.id}`} style={styles.cartCard}>
                {line.photo ? <Image source={{ uri: line.photo }} style={styles.cartPhoto} contentFit="cover" /> : (
                  <View style={[styles.cartPhoto, styles.cartPhotoEmpty]}><AppIcon name="cart" size={18} color={Palette.gold} /></View>
                )}
                <View style={styles.cartCopy}>
                  <Text style={styles.cartName}>{line.name}</Text>
                  <Text style={styles.cartMeta}>{money(line.price)} · {line.source === 'shop' ? 'Boutique' : 'Restaurant'}</Text>
                  <View style={styles.qty}>
                    <Pressable onPress={() => cart.setQty(line.source, line.id, line.qty - 1)} style={styles.qtyBtn}><Text style={styles.qtyTxt}>−</Text></Pressable>
                    <Text style={styles.qtyVal}>{line.qty}</Text>
                    <Pressable onPress={() => cart.setQty(line.source, line.id, line.qty + 1)} style={styles.qtyBtn}><Text style={styles.qtyTxt}>+</Text></Pressable>
                  </View>
                </View>
                <Text style={styles.cartPrice}>{money(line.qty * line.price)}</Text>
              </View>
            ))}
            {!cart.lines.length ? (
              <View style={styles.cartEmpty}>
                <AppIcon name="cart" size={28} color={Palette.gold} />
                <Text style={styles.cartEmptyTitle}>Votre panier est vide.</Text>
              </View>
            ) : null}
          </ScrollView>
          <View style={styles.cartFooter}>
            {notice ? <Text style={styles.notice}>{notice}</Text> : null}
            <View style={styles.cartFoot}>
              <Text style={styles.cartTotal}>{money(cart.total)}</Text>
              <GoldBtn compact label={busy ? 'Envoi…' : user ? 'Valider ma commande' : 'Commander'} onPress={() => void checkout()} />
            </View>
          </View>
        </View>
      </RightDrawer>
      </>
      )}
      </View>

      {!desktop ? (
        <View style={[styles.mobileNav, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          {MOBILE_TABS.map((item) => {
            const on = pathname === pathOf(item.href) || (item.href !== '/welcome' && pathname.startsWith(pathOf(item.href)));
            return (
              <Pressable key={item.href} onPress={() => go(item.href)} style={styles.mobileTab} accessibilityLabel={item.label}>
                <View style={[styles.mobileIcon, on && styles.mobileIconOn]}>
                  <AppIcon name={item.icon} size={20} color={Palette.ink} />
                </View>
                <Text numberOfLines={1} style={[styles.mobileLabel, on && styles.mobileLabelOn]}>{item.label}</Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => {
              cart.setOpen(false);
              setMenu((open) => !open);
            }}
            style={styles.mobileTab}
            accessibilityLabel="Menu">
            <View style={[styles.mobileIcon, menu && styles.mobileIconOn]}>
              <Hamburger color={Palette.ink} size={20} />
            </View>
            <Text numberOfLines={1} style={[styles.mobileLabel, menu && styles.mobileLabelOn]}>Menu</Text>
          </Pressable>
        </View>
      ) : null}

      {showTop && !cart.open && !menu ? (
        <Pressable
          onPress={() => {
            if (Platform.OS === 'web') webBox.current?.scrollTo({ top: 0, behavior: 'smooth' });
            else pageScroll.current?.scrollTo({ y: 0, animated: true });
          }}
          style={[styles.toTop, !desktop && styles.toTopMobile]}
          accessibilityLabel="Remonter">
          <ChevronUpMark size={22} />
        </Pressable>
      ) : null}

    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.white, overflow: 'hidden' },
  bodySlot: { flex: 1, minHeight: 0, position: 'relative' },
  top: { backgroundColor: Palette.white, zIndex: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(212,175,55,0.35)' },
  iconBtnOn: { backgroundColor: Palette.gold },
  bar: { flexDirection: 'row', alignItems: 'center', flexWrap: 'nowrap', gap: 8, paddingHorizontal: 12, minHeight: 60 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0, maxWidth: 148 },
  brandRowDesk: { maxWidth: 200 },
  brand: { color: Palette.ink, fontWeight: '800', fontSize: 16, letterSpacing: 0.5 },
  brandSm: { fontSize: 13 },
  grow: { flex: 1 },
  navInline: { flex: 1, flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', justifyContent: 'center', gap: 0, minWidth: 0, paddingHorizontal: 4 },
  link: { paddingVertical: 6, paddingHorizontal: 5, borderRadius: 999, flexShrink: 1 },
  linkOn: { backgroundColor: Palette.gold },
  linkText: { color: Palette.ink, fontSize: 13, fontWeight: '700' },
  linkTextOn: { fontWeight: '800' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 8, paddingLeft: 10, borderLeftWidth: 1, borderLeftColor: 'rgba(212,175,55,0.45)' },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: Palette.gold, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: Palette.ink, fontSize: 9, fontWeight: '800' },
  auth: { flexDirection: 'row', gap: 6, flexShrink: 0, flexWrap: 'wrap' },
  body: { flex: 1, minHeight: 0, backgroundColor: Palette.white },
  scroll: { flexGrow: 1 },
  footer: { backgroundColor: Palette.ink, paddingTop: 48, paddingBottom: 0, gap: 28 },
  footerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 32 },
  footerBrand: { flexGrow: 1, flexBasis: 240, gap: 12, maxWidth: 360 },
  footerCol: { flexGrow: 1, flexBasis: 160, gap: 6 },
  footerName: { color: Palette.gold, fontWeight: '800', fontSize: 18, letterSpacing: 0.6 },
  footerTitle: { color: Palette.white, fontWeight: '800', letterSpacing: 0.4, fontSize: 16 },
  footerRule: { width: 42, height: 3, backgroundColor: Palette.gold, borderRadius: 99, marginBottom: 8 },
  footerCopy: { color: Palette.white, opacity: 0.78, fontSize: 13, lineHeight: 20, flex: 1 },
  footerLink: { color: Palette.white, fontSize: 14 },
  footNav: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5 },
  footFact: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  footIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: Palette.gold, alignItems: 'center', justifyContent: 'center' },
  footerBottom: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', paddingVertical: 12, paddingHorizontal: 4, flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  socials: { flexDirection: 'row', gap: 4, flexShrink: 0 },
  social: { width: 32, height: 32, borderRadius: 16, backgroundColor: Palette.gold, alignItems: 'center', justifyContent: 'center' },
  socialSm: { width: 24, height: 24, borderRadius: 12 },
  copy: { color: Palette.white, opacity: 0.55, fontSize: 11, flexGrow: 1, flexShrink: 1, minWidth: 0, marginRight: 6 },
  mobileMenu: { flex: 1, backgroundColor: Palette.ink, minHeight: 0, paddingTop: 16, paddingHorizontal: 12, paddingBottom: 16 },
  menuBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(212,175,55,0.22)',
    marginBottom: 12,
  },
  menuBrandName: { color: Palette.gold, fontWeight: '800', fontSize: 16, letterSpacing: 0.5 },
  menuBrandRole: { color: Palette.white, opacity: 0.65, fontSize: 12, marginTop: 2 },
  menuList: { gap: 4, paddingBottom: 20 },
  menuNavItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  menuNavItemOn: { backgroundColor: 'rgba(212,175,55,0.16)' },
  menuNavLabel: { color: Palette.white, fontSize: 14, fontWeight: '600', flex: 1 },
  menuNavLabelOn: { color: Palette.gold, fontWeight: '800' },
  menuLogout: {
    marginTop: 8,
    backgroundColor: Palette.gold,
    borderRadius: 16,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  menuLogoutText: { color: Palette.ink, fontWeight: '800' },
  cartPanel: { flex: 1, backgroundColor: Palette.white },
  cartHeader: { backgroundColor: Palette.gold, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cartHeaderCopy: { flex: 1 },
  cartTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cartTitle: { color: Palette.ink, fontSize: 16, fontWeight: '800' },
  cartCount: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: Palette.ink, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  cartCountText: { color: Palette.white, fontSize: 11, fontWeight: '800' },
  cartList: { flex: 1 },
  cartBody: { padding: 12, gap: 8, paddingBottom: 24 },
  cartCard: { flexDirection: 'row', gap: 10, padding: 10, alignItems: 'center', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(20,22,34,0.08)', backgroundColor: Palette.white },
  cartPhoto: { width: 56, height: 56, borderRadius: 12, backgroundColor: 'rgba(20,22,34,0.06)' },
  cartPhotoEmpty: { alignItems: 'center', justifyContent: 'center' },
  cartCopy: { flex: 1, gap: 4, minWidth: 0 },
  cartName: { color: Palette.ink, fontWeight: '800' },
  cartMeta: { color: Palette.ink, opacity: 0.55, fontSize: 12 },
  cartPrice: { color: Palette.ink, fontWeight: '800' },
  cartEmpty: { alignItems: 'center', gap: 8, paddingVertical: 40 },
  cartEmptyTitle: { color: Palette.ink, fontWeight: '700' },
  cartFooter: { borderTopWidth: 1, borderTopColor: 'rgba(20,22,34,0.08)', padding: 12, gap: 8 },
  qty: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Palette.gold, borderRadius: 10, alignSelf: 'flex-start', overflow: 'hidden' },
  qtyBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: Palette.gold },
  qtyTxt: { color: Palette.ink, fontWeight: '800' },
  qtyVal: { minWidth: 24, textAlign: 'center', fontWeight: '800' },
  cartFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  cartTotal: { color: Palette.ink, fontWeight: '800', fontSize: 18 },
  notice: { color: Palette.ink, fontWeight: '700', backgroundColor: 'rgba(212,175,55,0.2)', padding: 10, borderRadius: 12 },
  toTop: {
    position: 'absolute',
    right: 18,
    bottom: 88,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
    elevation: 8,
  },
  toTopMobile: { bottom: 118 },
  mobileNav: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: Palette.white,
    borderTopWidth: 1,
    borderTopColor: 'rgba(212,175,55,0.35)',
    paddingHorizontal: 4,
    paddingTop: 8,
    zIndex: 20,
    ...Platform.select({
      web: { boxShadow: '0 -4px 16px rgba(20,22,34,0.1)' },
      default: { elevation: 16 },
    }),
  },
  mobileTab: { flex: 1, alignItems: 'center', gap: 3, paddingBottom: 2, minWidth: 0 },
  mobileIcon: { width: 36, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  mobileIconOn: { backgroundColor: Palette.gold },
  mobileLabel: { color: Palette.ink, opacity: 0.5, fontSize: 9, fontWeight: '700' },
  mobileLabelOn: { opacity: 1, fontWeight: '800' },
});
