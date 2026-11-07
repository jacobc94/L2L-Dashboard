import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { Root } from './components/DemoSandbox';
import { StoreProvider } from './store';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <Root />
    </StoreProvider>
  </StrictMode>
);
