import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth';
import Login from './pages/Login';
import Register from './pages/Register';
import Groups from './pages/Groups';
import GroupDetail from './pages/GroupDetail';
import JoinGroup from './pages/JoinGroup';
import DesignPlayground from './pages/DesignPlayground';
import InvitePlayground from './pages/InvitePlayground';
import BalancePlayground from './pages/BalancePlayground';
import NotificationsPlayground from './pages/NotificationsPlayground';
import TopbarPlayground from './pages/TopbarPlayground';
import RateFootnotePlayground from './pages/RateFootnotePlayground';
import PaidSummaryPlayground from './pages/PaidSummaryPlayground';
import PaidSummaryDPlayground from './pages/PaidSummaryDPlayground';
import PaidCashColorPlayground from './pages/PaidCashColorPlayground';

function App() {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/groups" /> : <Login />} />
      <Route path="/register" element={isAuthenticated ? <Navigate to="/groups" /> : <Register />} />
      <Route path="/join/:inviteCode" element={<JoinGroup />} />
      <Route path="/design-playground" element={<DesignPlayground />} />
      <Route path="/invite-playground" element={<InvitePlayground />} />
      <Route path="/balance-playground" element={<BalancePlayground />} />
      <Route path="/notifications-playground" element={<NotificationsPlayground />} />
      <Route path="/topbar-playground" element={<TopbarPlayground />} />
      <Route path="/rate-footnote-playground" element={<RateFootnotePlayground />} />
      <Route path="/paid-summary-playground" element={<PaidSummaryPlayground />} />
      <Route path="/paid-summary-d-playground" element={<PaidSummaryDPlayground />} />
      <Route path="/paid-cash-color-playground" element={<PaidCashColorPlayground />} />
      <Route
        path="/groups"
        element={!isAuthenticated ? <Navigate to="/login" /> : <Groups />}
      />
      <Route
        path="/groups/:groupId"
        element={!isAuthenticated ? <Navigate to="/login" /> : <GroupDetail />}
      />
      <Route path="*" element={<Navigate to={isAuthenticated ? "/groups" : "/login"} />} />
    </Routes>
  );
}

export default App;
