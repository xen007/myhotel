import { Redirect } from 'expo-router';

import { VisitMenu } from '@/components/visit/visit-menu';
import { VisitPage } from '@/components/visit/visit-page';
import { useAuth } from '@/context/auth-context';

export default function CarteScreen() {
  const { user, ready } = useAuth();
  if (ready && user) return <Redirect href="/table" />;
  return (
    <VisitPage>
      {(data) => <VisitMenu dishes={data.menu} categories={data.categories ?? []} />}
    </VisitPage>
  );
}
