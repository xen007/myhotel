import { createElement } from 'react';
import { Platform, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';

import { GoldBtn } from '@/components/hotel/kit';
import { Breakpoints, Palette } from '@/constants/theme';

export type FilterOption = { id: string; label: string };

export function FilterSelect({
  value,
  onChange,
  options,
  fill,
}: {
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  fill?: boolean;
}) {
  if (Platform.OS === 'web') {
    return createElement(
      'select',
      {
        value,
        onChange: (event: { target: { value: string } }) => onChange(event.target.value),
        style: fill ? { ...webSelect, ...webSelectFill } : webSelect,
      },
      options.map((opt) => createElement('option', { key: opt.id, value: opt.id }, opt.label)),
    );
  }
  return (
    <TextInput
      value={options.find((opt) => opt.id === value)?.label ?? value}
      onChangeText={onChange}
      style={[styles.search, fill && styles.searchFill]}
    />
  );
}

export function FilterBar({
  query,
  onQuery,
  queryPlaceholder = 'Rechercher...',
  category,
  onCategory,
  categories,
  status,
  onStatus,
  statuses,
}: {
  query: string;
  onQuery: (value: string) => void;
  queryPlaceholder?: string;
  category?: string;
  onCategory?: (value: string) => void;
  categories?: FilterOption[];
  status?: string;
  onStatus?: (value: string) => void;
  statuses?: FilterOption[];
  stackSearch?: boolean;
}) {
  return (
    <View style={styles.bar}>
      <TextInput placeholder={queryPlaceholder} value={query} onChangeText={onQuery} style={styles.search} />
      {categories && onCategory && category !== undefined ? (
        <FilterSelect value={category} onChange={onCategory} options={categories} />
      ) : null}
      {statuses && onStatus && status !== undefined ? (
        <FilterSelect value={status} onChange={onStatus} options={statuses} />
      ) : null}
      <View style={styles.filterBtn}>
        <GoldBtn compact icon="search" label="Filtrer" onPress={() => undefined} />
      </View>
    </View>
  );
}

const webSelect = {
  border: '1px solid rgba(20,22,34,0.12)',
  borderRadius: 12,
  padding: '8px 10px',
  color: Palette.ink,
  background: Palette.white,
  minWidth: 120,
  maxWidth: 170,
  flexShrink: 0,
  fontSize: 13,
  outline: 'none',
  height: 40,
} as const;

const webSelectFill = {
  minWidth: 0,
  maxWidth: 'none',
  flex: 1,
  width: '100%',
} as const;

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    flexShrink: 0,
    alignItems: 'center',
    gap: 8,
    backgroundColor: Palette.white,
    borderRadius: 16,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(20,22,34,0.06)',
    width: '100%',
    ...Platform.select({ web: { overflowX: 'auto' as const }, default: {} }),
  },
  search: {
    flexGrow: 1,
    flexShrink: 0,
    minWidth: 148,
    borderWidth: 1,
    borderColor: 'rgba(20,22,34,0.12)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: Palette.ink,
    height: 40,
  },
  searchFill: {
    width: '100%',
    flexGrow: 0,
  },
  tools: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  filterBtn: {
    flexShrink: 0,
  },
});
