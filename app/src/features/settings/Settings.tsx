import Header from '../shell/Header';
import ThemePicker from './ThemePicker';
import type { Member } from '../family/useFamily';

// Placeholder until Task 8: theme only.
export default function Settings(_props: { me: Member; members: Member[]; reload: () => void }) {
  return <><Header title="Настройки" back /><ThemePicker /></>;
}
