import { getItem, removeItem, setItem } from '@/lib/storage';

const NEXT_KEY = 'myhotel.visit.next';
const BOOK_KEY = 'myhotel.visit.book';

export type VisitBookIntent = {
  roomId: number;
  roomNumber: string;
  checkIn: string;
  checkOut: string;
  checkInTime: string;
  checkOutTime: string;
};

export async function saveVisitNext(href: string) {
  await setItem(NEXT_KEY, href);
}

export async function takeVisitNext() {
  const href = await getItem(NEXT_KEY);
  if (href) await removeItem(NEXT_KEY);
  return href;
}

export async function saveVisitBook(intent: VisitBookIntent) {
  await setItem(BOOK_KEY, JSON.stringify(intent));
}

export async function takeVisitBook(): Promise<VisitBookIntent | null> {
  const raw = await getItem(BOOK_KEY);
  if (!raw) return null;
  await removeItem(BOOK_KEY);
  try {
    return JSON.parse(raw) as VisitBookIntent;
  } catch {
    return null;
  }
}
