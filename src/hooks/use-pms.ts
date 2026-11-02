import { useCallback, useEffect, useState } from 'react';

import { pmsGet } from '@/lib/api';
import { useAuth } from '@/context/auth-context';

export function usePms<T>(path: string, enabled = true) {
  const { token, user, ready } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!token || !enabled) return;
    setError(null);
    try {
      const next = await pmsGet<T>(token, path);
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, [enabled, path, token]);

  useEffect(() => {
    if (!ready || !enabled) {
      if (!enabled || (ready && !token)) setLoading(false);
      return;
    }
    if (!token) {
      setLoading(false);
      setData(null);
      return;
    }
    void reload();
  }, [enabled, ready, reload, token]);

  return { data, error, loading, reload, token, user, ready };
}
