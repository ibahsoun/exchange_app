import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './layouts/AppShell';
import { DashboardPage } from './pages/Dashboard';
import { LiveRatesPage } from './pages/LiveRates';
import { TransactionsPage } from './pages/Transactions';
import { CustomersPage } from './pages/Customers';
import { SettlementTermsPage } from './pages/SettlementTerms';
import { MarginsPage } from './pages/Margins';
import { SettingsPage } from './pages/Settings';
import { SpreadSettingsPage } from './pages/SpreadSettings';
import { DestinationsPage } from './pages/Destinations';

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/live-rates" element={<LiveRatesPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/settlement-terms" element={<SettlementTermsPage />} />
        <Route path="/margins" element={<MarginsPage />} />
        <Route path="/spread-settings" element={<SpreadSettingsPage />} />
        <Route path="/destinations" element={<DestinationsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
