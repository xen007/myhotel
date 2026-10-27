import { Redirect } from 'expo-router';

import { MessageDesk } from '@/app/messages';
import { useAuth } from '@/context/auth-context';

export default function DeskScreen() {
  const { user, ready } = useAuth();
  if (ready && !user) return <Redirect href="/welcome" />;
  if (ready && user && user.role !== 'client') return <Redirect href="/home" />;
  return <MessageDesk clientDesk />;
}
