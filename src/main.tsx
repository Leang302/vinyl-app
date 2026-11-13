import { createRoot } from 'react-dom/client';
import App from './App';
import { usePlayer } from './state/store';
import './styles.css';
// Dev-only hook used by qa/declutter-check.mjs to raise a toast.
if (import.meta.env.DEV) (window as unknown as { __vinylNotify: (m: string) => void }).__vinylNotify = m => usePlayer.getState().notify(m);
createRoot(document.getElementById('root')!).render(<App/>);
