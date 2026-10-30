import { Redirect } from 'expo-router';

import { useAuth } from '@/context/auth-context';

export default function ContactScreen() {
  const { user, ready } = useAuth();
  if (ready && user) return <Redirect href={user.role === 'client' ? '/desk' : '/home'} />;
  return <Redirect href={{ pathname: '/welcome', params: { section: 'contact' } }} />;
}
