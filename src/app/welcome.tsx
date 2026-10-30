import { Redirect } from 'expo-router';

import { VisitHome } from '@/components/visit/visit-home';
import { VisitPage } from '@/components/visit/visit-page';
import { useAuth } from '@/context/auth-context';

export default function WelcomeScreen() {
  const { user, ready } = useAuth();
  if (ready && user) return <Redirect href="/home" />;
  return (
    <VisitPage>
      {(data) => <VisitHome data={data} />}
    </VisitPage>
  );
}
