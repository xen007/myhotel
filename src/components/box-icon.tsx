import { useEffect, useState } from 'react';
import { Platform, Text } from 'react-native';
import * as Font from 'expo-font';

import { Palette } from '@/constants/theme';

export const boxiconsGlyphMap = {
  'bar-chart-alt-2': 0xe9c6,
  bath: 0xe9cd,
  bed: 0xe9cf,
  bell: 0xe9d2,
  briefcase: 0xea00,
  building: 0xea0a,
  bulb: 0xea0d,
  cabinet: 0xea12,
  cart: 0xea36,
  calendar: 0xea15,
  'check-circle': 0xea46,
  'chevron-left': 0xea4d,
  'chevron-right': 0xea50,
  coffee: 0xea6c,
  cog: 0xea6e,
  'credit-card': 0xea87,
  'door-open': 0xeab0,
  droplet: 0xeabc,
  edit: 0xeabf,
  envelope: 0xeac1,
  'error-circle': 0xeac7,
  'food-menu': 0xeae7,
  fridge: 0xeaea,
  'grid-alt': 0xeafb,
  group: 0xeaff,
  hide: 0xeb0e,
  home: 0xeb12,
  'id-card': 0xeb1a,
  'info-circle': 0xeb21,
  key: 0xeb28,
  'lock-alt': 0xeb4a,
  'log-out': 0xeb4f,
  map: 0xeb56,
  money: 0xeb93,
  phone: 0xebb2,
  'phone-call': 0xebb3,
  plus: 0xebc0,
  printer: 0xebc9,
  paperclip: 0xebad,
  receipt: 0xebd5,
  restaurant: 0xebe1,
  search: 0xebf7,
  shower: 0xef54,
  show: 0xec0c,
  download: 0xead6,
  spa: 0xec20,
  star: 0xec27,
  time: 0xec45,
  trash: 0xec50,
  tv: 0xec57,
  user: 0xec63,
  'user-circle': 0xec65,
  wallet: 0xec78,
  wifi: 0xec7c,
  wind: 0xec81,
  'x-circle': 0xec8e,
} as const;

export type BoxIconName = keyof typeof boxiconsGlyphMap;

const fontSource = require('../../assets/fonts/boxicons.ttf') as number;

function ensureWebFont() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (document.getElementById('boxicons-font')) return;
  const style = document.createElement('style');
  style.id = 'boxicons-font';
  style.textContent = `
    @font-face {
      font-family: 'boxicons';
      font-weight: normal;
      font-style: normal;
      src: url('/fonts/boxicons.woff2') format('woff2'),
           url('/fonts/boxicons.ttf') format('truetype');
    }
  `;
  document.head.appendChild(style);
}

type AppIconProps = {
  name: string;
  size?: number;
  color?: string;
};

export function AppIcon({ name, size = 22, color = Palette.ink }: AppIconProps) {
  const [ready, setReady] = useState(Platform.OS === 'web');
  const iconName = (name in boxiconsGlyphMap ? name : 'star') as BoxIconName;
  const glyph = String.fromCodePoint(boxiconsGlyphMap[iconName]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      ensureWebFont();
      setReady(true);
      return;
    }
    if (Font.isLoaded('boxicons')) {
      setReady(true);
      return;
    }
    let cancelled = false;
    Font.loadAsync({ boxicons: fontSource })
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return <Text style={{ width: size, height: size }} />;
  }

  return (
    <Text
      accessibilityRole="image"
      style={{
        fontFamily: 'boxicons',
        fontSize: size,
        lineHeight: size,
        color,
        includeFontPadding: false,
        textAlign: 'center',
        width: size,
        height: size,
      }}>
      {glyph}
    </Text>
  );
}
