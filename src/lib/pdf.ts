import { Alert, Platform } from 'react-native';

import { getApiBaseUrl } from '@/constants/config';
import { getItem } from '@/lib/storage';

export type PdfBrand = {
  name?: string | null;
  legal_name?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  nif?: string | null;
  rccm?: string | null;
  slogan?: string | null;
  logo?: string | null;
  stamp?: string | null;
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

export async function deliverPdf(
  filename: string,
  title: string,
  lines: string[],
  mode: 'download' | 'print' = 'download',
  _brand?: PdfBrand,
) {
  const safeName = filename.toLowerCase().endsWith('.pdf') ? filename : `${filename.replace(/\.(html?|pdf)$/i, '')}.pdf`;
  const token = await getItem('myhotel.auth.token');
  const response = await fetch(`${getApiBaseUrl()}/pms/document`, {
    method: 'POST',
    headers: {
      Accept: 'application/pdf',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ title, lines, filename: safeName }),
  });
  if (!response.ok) {
    throw new Error('Le document PDF n’a pas pu être préparé.');
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 5 || String.fromCharCode(...bytes.slice(0, 4)) !== '%PDF') {
    throw new Error('Le serveur n’a pas renvoyé un PDF.');
  }

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const blob = new Blob([copy.buffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    if (mode === 'print') {
      const popup = window.open(url, '_blank', 'noopener,noreferrer');
      if (!popup) window.alert('Autorisez les pop-ups pour ouvrir le PDF.');
    } else {
      const link = document.createElement('a');
      link.href = url;
      link.download = safeName;
      link.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return;
  }

  try {
    const FileSystem = await import('expo-file-system/legacy');
    const Sharing = await import('expo-sharing');
    const base = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    if (!base) throw new Error('Dossier temporaire indisponible.');
    const uri = `${base}${safeName.replace(/[^\w.-]+/g, '-')}`;
    await FileSystem.writeAsStringAsync(uri, bytesToBase64(bytes), {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: title });
      return;
    }
  } catch {
    /* module natif absent */
  }

  Alert.alert('PDF', 'Ouvrez MyHotel dans le navigateur pour télécharger ce document PDF.');
}
