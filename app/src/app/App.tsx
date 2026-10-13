import { BrowserRouter, Route, Routes } from 'react-router-dom';
import TabBar from '../features/shell/TabBar';
import Header from '../features/shell/Header';
import ThemePicker from '../features/settings/ThemePicker';

export default function App() {
  return (
    <BrowserRouter>
      <div className="screen">
        <Routes>
          <Route path="/" element={<Header title="Семейный помощник" />} />
          <Route path="/settings" element={<><Header title="Настройки" back /><ThemePicker /></>} />
        </Routes>
      </div>
      <TabBar tabs={['home', 'menu', 'shop']} />
    </BrowserRouter>
  );
}
