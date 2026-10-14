import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
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

function Shell() {
  const loc = useLocation();
  const { session, loading } = useSession();
  const fam = useFamily(session);
  const invite = storedInvite(loc.search);
  const g = gate({ path: loc.pathname, loadingSession: loading, session: !!session, loadingFamily: fam.loading, hasMember: !!fam.me, inviteCode: invite });
  if (g === 'probe') return <ProbePage />;
  if (g === 'loading') return <main className="screen"><p className="note" style={{ margin: 16 }}>Загружаем…</p></main>;
  if (g === 'sign-in') return <SignIn />;
  if (g === 'accept-invite') return <AcceptInvite code={invite!} onDone={fam.reload} />;
  if (g === 'onboarding') return <Onboarding onDone={fam.reload} />;
  const me = fam.me!;
  return (
    <SyncProvider householdId={me.household_id}>
      <div className="screen">
        <Routes>
          <Route path="/" element={
            <Header title={`Привет, ${me.name}`} subtitle="Меню и покупки появятся в следующих частях"
              action={<NavLink to="/settings" className="av" style={{ ['--c' as string]: me.color }} aria-label="Настройки и профиль">{me.name.slice(0, 1)}</NavLink>} />
          } />
          <Route path="/menu" element={<Header title="Меню" subtitle="Скоро" />} />
          <Route path="/shop" element={<Header title="Покупки" subtitle="Скоро" />} />
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
