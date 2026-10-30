import { Redirect } from 'expo-router';

import { useAuth } from '@/context/auth-context';

export default function PrestationsScreen() {
  const { user, ready } = useAuth();
  if (ready && user) return <Redirect href="/home" />;
  return <Redirect href={{ pathname: '/welcome', params: { section: 'services' } }} />;
}
