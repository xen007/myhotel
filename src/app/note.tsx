import { Redirect } from 'expo-router';

import { ClientSpace } from '@/components/hotel/client-space';
import { HotelShell } from '@/components/hotel/hotel-shell';
import { useAuth } from '@/context/auth-context';

export default function NoteScreen() {
  const { user, ready } = useAuth();
  if (ready && !user) return <Redirect href="/welcome" />;
  if (ready && user && user.role !== 'client') return <Redirect href="/home" />;
  return (
    <HotelShell title="Note" fill hideHeading>
      <ClientSpace view="note" />
    </HotelShell>
  );
}
