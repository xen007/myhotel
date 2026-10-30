import { type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { VisitShell } from '@/components/visit/visit-shell';
import { Palette } from '@/constants/theme';
import { useVisit, type VisitPayload } from '@/hooks/use-visit';

export function VisitPage({ children }: { children: (data: VisitPayload) => ReactNode }) {
  const { data, error, loading } = useVisit();
  return (
    <VisitShell company={data?.company}>
      {loading && !data ? (
        <View style={styles.center}><ActivityIndicator color={Palette.gold} size="large" /></View>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : data ? (
        children(data)
      ) : null}
    </VisitShell>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: 80, alignItems: 'center' },
  error: { margin: 20, color: Palette.ink, fontWeight: '700' },
});
