import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { NotificationProvider } from './context/NotificationContext.tsx';
import { ThemeProvider } from './context/ThemeContext.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';

// After a deploy, a phone holding the previous index.html fails to load renamed
// lazy chunks (e.g. a modal never opens and only its backdrop renders). Reload once.
window.addEventListener('vite:preloadError', () => {
  const KEY = 'chunk-reload';
  if (!sessionStorage.getItem(KEY)) {
    sessionStorage.setItem(KEY, '1');
    window.location.reload();
  }
});
window.addEventListener('load', () => sessionStorage.removeItem('chunk-reload'), { once: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <NotificationProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </NotificationProvider>
    </ThemeProvider>
  </StrictMode>,
);
