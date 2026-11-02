import { Redirect } from 'expo-router';

import { DishBoard } from '@/components/hotel/dish-board';
import { useAuth } from '@/context/auth-context';

export default function DailyScreen() {
  const { user, ready } = useAuth();
  const allowed = user?.role === 'restaurant' || user?.role === 'manager' || user?.role === 'owner';
  if (!ready) return null;
  if (!user) return <Redirect href="/welcome" />;
  if (!allowed) return <Redirect href="/home" />;
  return <DishBoard mode="daily" />;
}
