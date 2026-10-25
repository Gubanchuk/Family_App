import { lazy, Suspense, useEffect } from 'react';
import { refreshPush } from '../lib/push';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import ScrollTop from '../features/shell/ScrollTop';
import StoryLink from '../features/stories/StoryLink';
import TabBar from '../features/shell/TabBar';
import Header from '../features/shell/Header';
import ProbePage from '../features/probe/ProbePage';
import PrivacyPage from '../features/privacy/PrivacyPage';
import SignIn from '../features/auth/SignIn';
import { useSession } from '../features/auth/useSession';
import { useFamily } from '../features/family/useFamily';
import Onboarding from '../features/family/Onboarding';
import AcceptInvite from '../features/family/AcceptInvite';
import { readInviteCode } from '../features/family/invite';
import Settings from '../features/settings/Settings';
import MenuPage from '../features/menu/MenuPage';
import ShopPage from '../features/shop/ShopPage';
import HomePage from '../features/home/HomePage';
import BoardPage from '../features/board/BoardPage';
import { useBoardReady } from '../features/board/useBoard';
import MoneyPage from '../features/money/MoneyPage';
import AssistantPage from '../features/assistant/AssistantPage';
import { useMoneyReady } from '../features/money/useMoney';
import { tabsFor } from '../features/shell/tabs';
import { localDb } from '../data/db';
import { gate } from './gate';
import { SyncProvider } from '../data/SyncProvider';
import ToastProvider from '../features/shell/Toast';
import StoriesProvider from '../features/stories/StoriesProvider';
import { useAppUpdate } from '../lib/appUpdate';

// A Google account brings a first name; the family screens start from it.
function firstName(meta: Record<string, unknown> | undefined): string {
  const raw = meta?.given_name ?? meta?.full_name ?? meta?.name;
  return typeof raw === 'string' ? raw.trim().split(/\s+/)[0] ?? '' : '';
}

// The invite code survives a Google sign-in round trip in sessionStorage.
function storedInvite(search: string): string | null {
  const fromUrl = readInviteCode(search);
  try {
    if (fromUrl) { sessionStorage.setItem('fa.invite', fromUrl); return fromUrl; }
    return sessionStorage.getItem('fa.invite');
  } catch { return fromUrl; }
}

// Development-only screen preview at /dev, loaded lazily so it never reaches the production bundle.
const DevPreview = import.meta.env.DEV ? lazy(() => import('../dev/Preview')) : null;

function Shell() {
  const loc = useLocation();
  if (DevPreview && loc.pathname.startsWith('/dev')) return <Suspense fallback={null}><DevPreview /></Suspense>;
  return <MemberShell />;
}

function MemberShell() {
  const loc = useLocation();
  const { session, loading } = useSession();
  const fam = useFamily(session);
  const boardReady = useBoardReady(localDb);
  const moneyReady = useMoneyReady(localDb);
  const meId = fam.me?.id;
  // Re-register this phone's push address on start in case the push service rotated it.
  useEffect(() => { if (fam.me) refreshPush(fam.me).catch(() => {}); }, [meId]); // eslint-disable-line react-hooks/exhaustive-deps
  const invite = storedInvite(loc.search);
  const g = gate({ path: loc.pathname, loadingSession: loading, session: !!session, loadingFamily: fam.loading, hasMember: !!fam.me, inviteCode: invite, familyError: fam.error });
  if (g === 'probe') return <ProbePage />;
  if (g === 'privacy') return <PrivacyPage />;
  if (g === 'loading') return <main className="screen"><p className="note" style={{ margin: 16 }}>Загружаем…</p></main>;
  if (g === 'sign-in') return <SignIn invite={invite} />;
  if (g === 'family-error') {
    return (
      <main className="screen">
        <header className="k-head"><div><h1>Нет связи с сервером</h1><p>Не получилось загрузить семью. Проверьте интернет.</p></div></header>
        <section className="card"><div className="btns fill"><button type="button" className="btn" onClick={() => fam.reload()}>Повторить</button></div></section>
      </main>
    );
  }
  const suggested = firstName(session?.user.user_metadata);
  if (g === 'accept-invite') return <AcceptInvite code={invite!} onDone={fam.reload} suggestedName={suggested} />;
  if (g === 'onboarding') return <Onboarding onDone={fam.reload} suggestedName={suggested} />;
  const me = fam.me!;
  return (
    <SyncProvider householdId={me.household_id} isParent={me.role === 'parent'} portions={fam.members.reduce((sum, m) => sum + m.portion, 0) || 3.5} onSynced={fam.reload}>
      <StoriesProvider me={me} members={fam.members}>
      <ScrollTop />
      {/* A story push opens the app at /?story=<member>: the viewer opens on that person's story. */}
      <StoryLink />
      <div className="screen">
        <Routes>
          <Route path="/" element={<HomePage me={me} members={fam.members} />} />
          <Route path="/menu" element={<MenuPage me={me} members={fam.members} />} />
          <Route path="/shop" element={<ShopPage me={me} members={fam.members} />} />
          <Route path="/settings" element={<Settings me={me} members={fam.members} reload={fam.reload} />} />
          <Route path="/board" element={<BoardPage me={me} members={fam.members} />} />
          <Route path="/assistant" element={<AssistantPage me={me} members={fam.members} />} />
          {me.role === 'parent' ? <Route path="/money" element={<MoneyPage me={me} members={fam.members} />} /> : null}
          <Route path="/join" element={<Header title="Вы уже в семье" />} />
          {/* An old or mistyped link, or a parent's page opened by a child, lands on Home, not a blank screen. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <TabBar tabs={tabsFor(me.role, boardReady, moneyReady)} />
      </StoriesProvider>
    </SyncProvider>
  );
}

// Shown on every screen, sign-in too: the open page runs old code until it reloads.
function UpdateBar() {
  const ready = useAppUpdate();
  if (!ready) return null;
  return (
    <div className="toast update-bar" role="status">
      <span>Вышла новая версия приложения</span>
      <button type="button" className="toast-act" onClick={() => location.reload()}>Обновить</button>
    </div>
  );
}

export default function App() {
  return <BrowserRouter><ToastProvider><Shell /><UpdateBar /></ToastProvider></BrowserRouter>;
}
