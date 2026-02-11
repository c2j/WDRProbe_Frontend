
import React, { createContext, useState, useContext, ReactNode } from 'react';
import { WdrReportDetail, WdrObjectStat, RiskIssue } from '../types';

interface WDRContextState {
  report: WdrReportDetail | null;
  setReport: (report: WdrReportDetail | null) => void;
  risks: RiskIssue[];
  setRisks: (risks: RiskIssue[]) => void;
  activeTab: 'overview' | 'wait' | 'sql' | 'obj' | 'settings';
  setActiveTab: (tab: 'overview' | 'wait' | 'sql' | 'obj' | 'settings') => void;
  selectedSql: any | null;
  setSelectedSql: (sql: any | null) => void;
  selectedObject: WdrObjectStat | null;
  setSelectedObject: (obj: WdrObjectStat | null) => void;
  objTypeFilter: 'All' | 'Table' | 'Index';
  setObjTypeFilter: (filter: 'All' | 'Table' | 'Index') => void;
  
  // New Filters
  sqlUserFilter: string;
  setSqlUserFilter: (user: string) => void;
  objSchemaFilter: string;
  setObjSchemaFilter: (schema: string) => void;

  reportHistory: WdrReportDetail[];
  setReportHistory: React.Dispatch<React.SetStateAction<WdrReportDetail[]>>;

  // Comparison Persistence State
  comparisonBaseline: WdrReportDetail | null;
  setComparisonBaseline: (report: WdrReportDetail | null) => void;
  comparisonTargets: WdrReportDetail[];
  setComparisonTargets: React.Dispatch<React.SetStateAction<WdrReportDetail[]>>;
  comparisonActiveTab: 'metrics' | 'wait' | 'sql';
  setComparisonActiveTab: (tab: 'metrics' | 'wait' | 'sql') => void;
  comparisonSqlSortMode: 'total' | 'avg' | 'diff' | 'calls_diff';
  setComparisonSqlSortMode: (mode: 'total' | 'avg' | 'diff' | 'calls_diff') => void;
  comparisonSqlUserFilter: string;
  setComparisonSqlUserFilter: (user: string) => void;
  comparisonSqlSearch: string;
  setComparisonSqlSearch: (search: string) => void;
}

const WDRContext = createContext<WDRContextState | undefined>(undefined);

export const WDRProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [report, setReport] = useState<WdrReportDetail | null>(null);
  const [risks, setRisks] = useState<RiskIssue[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'wait' | 'sql' | 'obj' | 'settings'>('overview');
  const [selectedSql, setSelectedSql] = useState<any | null>(null);
  const [selectedObject, setSelectedObject] = useState<WdrObjectStat | null>(null);
  const [objTypeFilter, setObjTypeFilter] = useState<'All' | 'Table' | 'Index'>('Table'); 
  
  // New Filters State
  const [sqlUserFilter, setSqlUserFilter] = useState<string>('All');
  const [objSchemaFilter, setObjSchemaFilter] = useState<string>('All');

  const [reportHistory, setReportHistory] = useState<WdrReportDetail[]>([]);

  // Comparison State
  const [comparisonBaseline, setComparisonBaseline] = useState<WdrReportDetail | null>(null);
  const [comparisonTargets, setComparisonTargets] = useState<WdrReportDetail[]>([]);
  const [comparisonActiveTab, setComparisonActiveTab] = useState<'metrics' | 'wait' | 'sql'>('metrics');
  const [comparisonSqlSortMode, setComparisonSqlSortMode] = useState<'total' | 'avg' | 'diff' | 'calls_diff'>('total');
  const [comparisonSqlUserFilter, setComparisonSqlUserFilter] = useState<string>('All');
  const [comparisonSqlSearch, setComparisonSqlSearch] = useState<string>('');

  return (
    <WDRContext.Provider value={{
      report, setReport,
      risks, setRisks,
      activeTab, setActiveTab,
      selectedSql, setSelectedSql,
      selectedObject, setSelectedObject,
      objTypeFilter, setObjTypeFilter,
      sqlUserFilter, setSqlUserFilter,
      objSchemaFilter, setObjSchemaFilter,
      reportHistory, setReportHistory,
      
      comparisonBaseline, setComparisonBaseline,
      comparisonTargets, setComparisonTargets,
      comparisonActiveTab, setComparisonActiveTab,
      comparisonSqlSortMode, setComparisonSqlSortMode,
      comparisonSqlUserFilter, setComparisonSqlUserFilter,
      comparisonSqlSearch, setComparisonSqlSearch
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
