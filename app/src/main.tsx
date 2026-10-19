import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/onest/400.css';
import '@fontsource/onest/500.css';
import '@fontsource/onest/600.css';
import '@fontsource/onest/700.css';
import '@fontsource/onest/800.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import App from './app/App';
import { applyAccent, applyTheme } from './lib/theme';

applyTheme();
applyAccent();

// On a phone a long press on a button or a link opens Chrome's link menu over the app; a field keeps its own menu.
document.addEventListener('contextmenu', (e) => {
  const t = e.target as Element | null;
  if (matchMedia('(hover: none)').matches && t?.closest('a, button, [role="button"]') && !t.closest('input, textarea')) e.preventDefault();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
