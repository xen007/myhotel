import { useCallback, useEffect, useState } from 'react';

import { pmsGet } from '@/lib/api';
import { useAuth } from '@/context/auth-context';

export function usePms<T>(path: string) {
  const { token, user, ready } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const next = await pmsGet<T>(token, path);
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, [path, token]);

  useEffect(() => {
    if (!ready) return;
    if (!token) {
      setLoading(false);
      setData(null);
      return;
    }
    void reload();
  }, [ready, reload, token]);

  return { data, error, loading, reload, token, user, ready };
}
