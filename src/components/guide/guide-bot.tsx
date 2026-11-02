import { usePathname, useRouter, type Href } from 'expo-router';
import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/context/auth-context';
import { pmsPost } from '@/lib/api';
import { canRun, composeTour, fold, fullTour, suggestionsFor, tourById, wantsFull, type GuideTour } from '@/components/guide/tours';

type ChatLine = { role: 'user' | 'bot'; text: string };
type Spot = { top: number; left: number; width: number; height: number };

const CSS = `
.mh-dock,.mh-dock *,.mh-card,.mh-card *{box-sizing:border-box}
.mh-dock{position:fixed;right:12px;z-index:100050;display:flex;flex-direction:row;align-items:flex-end;gap:8px;padding:8px;font-family:Segoe UI,system-ui,sans-serif;transition:top .22s ease;pointer-events:none}
.mh-dock > *{pointer-events:auto}
.mh-robot{width:72px;height:96px;border:0;background:transparent;padding:0;cursor:pointer;flex-shrink:0}
.mh-bubble{width:40px;height:40px;border-radius:10px;border:2px solid #fff;background:#d4af37;color:#141622;box-shadow:0 8px 16px rgba(212,175,55,.35);cursor:pointer;display:grid;place-items:center;flex-shrink:0;margin-bottom:8px}
.mh-bubble svg{width:18px;height:18px}
.mh-chat{position:absolute;right:0;bottom:calc(100% + 8px);z-index:100051;width:min(300px,calc(100vw - 24px));background:#fff;border-radius:16px;box-shadow:0 18px 50px rgba(16,24,40,.22);border:1px solid rgba(20,22,34,.08);display:flex;flex-direction:column;overflow:hidden;max-height:min(360px,calc(100vh - 180px))}
.mh-chat-h{display:flex;align-items:center;gap:10px;padding:12px 14px;background:#fff;border-bottom:1px solid rgba(20,22,34,.06);flex-shrink:0}
.mh-chat-h strong{display:block;color:#141622;font-size:14px}
.mh-chat-h span{display:block;color:#5c6578;font-size:12px}
.mh-x{margin-left:auto;border:0;background:transparent;font-size:20px;cursor:pointer;color:#141622}
.mh-log{padding:12px;overflow:auto;display:flex;flex-direction:column;gap:8px;flex:1;min-height:0;max-height:26vh}
.mh-b{max-width:88%;padding:8px 10px;border-radius:12px;font-size:13px;line-height:1.4;color:#141622;overflow-wrap:anywhere}
.mh-b.user{align-self:flex-end;background:#f8f1d8}
.mh-b.bot{align-self:flex-start;background:#f4f6f8}
.mh-chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 8px;flex-shrink:0}
.mh-chip{border:1px solid #d4af37;background:#fbf6e6;color:#141622;border-radius:999px;padding:5px 10px;font-size:12px;cursor:pointer}
.mh-form{display:flex;gap:6px;padding:10px;border-top:1px solid rgba(20,22,34,.06);flex-shrink:0}
.mh-form input{flex:1;min-width:0;width:100%;border:1px solid rgba(20,22,34,.12);border-radius:12px;padding:10px 12px;font-size:16px;outline:none}
.mh-form button{border:0;background:#d4af37;color:#141622;border-radius:12px;padding:0 14px;font-weight:700;cursor:pointer}
.mh-float{animation:mh-float 3.4s ease-in-out infinite}
@keyframes mh-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
.mh-ant{width:12px;height:12px;border-radius:50%;margin:0 auto 1px;background:radial-gradient(circle at 35% 30%,#fff,#f3e2a0 40%,#d4af37);box-shadow:0 0 10px #d4af37}
.mh-stick{width:3px;height:8px;margin:-2px auto 0;background:#c5d0e0;border-radius:2px}
.mh-head{width:58px;height:48px;margin:0 auto;position:relative;border-radius:24px 24px 18px 18px;background:radial-gradient(circle at 32% 22%,#fff,#f4f7fb 46%,#d5deea);box-shadow:inset 0 -8px 12px rgba(80,100,140,.16),0 8px 12px rgba(20,30,60,.12)}
.mh-visor{position:absolute;left:7px;right:7px;top:16px;height:18px;border-radius:10px;background:linear-gradient(180deg,#243044,#101624);display:flex;align-items:center;justify-content:center;gap:8px}
.mh-eye{width:8px;height:8px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff,#f6e7a8 28%,#d4af37 72%);box-shadow:0 0 8px #d4af37;animation:mh-blink 4.8s infinite}
@keyframes mh-blink{0%,46%,50%,100%{transform:scaleY(1)}48%{transform:scaleY(.1)}}
.mh-smile{position:absolute;left:20px;right:20px;bottom:6px;height:5px;border-bottom:2px solid #9aa8bd;border-radius:0 0 10px 10px}
.mh-body{width:42px;height:20px;margin:-2px auto 0;border-radius:0 0 14px 14px;background:linear-gradient(180deg,#fff,#e6edf5);box-shadow:inset 0 -6px 8px rgba(80,100,140,.12)}
.mh-shadow{width:42px;height:6px;margin:4px auto 0;border-radius:50%;background:rgba(20,30,60,.16);filter:blur(2px)}
.mh-spot{position:fixed;z-index:99990;pointer-events:none;border:3px solid #d4af37;border-radius:14px;box-shadow:0 0 0 4px rgba(212,175,55,.4),0 0 0 9999px rgba(15,18,32,.38);transition:top .2s ease,left .2s ease,width .2s ease,height .2s ease}
.mh-card{position:fixed;z-index:100040;background:#fff;border-radius:16px;box-shadow:0 16px 40px rgba(16,24,40,.2);padding:14px 14px 12px;color:#141622;max-width:calc(100vw - 16px);overflow:auto}
.mh-step{color:#8c6b1f;font-weight:800;font-size:13px;margin-bottom:6px}
.mh-card p{margin:0;font-size:14px;line-height:1.45;overflow-wrap:anywhere}
.mh-hint{margin-top:8px !important;color:#5c6578;font-size:12px}
.mh-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:12px}
.mh-ask{display:flex;gap:6px;margin-top:8px}
.mh-ask input{flex:1;min-width:0;width:100%;border:1px solid rgba(20,22,34,.12);border-radius:10px;padding:8px 10px;font-size:14px;outline:none}
.mh-ask button{border:0;background:#d4af37;color:#141622;border-radius:10px;padding:0 10px;font-weight:800;cursor:pointer}
.mh-note{margin:8px 0 0;font-size:13px;line-height:1.4;color:#141622;background:#fbf6e6;border-radius:10px;padding:8px}
.mh-link{border:0;background:transparent;color:#5c6578;font-size:13px;cursor:pointer;padding:6px}
.mh-next{margin-left:auto;background:#d4af37;color:#141622;border:0;border-radius:10px;padding:8px 16px;font-weight:800;cursor:pointer}
@media (max-width:900px){
  .mh-dock{right:8px;gap:6px;padding:6px}
  .mh-robot{width:62px;height:82px}
  .mh-head{width:50px;height:42px;border-radius:20px 20px 16px 16px}
  .mh-visor{left:6px;right:6px;top:14px;height:16px;gap:6px}
  .mh-eye{width:7px;height:7px}
  .mh-body{width:34px;height:16px}
  .mh-shadow{width:34px;height:5px}
  .mh-bubble{width:36px;height:36px;border-radius:9px;margin-bottom:6px}
  .mh-chat{width:min(280px,calc(100vw - 16px));max-height:min(38vh,280px)}
  .mh-log{max-height:14vh;padding:8px}
  .mh-chat-h{padding:8px 10px}
  .mh-chips{padding:0 8px 6px}
  .mh-form{padding:8px}
  .mh-form input{padding:8px 10px}
  .mh-card{max-height:30vh;padding:10px}
  .mh-card p{font-size:13px}
  .mh-hint{font-size:11px}
  .mh-next{margin-left:0;padding:8px 12px}
}
`;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickTarget(ids: string[]) {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    return el;
  }
  return null;
}

const AIM = ['demander le nettoyage', 'hors service', 'en service', 'menu du jour', 'se connecter', 'reserver un sejour', 'nouveau client', 'creer le compte', 'mon rapport', 'ajouter', 'modifier', 'supprimer', 'enregistrer', 'annuler', 'voir', 'filtrer', 'panier', 'encaisser', 'resoudre', 'prete', 'publier', 'horaire', 'tache', 'categorie', 'historique', 'connexion', 'reserver', 'imprimer', 'bannir', 'commander', 'chambres', 'reception', 'confirmer', 'chercher', 'factures', 'notes', 'disponible', 'creer', 'servir'];

function aimLabel(text: string) {
  const hay = fold(text);
  const wanted = AIM.filter((word) => hay.includes(fold(word))).sort((a, b) => fold(b).length - fold(a).length);
  if (!wanted.length) return null;
  const nodes = document.querySelectorAll('button, a, [role="button"], input, textarea, select');
  let best: HTMLElement | null = null;
  let bestScore = 0;
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.closest('.mh-dock, .mh-card, .mh-spot')) continue;
    const label = fold(`${node.innerText || ''} ${node.getAttribute('aria-label') || ''} ${node.getAttribute('placeholder') || ''}`);
    if (!label || label.length > 80) continue;
    const rect = node.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) continue;
    let score = 0;
    for (const word of wanted) {
      const folded = fold(word);
      if (label === folded) score += folded.length + 12;
      else if (label.includes(folded)) score += folded.length;
    }
    if (score > bestScore) {
      bestScore = score;
      best = node;
    }
  }
  return bestScore >= 5 ? best : null;
}

function viewSize() {
  return {
    w: document.documentElement?.clientWidth || window.innerWidth,
    h: window.innerHeight,
  };
}

function dockSize() {
  const { w } = viewSize();
  const narrow = w < 900;
  return {
    width: narrow ? 110 : 128,
    height: narrow ? 96 : 112,
    bottomGap: narrow ? 78 : 16,
  };
}

async function findTarget(ids: string[], text: string) {
  const specific = ids.filter((id) => id !== 'guide-page');
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const found = pickTarget(specific);
    if (found) {
      const rect = found.getBoundingClientRect();
      const { h, w } = viewSize();
      const inside = rect.top >= 56 && rect.bottom <= h - 12 && rect.left >= 0 && rect.right <= w;
      if (!inside) found.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
      await wait(30);
      return found;
    }
    if (attempt === 0 && specific.some((id) => id.startsWith('guide-nav-') || id === 'guide-menu') && viewSize().w < 1024) {
      window.dispatchEvent(new CustomEvent('myhotel-guide', { detail: { action: 'open-menu' } }));
    }
    await wait(50);
  }
  const aimed = aimLabel(text);
  if (aimed) {
    aimed.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
    await wait(30);
    return aimed;
  }
  return pickTarget(['guide-page']);
}

function clampSpot(raw: Spot): Spot {
  const { w, h } = viewSize();
  const pad = 4;
  let left = Math.max(pad, raw.left);
  let top = Math.max(pad, raw.top);
  let width = Math.min(raw.width, w - left - pad);
  let height = Math.min(raw.height, h - top - pad);
  if (width < 24) {
    left = Math.max(pad, Math.min(raw.left, w - 48));
    width = Math.min(Math.max(24, raw.width), w - left - pad);
  }
  if (height < 24) {
    top = Math.max(pad, Math.min(raw.top, h - 48));
    height = Math.min(Math.max(24, raw.height), h - top - pad);
  }
  return { top, left, width, height };
}

function placeRobot(spot: Spot | null) {
  const { w, h } = viewSize();
  const dock = dockSize();
  const left = Math.max(8, w - dock.width - 12);
  const restTop = Math.max(8, h - dock.height - dock.bottomGap);
  if (!spot) return { left, top: restTop };
  let top = spot.top + Math.min(spot.height / 2, 24) - dock.height / 2;
  if (top < 8) top = 8;
  if (top > restTop) top = restTop;
  if (spot.top + spot.height > top - 8 && spot.top < top + dock.height + 8) {
    const above = spot.top - dock.height - 12;
    const below = spot.top + spot.height + 12;
    top = above >= 8 ? above : Math.min(restTop, below);
  }
  return { left, top };
}

function placeCard(spot: Spot, robot: { left: number; top: number }) {
  const { w, h } = viewSize();
  const narrow = w < 900;
  const dock = dockSize();
  const width = narrow ? Math.min(w - 16, 320) : Math.min(320, w - dock.width - 28);
  const maxHeight = narrow ? Math.min(190, Math.round(h * 0.28)) : Math.min(240, h - 24);
  let top = spot.top + spot.height + 10;
  if (top + maxHeight > h - dock.bottomGap - 8) top = Math.max(8, spot.top - maxHeight - 10);
  if (top + maxHeight > robot.top - 8 && robot.top > 80) {
    top = Math.max(8, Math.min(top, robot.top - maxHeight - 8));
  }
  if (top + maxHeight > h - 8) top = Math.max(8, h - maxHeight - 8);
  let left = narrow ? 8 : Math.max(8, robot.left - width - 12);
  if (left + width > w - 8) left = w - width - 8;
  if (left < 8) left = 8;
  return { top, left, width, maxHeight };
}

const SKIP = new Set([
  'aide', 'aider', 'montre', 'montrer', 'comment', 'faire', 'veux', 'voudrais', 'peux', 'pour', 'avec', 'dans',
  'cette', 'cela', 'suis', 'etre', 'avoir', 'devant', 'ecran', 'bouton', 'cliquer', 'clique', 'ouvre', 'ouvrir',
  'guide', 'etape', 'zone', 'quel', 'quelle', 'quoi', 'donc', 'alors', 'merci', 'bonjour', 'svp', 'sil', 'vous',
  'plait', 'montrer', 'vouloir', 'besoin',
]);

function tourFromScreen(text: string): GuideTour | null {
  const words = fold(text).split(' ').filter((word) => word.length > 3 && !SKIP.has(word));
  if (!words.length) return null;
  const nodes = Array.from(document.querySelectorAll('a, button, [role="button"], [id^="guide-"]'));
  let best: { el: HTMLElement; score: number } | null = null;
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.closest('.mh-dock, .mh-card, .mh-spot')) continue;
    const label = fold(`${node.innerText || ''} ${node.getAttribute('aria-label') || ''}`);
    if (!label || label.length > 90) continue;
    const rect = node.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) continue;
    let score = 0;
    for (const word of words) if (label.includes(word)) score += word.length;
    if (score > 0 && (!best || score > best.score)) best = { el: node, score };
  }
  if (!best || best.score < 4) return null;
  if (!best.el.id) best.el.id = 'guide-live';
  return {
    id: 'live',
    title: 'Guidage',
    keywords: [],
    steps: [
      {
        text: 'Voici la zone qui correspond à ce que vous avez écrit. Le cadre doré l’entoure. Faites le geste, puis touchez Suivant.',
        targets: [best.el.id],
      },
    ],
  };
}

function hello(role?: string | null) {
  if (!role) {
    return 'Bonjour. Je vous accompagne dans le site. Dites-moi ce que vous voulez faire, par exemple : « montre-moi les chambres ». Je cadre l’endroit exact et j’explique le geste.';
  }
  if (role === 'client') {
    return 'Bonjour. Dites « visite » et je vous emmène, bouton après bouton : chambres, restaurant, note, réception, nettoyage. Je me place sur la zone à toucher.';
  }
  if (role === 'owner') {
    return 'Bonjour. Je guide le propriétaire comme le reste de l’équipe. Exemple : « aidez-moi à faire une réservation, j’ai un client devant moi ». Je cadre chaque zone, j’explique quoi demander, et je ne répète aucun chiffre ni aucune pièce d’identité.';
  }
  return 'Bonjour. Dites-moi ce que vous devez faire. Exemple : « aidez-moi à faire une réservation, j’ai un client devant moi ». Un cadre doré entoure le bouton ou le champ, et le texte vous dit exactement quoi faire.';
}

export function GuideBot() {
  const { user, token } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [tour, setTour] = useState<GuideTour | null>(null);
  const [index, setIndex] = useState(0);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [busy, setBusy] = useState(false);
  const [stepNote, setStepNote] = useState('');
  const [stepAsk, setStepAsk] = useState('');
  const targetRef = useRef<HTMLElement | null>(null);
  const greeted = useRef(false);

  const suggestions = useMemo(() => suggestionsFor(user?.role), [user?.role]);
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onResize = () => setFrame((value) => value + 1);
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
    };
  }, []);
  useEffect(() => {
    setStepNote('');
  }, [index]);
  const step = tour?.steps[index] ?? null;

  const start = useCallback((next: GuideTour, intro?: string) => {
    if (user?.role && !canRun(next, user.role)) {
      setLines((current) => [...current, { role: 'bot', text: 'Cet écran n’est pas ouvert pour votre rôle. Demandez au propriétaire s’il doit vous y donner accès.' }]);
      setOpen(true);
      return;
    }
    if (!user && next.roles?.length && next.id !== 'login' && next.id !== 'browse' && next.id !== 'tour') {
      setLines((current) => [...current, { role: 'bot', text: 'Connectez-vous d’abord. Je vous montre l’écran de connexion.' }]);
      const login = tourById('login');
      if (login) {
        setTour(login);
        setIndex(0);
      }
      setOpen(false);
      return;
    }
    setLines((current) => [
      ...current,
      { role: 'bot', text: intro || `${next.title}. Je vous montre une zone à la fois. Le cadre doré indique où cliquer ou où écrire. Lisez l’explication, faites le geste, puis touchez Suivant.` },
    ]);
    setStepNote('');
    setStepAsk('');
    setTour(next);
    setIndex(0);
    setOpen(false);
  }, [user]);

  useEffect(() => {
    if (Platform.OS !== 'web' || greeted.current) return;
    greeted.current = true;
    try {
      if (window.localStorage.getItem('mh-guide-hi')) return;
      window.localStorage.setItem('mh-guide-hi', '1');
    } catch {
      /* navigation privée */
    }
    setLines([{ role: 'bot', text: hello(user?.role) }]);
    setOpen(true);
  }, [user?.role]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onStart = (event: Event) => {
      const id = (event as CustomEvent<{ tour?: string }>).detail?.tour;
      const next = tourById(id);
      if (next) start(next);
    };
    window.addEventListener('myhotel-guide-start', onStart);
    return () => window.removeEventListener('myhotel-guide-start', onStart);
  }, [start]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !step) {
      targetRef.current = null;
      setSpot(null);
      return;
    }
    let cancel = false;
    void (async () => {
      if (step.action) {
        window.dispatchEvent(new CustomEvent('myhotel-guide', { detail: { action: step.action } }));
        await wait(80);
      }
      const route = step.route === '/messages' && user?.role === 'client' ? '/desk' : step.route;
      if (route && !window.location.pathname.startsWith(route)) {
        router.push(route as Href);
        await wait(120);
      }
      const found = await findTarget(step.targets, step.text);
      if (cancel) return;
      targetRef.current = found;
      if (!found) {
        setSpot(null);
        return;
      }
      const rect = found.getBoundingClientRect();
      setSpot(clampSpot({
        top: rect.top - 4,
        left: rect.left - 4,
        width: Math.min(rect.width + 8, 420),
        height: Math.min(rect.height + 8, 220),
      }));
    })();
    return () => {
      cancel = true;
    };
  }, [step, pathname, router, user?.role]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !step) return;
    function measure() {
      const el = targetRef.current;
      if (!el || !el.isConnected) return;
      const rect = el.getBoundingClientRect();
      setSpot(clampSpot({
        top: rect.top - 4,
        left: rect.left - 4,
        width: Math.min(rect.width + 8, 420),
        height: Math.min(rect.height + 8, 220),
      }));
    }
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [step, index]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !step || step.click === false) return;
    function onClick(event: MouseEvent) {
      const el = targetRef.current;
      if (!el) return;
      if (event.target instanceof Node && el.contains(event.target)) {
        window.setTimeout(() => setIndex((current) => current + 1), 320);
      }
    }
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [step, index]);

  useEffect(() => {
    if (!tour) return;
    if (index >= tour.steps.length) {
      setLines((current) => [...current, { role: 'bot', text: 'La visite est terminée. Si le client est encore devant vous, relisez le récapitulatif à l’écran avant de fermer la fenêtre. Je peux vous guider pour une autre action.' }]);
      setTour(null);
      setIndex(0);
      setSpot(null);
      window.dispatchEvent(new CustomEvent('myhotel-guide', { detail: { action: 'close-menu' } }));
    }
  }, [index, tour]);

  function askStep(text: string) {
    const clean = text.trim();
    if (!clean || !step) return;
    setStepAsk('');
    const hay = fold(clean);
    if (wantsFull(clean)) {
      start(fullTour(user?.role));
      return;
    }
    if (/montre|emmene|ouvre|guide/.test(hay)) {
      const other = composeTour(clean, user?.role);
      if (other && tour && other.id !== tour.id) {
        start(other, 'Je vous emmène sur ce que vous venez de demander.');
        return;
      }
    }
    const where = /ou est|ou se trouve|ou cliquer|ou ecrire|ou toucher/.test(hay);
    const why = /pourquoi|a quoi|pour quoi/.test(hay);
    const lead = where
      ? 'Le cadre doré est déjà sur la zone. '
      : why
        ? 'Cette étape prépare le geste suivant. '
        : '';
    setStepNote(`${lead}${step.text} Faites seulement ce geste, puis Suivant. Je ne donne aucun chiffre, aucun nom et aucune pièce d’identité.`);
  }

  const begin = useCallback((clean: string, local: GuideTour | null, intro?: string) => {
    if (wantsFull(clean)) {
      start(fullTour(user?.role));
      return;
    }
    if (local) {
      start(local, intro);
      return;
    }
    const live = tourFromScreen(clean);
    if (live) {
      start(live, intro);
      return;
    }
    const general = tourById('tour');
    if (general) {
      start(general, intro || 'Je n’ai pas reconnu un écran précis. Je vous montre le menu. Dites ensuite le nom : réservation, vente, sales, rapport, planning…');
      return;
    }
    setLines((current) => [...current, { role: 'bot', text: intro || 'Dites-moi l’écran ou l’action, par exemple « réservation » ou « vente ».' }]);
    setOpen(true);
  }, [start, user?.role]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onPhrase = (event: Event) => {
      const detail = (event as CustomEvent<{ text?: string; tour?: string | null }>).detail;
      const phrase = detail?.text?.trim();
      if (!phrase) return;
      const named = detail?.tour ? tourById(detail.tour) : null;
      begin(phrase, composeTour(phrase, user?.role) || (named && canRun(named, user?.role) ? named : null));
    };
    window.addEventListener('myhotel-guide-phrase', onPhrase);
    return () => window.removeEventListener('myhotel-guide-phrase', onPhrase);
  }, [begin, user?.role]);

  async function ask(text: string) {
    const clean = text.trim();
    if (!clean || busy) return;
    setDraft('');
    setLines((current) => [...current, { role: 'user', text: clean }]);
    if (wantsFull(clean)) {
      begin(clean, null);
      return;
    }
    const local = composeTour(clean, user?.role);
    if (local || !token) {
      begin(clean, local);
      return;
    }
    setBusy(true);
    try {
      const data = await pmsPost<{ reply: string; tour?: string | null }>(token, 'assistant', { body: clean }, 45000);
      const named = data.tour ? tourById(data.tour) : null;
      const next = named && canRun(named, user?.role) ? named : null;
      const refused = /refuse cette clé|n’arrive pas à joindre|n’est pas configuré/i.test(data.reply || '');
      begin(clean, next, refused ? undefined : data.reply);
    } catch (error) {
      begin(clean, null, error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return <NativeGuide role={user?.role} onAsk={(id) => {
      const next = tourById(id);
      if (next) router.push((next.steps.find((item) => item.route)?.route || '/home') as Href);
    }} />;
  }

  const robot = placeRobot(tour && spot ? spot : null);
  void frame;
  const cardStyle = spot
    ? placeCard(spot, robot)
    : { top: Math.max(8, window.innerHeight - (window.innerWidth < 900 ? 360 : 250)), left: 8, width: Math.min(320, window.innerWidth - 16), maxHeight: window.innerWidth < 900 ? 190 : 240 };
  function askAbout(event: Event) {
    event.preventDefault();
    askStep(stepAsk);
  }

  return createPortal(
    createElement(
      'div',
      null,
      createElement('style', null, CSS),
      tour && step
        ? createElement('div', {
            className: 'mh-spot',
            style: spot
              ? { top: `${spot.top}px`, left: `${spot.left}px`, width: `${spot.width}px`, height: `${spot.height}px` }
              : { top: '16px', left: '16px', width: '0px', height: '0px', border: '0', boxShadow: 'none' },
          })
        : null,
      tour && step
        ? createElement(
            'div',
            { className: 'mh-card', style: { top: `${cardStyle.top}px`, left: `${cardStyle.left}px`, width: `${cardStyle.width}px`, maxHeight: `${cardStyle.maxHeight}px` }, role: 'dialog' },
            createElement('div', { className: 'mh-step' }, `Étape ${index + 1} sur ${tour.steps.length}`),
            createElement('p', null, step.text),
            createElement('p', { className: 'mh-hint' }, index + 1 >= tour.steps.length ? 'Touchez Terminer pour fermer le cadre.' : 'Quand ce geste est fait, touchez Suivant. Retour revient à la zone précédente.'),
            stepNote ? createElement('p', { className: 'mh-note' }, stepNote) : null,
            createElement(
              'form',
              { className: 'mh-ask', onSubmit: askAbout },
              createElement('input', {
                value: stepAsk,
                placeholder: 'Une question sur cette étape ?',
                onChange: (event: Event) => setStepAsk((event.target as HTMLInputElement).value),
              }),
              createElement('button', { type: 'submit' }, 'OK'),
            ),
            createElement(
              'div',
              { className: 'mh-actions' },
              createElement('button', { className: 'mh-link', type: 'button', onClick: () => { setTour(null); setSpot(null); } }, 'Fermer la visite'),
              index > 0 ? createElement('button', { className: 'mh-link', type: 'button', onClick: () => setIndex((current) => Math.max(0, current - 1)) }, 'Retour') : null,
              createElement('button', { className: 'mh-next', type: 'button', onClick: () => setIndex((current) => current + 1) }, index + 1 >= tour.steps.length ? 'Terminer' : 'Suivant'),
            ),
          )
        : null,
      createElement(
        'div',
        { className: 'mh-dock', style: { top: `${robot.top}px` } },
        createElement(
          'button',
          { className: 'mh-robot', type: 'button', onClick: () => setOpen((value) => !value), 'aria-label': 'Ouvrir le guide' },
          createElement(
            'div',
            { className: 'mh-float' },
            createElement('div', { className: 'mh-ant' }),
            createElement('div', { className: 'mh-stick' }),
            createElement(
              'div',
              { className: 'mh-head' },
              createElement(
                'div',
                { className: 'mh-visor' },
                createElement('i', { className: 'mh-eye' }),
                createElement('i', { className: 'mh-eye' }),
              ),
              createElement('div', { className: 'mh-smile' }),
            ),
            createElement('div', { className: 'mh-body' }),
            createElement('div', { className: 'mh-shadow' }),
          ),
        ),
        createElement(
          'button',
          { className: 'mh-bubble', type: 'button', onClick: () => setOpen((value) => !value), 'aria-label': 'Discuter avec le guide' },
          createElement(
            'svg',
            { viewBox: '0 0 24 24', fill: 'none' },
            createElement('path', {
              d: 'M5 6.5A3.5 3.5 0 0 1 8.5 3h7A3.5 3.5 0 0 1 19 6.5v6A3.5 3.5 0 0 1 15.5 16H10l-3.8 3.2c-.5.4-1.2 0-1.2-.6V16A3.5 3.5 0 0 1 5 12.5v-6Z',
              stroke: '#141622',
              strokeWidth: '1.8',
            }),
          ),
        ),
        open
          ? createElement(
              'div',
              { className: 'mh-chat' },
              createElement(
                'div',
                { className: 'mh-chat-h' },
                createElement('div', null, createElement('strong', null, 'Guide MyHotel'), createElement('span', null, 'Je cadre où cliquer')),
                createElement('button', { className: 'mh-x', type: 'button', onClick: () => setOpen(false), 'aria-label': 'Fermer le chat' }, '×'),
              ),
              createElement(
                'div',
                { className: 'mh-log' },
                ...lines.map((line, lineIndex) => createElement('div', { key: lineIndex, className: `mh-b ${line.role}` }, line.text)),
                busy ? createElement('div', { className: 'mh-b bot' }, 'Je prépare le guidage…') : null,
              ),
              createElement(
                'div',
                { className: 'mh-chips' },
                ...suggestions.map((item) =>
                  createElement(
                    'button',
                    {
                      key: item.id,
                      className: 'mh-chip',
                      type: 'button',
                      onClick: () => {
                        if (item.id === 'parcours') start(fullTour(user?.role));
                        else void ask(item.label);
                      },
                    },
                    item.label,
                  ),
                ),
              ),
              createElement(
                'form',
                {
                  className: 'mh-form',
                  onSubmit: (event: Event) => {
                    event.preventDefault();
                    void ask(draft);
                  },
                },
                createElement('input', {
                  value: draft,
                  placeholder: 'Aide-moi à faire une réservation…',
                  onChange: (event: Event) => setDraft((event.target as HTMLInputElement).value),
                }),
                createElement('button', { type: 'submit' }, 'OK'),
              ),
            )
          : null,
      ),
    ),
    document.body,
  );
}

function NativeGuide({ role, onAsk }: { role?: string | null; onAsk: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const suggestions = suggestionsFor(role);
  return (
    <View pointerEvents="box-none" style={styles.nativeFill}>
      {open ? (
        <View style={styles.nativeCard}>
          <Text style={styles.nativeTitle}>Guide MyHotel</Text>
          <Text style={styles.nativeText}>{hello(role)}</Text>
          <View style={styles.nativeChips}>
            {suggestions.map((item) => (
              <Pressable key={item.id} onPress={() => onAsk(item.id)} style={styles.nativeChip}>
                <Text style={styles.nativeChipText}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      <Pressable onPress={() => setOpen((value) => !value)} style={styles.nativeBtn} accessibilityLabel="Ouvrir le guide">
        <Text style={styles.nativeBtnText}>IA</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  nativeFill: { ...StyleSheet.absoluteFill, zIndex: 80, alignItems: 'flex-end', justifyContent: 'flex-end', padding: 16, paddingBottom: 92 },
  nativeCard: { width: 280, backgroundColor: '#fff', borderRadius: 16, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(20,22,34,0.08)' },
  nativeTitle: { fontWeight: '800', color: '#141622', marginBottom: 4 },
  nativeText: { color: '#141622', fontSize: 13, lineHeight: 18 },
  nativeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  nativeChip: { backgroundColor: '#f8f1d8', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  nativeChipText: { color: '#141622', fontSize: 12, fontWeight: '700' },
  nativeBtn: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#d4af37', alignItems: 'center', justifyContent: 'center' },
  nativeBtnText: { color: '#141622', fontWeight: '800' },
});
