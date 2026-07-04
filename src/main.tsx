import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { NotificationProvider } from './context/NotificationContext.tsx';
import { ThemeProvider } from './context/ThemeContext.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';

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
