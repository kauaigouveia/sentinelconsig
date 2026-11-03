import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { V8WorkerConsentPage } from './components/simulation/V8WorkerConsentPage.tsx';
import './index.css';
import { ThemeProvider } from './context/ThemeContext.tsx';
import { ErrorBoundary } from './components/common/ErrorBoundary.tsx';
import { SpeedInsights } from '@vercel/speed-insights/react';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        {window.location.pathname === '/consentimento-v8' ? <V8WorkerConsentPage /> : <App />}
        <SpeedInsights />
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);


