import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import UpdateToast from './components/UpdateToast';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <UpdateToast />
  </StrictMode>,
);
