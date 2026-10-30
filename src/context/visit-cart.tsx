import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { getItem, setItem } from '@/lib/storage';

const CART_KEY = 'myhotel.visit.cart';

export type VisitCartLine = {
  source: 'menu' | 'shop';
  id: number;
  name: string;
  price: number;
  photo?: string | null;
  qty: number;
};

type VisitCartValue = {
  lines: VisitCartLine[];
  count: number;
  total: number;
  open: boolean;
  setOpen: (open: boolean) => void;
  add: (line: Omit<VisitCartLine, 'qty'>, qty?: number) => void;
  setQty: (source: VisitCartLine['source'], id: number, qty: number) => void;
  clear: (source?: VisitCartLine['source']) => void;
};

const VisitCartContext = createContext<VisitCartValue | null>(null);

export function VisitCartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<VisitCartLine[]>([]);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void getItem(CART_KEY).then((raw) => {
      if (!alive || !raw) {
        setReady(true);
        return;
      }
      try {
        const parsed = JSON.parse(raw) as VisitCartLine[];
        if (Array.isArray(parsed)) setLines(parsed.filter((row) => row.qty > 0));
      } catch {
        /* ignore */
      }
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    void setItem(CART_KEY, JSON.stringify(lines));
  }, [lines, ready]);

  const add = useCallback((line: Omit<VisitCartLine, 'qty'>, qty = 1) => {
    setLines((current) => {
      const index = current.findIndex((row) => row.source === line.source && row.id === line.id);
      if (index < 0) return [...current, { ...line, qty }];
      const next = [...current];
      next[index] = { ...next[index], qty: next[index].qty + qty };
      return next;
    });
  }, []);

  const setQty = useCallback((source: VisitCartLine['source'], id: number, qty: number) => {
    setLines((current) => current.map((row) => (row.source === source && row.id === id ? { ...row, qty } : row)).filter((row) => row.qty > 0));
  }, []);

  const clear = useCallback((source?: VisitCartLine['source']) => {
    setLines((current) => (source ? current.filter((row) => row.source !== source) : []));
  }, []);

  const value = useMemo<VisitCartValue>(() => ({
    lines,
    count: lines.reduce((sum, row) => sum + row.qty, 0),
    total: lines.reduce((sum, row) => sum + row.qty * Number(row.price || 0), 0),
    open,
    setOpen,
    add,
    setQty,
    clear,
  }), [add, clear, lines, open, setQty]);

  return <VisitCartContext.Provider value={value}>{children}</VisitCartContext.Provider>;
}

export function useVisitCart() {
  const value = useContext(VisitCartContext);
  if (!value) throw new Error('VisitCartProvider manquant.');
  return value;
}
