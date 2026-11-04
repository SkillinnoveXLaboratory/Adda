import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/poppins/300.css';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './styles/index.css';
import App from './App.jsx';

// After a new deployment, an open tab may request page chunks that no longer exist. Reload once to pick up
// the new build instead of showing a blank page (guarded so it can never loop).
window.addEventListener('vite:preloadError', (event) => {
  const key = 'adda.chunkReloadAt';
  const last = Number(sessionStorage.getItem(key) || 0);
  if (Date.now() - last > 30000) {
    event.preventDefault();
    sessionStorage.setItem(key, String(Date.now()));
    window.location.reload();
  }
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
