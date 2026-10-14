import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import TabBar from '../features/shell/TabBar';
import Header from '../features/shell/Header';
import ProbePage from '../features/probe/ProbePage';
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
import { gate } from './gate';
import { SyncProvider } from '../data/SyncProvider';

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
  const invite = storedInvite(loc.search);
  const g = gate({ path: loc.pathname, loadingSession: loading, session: !!session, loadingFamily: fam.loading, hasMember: !!fam.me, inviteCode: invite, familyError: fam.error });
  if (g === 'probe') return <ProbePage />;
  if (g === 'loading') return <main className="screen"><p className="note" style={{ margin: 16 }}>Загружаем…</p></main>;
  if (g === 'sign-in') return <SignIn />;
  if (g === 'family-error') {
    return (
      <main className="screen">
        <header className="k-head"><div><h1>Нет связи с сервером</h1><p>Не получилось загрузить семью. Проверьте интернет.</p></div></header>
        <section className="card"><div className="btns fill"><button type="button" className="btn" onClick={() => fam.reload()}>Повторить</button></div></section>
      </main>
    );
  }
  if (g === 'accept-invite') return <AcceptInvite code={invite!} onDone={fam.reload} />;
  if (g === 'onboarding') return <Onboarding onDone={fam.reload} />;
  const me = fam.me!;
  return (
    <SyncProvider householdId={me.household_id} isParent={me.role === 'parent'} portions={fam.members.reduce((sum, m) => sum + m.portion, 0) || 3.5}>
      <div className="screen">
        <Routes>
          <Route path="/" element={<HomePage me={me} members={fam.members} />} />
          <Route path="/menu" element={<MenuPage me={me} members={fam.members} />} />
          <Route path="/shop" element={<ShopPage me={me} members={fam.members} />} />
          <Route path="/settings" element={<Settings me={me} members={fam.members} reload={fam.reload} />} />
          <Route path="/join" element={<Header title="Вы уже в семье" />} />
        </Routes>
      </div>
      <TabBar tabs={['home', 'menu', 'shop']} />
    </SyncProvider>
  );
}

export default function App() {
  return <BrowserRouter><Shell /></BrowserRouter>;
}
