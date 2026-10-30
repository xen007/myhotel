import { useCallback, useEffect, useState } from 'react';

import { visitGet } from '@/lib/api';

export type VisitCompany = {
  name?: string | null;
  legal_name?: string | null;
  slogan?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  nif?: string | null;
  rccm?: string | null;
};

export type VisitRoom = {
  id: number;
  number: string;
  type: string;
  floor?: number;
  status?: string;
  price_night: number;
  capacity?: number;
  photo?: string | null;
  video?: string | null;
  description?: string | null;
  bookable?: boolean;
};

export type VisitDish = { id: number; name: string; category: string; price: number; description?: string | null; photo?: string | null };
export type VisitService = { id: number; name: string; description?: string | null; price: number; icon?: string | null };
export type VisitProduct = { id: number; name: string; category: string; unit: string; price: number; stock: number; photo?: string | null };
export type VisitReview = { id: number; guest_name: string; rating: number; comment: string; at?: string | null };

export type VisitPayload = {
  company: VisitCompany | null;
  rooms: VisitRoom[];
  menu: VisitDish[];
  categories?: { id: number; name: string; kind: string }[];
  services: VisitService[];
  products: VisitProduct[];
  reviews: VisitReview[];
};

let memory: { at: number; data: VisitPayload } | null = null;
const MEMORY_TTL = 45000;

export function useVisit() {
  const [data, setData] = useState<VisitPayload | null>(memory?.data ?? null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!memory);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const next = await visitGet<VisitPayload>('visit');
      memory = { at: Date.now(), data: next };
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (memory) {
      setData(memory.data);
      setLoading(false);
      if (Date.now() - memory.at < MEMORY_TTL) return;
    }
    void reload();
  }, [reload]);

  return { data, error, loading, reload };
}
