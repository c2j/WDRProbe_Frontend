
import React, { useState, useRef, useMemo } from 'react';
import { useI18n } from '../context/I18nContext';
import { parseWdrHtml } from '../utils/wdrParser';
import { WdrReportDetail } from '../types';
import { 
  GitCompare, Upload, X, ArrowRight, ArrowUp, ArrowDown, 
  Minus, FileText, Database, Activity, Clock, Trash2,
  BarChart2, AlignLeft, AlertCircle, Info, Lock
} from 'lucide-react';

const WDRComparison: React.FC = () => {
  const { t } = useI18n();
  const [baseline, setBaseline] = useState<WdrReportDetail | null>(null);
  const [targets, setTargets] = useState<WdrReportDetail[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Page Tabs
  const [activeTab, setActiveTab] = useState<'metrics' | 'wait' | 'sql'>('metrics');

  // State for Top SQL internal sorting
  // Added 'calls_diff' for frequency variation
  const [sqlSortMode, setSqlSortMode] = useState<'total' | 'avg' | 'diff' | 'calls_diff'>('total');
  const [selectedCompSqlId, setSelectedCompSqlId] = useState<number | null>(null);

  const baselineInputRef = useRef<HTMLInputElement>(null);
  const targetInputRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File, isBaseline: boolean) => {
    setLoading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
        const html = ev.target?.result as string;
        try {
            const parsedData = parseWdrHtml(html);
            if (isBaseline) {
                setBaseline(parsedData);
            } else {
                setTargets(prev => [...prev, parsedData]);
            }
        } catch (err) {
            console.error(err);
            alert('Error parsing WDR report.');
        } finally {
            setLoading(false);
        }
    };
    reader.readAsText(file);
  };

  const handleBaselineUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file, true);
  };

  const handleTargetUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
          Array.from(e.target.files).forEach(file => processFile(file, false));
      }
  };

  const removeTarget = (idx: number) => {
      setTargets(prev => prev.filter((_, i) => i !== idx));
  };

  const getWaitEventDescription = (event: string) => {
      const lower = event.toLowerCase();
      if (lower.includes('lockmgrlock')) return t('desc.wait.LockMgrLock');
      if (lower.includes('walsync')) return t('desc.wait.WALSync');
      if (lower.includes('datafileread')) return t('desc.wait.DataFileRead');
      if (lower.includes('datafilewrite')) return t('desc.wait.DataFileWrite');
      return null;
  };

  // Helper to calculate report duration in seconds for normalization
  const getReportDuration = (snapshots: { start: string; end: string }) => {
      try {
          const start = new Date(snapshots.start).getTime();
          const end = new Date(snapshots.end).getTime();
          const diff = (end - start) / 1000;
          return diff > 0 ? diff : 1; // Avoid division by zero
      } catch (e) {
          return 1;
      }
  };

  const DeltaCell = ({ base, current, unit = '', reverse = false, showVal = true, isRate = false }: { base: number, current: number, unit?: string, reverse?: boolean, showVal?: boolean, isRate?: boolean }) => {
      if (base === 0 && current === 0) return <span className="text-gray-400">-</span>;
      
      const diff = current - base;
      const percent = base !== 0 ? ((diff / base) * 100) : 0;
      
      const isBad = reverse ? diff < 0 : diff > 0;
      const isNeutral = diff === 0;
      
      let colorClass = isNeutral ? 'text-gray-500' : isBad ? 'text-red-600' : 'text-green-600';
      const Icon = isNeutral ? Minus : diff > 0 ? ArrowUp : ArrowDown;

      // Format value based on whether it's a rate (float) or count (int/float)
      const valStr = isRate ? current.toFixed(2) : current.toLocaleString();

      return (
          <div className="flex flex-col items-end">
              {showVal && <span className="font-mono font-medium text-gray-800">{valStr}{unit}</span>}
              <span className={`text-xs flex items-center ${colorClass}`}>
                  <Icon size={10} className="mr-0.5"/>
                  {Math.abs(percent).toFixed(1)}%
              </span>
          </div>
      );
  };

  // --- Top SQL Logic ---
  const sortedTopSqls = useMemo(() => {
      if (!baseline) return [];
      const items = [...baseline.topSql];
      const target1 = targets[0];

      return items.sort((a, b) => {
          switch (sqlSortMode) {
              case 'avg':
                  return b.avgTime - a.avgTime;
              case 'calls_diff':
                  // Sort by absolute difference of Execution Frequency (Calls/Sec)
                  if (!target1) return b.calls - a.calls;
                  
                  const durBase = getReportDuration(baseline.snapshots);
                  const durTgt = getReportDuration(target1.snapshots);

                  const getCps = (sql: any, dur: number) => (sql ? sql.calls / dur : 0);
                  
                  const baseCpsA = getCps(a, durBase);
                  const tgtCpsA = getCps(target1.topSql.find(s => s.uniqueSqlId === a.uniqueSqlId), durTgt);
                  
                  const baseCpsB = getCps(b, durBase);
                  const tgtCpsB = getCps(target1.topSql.find(s => s.uniqueSqlId === b.uniqueSqlId), durTgt);

                  return Math.abs(tgtCpsB - baseCpsB) - Math.abs(tgtCpsA - baseCpsA);

              case 'diff':
                  // Sort by absolute difference of Total Time vs Target 1
                  if (!target1) return b.totalTime - a.totalTime;
                  const t1A = target1.topSql.find(s => s.uniqueSqlId === a.uniqueSqlId)?.totalTime || 0;
                  const t1B = target1.topSql.find(s => s.uniqueSqlId === b.uniqueSqlId)?.totalTime || 0;
                  return Math.abs(t1B - b.totalTime) - Math.abs(t1A - a.totalTime);
              case 'total':
              default:
                  return b.totalTime - a.totalTime;
          }
      }).slice(0, 20);
  }, [baseline, targets, sqlSortMode]);

  // Comparison Data for Modal
  const getSqlComparisonData = (uniqueId: number) => {
      if (!baseline) return null;
      const baseSql = baseline.topSql.find(s => s.uniqueSqlId === uniqueId);
      if (!baseSql) return null;

      const rows = [
          { label: t('wdr.comp.metric.calls'), key: 'calls' as const, unit: '' },
          { label: t('wdr.comp.metric.total'), key: 'totalTime' as const, unit: 'us' },
          { label: t('wdr.comp.metric.avg'), key: 'avgTime' as const, unit: 'us' },
          { label: t('wdr.comp.metric.cpu'), key: 'cpuTime' as const, unit: 'us' },
          { label: t('wdr.comp.metric.io'), key: 'ioTime' as const, unit: 'us' },
          { label: t('wdr.comp.metric.rows'), key: 'rows' as const, unit: '' },
          { label: t('wdr.comp.metric.lread'), key: 'logicalRead' as const, unit: '' },
      ];

      return {
          baseSql,
          rows: rows.map(r => ({
              label: r.label,
              unit: r.unit,
              baseVal: (baseSql[r.key] || 0) as number,
              targets: targets.map(t => {
                  const tSql = t.topSql.find(s => s.uniqueSqlId === uniqueId);
                  return (tSql ? tSql[r.key] || 0 : 0) as number;
              })
          }))
      };
  };

  const selectedSqlDetails = selectedCompSqlId ? getSqlComparisonData(selectedCompSqlId) : null;

  // Header Logic helper
  const getSqlMetricHeader = () => {
      if (sqlSortMode === 'avg') return `${t('wdr.comp.metric.avg')} (us)`;
      if (sqlSortMode === 'calls_diff') return t('wdr.comp.metric.cps');
      return `${t('wdr.comp.metric.total')} (us)`;
  };

  return (
    <div className="h-full flex flex-col space-y-4 relative">
        {/* Header Control Panel */}
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 shrink-0">
             <div className="flex justify-between items-start">
                 <h2 className="text-lg font-bold text-gray-800 flex items-center">
                    <GitCompare size={20} className="mr-2 text-blue-600"/>
                    {t('wdr.comp.title')}
                 </h2>
                 <div className="flex space-x-2">
                     <button 
                        onClick={() => { setBaseline(null); setTargets([]); }} 
                        className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded border border-gray-200"
                     >
                        {t('wdr.comp.reset')}
                     </button>
                 </div>
             </div>
             
             <div className="flex mt-4 gap-4 items-stretch">
                 {/* Baseline Zone */}
                 <div className={`flex-1 p-3 rounded border-2 border-dashed transition-colors relative ${baseline ? 'border-blue-200 bg-blue-50/50' : 'border-gray-300 hover:border-blue-400 bg-gray-50'}`}>
                     {baseline ? (
                         <div className="flex justify-between items-center">
                             <div>
                                 <div className="text-xs font-bold text-blue-600 uppercase mb-1">{t('wdr.comp.baseline')}</div>
                                 <div className="font-medium text-gray-800 flex items-center"><Database size={12} className="mr-1"/>{baseline.meta.instanceName}</div>
                                 <div className="text-xs text-gray-500">{baseline.meta.period}</div>
                             </div>
                             <button onClick={() => setBaseline(null)} className="p-1 hover:bg-red-100 text-gray-400 hover:text-red-500 rounded"><X size={16}/></button>
                         </div>
                     ) : (
                         <div 
                            className="flex flex-col items-center justify-center h-full cursor-pointer py-2"
                            onClick={() => baselineInputRef.current?.click()}
                         >
                             <Upload size={20} className="text-gray-400 mb-1"/>
                             <span className="text-xs font-medium text-gray-600">{t('wdr.comp.uploadBase')}</span>
                             <input type="file" ref={baselineInputRef} className="hidden" accept=".html" onChange={handleBaselineUpload} />
                         </div>
                     )}
                 </div>

                 <div className="flex items-center text-gray-300">
                     <ArrowRight size={20} />
                 </div>

                 {/* Targets Zone */}
                 <div className="flex-[2] flex gap-2 overflow-x-auto">
                     {targets.map((tgt, idx) => (
                         <div key={idx} className="min-w-[200px] p-3 rounded border border-blue-100 bg-white relative group">
                             <div className="text-xs font-bold text-green-600 uppercase mb-1">{t('wdr.comp.target')} #{idx + 1}</div>
                             <div className="font-medium text-gray-800 text-sm truncate" title={tgt.meta.instanceName}>{tgt.meta.instanceName}</div>
                             <div className="text-xs text-gray-500 truncate">{tgt.meta.period}</div>
                             <button 
                                onClick={() => removeTarget(idx)}
                                className="absolute top-2 right-2 p-1 hover:bg-red-50 text-gray-300 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                             >
                                 <Trash2 size={12}/>
                             </button>
                         </div>
                     ))}
                     
                     <div 
                        className="min-w-[100px] rounded border-2 border-dashed border-gray-300 hover:border-green-400 bg-gray-50 flex flex-col items-center justify-center cursor-pointer hover:bg-green-50 transition-colors"
                        onClick={() => targetInputRef.current?.click()}
                     >
                         <Upload size={20} className="text-gray-400 mb-1"/>
                         <span className="text-xs text-gray-500">{t('wdr.comp.addTarget')}</span>
                         <input type="file" ref={targetInputRef} className="hidden" accept=".html" multiple onChange={handleTargetUpload} />
                     </div>
                 </div>
             </div>
        </div>

        {/* Tabbed Content Area */}
        {baseline && targets.length > 0 ? (
            <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-100 flex flex-col min-h-0 overflow-hidden">
                {/* Tabs */}
                <div className="flex border-b border-gray-100 px-4 pt-2 bg-white shrink-0">
                    <button 
                        onClick={() => setActiveTab('metrics')}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'metrics' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        {t('comp.tab.sys')}
                    </button>
                    <button 
                        onClick={() => setActiveTab('wait')}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'wait' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        {t('comp.tab.wait')}
                    </button>
                    <button 
                        onClick={() => setActiveTab('sql')}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'sql' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        {t('comp.tab.sql')}
                    </button>
                </div>

                <div className="flex-1 overflow-auto p-4">
                    {/* 1. Key Metrics Comparison */}
                    {activeTab === 'metrics' && (
                        <div className="overflow-hidden">
                            <div className="mb-4 font-semibold text-gray-700 flex items-center">
                                <Activity size={16} className="mr-2 text-blue-500"/> {t('wdr.comp.keyMetrics')}
                            </div>
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 text-gray-600 border-b border-gray-100">
                                    <tr>
                                        <th className="px-4 py-3 font-medium">{t('rep.metric')}</th>
                                        <th className="px-4 py-3 font-medium text-right bg-blue-50/30">{t('wdr.comp.baseline')}</th>
                                        {targets.map((_, i) => (
                                            <th key={i} className="px-4 py-3 font-medium text-right bg-green-50/30">{t('wdr.comp.target')} #{i+1}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {baseline.loadProfile.map((metric, mIdx) => (
                                        <tr key={mIdx} className="hover:bg-gray-50">
                                            <td className="px-4 py-2 font-medium text-gray-700">{metric.metric}</td>
                                            <td className="px-4 py-2 text-right font-mono bg-blue-50/10">{metric.perSec.toLocaleString()}</td>
                                            {targets.map((tgt, tIdx) => {
                                                const tgtMetric = tgt.loadProfile.find(m => m.metric === metric.metric);
                                                const val = tgtMetric ? tgtMetric.perSec : 0;
                                                return (
                                                    <td key={tIdx} className="px-4 py-2 text-right bg-green-50/10">
                                                        <DeltaCell base={metric.perSec} current={val} />
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                    {/* Efficiency Efficiency */}
                                    {baseline.efficiency.map((eff, eIdx) => (
                                        <tr key={`eff-${eIdx}`} className="hover:bg-gray-50 bg-gray-50/30">
                                            <td className="px-4 py-2 font-medium text-gray-700">{eff.name} (%)</td>
                                            <td className="px-4 py-2 text-right font-mono bg-blue-50/10">{eff.value}</td>
                                            {targets.map((tgt, tIdx) => {
                                                const tgtEff = tgt.efficiency.find(e => e.name === eff.name);
                                                const val = tgtEff ? tgtEff.value : 0;
                                                return (
                                                    <td key={tIdx} className="px-4 py-2 text-right bg-green-50/10">
                                                        <DeltaCell base={eff.value} current={val} unit="%" reverse={true} />
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* 2. Top Wait Events Comparison */}
                    {activeTab === 'wait' && (
                        <div className="overflow-hidden">
                            <div className="mb-4 font-semibold text-gray-700 flex items-center">
                                <Clock size={16} className="mr-2 text-orange-500"/> {t('wdr.comp.topWait')}
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left whitespace-nowrap">
                                    <thead className="bg-gray-50 text-gray-600 border-b border-gray-100">
                                        <tr>
                                            <th className="px-4 py-3 font-medium">{t('wdr.comp.eventName')}</th>
                                            <th className="px-4 py-3 font-medium text-right bg-blue-50/30">{t('wdr.comp.baseWaits')}</th>
                                            <th className="px-4 py-3 font-medium text-right bg-blue-50/30">{t('wdr.comp.baseAvg')}(us)</th>
                                            <th className="px-4 py-3 font-medium text-right bg-blue-50/30">{t('wdr.comp.baseMax')}(us)</th>
                                            {targets.map((_, i) => (
                                                <React.Fragment key={i}>
                                                    <th className="px-4 py-3 font-medium text-right bg-green-50/30">T#{i+1} {t('wdr.comp.waits')}</th>
                                                    <th className="px-4 py-3 font-medium text-right bg-green-50/30">T#{i+1} {t('wdr.comp.avg')}</th>
                                                    <th className="px-4 py-3 font-medium text-right bg-green-50/30">T#{i+1} {t('wdr.comp.max')}</th>
                                                </React.Fragment>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {baseline.waitEvents.slice(0, 15).map((evt, idx) => {
                                            const isLock = evt.event.toLowerCase().includes('lockmgrlock');
                                            const desc = getWaitEventDescription(evt.event);
                                            
                                            return (
                                                <tr key={idx} className={`hover:bg-gray-50 ${isLock ? 'bg-orange-50/50' : ''}`}>
                                                    <td className="px-4 py-2 font-medium text-gray-700 group relative">
                                                        <div className="flex items-center">
                                                            {isLock && <Lock size={12} className="mr-1.5 text-orange-500"/>}
                                                            <span className={isLock ? 'text-orange-700 font-bold' : ''}>{evt.event}</span>
                                                            {desc && (
                                                                <div className="ml-2 group relative">
                                                                    <Info size={12} className="text-gray-400 hover:text-blue-500 cursor-help" />
                                                                    <div className="absolute left-full top-0 ml-2 w-64 p-2 bg-gray-800 text-white text-xs rounded shadow-lg z-50 invisible group-hover:visible">
                                                                        {desc}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    {/* Baseline Data */}
                                                    <td className="px-4 py-2 text-right font-mono bg-blue-50/10">{evt.waits.toLocaleString()}</td>
                                                    <td className="px-4 py-2 text-right font-mono bg-blue-50/10">{evt.avgWaitTime.toLocaleString()}</td>
                                                    <td className="px-4 py-2 text-right font-mono bg-blue-50/10 text-gray-500">
                                                        {evt.maxWaitTime !== undefined ? evt.maxWaitTime.toLocaleString() : '-'}
                                                    </td>

                                                    {/* Target Data with Deltas */}
                                                    {targets.map((tgt, tIdx) => {
                                                        const tgtEvt = tgt.waitEvents.find(e => e.event === evt.event);
                                                        return (
                                                            <React.Fragment key={tIdx}>
                                                                <td className="px-4 py-2 text-right bg-green-50/10">
                                                                    {tgtEvt ? <DeltaCell base={evt.waits} current={tgtEvt.waits} showVal={true} /> : '-'}
                                                                </td>
                                                                <td className="px-4 py-2 text-right bg-green-50/10">
                                                                    {tgtEvt ? <DeltaCell base={evt.avgWaitTime} current={tgtEvt.avgWaitTime} showVal={true} /> : '-'}
                                                                </td>
                                                                <td className="px-4 py-2 text-right bg-green-50/10 text-gray-500">
                                                                    {tgtEvt ? <DeltaCell base={evt.maxWaitTime || 0} current={tgtEvt.maxWaitTime || 0} showVal={true} /> : '-'}
                                                                </td>
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* 3. Top SQL Comparison (Enhanced) */}
                    {activeTab === 'sql' && (
                        <div className="overflow-hidden">
                            <div className="border-b border-gray-100 bg-gray-50 mb-2 rounded">
                                <div className="px-4 py-3 flex justify-between items-center">
                                    <div className="font-semibold text-gray-700 flex items-center">
                                        <FileText size={16} className="mr-2 text-purple-500"/> {t('wdr.comp.topSql')}
                                    </div>
                                    {/* Sort Tabs */}
                                    <div className="flex space-x-1 bg-gray-200 p-0.5 rounded text-xs font-medium">
                                        <button 
                                            onClick={() => setSqlSortMode('total')}
                                            className={`px-3 py-1 rounded transition-all ${sqlSortMode === 'total' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                        >
                                            {t('wdr.comp.sort.total')}
                                        </button>
                                        <button 
                                            onClick={() => setSqlSortMode('avg')}
                                            className={`px-3 py-1 rounded transition-all ${sqlSortMode === 'avg' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                        >
                                            {t('wdr.comp.sort.avg')}
                                        </button>
                                        <button 
                                            onClick={() => setSqlSortMode('diff')}
                                            className={`px-3 py-1 rounded transition-all ${sqlSortMode === 'diff' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                            disabled={targets.length === 0}
                                            title={targets.length === 0 ? "Requires a target to calculate difference" : ""}
                                        >
                                            {t('wdr.comp.sort.diff')}
                                        </button>
                                        <button 
                                            onClick={() => setSqlSortMode('calls_diff')}
                                            className={`px-3 py-1 rounded transition-all ${sqlSortMode === 'calls_diff' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                            disabled={targets.length === 0}
                                            title={targets.length === 0 ? "Identify SQL with largest execution frequency change (Calls/Sec)" : ""}
                                        >
                                            {t('wdr.comp.sort.freq')}
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left whitespace-nowrap">
                                    <thead className="bg-gray-50 text-gray-600 border-b border-gray-100 text-xs uppercase tracking-wide">
                                        <tr>
                                            <th className="px-4 py-3 font-medium">{t('wdr.comp.uniqueId')}</th>
                                            <th className="px-4 py-3 font-medium text-right bg-blue-50/30">
                                                {t('wdr.comp.baseline')} {getSqlMetricHeader()}
                                            </th>
                                            {targets.map((_, i) => (
                                                <th key={i} className="px-4 py-3 font-medium text-right bg-green-50/30">{t('wdr.comp.target')} #{i+1} {sqlSortMode === 'calls_diff' ? 'CPS' : (sqlSortMode === 'avg' ? t('wdr.comp.avg') : 'Total')}</th>
                                            ))}
                                            <th className="px-4 py-3 font-medium w-10 text-center">{t('wdr.comp.action')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {sortedTopSqls.map((sql, idx) => {
                                            const baseDuration = getReportDuration(baseline.snapshots);
                                            const showAsRate = sqlSortMode === 'calls_diff';
                                            const baseVal = showAsRate 
                                                ? (sql.calls / baseDuration)
                                                : (sqlSortMode === 'avg' ? sql.avgTime : sql.totalTime);

                                            return (
                                                <tr key={idx} className="hover:bg-purple-50 cursor-pointer transition-colors" onClick={() => setSelectedCompSqlId(sql.uniqueSqlId)}>
                                                    <td className="px-4 py-2 font-mono text-blue-600 text-xs" title={sql.text}>{sql.uniqueSqlId}</td>
                                                    
                                                    {/* Baseline Value Column */}
                                                    <td className="px-4 py-2 text-right font-mono bg-blue-50/10">
                                                        {showAsRate ? baseVal.toFixed(2) : baseVal.toLocaleString()}
                                                    </td>

                                                    {/* Targets Columns */}
                                                    {targets.map((tgt, tIdx) => {
                                                        const tgtSql = tgt.topSql.find(s => s.uniqueSqlId === sql.uniqueSqlId);
                                                        const tgtDuration = getReportDuration(tgt.snapshots);
                                                        
                                                        const tgtVal = tgtSql 
                                                            ? (showAsRate 
                                                                ? (tgtSql.calls / tgtDuration) 
                                                                : (sqlSortMode === 'avg' ? tgtSql.avgTime : tgtSql.totalTime)) 
                                                            : 0;

                                                        return (
                                                            <td key={tIdx} className="px-4 py-2 text-right bg-green-50/10">
                                                                {tgtSql 
                                                                    ? <DeltaCell base={baseVal} current={tgtVal} isRate={showAsRate} /> 
                                                                    : <span className="text-gray-300 text-xs italic">{t('wdr.comp.notFound')}</span>
                                                                }
                                                            </td>
                                                        );
                                                    })}
                                                    
                                                    <td className="px-4 py-2 text-center text-gray-400">
                                                        <BarChart2 size={14} />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 rounded-lg m-4">
                <GitCompare size={48} className="mb-4 text-gray-300"/>
                <p>{t('wdr.comp.empty')}</p>
            </div>
        )}

        {/* SQL Detail Modal */}
        {selectedSqlDetails && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
                    <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                        <div className="flex flex-col">
                            <h3 className="font-bold text-gray-800 flex items-center">
                                <FileText size={18} className="mr-2 text-purple-600"/>
                                {t('wdr.comp.sqlDetail')}: <span className="font-mono ml-2 text-purple-700 select-all">{selectedSqlDetails.baseSql.uniqueSqlId}</span>
                            </h3>
                            <span className="text-xs text-gray-500 mt-1">{t('wdr.comp.user')}: {selectedSqlDetails.baseSql.userName}</span>
                        </div>
                        <button onClick={() => setSelectedCompSqlId(null)} className="p-1 hover:bg-gray-200 rounded-full transition-colors text-gray-500">
                            <X size={20} />
                        </button>
                    </div>
                    
                    <div className="flex-1 overflow-auto p-6 space-y-6">
                        {/* SQL Text */}
                        <div>
                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center"><AlignLeft size={14} className="mr-1"/> {t('wdr.comp.sqlText')}</h4>
                            <div className="bg-gray-800 rounded-lg p-4 font-mono text-sm text-gray-200 overflow-x-auto border border-gray-700 shadow-inner whitespace-pre-wrap max-h-40">
                                {selectedSqlDetails.baseSql.text}
                            </div>
                        </div>

                        {/* Metrics Table */}
                        <div>
                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center"><BarChart2 size={14} className="mr-1"/> {t('wdr.comp.perfComp')}</h4>
                            <div className="border border-gray-200 rounded-lg overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                                        <tr>
                                            <th className="px-4 py-2">{t('rep.metric')}</th>
                                            <th className="px-4 py-2 text-right bg-blue-50/30">{t('wdr.comp.baseline')}</th>
                                            {targets.map((_, i) => (
                                                <th key={i} className="px-4 py-2 text-right bg-green-50/30">{t('wdr.comp.target')} #{i+1}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {selectedSqlDetails.rows.map((row, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50">
                                                <td className="px-4 py-3 font-medium text-gray-700">{row.label}</td>
                                                <td className="px-4 py-3 text-right font-mono text-gray-800 bg-blue-50/10">
                                                    {row.baseVal.toLocaleString()} <span className="text-xs text-gray-400">{row.unit}</span>
                                                </td>
                                                {row.targets.map((val, tIdx) => (
                                                    <td key={tIdx} className="px-4 py-3 text-right bg-green-50/10">
                                                        <div className="flex justify-end items-center">
                                                            <DeltaCell base={row.baseVal} current={val} unit={row.unit} />
                                                        </div>
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default WDRComparison;
