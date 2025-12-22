import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ApiService } from '../services/apiService';
import { WdrReportDetail } from '../types';
import { 
  ArrowLeft, Loader2, Database, Clock, Activity, Code, Layers, 
  Search, BarChart, ChevronDown, FileText, Zap, ChevronRight
} from 'lucide-react';
import { useI18n } from '../context/I18nContext';

const EfficiencyGauge: React.FC<{ name: string; value: number; target: number }> = ({ name, value, target }) => {
    const isHealthy = value >= target;
    const isWarning = value >= target * 0.9 && value < target;
    const colorClass = isHealthy ? 'text-green-600' : isWarning ? 'text-yellow-600' : 'text-red-600';
    const bgClass = isHealthy ? 'bg-green-100' : isWarning ? 'bg-yellow-100' : 'bg-red-100';
    
    return (
        <div className="flex flex-col items-center justify-center p-4 bg-white rounded-lg border border-gray-100 shadow-sm">
            <div className={`relative w-20 h-20 rounded-full flex items-center justify-center border-4 ${isHealthy ? 'border-green-100' : isWarning ? 'border-yellow-100' : 'border-red-100'} mb-2`}>
                <span className={`text-xl font-bold ${colorClass}`}>{value}%</span>
            </div>
            <span className="text-sm font-medium text-gray-700 text-center">{name}</span>
            <span className="text-xs text-gray-400 mt-1">Target: &gt;{target}%</span>
        </div>
    );
};

const ReportDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const [detail, setDetail] = useState<WdrReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'summary' | 'sqlstats' | 'objstats'>('summary');
  const [sqlOrderBy, setSqlOrderBy] = useState<'elapsed' | 'cpu' | 'calls' | 'reads'>('elapsed');
  const [selectedSql, setSelectedSql] = useState<any | null>(null);

  useEffect(() => {
    if (id) {
        ApiService.getWdrReportDetail(Number(id)).then(data => {
            setDetail(data);
            setLoading(false);
        });
    }
  }, [id]);

  if (loading) {
      return (
          <div className="flex h-full justify-center items-center">
              <Loader2 size={48} className="animate-spin text-blue-500" />
          </div>
      );
  }

  if (!detail) {
      return <div className="p-8 text-center text-gray-500">Report not found.</div>;
  }

  const sortedSqls = [...detail.topSql].sort((a, b) => {
      switch (sqlOrderBy) {
          case 'cpu': return b.cpuTime - a.cpuTime;
          case 'calls': return b.calls - a.calls;
          case 'reads': return 0; // Mock data doesn't have reads yet, keep stable
          default: return b.totalTime - a.totalTime;
      }
  });

  const renderContent = () => {
      switch (activeTab) {
          case 'summary':
              return (
                  <div className="space-y-6 animate-in fade-in duration-300">
                      {/* Efficiency Section */}
                      <div>
                          <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                              <Zap size={20} className="mr-2 text-yellow-500"/>
                              {t('rep.summary.efficiency')}
                          </h3>
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                              {detail.efficiency.map((eff, idx) => (
                                  <EfficiencyGauge key={idx} {...eff} />
                              ))}
                          </div>
                      </div>

                      {/* Load Profile Section */}
                      <div>
                          <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                              <Activity size={20} className="mr-2 text-blue-600"/>
                              {t('rep.summary.workload')}
                          </h3>
                          <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                              <table className="w-full text-sm text-left">
                                  <thead className="bg-gray-50 text-gray-600 font-medium">
                                      <tr>
                                          <th className="px-6 py-3">{t('rep.metric')}</th>
                                          <th className="px-6 py-3 text-right">{t('rep.perSec')}</th>
                                          <th className="px-6 py-3 text-right">{t('rep.perTxn')}</th>
                                      </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                      {detail.loadProfile.map((item, idx) => (
                                          <tr key={idx} className="hover:bg-gray-50">
                                              <td className="px-6 py-3 text-gray-800 font-medium">{item.metric}</td>
                                              <td className="px-6 py-3 text-right font-mono">{item.perSec.toLocaleString()}</td>
                                              <td className="px-6 py-3 text-right font-mono">{item.perTxn.toLocaleString()}</td>
                                          </tr>
                                      ))}
                                  </tbody>
                              </table>
                          </div>
                      </div>
                  </div>
              );
          
          case 'sqlstats':
              return (
                  <div className="bg-white rounded-lg shadow-sm border border-gray-100 flex flex-col h-[calc(100vh-250px)] animate-in fade-in duration-300 relative">
                      <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center shrink-0 bg-gray-50">
                          <h3 className="font-semibold text-gray-800 flex items-center">
                              <Code size={18} className="mr-2 text-purple-600"/>
                              {t('rep.tab.sqlstats')}
                          </h3>
                          <div className="flex items-center space-x-2">
                              <span className="text-sm text-gray-500">{t('rep.sql.orderBy')}:</span>
                              <div className="flex bg-white rounded border border-gray-300 p-0.5">
                                  <button 
                                    onClick={() => setSqlOrderBy('elapsed')}
                                    className={`px-3 py-1 text-xs font-medium rounded ${sqlOrderBy === 'elapsed' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
                                  >
                                      {t('rep.sql.elapsed')}
                                  </button>
                                  <button 
                                    onClick={() => setSqlOrderBy('cpu')}
                                    className={`px-3 py-1 text-xs font-medium rounded ${sqlOrderBy === 'cpu' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
                                  >
                                      {t('rep.sql.cpu')}
                                  </button>
                                  <button 
                                    onClick={() => setSqlOrderBy('calls')}
                                    className={`px-3 py-1 text-xs font-medium rounded ${sqlOrderBy === 'calls' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
                                  >
                                      {t('rep.sql.calls')}
                                  </button>
                              </div>
                          </div>
                      </div>
                      <div className="overflow-auto flex-1">
                        <table className="w-full text-sm text-left whitespace-nowrap">
                            <thead className="bg-gray-50 text-gray-600 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="px-6 py-3">SQL ID</th>
                                    <th className="px-6 py-3">User</th>
                                    <th className="px-6 py-3">{t('rep.sql.text')}</th>
                                    <th className="px-6 py-3 text-right">{t('rep.sql.calls')}</th>
                                    <th className="px-6 py-3 text-right">{t('rep.sql.elapsed')} (us)</th>
                                    <th className="px-6 py-3 text-right">{t('rep.sql.cpu')} (us)</th>
                                    <th className="px-6 py-3 text-right">IO Time (us)</th>
                                    <th className="px-6 py-3 text-right">Rows</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {sortedSqls.map((item, idx) => (
                                    <tr 
                                        key={idx} 
                                        className="hover:bg-blue-50 cursor-pointer transition-colors group"
                                        onClick={() => setSelectedSql(item)}
                                    >
                                        <td className="px-6 py-3 font-mono text-xs text-blue-600 group-hover:underline">{item.uniqueSqlId}</td>
                                        <td className="px-6 py-3 text-gray-600">{item.userName}</td>
                                        <td className="px-6 py-3 font-mono text-xs text-gray-500 max-w-[200px] truncate" title={item.text}>{item.text}</td>
                                        <td className="px-6 py-3 text-right">{item.calls}</td>
                                        <td className="px-6 py-3 text-right font-medium">{item.totalTime.toLocaleString()}</td>
                                        <td className="px-6 py-3 text-right text-gray-600">{item.cpuTime.toLocaleString()}</td>
                                        <td className="px-6 py-3 text-right text-gray-600">{item.ioTime.toLocaleString()}</td>
                                        <td className="px-6 py-3 text-right text-gray-600">{item.rows}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                      </div>
                      
                      {/* SQL Detail Overlay/Modal */}
                      {selectedSql && (
                          <div className="absolute inset-0 bg-white z-20 flex flex-col animate-in slide-in-from-right-10 shadow-xl">
                              <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                                  <h3 className="font-bold text-gray-800 flex items-center">
                                      <FileText size={18} className="mr-2 text-blue-600"/>
                                      SQL Details: <span className="font-mono ml-2 text-blue-700">{selectedSql.uniqueSqlId}</span>
                                  </h3>
                                  <button onClick={() => setSelectedSql(null)} className="p-1 hover:bg-gray-200 rounded-full">
                                      <ChevronRight size={24} className="text-gray-500"/>
                                  </button>
                              </div>
                              <div className="flex-1 overflow-auto p-6 space-y-6">
                                  <div className="bg-gray-800 rounded-lg p-4 font-mono text-sm text-gray-200 overflow-x-auto border border-gray-700 shadow-inner">
                                      {selectedSql.text}
                                  </div>
                                  <div className="grid grid-cols-4 gap-4">
                                      <div className="p-4 bg-blue-50 rounded border border-blue-100">
                                          <div className="text-xs text-blue-500 uppercase font-bold mb-1">Total Time</div>
                                          <div className="text-xl font-bold text-blue-800">{selectedSql.totalTime.toLocaleString()} us</div>
                                      </div>
                                      <div className="p-4 bg-purple-50 rounded border border-purple-100">
                                          <div className="text-xs text-purple-500 uppercase font-bold mb-1">CPU Time</div>
                                          <div className="text-xl font-bold text-purple-800">{selectedSql.cpuTime.toLocaleString()} us</div>
                                      </div>
                                      <div className="p-4 bg-green-50 rounded border border-green-100">
                                          <div className="text-xs text-green-500 uppercase font-bold mb-1">Executions</div>
                                          <div className="text-xl font-bold text-green-800">{selectedSql.calls}</div>
                                      </div>
                                      <div className="p-4 bg-gray-50 rounded border border-gray-200">
                                          <div className="text-xs text-gray-500 uppercase font-bold mb-1">Avg Time</div>
                                          <div className="text-xl font-bold text-gray-800">{selectedSql.avgTime.toLocaleString()} us</div>
                                      </div>
                                  </div>
                                  <div className="flex justify-end">
                                      <Link to="/visualizer" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow-sm flex items-center">
                                          <Zap size={16} className="mr-2"/> {t('rep.sql.visualize')}
                                      </Link>
                                  </div>
                              </div>
                          </div>
                      )}
                  </div>
              );

          case 'objstats':
              return (
                  <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                             <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                                <h3 className="font-semibold text-gray-800 flex items-center">
                                    <Layers size={18} className="mr-2 text-indigo-600"/>
                                    {t('rep.tab.objstats')}
                                </h3>
                             </div>
                             <div className="overflow-x-auto">
                                 <table className="w-full text-sm text-left whitespace-nowrap">
                                     <thead className="bg-gray-50 text-gray-600">
                                         <tr>
                                             <th className="px-6 py-3">Schema</th>
                                             <th className="px-6 py-3">Object Name</th>
                                             <th className="px-6 py-3">Type</th>
                                             <th className="px-6 py-3 text-right">{t('rep.obj.seqScan')}</th>
                                             <th className="px-6 py-3 text-right">{t('rep.obj.idxScan')}</th>
                                             <th className="px-6 py-3 text-center">Tuples (I/U/D)</th>
                                             <th className="px-6 py-3 text-right">{t('rep.obj.liveTup')}</th>
                                             <th className="px-6 py-3 text-right">{t('rep.obj.deadTup')}</th>
                                         </tr>
                                     </thead>
                                     <tbody className="divide-y divide-gray-100">
                                         {detail.objectStats.map((obj, idx) => {
                                             const highDeadTuples = (obj.deadTup || 0) > 1000; // Threshold
                                             return (
                                                <tr key={idx} className="hover:bg-gray-50">
                                                    <td className="px-6 py-3 text-gray-500">{obj.schema}</td>
                                                    <td className="px-6 py-3 font-medium text-gray-800">{obj.name}</td>
                                                    <td className="px-6 py-3">
                                                        <span className={`px-2 py-0.5 rounded text-xs ${obj.type === 'Table' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                                                            {obj.type}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-3 text-right text-gray-600">{obj.seqScan || '-'}</td>
                                                    <td className="px-6 py-3 text-right text-gray-600">{obj.idxScan || '-'}</td>
                                                    <td className="px-6 py-3 text-center text-gray-500 text-xs">
                                                        {obj.tupIns || 0} / {obj.tupUpd || 0} / {obj.tupDel || 0}
                                                    </td>
                                                    <td className="px-6 py-3 text-right text-gray-600">{obj.liveTup?.toLocaleString() || '-'}</td>
                                                    <td className={`px-6 py-3 text-right font-medium ${highDeadTuples ? 'text-red-600' : 'text-gray-600'}`}>
                                                        {obj.deadTup?.toLocaleString() || '-'}
                                                    </td>
                                                </tr>
                                             );
                                         })}
                                     </tbody>
                                 </table>
                             </div>
                        </div>
                  </div>
              );
      }
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
        <div className="flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-4">
                <Link to="/reports" className="p-2 rounded-full hover:bg-gray-200 text-gray-600 transition-colors">
                    <ArrowLeft size={20} />
                </Link>
                <div>
                    <h2 className="text-xl font-bold text-gray-800 flex items-center">
                        {t('rep.viewTitle')}
                        <span className="ml-3 px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full font-normal">#{detail.id}</span>
                    </h2>
                    <div className="flex items-center text-sm text-gray-500 mt-1 space-x-4">
                        <span className="flex items-center"><Database size={14} className="mr-1"/> {detail.meta.instanceName}</span>
                        <span className="flex items-center"><Clock size={14} className="mr-1"/> {detail.snapshots.start} - {detail.snapshots.end}</span>
                    </div>
                </div>
            </div>
            
            <div className="flex bg-gray-100 p-1 rounded-lg">
                {(['summary', 'sqlstats', 'objstats'] as const).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                            activeTab === tab 
                            ? 'bg-white text-blue-700 shadow-sm' 
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        {t(`rep.tab.${tab}`)}
                    </button>
                ))}
            </div>
        </div>

        <div className="flex-1 min-h-0">
            {renderContent()}
        </div>
    </div>
  );
};

export default ReportDetail;
