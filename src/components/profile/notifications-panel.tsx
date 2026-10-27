import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon, type BoxIconName } from '@/components/box-icon';
import { Palette } from '@/constants/theme';
import type { HotelNotification } from '@/lib/api';

function timeAgo(value: string) {
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return '';
  const mins = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));
  if (mins < 60) return `Il y a ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  const days = Math.round(hours / 24);
  return `Il y a ${days} j`;
}

function iconFor(category: string): BoxIconName {
  const key = category.toUpperCase();
  if (key.includes('COMPTE')) return 'user';
  if (key.includes('RÉSA') || key.includes('RESA')) return 'calendar';
  if (key.includes('ÉTAGE') || key.includes('ETAGE')) return 'bed';
  if (key.includes('MAINT')) return 'cog';
  if (key.includes('SIGNAL') || key.includes('URGEN')) return 'error-circle';
  return 'bell';
}

export function NotificationsPanel({
  items,
  unread,
  onClose,
  onRead,
  onReadAll,
  onOpen,
  embed,
}: {
  items: HotelNotification[];
  unread: number;
  onClose: () => void;
  onRead: (id: number) => void;
  onReadAll: () => void;
  onOpen?: (href?: string | null) => void;
  embed?: boolean;
}) {
  return (
    <View style={styles.panel}>
      <SafeAreaView edges={embed ? [] : ['top']} style={styles.header}>
        <View style={styles.headerCopy}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Notifications</Text>
            {unread > 0 ? (
              <View style={styles.count}>
                <Text style={styles.countText}>{unread}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <Pressable onPress={onClose} hitSlop={8}>
          <AppIcon name="x-circle" size={22} color={Palette.ink} />
        </Pressable>
      </SafeAreaView>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {items.length === 0 ? (
          <View style={styles.empty}>
            <AppIcon name="bell" size={28} color={Palette.gold} />
            <Text style={styles.emptyTitle}>Aucune notification</Text>
          </View>
        ) : (
          items.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => {
                if (!item.is_read) onRead(item.id);
                onOpen?.(item.href);
              }}
              style={[styles.card, !item.is_read && styles.cardUnread]}>
              <View style={styles.iconBox}>
                <AppIcon name={iconFor(item.category)} size={14} color={Palette.ink} />
              </View>
              <View style={styles.cardCopy}>
                <View style={styles.meta}>
                  <Text style={styles.category}>{item.category}</Text>
                  <Text style={styles.ago}>{timeAgo(item.created_at)}</Text>
                </View>
                <Text style={styles.cardTitle}>{item.title}</Text>
                {item.body ? <Text style={styles.cardBody} numberOfLines={2}>{item.body}</Text> : null}
              </View>
              <Pressable
                onPress={() => {
                  if (!item.is_read) onRead(item.id);
                }}
                hitSlop={8}
                style={[styles.check, item.is_read && styles.checkOn]}>
                {item.is_read ? <AppIcon name="check-circle" size={18} color={Palette.gold} /> : null}
              </Pressable>
            </Pressable>
          ))
        )}
      </ScrollView>

      <SafeAreaView edges={embed ? [] : ['bottom']} style={styles.footer}>
        <Pressable onPress={onClose} style={styles.ghost}>
          <Text style={styles.ghostText}>Fermer</Text>
        </Pressable>
        {unread > 0 ? (
          <Pressable onPress={onReadAll} style={styles.gold}>
            <AppIcon name="check-circle" size={16} color={Palette.ink} />
            <Text style={styles.goldText}>Tout lu</Text>
          </Pressable>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    backgroundColor: Palette.white,
  },
  header: {
    backgroundColor: Palette.gold,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerCopy: {
    flex: 1,
  },
  kicker: {
    color: Palette.ink,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    lineHeight: 14,
    textTransform: 'uppercase',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  title: {
    color: Palette.ink,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 20,
  },
  count: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  countText: {
    color: Palette.white,
    fontSize: 11,
    fontWeight: '800',
  },
  scroll: {
    flex: 1,
  },
  body: {
    padding: 8,
    gap: 6,
    paddingBottom: 12,
  },
  empty: {
    paddingVertical: 60,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    color: Palette.ink,
    fontWeight: '800',
    fontSize: 14,
    lineHeight: 18,
  },
  card: {
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(20,22,34,0.08)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: Palette.white,
  },
  cardUnread: {
    borderColor: Palette.gold,
  },
  iconBox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: Palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardCopy: {
    flex: 1,
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  category: {
    color: Palette.gold,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
    lineHeight: 14,
  },
  ago: {
    color: Palette.ink,
    opacity: 0.45,
    fontSize: 11,
  },
  cardTitle: {
    color: Palette.ink,
    fontWeight: '800',
    fontSize: 13,
    lineHeight: 16,
    marginTop: 1,
  },
  cardBody: {
    color: Palette.ink,
    opacity: 0.7,
    fontSize: 12,
    marginTop: 1,
    lineHeight: 16,
  },
  open: {
    color: Palette.gold,
    fontWeight: '800',
    fontSize: 12,
    marginTop: 8,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(20,22,34,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkOn: {
    borderColor: Palette.gold,
  },
  footer: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(20,22,34,0.06)',
  },
  ghost: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.white,
  },
  ghostText: {
    color: Palette.ink,
    fontWeight: '800',
    fontSize: 14,
    lineHeight: 18,
  },
  gold: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    backgroundColor: Palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  goldText: {
    color: Palette.ink,
    fontWeight: '800',
    fontSize: 14,
    lineHeight: 18,
  },
});
