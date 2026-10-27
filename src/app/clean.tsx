import { Redirect } from 'expo-router';

import { ClientSpace } from '@/components/hotel/client-space';
import { HotelShell } from '@/components/hotel/hotel-shell';
import { useAuth } from '@/context/auth-context';

export default function CleanScreen() {
  const { user, ready } = useAuth();
  if (ready && !user) return <Redirect href="/welcome" />;
  if (ready && user && user.role !== 'client') return <Redirect href="/home" />;
  return (
    <HotelShell title="Nettoyage" fill>
      <ClientSpace view="clean" />
    </HotelShell>
  );
}
