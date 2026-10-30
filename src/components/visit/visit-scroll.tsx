import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { Platform, type ScrollView } from 'react-native';

type WebBox = {
  scrollTo: (opts: { top: number; behavior?: ScrollBehavior }) => void;
  scrollTop: number;
  getBoundingClientRect: () => { top: number };
};

type VisitScrollApi = {
  register: (id: string, y: number) => void;
  to: (id: string, animated?: boolean) => void;
};

const VisitScrollContext = createContext<VisitScrollApi>({
  register: () => undefined,
  to: () => undefined,
});

export function VisitScrollProvider({
  scroller,
  webScroller,
  children,
}: {
  scroller: RefObject<ScrollView | null>;
  webScroller?: RefObject<WebBox | null>;
  children: ReactNode;
}) {
  const targets = useRef<Record<string, number>>({});

  const register = useCallback((id: string, y: number) => {
    targets.current[id] = y;
  }, []);

  const to = useCallback((id: string, animated = true) => {
    let tries = 0;
    const run = () => {
      tries += 1;
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const node = document.getElementById(id);
        const box = webScroller?.current;
        if (node && box) {
          const y = node.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 8;
          box.scrollTo({ top: Math.max(0, y), behavior: animated ? 'smooth' : 'auto' });
          return;
        }
        if (tries < 25) setTimeout(run, 80);
        return;
      }
      const y = targets.current[id];
      if (y == null) {
        if (tries < 25) setTimeout(run, 80);
        return;
      }
      scroller.current?.scrollTo({ y: Math.max(0, y - 8), animated });
    };
    run();
  }, [scroller, webScroller]);

  const api = useMemo(() => ({ register, to }), [register, to]);
  return <VisitScrollContext.Provider value={api}>{children}</VisitScrollContext.Provider>;
}

export function useVisitScroll() {
  return useContext(VisitScrollContext);
}
