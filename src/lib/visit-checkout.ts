import type { VisitCartLine } from '@/context/visit-cart';
import { pmsPost } from '@/lib/api';

export async function submitVisitCart(token: string, lines: VisitCartLine[]) {
  const menuLines = lines.filter((row) => row.source === 'menu' && row.qty > 0);
  const shopLines = lines.filter((row) => row.source === 'shop' && row.qty > 0);
  if (!menuLines.length && !shopLines.length) return;
  if (menuLines.length) {
    await pmsPost(token, 'guest/order', {
      mode: 'salle',
      place: 'Vitrine',
      items: menuLines.map((row) => ({ id: row.id, qty: row.qty })),
    });
  }
  if (shopLines.length) {
    await pmsPost(token, 'guest/shop', {
      items: shopLines.map((row) => ({ id: row.id, qty: row.qty })),
    });
  }
}
