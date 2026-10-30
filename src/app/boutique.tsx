import { Redirect } from 'expo-router';

import { VisitPage } from '@/components/visit/visit-page';
import { VisitShop } from '@/components/visit/visit-shop';
import { useAuth } from '@/context/auth-context';

export default function BoutiqueScreen() {
  const { user, ready } = useAuth();
  if (ready && user) return <Redirect href="/home" />;
  return (
    <VisitPage>
      {(data) => <VisitShop products={data.products} />}
    </VisitPage>
  );
}
