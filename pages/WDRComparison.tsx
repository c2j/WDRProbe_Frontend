
import React, { useState, useRef, useMemo } from 'react';
import { useI18n } from '../context/I18nContext';
import { parseWdrHtml } from '../utils/wdrParser';
import { WdrReportDetail } from '../types';
import { useWDRContext } from '../context/WDRContext';
import { 
  GitCompare, Upload, X, ArrowRight, ArrowUp, ArrowDown, 
  Minus, FileText, Database, Activity, Clock, Trash2,
  BarChart2, AlignLeft, AlertCircle, Info, Lock, User, Lightbulb, Search
} from 'lucide-react';

const WDRComparison: React.FC = () => {
  const { t } = useI18n();
  const { 
      comparisonBaseline: baseline, 
      setComparisonBaseline: setBaseline,
      comparisonTargets: targets, 
      setComparisonTargets: setTargets,
      comparisonActiveTab: activeTab,
      setComparisonActiveTab: setActiveTab,
      comparisonSqlSortMode: sqlSortMode,
      setComparisonSqlSortMode: setSqlSortMode,
      comparisonSqlUserFilter: sqlUserFilter,
      setComparisonSqlUserFilter: setSqlUserFilter,
      comparisonSqlSearch: sqlSearch,
      setComparisonSqlSearch: setSqlSearch
  } = useWDRContext();

  const [loading, setLoading] = useState(false);
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

  const resetAll = () => {
      setBaseline(null);
      setTargets([]);
      setSelectedCompSqlId(null);
  };

  const getWaitEventDescription = (event: string) => {
      const lower = event.toLowerCase();
      if (lower.includes('lockmgrlock')) return t('desc.wait.LockMgrLock');
      if (lower.includes('walsync')) return t('desc.wait.WALSync');
      if (lower.includes('datafileread')) return t('desc.wait.DataFileRead');
      if (lower.includes('datafilewrite')) return t('desc.wait.DataFileWrite');
      return null;
  };

  const getReportDuration = (snapshots: { start: string; end: string }) => {
      try {
          const start = new Date(snapshots.start).getTime();
          const end = new Date(snapshots.end).getTime();
          const diff = (end - start) / 1000;
          return diff > 0 ? diff : 1;
      } catch (e) {
          return 1;
      }
  };

  const DeltaCell = ({ base, current, unit = '', reverse = false, showVal = true, isRate = false }: { base: number, current: number, unit?: string, reverse?: boolean, showVal?: boolean, isRate?: boolean }) => {
      if (base === 0 && current === 0) return <span className="text-gray-400">-</span>;
      const diff = current - base;
      const percent = base !== 0 ? ((diff / base) * 100) : 0;
      const isBad = reverse ? diff < 0 : diff > 0;
      const isNeutral = Math.abs(percent) < 0.1;
      let colorClass = isNeutral ? 'text-gray-500' : isBad ? 'text-red-600' : 'text-green-600';
      const Icon = isNeutral ? Minus : diff > 0 ? ArrowUp : ArrowDown;
      const valStr = isRate ? current.toFixed(2) : current.toLocaleString();

      return (
          <div className="flex flex-col items-end">
              {showVal && <span className="font-mono font-medium text-gray-800">{valStr}{unit}</span>}
              <span className={`text-[10px] flex items-center ${colorClass}`}>
                  <Icon size={10} className="mr-0.5"/>
                  {Math.abs(percent).toFixed(1)}%
              </span>
          </div>
      );
  };

  const comparisonRisks = useMemo(() => {
      if (!baseline || targets.length === 0) return [];
      const risks: Array<{title: string, desc: string, type: 'error'|'warning'}> = [];
      const target = targets[0];

      const checkLockSurge = (eventName: string, titleKey: string, descKey: string) => {
          const baseLock = baseline.waitEvents.find(e => e.event === eventName);
          const tgtLock = target.waitEvents.find(e => e.event === eventName);
          if (tgtLock) {
              const baseWaits = baseLock ? baseLock.waits : 0;
              const tgtWaits = tgtLock.waits;
              if (tgtWaits > 100 && (tgtWaits > baseWaits * 1.5 || baseWaits === 0)) {
                  risks.push({
                      type: eventName.includes('Lock') ? 'error' : 'warning',
                      title: t(titleKey),
                      desc: t(descKey)
                  });
              }
          }
      };

      checkLockSurge('LockMgrLock', 'wdr.risk.lock.mgr.title', 'wdr.risk.lock.mgr.desc');
      checkLockSurge('SInvalWriteLock', 'wdr.risk.lock.sinval.title', 'wdr.risk.lock.sinval.desc');

      return risks;
  }, [baseline, targets, t]);

  const sortedTopSqls = useMemo(() => {
      if (!baseline) return [];
      let items = [...baseline.topSql];
      if (sqlUserFilter !== 'All') {
          items = items.filter(s => s.userName === sqlUserFilter);
      }
      if (sqlSearch) {
          const lower = sqlSearch.toLowerCase();
          items = items.filter(s => s.text.toLowerCase().includes(lower));
      }
      const target1 = targets[0];

      return items.sort((a, b) => {
          switch (sqlSortMode) {
              case 'avg': return b.avgTime - a.avgTime;
              case 'calls_diff':
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
                  if (!target1) return b.totalTime - a.totalTime;
                  const t1A = target1.topSql.find(s => s.uniqueSqlId === a.uniqueSqlId)?.totalTime || 0;
                  const t1B = target1.topSql.find(s => s.uniqueSqlId === b.uniqueSqlId)?.totalTime || 0;
                  return Math.abs(t1B - b.totalTime) - Math.abs(t1A - a.totalTime);
              case 'total':
              default: return b.totalTime - a.totalTime;
          }
      }).slice(0, 20);
  }, [baseline, targets, sqlSortMode, sqlUserFilter, sqlSearch]);

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

  const getSqlMetricHeader = () => {
      if (sqlSortMode === 'avg') return t('wdr.comp.metric.avg');
      if (sqlSortMode === 'calls_diff') return t('wdr.comp.metric.cps');
      return t('wdr.comp.metric.total');
  };

  const availableUsers = useMemo(() => {
      if (!baseline) return [];
      return Array.from(new Set(baseline.topSql.map(s => s.userName))).sort();
  }, [baseline]);

  return (
    <div className="h-full flex flex-col space-y-4 relative">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 shrink-0">
             <div className="flex justify-between items-start">
                 <h2 className="text-lg font-bold text-gray-800 flex items-center">
                    <GitCompare size={20} className="mr-2 text-blue-600"/>
                    {t('wdr.comp.title')}
                 </h2>
                 <div className="flex space-x-2">
                     <button onClick={resetAll} className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded border border-gray-200">
                        {t('wdr.comp.reset')}
                     </button>
                 </div>
             </div>
             <div className="flex mt-4 gap-4 items-stretch">
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
                         <div className="flex flex-col items-center justify-center h-full cursor-pointer py-2" onClick={() => baselineInputRef.current?.click()}>
                             <Upload size={20} className="text-gray-400 mb-1"/>
                             <span className="text-xs font-medium text-gray-600">{t('wdr.comp.uploadBase')}</span>
                             <input type="file" ref={baselineInputRef} className="hidden" accept=".html" onChange={handleBaselineUpload} />
                         </div>
                     )}
                 </div>
                 <div className="flex items-center text-gray-300"><ArrowRight size={20} /></div>
                 <div className="flex-[2] flex gap-2 overflow-x-auto">
                     {targets.map((tgt, idx) => (
                         <div key={idx} className="min-w-[200px] p-3 rounded border border-blue-100 bg-white relative group">
                             <div className="text-xs font-bold text-green-600 uppercase mb-1">{t('wdr.comp.target')} #{idx + 1}</div>
                             <div className="font-medium text-gray-800 text-sm truncate">{tgt.meta.instanceName}</div>
                             <div className="text-xs text-gray-500 truncate">{tgt.meta.period}</div>
                             <button onClick={() => removeTarget(idx)} className="absolute top-2 right-2 p-1 hover:bg-red-50 text-gray-300 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                 <Trash2 size={12}/>
                             </button>
                         </div>
                     ))}
                     <div className="min-w-[100px] rounded border-2 border-dashed border-gray-300 hover:border-green-400 bg-gray-50 flex flex-col items-center justify-center cursor-pointer hover:bg-green-50 transition-colors" onClick={() => targetInputRef.current?.click()}>
                         <Upload size={20} className="text-gray-400 mb-1"/>
                         <span className="text-xs text-gray-500">{t('wdr.comp.addTarget')}</span>
                         <input type="file" ref={targetInputRef} className="hidden" accept=".html" multiple onChange={handleTargetUpload} />
                     </div>
                 </div>
             </div>
        </div>

        {baseline && targets.length > 0 ? (
            <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-100 flex flex-col min-h-0 overflow-hidden">
                <div className="flex border-b border-gray-100 px-4 pt-2 bg-white shrink-0">
                    <button onClick={() => setActiveTab('metrics')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'metrics' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                        {t('wdr.comp.keyMetrics')}
                    </button>
                    <button onClick={() => setActiveTab('wait')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'wait' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                        {t('wdr.comp.topWait')}
                    </button>
                    <button onClick={() => setActiveTab('sql')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'sql' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                        {t('wdr.comp.topSql')}
                    </button>
                </div>
                <div className="flex-1 overflow-auto p-4">
                    {comparisonRisks.length > 0 && (
                        <div className="mb-6 space-y-2">
                            <div className="text-sm font-bold text-gray-700 flex items-center"><Lightbulb size={16} className="text-yellow-500 mr-2"/> {t('wdr.comp.insights')}</div>
                            {comparisonRisks.map((risk, idx) => (
                                <div key={idx} className={`p-3 rounded border flex items-start ${risk.type === 'error' ? 'bg-red-50 border-red-100 text-red-800' : 'bg-orange-50 border-orange-100 text-orange-800'}`}>
                                    <AlertCircle size={18} className="mr-3 mt-0.5 shrink-0"/>
                                    <div>
                                        <h4 className="font-bold text-sm">{risk.title}</h4>
                                        <p className="text-xs mt-1 opacity-90">{risk.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {activeTab === 'metrics' && (
                        <div>
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 text-gray-600">
                                    <tr>
                                        <th className="px-4 py-3 border-b">{t('rep.metric')}</th>
                                        <th className="px-4 py-3 text-right bg-blue-50/30 border-b">{t('wdr.comp.baseline')}</th>
                                        {targets.map((_, i) => <th key={i} className="px-4 py-3 text-right bg-green-50/30 border-b">T#{i+1}</th>)}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {baseline.loadProfile.map((metric, mIdx) => (
                                        <tr key={mIdx} className="hover:bg-gray-50">
                                            <td className="px-4 py-2 font-medium text-gray-700">{metric.metric}</td>
                                            <td className="px-4 py-2 text-right font-mono bg-blue-50/10">{metric.perSec.toLocaleString()}</td>
                                            {targets.map((tgt, tIdx) => {
                                                const tgtMetric = tgt.loadProfile.find(m => m.metric === metric.metric);
                                                return <td key={tIdx} className="px-4 py-2 text-right bg-green-50/10"><DeltaCell base={metric.perSec} current={tgtMetric ? tgtMetric.perSec : 0} /></td>;
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {activeTab === 'wait' && (
                        <table className="w-full text-sm text-left whitespace-nowrap">
                            <thead className="bg-gray-50 text-gray-600">
                                <tr>
                                    <th className="px-4 py-3 border-b">{t('wdr.comp.eventName')}</th>
                                    <th className="px-4 py-3 text-right border-b">{t('wdr.comp.baseWaits')}</th>
                                    {targets.map((_, i) => <th key={i} className="px-4 py-3 text-right border-b">T#{i+1} {t('wdr.comp.waits')}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {baseline.waitEvents.slice(0, 10).map((evt, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50">
                                        <td className="px-4 py-2 font-medium group relative">
                                            {evt.event}
                                            {getWaitEventDescription(evt.event) && (
                                                <div className="inline-block ml-1 relative group/info">
                                                    <Info size={12} className="text-gray-300 inline cursor-help"/>
                                                    <div className="absolute left-full top-0 ml-2 w-48 p-2 bg-gray-800 text-white text-[10px] rounded invisible group-hover/info:visible z-50">
                                                        {getWaitEventDescription(evt.event)}
                                                    </div>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-2 text-right font-mono">{evt.waits.toLocaleString()}</td>
                                        {targets.map((tgt, tIdx) => {
                                            const tgtEvt = tgt.waitEvents.find(e => e.event === evt.event);
                                            return <td key={tIdx} className="px-4 py-2 text-right"><DeltaCell base={evt.waits} current={tgtEvt ? tgtEvt.waits : 0} /></td>;
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {activeTab === 'sql' && (
                        <div>
                            <div className="flex justify-between items-center mb-4 bg-gray-50 p-2 rounded">
                                <div className="flex gap-2">
                                    <select className="text-xs border rounded px-2" value={sqlUserFilter} onChange={e => setSqlUserFilter(e.target.value)}>
                                        <option value="All">All Users</option>
                                        {availableUsers.map(u => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                    <input className="text-xs border rounded px-2 w-32" placeholder="Search SQL..." value={sqlSearch} onChange={e => setSqlSearch(e.target.value)} />
                                </div>
                                <div className="flex bg-gray-200 p-0.5 rounded text-[10px]">
                                    {['total', 'avg', 'diff', 'calls_diff'].map(mode => (
                                        <button key={mode} onClick={() => setSqlSortMode(mode as any)} className={`px-2 py-1 rounded ${sqlSortMode === mode ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>
                                            {t(`wdr.comp.sort.${mode}`)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <table className="w-full text-sm text-left whitespace-nowrap">
                                <thead className="bg-gray-50 text-gray-600 text-[10px] uppercase">
                                    <tr>
                                        <th className="px-4 py-2 border-b">SQL ID</th>
                                        <th className="px-4 py-2 text-right border-b">{t('wdr.comp.baseline')} {getSqlMetricHeader()}</th>
                                        {targets.map((_, i) => <th key={i} className="px-4 py-2 text-right border-b">T#{i+1}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedTopSqls.map((sql, idx) => {
                                        const durBase = getReportDuration(baseline.snapshots);
                                        const baseVal = sqlSortMode === 'calls_diff' ? (sql.calls / durBase) : (sqlSortMode === 'avg' ? sql.avgTime : sql.totalTime);
                                        return (
                                            <tr key={idx} className="hover:bg-blue-50 cursor-pointer" onClick={() => setSelectedCompSqlId(sql.uniqueSqlId)}>
                                                <td className="px-4 py-2 font-mono text-xs text-blue-600">{sql.uniqueSqlId}</td>
                                                <td className="px-4 py-2 text-right font-mono">{sqlSortMode === 'calls_diff' ? baseVal.toFixed(2) : baseVal.toLocaleString()}</td>
                                                {targets.map((tgt, tIdx) => {
                                                    const tgtSql = tgt.topSql.find(s => s.uniqueSqlId === sql.uniqueSqlId);
                                                    const durTgt = getReportDuration(tgt.snapshots);
                                                    const tgtVal = tgtSql ? (sqlSortMode === 'calls_diff' ? (tgtSql.calls / durTgt) : (sqlSortMode === 'avg' ? tgtSql.avgTime : tgtSql.totalTime)) : 0;
                                                    return <td key={tIdx} className="px-4 py-2 text-right"><DeltaCell base={baseVal} current={tgtVal} isRate={sqlSortMode === 'calls_diff'} /></td>;
                                                })}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
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

        {selectedSqlDetails && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh]">
                    <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50">
                        <h3 className="font-bold text-gray-800">{t('wdr.comp.sqlDetail')}: {selectedCompSqlId}</h3>
                        <button onClick={() => setSelectedCompSqlId(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                    </div>
                    <div className="p-6 overflow-auto space-y-4">
                        <div className="bg-gray-800 p-4 rounded-lg font-mono text-xs text-gray-200 break-all whitespace-pre-wrap">{selectedSqlDetails.baseSql.text}</div>
                        <table className="w-full text-xs text-left border rounded">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-3 py-2 border-b">{t('rep.metric')}</th>
                                    <th className="px-3 py-2 border-b text-right">{t('wdr.comp.baseline')}</th>
                                    {targets.map((_, i) => <th key={i} className="px-3 py-2 border-b text-right">T#{i+1}</th>)}
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {selectedSqlDetails.rows.map((row, rIdx) => (
                                    <tr key={rIdx}>
                                        <td className="px-3 py-2 font-medium">{row.label}</td>
                                        <td className="px-3 py-2 text-right font-mono">{row.baseVal.toLocaleString()}</td>
                                        {row.targets.map((val, tIdx) => <td key={tIdx} className="px-3 py-2 text-right"><DeltaCell base={row.baseVal} current={val} /></td>)}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default WDRComparison;
