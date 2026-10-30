import { AppIcon } from '@/components/box-icon';
import { Palette } from '@/constants/theme';

export type AuthIconName = 'person' | 'lock' | 'mail' | 'phone' | 'eye' | 'eye-off';

const map = {
  person: 'user',
  lock: 'lock-alt',
  mail: 'envelope',
  phone: 'phone',
  eye: 'show',
  'eye-off': 'hide',
} as const;

export function AuthIcon({ name, color = Palette.ink, size = 22 }: { name: AuthIconName; color?: string; size?: number }) {
  return <AppIcon name={map[name]} size={size} color={color} />;
}
