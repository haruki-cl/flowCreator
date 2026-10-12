import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import '../shared/styles/theme.css';
import './viewer.css';
import { loadEmbedded } from './loadEmbedded';
import { ViewerApp } from './ViewerApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ViewerApp doc={loadEmbedded()} />
  </StrictMode>,
);
