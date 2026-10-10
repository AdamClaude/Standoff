import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { sound } from './audio';

// Browsers only start audio after a gesture: start the band on the first tap anywhere.
window.addEventListener('pointerdown', () => sound.unlock(), { once: true });

createRoot(document.getElementById('root')!).render(<App />);
