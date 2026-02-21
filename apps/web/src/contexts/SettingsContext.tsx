import { createContext, useContext, useState } from 'react';

interface SettingsContextValue {
  showSettlementTerms: boolean;
  showMargins: boolean;
  setShowSettlementTerms: (v: boolean) => void;
  setShowMargins: (v: boolean) => void;
}

const SettingsContext = createContext<SettingsContextValue>({
  showSettlementTerms: true,
  showMargins: true,
  setShowSettlementTerms: () => {},
  setShowMargins: () => {},
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [showSettlementTerms, setShowSettlementTerms] = useState(
    () => localStorage.getItem('show_settlement_terms') !== 'false',
  );
  const [showMargins, setShowMargins] = useState(
    () => localStorage.getItem('show_margins') !== 'false',
  );

  const updateSettlement = (v: boolean) => {
    setShowSettlementTerms(v);
    localStorage.setItem('show_settlement_terms', String(v));
  };

  const updateMargins = (v: boolean) => {
    setShowMargins(v);
    localStorage.setItem('show_margins', String(v));
  };

  return (
    <SettingsContext.Provider
      value={{
        showSettlementTerms,
        showMargins,
        setShowSettlementTerms: updateSettlement,
        setShowMargins: updateMargins,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
