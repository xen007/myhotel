import { Redirect } from 'expo-router';

import { VisitPage } from '@/components/visit/visit-page';
import { VisitRooms } from '@/components/visit/visit-rooms';
import { useAuth } from '@/context/auth-context';

export default function BrowseScreen() {
  const { user, ready } = useAuth();
  if (ready && user) return <Redirect href="/home" />;
  return (
    <VisitPage>
      {(data) => <VisitRooms rooms={data.rooms} />}
    </VisitPage>
  );
}
