import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './layouts/AppShell';
import { DashboardPage } from './pages/Dashboard';
import { LiveRatesPage } from './pages/LiveRates';
import { TransactionsPage } from './pages/Transactions';
import { VaultInventoryPage } from './pages/VaultInventory';
import { CustomersPage } from './pages/Customers';

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/live-rates" element={<LiveRatesPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/vault" element={<VaultInventoryPage />} />
        <Route path="/customers" element={<CustomersPage />} />
      </Route>
    </Routes>
  );
}
