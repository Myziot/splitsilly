import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { useAuthStore } from './store/auth';
import './index.css';

// Bootstrap the session on startup so #root stops showing the loading spinner
// when there is no active session (design Phase 2: "session persists across
// page reload"). checkAuth flips isLoading -> false on success OR 401.
useAuthStore.getState().checkAuth();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
