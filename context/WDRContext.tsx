
import React, { createContext, useState, useContext, ReactNode } from 'react';
import { WdrReportDetail, WdrObjectStat, RiskIssue } from '../types';

interface WDRContextState {
  report: WdrReportDetail | null;
  setReport: (report: WdrReportDetail | null) => void;
  risks: RiskIssue[];
  setRisks: (risks: RiskIssue[]) => void;
  activeTab: 'overview' | 'wait' | 'sql' | 'obj';
  setActiveTab: (tab: 'overview' | 'wait' | 'sql' | 'obj') => void;
  selectedSql: any | null;
  setSelectedSql: (sql: any | null) => void;
  selectedObject: WdrObjectStat | null;
  setSelectedObject: (obj: WdrObjectStat | null) => void;
  objTypeFilter: 'All' | 'Table' | 'Index';
  setObjTypeFilter: (filter: 'All' | 'Table' | 'Index') => void;
  reportHistory: WdrReportDetail[];
  setReportHistory: React.Dispatch<React.SetStateAction<WdrReportDetail[]>>;
}

const WDRContext = createContext<WDRContextState | undefined>(undefined);

export const WDRProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [report, setReport] = useState<WdrReportDetail | null>(null);
  const [risks, setRisks] = useState<RiskIssue[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'wait' | 'sql' | 'obj'>('overview');
  const [selectedSql, setSelectedSql] = useState<any | null>(null);
  const [selectedObject, setSelectedObject] = useState<WdrObjectStat | null>(null);
  const [objTypeFilter, setObjTypeFilter] = useState<'All' | 'Table' | 'Index'>('All');
  const [reportHistory, setReportHistory] = useState<WdrReportDetail[]>([]);

  return (
    <WDRContext.Provider value={{
      report, setReport,
      risks, setRisks,
      activeTab, setActiveTab,
      selectedSql, setSelectedSql,
      selectedObject, setSelectedObject,
      objTypeFilter, setObjTypeFilter,
      reportHistory, setReportHistory
    }}>
      {children}
    </WDRContext.Provider>
  );
};

export const useWDRContext = () => {
  const context = useContext(WDRContext);
  if (!context) {
    throw new Error('useWDRContext must be used within a WDRProvider');
  }
  return context;
};
