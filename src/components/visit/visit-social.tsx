import { Image } from 'expo-image';

function mark(path: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#141622">${path}</svg>`,
  )}`;
}

const MARKS = {
  whatsapp: mark(
    '<path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51-.17-.01-.37-.01-.57-.01-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.07.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35z"/><path d="M12.05 2C6.5 2 2 6.49 2 12.05c0 1.78.46 3.51 1.34 5.04L2 22l5.03-1.32A10.03 10.03 0 0012.05 22C17.57 22 22 17.51 22 12.05 22 6.49 17.57 2 12.05 2zm0 18.15a8.1 8.1 0 01-4.13-1.13l-.3-.18-2.98.79.8-2.91-.19-.3A8.08 8.08 0 013.9 12.05c0-4.49 3.66-8.15 8.15-8.15s8.15 3.66 8.15 8.15-3.66 8.15-8.15 8.15z"/>',
  ),
  facebook: mark(
    '<path d="M14 9h3V6h-3c-2.2 0-4 1.8-4 4v2H8v3h2v7h3v-7h2.6l.4-3H13v-2c0-.6.4-1 1-1z"/>',
  ),
  instagram: mark(
    '<path d="M7 3h10a4 4 0 014 4v10a4 4 0 01-4 4H7a4 4 0 01-4-4V7a4 4 0 014-4zm10 2H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2zm-5 3.2A3.8 3.8 0 1112 16.8 3.8 3.8 0 0112 8.2zm0 2a1.8 1.8 0 100 3.6 1.8 1.8 0 000-3.6zM17.2 6.4a1 1 0 110 2 1 1 0 010-2z"/>',
  ),
  x: mark(
    '<path d="M17.5 4h2.3l-5.1 5.8L21 20h-4.6l-3.6-4.7L8.6 20H6.3l5.5-6.2L4 4h4.7l3.2 4.3L17.5 4zm-.8 14.4h1.3L8.4 5.5H7L16.7 18.4z"/>',
  ),
} as const;

const CHEVRON_UP = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#141622" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14l6-6 6 6"/></svg>',
)}`;

export function SocialMark({ name, size = 16 }: { name: keyof typeof MARKS; size?: number }) {
  return <Image source={{ uri: MARKS[name] }} style={{ width: size, height: size }} contentFit="contain" />;
}

export function ChevronUpMark({ size = 22 }: { size?: number }) {
  return <Image source={{ uri: CHEVRON_UP }} style={{ width: size, height: size }} contentFit="contain" />;
}
