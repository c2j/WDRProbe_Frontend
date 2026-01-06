
import React, { createContext, useState, useContext, ReactNode } from 'react';
import { EnhancedNode, PlanIssue, PlanType, DiffNode } from '../types';

interface PlanContextState {
  // --- Visualizer State ---
  visSql: string;
  setVisSql: (s: string) => void;
  visRawPlanText: string;
  setVisRawPlanText: (s: string) => void;
  visPlan: EnhancedNode | null;
  setVisPlan: (p: EnhancedNode | null) => void;
  visPlanType: PlanType;
  setVisPlanType: (t: PlanType) => void;
  visIssues: PlanIssue[];
  setVisIssues: (i: PlanIssue[]) => void;
  visViewMode: 'tree' | 'flow';
  setVisViewMode: (m: 'tree' | 'flow') => void;
  
  // --- Diff State ---
  diffInputMode: 'unified' | 'split';
  setDiffInputMode: (m: 'unified' | 'split') => void;
  diffLeftText: string;
  setDiffLeftText: (s: string) => void;
  diffRightText: string;
  setDiffRightText: (s: string) => void;
  diffUnifiedText: string;
  setDiffUnifiedText: (s: string) => void;
  diffPlanLeft: DiffNode | null;
  setDiffPlanLeft: (p: DiffNode | null) => void;
  diffPlanRight: DiffNode | null;
  setDiffPlanRight: (p: DiffNode | null) => void;
  diffVerdict: 'Improved' | 'Regressed' | 'Similar' | null;
  setDiffVerdict: (v: 'Improved' | 'Regressed' | 'Similar' | null) => void;
}

const PlanContext = createContext<PlanContextState | undefined>(undefined);

export const PlanProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Visualizer State
  const [visSql, setVisSql] = useState('');
  const [visRawPlanText, setVisRawPlanText] = useState('');
  const [visPlan, setVisPlan] = useState<EnhancedNode | null>(null);
  const [visPlanType, setVisPlanType] = useState<PlanType>('Explain Only');
  const [visIssues, setVisIssues] = useState<PlanIssue[]>([]);
  const [visViewMode, setVisViewMode] = useState<'tree' | 'flow'>('tree');

  // Diff State
  const [diffInputMode, setDiffInputMode] = useState<'unified' | 'split'>('unified');
  const [diffLeftText, setDiffLeftText] = useState('');
  const [diffRightText, setDiffRightText] = useState('');
  const [diffUnifiedText, setDiffUnifiedText] = useState('');
  const [diffPlanLeft, setDiffPlanLeft] = useState<DiffNode | null>(null);
  const [diffPlanRight, setDiffPlanRight] = useState<DiffNode | null>(null);
  const [diffVerdict, setDiffVerdict] = useState<'Improved' | 'Regressed' | 'Similar' | null>(null);

  return (
    <PlanContext.Provider value={{
      visSql, setVisSql,
      visRawPlanText, setVisRawPlanText,
      visPlan, setVisPlan,
      visPlanType, setVisPlanType,
      visIssues, setVisIssues,
      visViewMode, setVisViewMode,
      
      diffInputMode, setDiffInputMode,
      diffLeftText, setDiffLeftText,
      diffRightText, setDiffRightText,
      diffUnifiedText, setDiffUnifiedText,
      diffPlanLeft, setDiffPlanLeft,
      diffPlanRight, setDiffPlanRight,
      diffVerdict, setDiffVerdict,
    }}>
      {children}
    </PlanContext.Provider>
  );
};

export const usePlanContext = () => {
  const context = useContext(PlanContext);
  if (!context) {
    throw new Error('usePlanContext must be used within a PlanProvider');
  }
  return context;
};
