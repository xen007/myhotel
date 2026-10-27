import { Redirect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { ClientSpace } from '@/components/hotel/client-space';
import { HotelShell } from '@/components/hotel/hotel-shell';
import { GoldBtn } from '@/components/hotel/kit';
import { useAuth } from '@/context/auth-context';

export default function TableScreen() {
  const { user, ready } = useAuth();
  const openCart = useRef(() => {});
  const [cartCount, setCartCount] = useState(0);
  const onCart = useCallback((next: { count: number; open: () => void }) => {
    openCart.current = next.open;
    setCartCount((current) => (current === next.count ? current : next.count));
  }, []);
  if (ready && !user) return <Redirect href="/welcome" />;
  if (ready && user && user.role !== 'client') return <Redirect href="/home" />;
  return (
    <HotelShell
      title="Restaurant"
      fill
      right={<GoldBtn compact icon="cart" label={cartCount ? `Panier ${cartCount}` : 'Panier'} onPress={() => openCart.current()} />}>
      <ClientSpace view="table" onCart={onCart} />
    </HotelShell>
  );
}
