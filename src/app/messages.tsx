import { Image } from 'expo-image';
import * as DocumentPicker from 'expo-document-picker';
import * as Linking from 'expo-linking';
import { Redirect } from 'expo-router';
import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { AppIcon } from '@/components/box-icon';
import { HotelShell } from '@/components/hotel/hotel-shell';
import { GoldBtn } from '@/components/hotel/kit';
import { ClipIcon } from '@/components/nav/clip-icon';
import { getApiBaseUrl } from '@/constants/config';
import { ROLE_LABEL, type UserRole } from '@/constants/roles';
import { Breakpoints, Palette } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { pmsGet, pmsPost } from '@/lib/api';
import { prettyChatTime } from '@/lib/format';

type Contact = {
  id: number;
  full_name: string;
  email: string;
  role: string;
  photo?: string | null;
};

type Thread = {
  id: number;
  other: Contact | null;
  last_body: string;
  last_at: string;
};

type ChatMessage = {
  id: number;
  thread_id: number;
  sender_id: number;
  body: string;
  created_at: string;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_mime?: string | null;
  attachment_size?: number | null;
};

type PendingFile = { name: string; mime: string; size: number; data: string };
type Payload = { contacts: Contact[]; threads: Thread[]; messages: ChatMessage[] };

function pendingUri(file: PendingFile) {
  return `data:${file.mime};base64,${file.data}`;
}

function mediaUrl(url?: string | null) {
  if (!url) return '';
  if (url.startsWith('http') || url.startsWith('data:')) return url;
  return `${getApiBaseUrl()}${url}`;
}

function prettySize(bytes?: number | null) {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`;
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || '');
      const comma = raw.indexOf(',');
      resolve(comma >= 0 ? raw.slice(comma + 1) : raw);
    };
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
    reader.readAsDataURL(blob);
  });
}

async function pickFileWeb(): Promise<PendingFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '*/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const raw = String(reader.result || '');
        const comma = raw.indexOf(',');
        resolve({
          name: file.name,
          mime: file.type || 'application/octet-stream',
          size: file.size,
          data: comma >= 0 ? raw.slice(comma + 1) : raw,
        });
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };
    input.click();
  });
}

export function MessageDesk({ clientDesk = false }: { clientDesk?: boolean }) {
  const { token, user, ready } = useAuth();
  const { width } = useWindowDimensions();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [pickerQuery, setPickerQuery] = useState('');
  const [threadId, setThreadId] = useState<number | null>(null);
  const [peer, setPeer] = useState<Contact | null>(null);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<PendingFile | null>(null);
  const [picker, setPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<ChatMessage | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const isWide = width >= Breakpoints.tablet;
  const inChat = !isWide && (threadId !== null || !!peer);

  const load = useCallback(
    async (silent = false) => {
      if (!token) return;
      try {
        setData(await pmsGet<Payload>(token, 'messages'));
        setError(null);
      } catch (err) {
        if (!silent) setError(err instanceof Error ? err.message : 'Chargement impossible.');
      }
    },
    [token],
  );

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => void load(true), 6000);
    return () => clearInterval(timer);
  }, [load]);

  const threads = data?.threads ?? [];
  const contacts = (data?.contacts ?? []).filter((item) => !clientDesk || item.role === 'receptionist');
  const messages = useMemo(
    () => (data?.messages ?? []).filter((item) => item.thread_id === threadId),
    [data?.messages, threadId],
  );
  const active = threads.find((item) => item.id === threadId) ?? null;
  const other = active?.other ?? peer;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return threads.filter((item) => {
      if (!item.last_body) return false;
      if (!q) return true;
      const hay = `${item.other?.full_name ?? ''} ${item.last_body}`.toLowerCase();
      return hay.includes(q);
    });
  }, [threads, query]);

  const pickerContacts = contacts.filter((item) => {
    const hay = `${item.full_name} ${ROLE_LABEL[item.role as UserRole] ?? item.role}`.toLowerCase();
    return !pickerQuery.trim() || hay.includes(pickerQuery.trim().toLowerCase());
  });

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [messages.length, threadId]);

  function startChat(contact: Contact) {
    const existing = threads.find((item) => item.other?.id === contact.id && item.last_body);
    setPicker(false);
    setPickerQuery('');
    if (existing) {
      setThreadId(existing.id);
      setPeer(null);
      return;
    }
    setThreadId(null);
    setPeer(contact);
  }

  async function attach() {
    if (!active && !peer) {
      setPicker(true);
      return;
    }
    let file: PendingFile | null = null;
    if (Platform.OS === 'web') {
      file = await pickFileWeb();
    } else {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      let data = asset.base64 || '';
      if (!data) {
        const response = await fetch(asset.uri);
        data = await blobToBase64(await response.blob());
      }
      file = {
        name: asset.name || 'fichier',
        mime: asset.mimeType || 'application/octet-stream',
        size: asset.size || 0,
        data,
      };
    }
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      setError('Fichier trop volumineux (12 Mo max).');
      return;
    }
    setPending(file);
  }

  async function send() {
    if (!token || saving) return;
    if (!threadId && !peer) {
      setPicker(true);
      return;
    }
    const text = draft.trim();
    if (!text && !pending) return;
    setSaving(true);
    setDraft('');
    const file = pending;
    setPending(null);
    try {
      const next = await pmsPost<Payload & { thread_id?: number }>(
        token,
        'messages',
        {
          thread_id: threadId,
          user_id: peer?.id,
          body: text,
          file: file ? { name: file.name, mime: file.mime, size: file.size, data: file.data } : undefined,
        },
        60000,
      );
      setData(next);
      if (next.thread_id) setThreadId(next.thread_id);
      else {
        const created = (next.threads ?? []).find((item) => item.other?.id === peer?.id);
        if (created) setThreadId(created.id);
      }
      setPeer(null);
    } catch (err) {
      setDraft(text);
      if (file) setPending(file);
      setError(err instanceof Error ? err.message : 'Envoi impossible.');
    } finally {
      setSaving(false);
    }
  }

  if (ready && !user) return <Redirect href="/welcome" />;

  const showList = isWide || (threadId === null && !peer);
  const showChat = isWide || threadId !== null || !!peer;
  const canSend = (!!draft.trim() || !!pending) && !saving;
  const ChatWrap = Platform.OS === 'web' ? View : KeyboardAvoidingView;

  const listPane = (
    <View style={[styles.pane, isWide ? styles.listPane : styles.flex, styles.listPaneInner]}>
      <View style={styles.listHead}>
        <Text style={styles.paneTitle}>Conversations</Text>
        <GoldBtn compact icon="plus" label="Nouveau" onPress={() => setPicker(true)} />
      </View>
      <TextInput value={query} onChangeText={setQuery} placeholder="Rechercher..." style={styles.search} />
      <ScrollView style={styles.flex} contentContainerStyle={[styles.threadList, styles.threadListFab]} keyboardShouldPersistTaps="handled">
        {rows.map((item) => {
          const on = item.id === threadId;
          return (
            <Pressable
              key={item.id}
              onPress={() => {
                setPeer(null);
                setThreadId(item.id);
              }}
              style={[styles.row, on && styles.rowOn]}>
              <Avatar name={item.other?.full_name} photo={item.other?.photo} />
              <View style={styles.rowCopy}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.other?.full_name ?? 'Équipe'}
                </Text>
                <Text style={styles.rowPreview} numberOfLines={1}>
                  {item.last_body} · {prettyChatTime(item.last_at)}
                </Text>
              </View>
            </Pressable>
          );
        })}
        {!rows.length ? (
          <Text style={styles.empty}>{clientDesk ? 'Aucune discussion. Touchez Nouveau pour écrire à la réception.' : 'Aucune discussion. Touchez Nouveau ou + pour écrire à un collègue.'}</Text>
        ) : null}
      </ScrollView>
      <Pressable onPress={() => setPicker(true)} style={styles.fab} accessibilityLabel="Nouvelle conversation">
        <AppIcon name="plus" size={26} color={Palette.ink} />
      </Pressable>
    </View>
  );

  const chatPane = (
    <ChatWrap
      style={[styles.pane, styles.chatPane, styles.chatColumn, !isWide && styles.flex]}
      {...(Platform.OS === 'web'
        ? {}
        : { behavior: 'padding' as const, keyboardVerticalOffset: 72 })}>
      <View style={styles.chatHead}>
        {!isWide ? (
          <Pressable
            onPress={() => {
              setThreadId(null);
              setPeer(null);
            }}
            hitSlop={10}
            style={styles.back}>
            <AppIcon name="chevron-left" size={22} color={Palette.ink} />
          </Pressable>
        ) : null}
        {other ? <Avatar name={other.full_name} photo={other.photo} size={40} /> : null}
        <View style={styles.chatHeadCopy}>
          <Text style={styles.chatName} numberOfLines={1}>
            {other?.full_name ?? 'Sélectionnez une conversation'}
          </Text>
          {other?.role ? (
            <Text style={styles.chatRole} numberOfLines={1}>
              {ROLE_LABEL[other.role as UserRole] ?? other.role}
            </Text>
          ) : null}
        </View>
      </View>
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={styles.bubbles}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive">
        {!other ? (
          <View style={styles.idle}>
            <Text style={styles.idleText}>Choisissez ou démarrez une conversation</Text>
          </View>
        ) : null}
        {other && !messages.length && !pending ? <Text style={styles.empty}>Écrivez le premier message.</Text> : null}
        {other
          ? messages.map((item) => {
              const mine = Number(item.sender_id) === Number(user?.id);
              return (
                <View key={item.id} style={[styles.bubbleWrap, mine && styles.bubbleWrapMine]}>
                  <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                    <AttachmentView item={item} onOpen={() => setPreview(item)} />
                    {item.body ? <Text style={styles.bubbleText}>{item.body}</Text> : null}
                    <Text style={[styles.bubbleMeta, mine && styles.bubbleMetaMine]}>{prettyChatTime(item.created_at)}</Text>
                  </View>
                </View>
              );
            })
          : null}
      </ScrollView>
      {pending ? <PendingPreview file={pending} onClear={() => setPending(null)} /> : null}
      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Votre message..."
          style={styles.composerInput}
          multiline
          blurOnSubmit={false}
          onKeyPress={(event) => {
            if (event.nativeEvent.key === 'Enter' && !(event.nativeEvent as { shiftKey?: boolean }).shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <Pressable onPress={() => void attach()} style={styles.clip} accessibilityLabel="Joindre un fichier">
          <ClipIcon size={20} />
        </Pressable>
        <Pressable onPress={() => void send()} disabled={!canSend} style={[styles.send, !canSend && styles.sendOff]}>
          <AppIcon name="chevron-right" size={22} color={Palette.ink} />
        </Pressable>
      </View>
    </ChatWrap>
  );

  return (
    <HotelShell title="Messagerie" fill hideHeading={inChat} edgeToEdge={inChat}>
      {error ? <Text style={styles.banner}>{error}</Text> : null}
      <View style={styles.wrap}>
      <View style={[styles.layout, isWide ? styles.layoutDesk : styles.layoutMobile]}>
        {showList ? listPane : null}
        {showChat ? chatPane : null}
      </View>
      </View>

      <Modal visible={picker} transparent animationType="fade" onRequestClose={() => setPicker(false)}>
        <View style={styles.overlay}>
          <Pressable style={styles.overlayFill} onPress={() => setPicker(false)} />
          <View style={styles.dialog}>
            <View style={styles.dialogHead}>
              <Text style={styles.dialogTitle}>{clientDesk ? 'Écrire à la réception' : 'Nouvelle conversation'}</Text>
              <Pressable onPress={() => setPicker(false)} hitSlop={10}>
                <AppIcon name="x-circle" size={22} color={Palette.ink} />
              </Pressable>
            </View>
            <TextInput value={pickerQuery} onChangeText={setPickerQuery} placeholder={clientDesk ? 'Rechercher un réceptionniste…' : 'Rechercher un collègue…'} style={styles.search} />
            <ScrollView style={styles.pickerList}>
              {pickerContacts.map((item) => (
                <Pressable key={item.id} onPress={() => startChat(item)} style={styles.pickRow}>
                  <Avatar name={item.full_name} photo={item.photo} size={44} />
                  <View style={styles.flex}>
                    <Text style={styles.rowName}>{item.full_name}</Text>
                    <Text style={styles.rowPreview}>
                      {ROLE_LABEL[item.role as UserRole] ?? item.role}
                    </Text>
                  </View>
                  <AppIcon name="chevron-right" size={18} color={Palette.gold} />
                </Pressable>
              ))}
              {!pickerContacts.length ? <Text style={styles.empty}>Aucun membre trouvé.</Text> : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <View style={styles.overlay}>
          <Pressable style={styles.overlayFill} onPress={() => setPreview(null)} />
          <View style={styles.previewBox}>
            <View style={styles.dialogHead}>
              <Text style={styles.dialogTitle} numberOfLines={1}>
                {preview?.attachment_name || 'Fichier'}
              </Text>
              <Pressable onPress={() => setPreview(null)} hitSlop={10}>
                <AppIcon name="x-circle" size={22} color={Palette.ink} />
              </Pressable>
            </View>
            {preview ? <AttachmentView item={preview} large /> : null}
            <GoldBtn compact icon="download" label="Ouvrir" onPress={() => void Linking.openURL(mediaUrl(preview?.attachment_url))} />
          </View>
        </View>
      </Modal>
    </HotelShell>
  );
}

function Avatar({ name, photo, size = 48 }: { name?: string | null; photo?: string | null; size?: number }) {
  const initial = (name || '?').trim().slice(0, 1).toUpperCase();
  const uri = mediaUrl(photo);
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: Palette.gold }}
        contentFit="cover"
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: Palette.gold,
        alignItems: 'center',
        justifyContent: 'center',
        borderBottomWidth: 3,
        borderBottomColor: Palette.ink,
      }}>
      <Text style={{ color: Palette.ink, fontWeight: '800', fontSize: Math.round(size * 0.38) }}>{initial}</Text>
    </View>
  );
}

function PendingPreview({ file, onClear }: { file: PendingFile; onClear: () => void }) {
  const uri = pendingUri(file);
  const mime = file.mime;
  return (
    <View style={styles.pendingBox}>
      <View style={styles.pendingHead}>
        <Text style={styles.pendingLabel}>Aperçu avant envoi</Text>
        <Pressable onPress={onClear} hitSlop={10}>
          <AppIcon name="x-circle" size={22} color={Palette.ink} />
        </Pressable>
      </View>
      {mime.startsWith('image/') ? (
        <Image source={{ uri }} style={styles.pendingImage} contentFit="contain" />
      ) : mime.startsWith('video/') && Platform.OS === 'web' ? (
        createElement('video', {
          src: uri,
          controls: true,
          style: { width: '100%', maxHeight: 240, borderRadius: 12, background: Palette.ink },
        })
      ) : mime === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') ? (
        <View>
          {Platform.OS === 'web'
            ? createElement('iframe', {
                src: uri,
                style: { width: '100%', height: 180, border: 0, borderRadius: 12 },
              })
            : null}
          <View style={styles.docCard}>
            <AppIcon name="receipt" size={22} color={Palette.ink} />
            <View style={styles.flex}>
              <Text style={styles.docName} numberOfLines={1}>{file.name}</Text>
              <Text style={styles.docMeta}>PDF · {prettySize(file.size)}</Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.docCard}>
          <ClipIcon size={20} />
          <View style={styles.flex}>
            <Text style={styles.docName} numberOfLines={1}>{file.name}</Text>
            <Text style={styles.docMeta}>{prettySize(file.size)}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

function AttachmentView({ item, large, onOpen }: { item: ChatMessage; large?: boolean; onOpen?: () => void }) {
  const url = mediaUrl(item.attachment_url);
  const mime = String(item.attachment_mime || '');
  const name = item.attachment_name || 'Fichier';
  if (!url) return null;
  if (mime.startsWith('image/')) {
    return (
      <Pressable onPress={onOpen}>
        <Image source={{ uri: url }} style={large ? styles.previewImage : styles.thumb} contentFit="cover" />
      </Pressable>
    );
  }
  if (mime.startsWith('video/')) {
    if (Platform.OS === 'web') {
      return createElement('video', {
        src: url,
        controls: true,
        style: large
          ? { width: '100%', maxHeight: 420, borderRadius: 12, background: Palette.ink }
          : { width: 220, maxHeight: 180, borderRadius: 12, background: Palette.ink },
      });
    }
    return (
      <Pressable onPress={() => void Linking.openURL(url)} style={styles.docCard}>
        <AppIcon name="tv" size={22} color={Palette.ink} />
        <View style={styles.flex}>
          <Text style={styles.docName} numberOfLines={1}>{name}</Text>
          <Text style={styles.docMeta}>Vidéo · {prettySize(item.attachment_size)}</Text>
        </View>
      </Pressable>
    );
  }
  if (mime === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) {
    return (
      <View>
        {Platform.OS === 'web'
          ? createElement('iframe', {
              src: large ? url : `${url}#toolbar=0&navpanes=0`,
              style: large
                ? { width: '100%', height: 360, border: 0, borderRadius: 12 }
                : { width: 220, height: 140, border: 0, borderRadius: 10 },
            })
          : null}
        <Pressable onPress={() => void Linking.openURL(url)} style={styles.docCard}>
          <AppIcon name="receipt" size={22} color={Palette.ink} />
          <View style={styles.flex}>
            <Text style={styles.docName} numberOfLines={1}>{name}</Text>
            <Text style={styles.docMeta}>PDF · {prettySize(item.attachment_size)}</Text>
          </View>
        </Pressable>
      </View>
    );
  }
  return (
    <Pressable onPress={() => void Linking.openURL(url)} style={styles.docCard}>
      <ClipIcon size={18} />
      <View style={styles.flex}>
        <Text style={styles.docName} numberOfLines={1}>{name}</Text>
        <Text style={styles.docMeta}>{prettySize(item.attachment_size)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minHeight: 0 },
  wrap: { flex: 1, minHeight: 0, position: 'relative' },
  banner: {
    color: Palette.ink,
    fontWeight: '700',
    backgroundColor: 'rgba(212,175,55,0.2)',
    padding: 10,
    borderRadius: 12,
    marginBottom: 8,
  },
  layout: { flex: 1, minHeight: 0, alignItems: 'stretch' },
  layoutDesk: { flexDirection: 'row', gap: 14 },
  layoutMobile: { flexDirection: 'column' },
  pane: {
    flex: 1,
    minHeight: 0,
    backgroundColor: Palette.white,
    borderWidth: 1,
    borderColor: 'rgba(20,22,34,0.10)',
    borderRadius: 18,
  },
  listPaneInner: {
    position: 'relative',
    overflow: 'visible',
  },
  listPane: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 320,
    width: 320,
    maxWidth: '38%',
    minHeight: 0,
    height: '100%',
  },
  chatPane: { flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' },
  chatColumn: { flexDirection: 'column' },
  listHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 10,
  },
  paneTitle: { color: Palette.ink, fontWeight: '800', fontSize: 18 },
  search: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(20,22,34,0.12)',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 42,
    color: Palette.ink,
    backgroundColor: Palette.white,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(20,22,34,0.06)',
  },
  rowOn: { backgroundColor: 'rgba(212,175,55,0.18)' },
  rowCopy: { flex: 1, minWidth: 0 },
  rowName: { color: Palette.ink, fontWeight: '800', fontSize: 15 },
  rowPreview: { color: Palette.ink, opacity: 0.5, fontSize: 12, marginTop: 4 },
  empty: { color: Palette.ink, opacity: 0.5, padding: 20, textAlign: 'center' },
  idle: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', minHeight: 80 },
  idleText: { color: Palette.ink, opacity: 0.4, fontSize: 15, textAlign: 'center' },
  threadList: { paddingBottom: 12, flexGrow: 1 },
  threadListFab: { paddingBottom: 88 },
  chatHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(20,22,34,0.06)',
    flexShrink: 0,
    backgroundColor: Palette.white,
  },
  back: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: 'rgba(20,22,34,0.04)',
  },
  chatName: { color: Palette.ink, fontWeight: '800', fontSize: 16 },
  chatHeadCopy: { flex: 1, minWidth: 0, gap: 1 },
  chatRole: { color: Palette.ink, opacity: 0.5, fontSize: 12, fontWeight: '700' },
  bubbles: { padding: 14, gap: 8, flexGrow: 1 },
  bubbleWrap: { alignItems: 'flex-start' },
  bubbleWrapMine: { alignItems: 'flex-end' },
  bubble: {
    maxWidth: '78%',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F6F7FA',
    gap: 6,
  },
  bubbleMine: { backgroundColor: Palette.gold, borderBottomRightRadius: 4 },
  bubbleOther: { borderBottomLeftRadius: 4 },
  bubbleText: { color: Palette.ink, fontSize: 15, lineHeight: 22 },
  bubbleMeta: { color: Palette.ink, opacity: 0.45, fontSize: 10, fontWeight: '700' },
  bubbleMetaMine: { textAlign: 'right' },
  thumb: { width: 220, height: 160, borderRadius: 12, backgroundColor: Palette.ink },
  previewImage: { width: '100%', height: 360, borderRadius: 12, backgroundColor: Palette.ink },
  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius: 12,
    padding: 8,
    minWidth: 180,
  },
  docName: { color: Palette.ink, fontWeight: '800', fontSize: 13 },
  docMeta: { color: Palette.ink, opacity: 0.5, fontSize: 11, marginTop: 2 },
  pendingBox: {
    marginHorizontal: 10,
    marginBottom: 6,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Palette.gold,
    backgroundColor: Palette.white,
    gap: 8,
  },
  pendingHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pendingLabel: { color: Palette.ink, fontWeight: '800', fontSize: 13 },
  pendingImage: { width: '100%', height: 220, borderRadius: 12, backgroundColor: Palette.ink },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 12,
    flexShrink: 0,
    backgroundColor: Palette.white,
    borderTopWidth: 1,
    borderTopColor: 'rgba(20,22,34,0.08)',
    zIndex: 5,
  },
  composerInput: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: 'rgba(20,22,34,0.12)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Palette.ink,
    backgroundColor: Palette.white,
  },
  clip: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(20,22,34,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.white,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendOff: { opacity: 0.35 },
  overlay: { ...StyleSheet.absoluteFill, justifyContent: 'center', alignItems: 'center', padding: 18 },
  overlayFill: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(20,22,34,0.55)' },
  dialog: {
    zIndex: 2,
    width: 420,
    maxWidth: '94%',
    maxHeight: '80%',
    backgroundColor: Palette.white,
    borderRadius: 18,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: Palette.gold,
  },
  previewBox: {
    zIndex: 2,
    width: 560,
    maxWidth: '94%',
    maxHeight: '88%',
    backgroundColor: Palette.white,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  dialogHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  dialogTitle: { color: Palette.ink, fontWeight: '800', fontSize: 18, flex: 1 },
  pickerList: { maxHeight: 360 },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(20,22,34,0.03)',
    marginBottom: 8,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
    elevation: 8,
    ...Platform.select({
      web: { boxShadow: '0 8px 22px rgba(20,22,34,0.22)', cursor: 'pointer' },
      default: {},
    }),
  },
});

export default function MessagesScreen() {
  return <MessageDesk />;
}
