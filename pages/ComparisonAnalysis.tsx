import React, { useState, useEffect } from 'react';
import { X, Save, ArrowUp, ArrowDown, Loader2, Sparkles, TrendingDown, TrendingUp, Minus, BarChart3 } from 'lucide-react';
import { 
    BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid 
} from 'recharts';
import { useI18n } from '../context/I18nContext';
import { ApiService } from '../services/apiService';
import { 
    ComparisonCategory, 
    SqlComparisonMetric, 
    WaitEventComparison, 
    ObjectStatComparison, 
    SystemMetricComparison,
    ComparisonSummary
} from '../types';

const ComparisonAnalysis: React.FC = () => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<ComparisonCategory>('sql');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<ComparisonSummary | null>(null);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetricComparison[]>([]);

  // Comparison ID would typically come from route params or selection state
  // Hardcoded for demo purposes
  const selectedComparisonId = 1; 

  const TABS: { id: ComparisonCategory, label: string }[] = [
    { id: 'sql', label: t('comp.tab.sql') },
    { id: 'wait', label: t('comp.tab.wait') },
    { id: 'obj', label: t('comp.tab.obj') },
    { id: 'sys', label: t('comp.tab.sys') }
  ];

  useEffect(() => {
    const fetchSummary = async () => {
        try {
            const data = await ApiService.getComparisonSummary(selectedComparisonId);
            setSummary(data);
            // Pre-fetch system metrics for the overview chart
            const sysData = await ApiService.getComparisonDetails(selectedComparisonId, 'sys');
            setSystemMetrics(sysData as SystemMetricComparison[]);
        } catch (error) {
            console.error("Failed to fetch summary", error);
        }
    };
    fetchSummary();
  }, [selectedComparisonId]);

  useEffect(() => {
    const fetchData = async () => {
        setLoading(true);
        try {
            const data = await ApiService.getComparisonDetails(selectedComparisonId, activeTab);
            setMetrics(data);
        } catch (error) {
            console.error("Failed to fetch comparison details", error);
            setMetrics([]);
        } finally {
            setLoading(false);
        }
    };

    fetchData();
  }, [activeTab, selectedComparisonId]);

  const renderChange = (val: number) => {
      const colorClass = val > 0 ? 'text-red-500' : val < 0 ? 'text-green-500' : 'text-gray-500';
      return (
          <span className={`flex items-center justify-end ${colorClass}`}>
              {val > 0 ? '+' : ''}{Math.abs(val)}%
              {val > 0 ? <ArrowUp size={14} className="ml-1"/> : val < 0 ? <ArrowDown size={14} className="ml-1"/> : null}
          </span>
      );
  };

  const renderTableContent = () => {
      if (loading) {
          return (
              <div className="flex justify-center items-center h-64 text-gray-400">
                  <Loader2 size={32} className="animate-spin mr-2" /> Loading data...
              </div>
          );
      }

      if (metrics.length === 0) {
          return <div className="p-8 text-center text-gray-500">No data available for this category.</div>;
      }

      switch (activeTab) {
        case 'sql':
            return (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100 text-xs uppercase tracking-wider text-gray-500">
                                <th className="px-4 py-3 font-semibold sticky left-0 bg-gray-50">{t('comp.fingerprint')}</th>
                                <th className="px-4 py-3 font-semibold text-right bg-blue-50/30">{t('comp.r1')} (ms)</th>
                                <th className="px-4 py-3 font-semibold text-right bg-blue-50/30">{t('comp.r2')} (ms)</th>
                                <th className="px-4 py-3 font-semibold text-right">{t('comp.change')}</th>
                                {/* Detailed CPU / IO */}
                                <th className="px-4 py-3 font-semibold text-right text-gray-600 bg-gray-100/50">{t('comp.col.cpu')} (1/2)</th>
                                <th className="px-4 py-3 font-semibold text-right text-gray-600 bg-gray-100/50">{t('comp.col.io')} (1/2)</th>
                                {/* Physical / Logical Reads */}
                                <th className="px-4 py-3 font-semibold text-right text-gray-600 bg-gray-50/50">{t('comp.col.phyRd')}</th>
                                <th className="px-4 py-3 font-semibold text-right text-gray-600 bg-gray-50/50">{t('comp.col.logRd')}</th>
                                <th className="px-4 py-3 font-semibold text-center">{t('comp.action')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {(metrics as SqlComparisonMetric[]).map((m) => (
                                <tr key={m.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-mono text-xs text-gray-700 truncate max-w-xs sticky left-0 bg-white" title={m.name}>{m.name}</td>
                                    <td className="px-4 py-3 text-right bg-blue-50/10 font-medium">{m.value1}</td>
                                    <td className="px-4 py-3 text-right bg-blue-50/10 font-medium">{m.value2}</td>
                                    <td className="px-4 py-3 text-right">{renderChange(m.changeRate)}</td>
                                    {/* Breakdown Cells */}
                                    <td className="px-4 py-3 text-right text-xs text-gray-500 bg-gray-50/30 font-mono">
                                        {m.cpuTime1} / {m.cpuTime2}
                                    </td>
                                    <td className="px-4 py-3 text-right text-xs text-gray-500 bg-gray-50/30 font-mono">
                                        {m.ioTime1} / {m.ioTime2}
                                    </td>
                                    {/* IO Stats */}
                                    <td className="px-4 py-3 text-right text-xs text-gray-600 bg-gray-50/30">
                                        {m.physicalReads1} <span className="text-gray-300">/</span> {m.physicalReads2}
                                    </td>
                                    <td className="px-4 py-3 text-right text-xs text-gray-600 bg-gray-50/30">
                                        {m.logicalReads1} <span className="text-gray-300">/</span> {m.logicalReads2}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <button className="text-blue-600 hover:underline text-xs font-medium">{t('comp.plan')}</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        case 'wait':
            return (
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="px-4 py-3 font-medium text-gray-600">{t('comp.col.event')}</th>
                            <th className="px-4 py-3 font-medium text-gray-600">{t('comp.col.class')}</th>
                            <th className="px-4 py-3 font-medium text-gray-600 text-right">{t('comp.r1')} (ms)</th>
                            <th className="px-4 py-3 font-medium text-gray-600 text-right">{t('comp.r2')} (ms)</th>
                            <th className="px-4 py-3 font-medium text-gray-600 text-right">{t('comp.change')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {(metrics as WaitEventComparison[]).map((m) => (
                            <tr key={m.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 font-medium text-gray-700">{m.name}</td>
                                <td className="px-4 py-3 text-gray-500 text-xs">{m.waitClass}</td>
                                <td className="px-4 py-3 text-right">{m.value1}</td>
                                <td className="px-4 py-3 text-right">{m.value2}</td>
                                <td className="px-4 py-3 text-right">{renderChange(m.changeRate)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            );
        case 'obj':
            return (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100 text-xs uppercase tracking-wider text-gray-500">
                                <th className="px-4 py-3 font-semibold sticky left-0 bg-gray-50">{t('comp.col.object')}</th>
                                <th className="px-4 py-3 font-semibold">{t('comp.col.schema')}</th>
                                <th className="px-4 py-3 font-semibold text-right">{t('comp.r1')} (Scans)</th>
                                <th className="px-4 py-3 font-semibold text-right">{t('comp.r2')} (Scans)</th>
                                <th className="px-4 py-3 font-semibold text-right">{t('comp.col.diff')}</th>
                                {/* IO Block Stats */}
                                <th className="px-4 py-3 font-semibold text-right text-gray-600 bg-gray-50/50">{t('comp.col.heapRd')}</th>
                                <th className="px-4 py-3 font-semibold text-right text-gray-600 bg-gray-50/50">{t('comp.col.heapHit')}</th>
                                <th className="px-4 py-3 font-semibold text-right text-gray-600 bg-gray-100/50">{t('comp.col.idxRd')}</th>
                                <th className="px-4 py-3 font-semibold text-right text-gray-600 bg-gray-100/50">{t('comp.col.idxHit')}</th>
                                {/* Tuples */}
                                <th className="px-4 py-3 font-semibold text-center text-gray-600">{t('comp.col.tup')} (1/2)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {(metrics as ObjectStatComparison[]).map((m) => (
                                <tr key={m.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-medium text-gray-700 sticky left-0 bg-white">
                                        {m.name} <span className="text-gray-400 text-xs ml-2">({m.scanType})</span>
                                    </td>
                                    <td className="px-4 py-3 text-gray-500 text-xs">{m.schema}</td>
                                    <td className="px-4 py-3 text-right">{m.value1}</td>
                                    <td className="px-4 py-3 text-right">{m.value2}</td>
                                    <td className="px-4 py-3 text-right font-mono text-gray-600">
                                        {m.diff > 0 ? '+' : ''}{m.diff}
                                    </td>
                                    {/* Heap Block Stats */}
                                    <td className="px-4 py-3 text-right text-xs text-gray-600 bg-gray-50/30">
                                        {m.heapBlksRead1} / {m.heapBlksRead2}
                                    </td>
                                    <td className="px-4 py-3 text-right text-xs text-gray-600 bg-gray-50/30">
                                        {m.heapBlksHit1} / {m.heapBlksHit2}
                                    </td>
                                    {/* Index Block Stats */}
                                    <td className="px-4 py-3 text-right text-xs text-gray-600 bg-gray-100/30">
                                        {m.idxBlksRead1} / {m.idxBlksRead2}
                                    </td>
                                    <td className="px-4 py-3 text-right text-xs text-gray-600 bg-gray-100/30">
                                        {m.idxBlksHit1} / {m.idxBlksHit2}
                                    </td>
                                    <td className="px-4 py-3 text-center text-xs text-gray-500" title="Insert / Update / Delete">
                                        {m.tupleIns1}/{m.tupleUpd1}/{m.tupleDel1} <span className="text-gray-300 mx-1">vs</span> {m.tupleIns2}/{m.tupleUpd2}/{m.tupleDel2}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        case 'sys':
            return (
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="px-4 py-3 font-medium text-gray-600">{t('comp.col.metric')}</th>
                            <th className="px-4 py-3 font-medium text-gray-600 text-right">{t('comp.r1')}</th>
                            <th className="px-4 py-3 font-medium text-gray-600 text-right">{t('comp.r2')}</th>
                            <th className="px-4 py-3 font-medium text-gray-600 text-right">{t('comp.change')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {(metrics as SystemMetricComparison[]).map((m) => (
                            <tr key={m.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 font-medium text-gray-700">{m.name}</td>
                                <td className="px-4 py-3 text-right">{m.value1} <span className="text-xs text-gray-400">{m.unit}</span></td>
                                <td className="px-4 py-3 text-right">{m.value2} <span className="text-xs text-gray-400">{m.unit}</span></td>
                                <td className="px-4 py-3 text-right">{renderChange(m.changeRate)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            );
        default:
            return null;
      }
  };

  const renderSummary = () => {
    if (!summary) return null;
    
    const isDegraded = summary.status === 'Degraded';
    const isImproved = summary.status === 'Improved';
    
    const statusColor = isDegraded ? 'text-red-600' : isImproved ? 'text-green-600' : 'text-blue-600';
    const statusBg = isDegraded ? 'bg-red-50' : isImproved ? 'bg-green-50' : 'bg-blue-50';
    const statusBorder = isDegraded ? 'border-red-100' : isImproved ? 'border-green-100' : 'border-blue-100';
    const StatusIcon = isDegraded ? TrendingDown : isImproved ? TrendingUp : Minus;

    return (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 mb-6 animate-in slide-in-from-top-5">
            <h3 className="font-medium text-gray-800 mb-4 flex items-center">
                <Sparkles className="mr-2 text-purple-500" size={18} /> {t('comp.summary.title')}
            </h3>
            <div className="flex flex-col md:flex-row gap-6">
                {/* Status/Score Block */}
                <div className={`md:w-1/4 rounded-lg p-6 flex flex-col items-center justify-center border ${statusBg} ${statusBorder}`}>
                    <div className="flex items-center space-x-2 mb-2">
                        <StatusIcon className={statusColor} size={24} />
                        <span className={`text-lg font-bold ${statusColor}`}>
                            {t(`comp.status.${summary.status.toLowerCase()}`)}
                        </span>
                    </div>
                    <span className={`text-4xl font-bold my-1 ${statusColor}`}>
                        {summary.scoreChange > 0 ? '+' : ''}{summary.scoreChange}%
                    </span>
                    <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold opacity-75">{t('comp.summary.score')}</span>
                </div>
                
                {/* Conclusion Block */}
                <div className="md:w-3/4 flex flex-col justify-between">
                    <div className="mb-4">
                        <h4 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide flex items-center">
                            {t('comp.summary.conclusion')}
                        </h4>
                        <p className="text-sm text-gray-600 leading-relaxed border-l-4 border-gray-200 pl-3">
                            {summary.conclusion}
                        </p>
                    </div>
                    <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">
                            {t('comp.summary.findings')}
                        </h4>
                        <ul className="list-disc list-inside text-sm text-gray-600 space-y-1.5 marker:text-gray-300">
                            {summary.keyFindings.map((finding, idx) => (
                                <li key={idx} className="pl-1">{finding}</li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
  };

  // Helper for Chart Data Construction
  const getChartData = (metricName: string) => {
      const m = systemMetrics.find(s => s.name === metricName);
      if (!m) return [];
      return [
          { name: t('comp.r1'), value: m.value1 },
          { name: t('comp.r2'), value: m.value2 },
      ];
  };

  const OverviewSection = () => {
      if (systemMetrics.length === 0) return null;

      return (
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 mb-6">
              <h3 className="font-medium text-gray-800 mb-4 flex items-center border-b pb-2">
                  <BarChart3 className="mr-2 text-blue-500" size={18} /> {t('comp.overview.title')}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-48">
                  {/* DB Time Chart */}
                  <div className="flex flex-col">
                      <h4 className="text-xs font-semibold text-gray-500 text-center mb-2">{t('comp.chart.dbTime')}</h4>
                      <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={getChartData('DB Time')} barCategoryGap="30%">
                              <CartesianGrid strokeDasharray="3 3" vertical={false} />
                              <XAxis dataKey="name" tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                              <YAxis tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                              <Tooltip cursor={{fill: 'transparent'}} />
                              <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                          </BarChart>
                      </ResponsiveContainer>
                  </div>
                  {/* CPU Chart */}
                  <div className="flex flex-col">
                      <h4 className="text-xs font-semibold text-gray-500 text-center mb-2">{t('comp.chart.cpu')}</h4>
                      <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={getChartData('Average CPU Usage')} barCategoryGap="30%">
                              <CartesianGrid strokeDasharray="3 3" vertical={false} />
                              <XAxis dataKey="name" tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                              <YAxis tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                              <Tooltip cursor={{fill: 'transparent'}} />
                              <Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                          </BarChart>
                      </ResponsiveContainer>
                  </div>
                  {/* IOPS Chart */}
                  <div className="flex flex-col">
                      <h4 className="text-xs font-semibold text-gray-500 text-center mb-2">{t('comp.chart.io')}</h4>
                      <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={getChartData('IOPS')} barCategoryGap="30%">
                              <CartesianGrid strokeDasharray="3 3" vertical={false} />
                              <XAxis dataKey="name" tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                              <YAxis tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                              <Tooltip cursor={{fill: 'transparent'}} />
                              <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
                          </BarChart>
                      </ResponsiveContainer>
                  </div>
              </div>
          </div>
      );
  };

  return (
    <div className="space-y-6">
      {/* Control Panel */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        <div className="flex justify-between items-start mb-6">
            <div>
                <h3 className="font-medium text-gray-700 mb-2">{t('comp.selected')}:</h3>
                <div className="flex space-x-3">
                    <div className="flex items-center bg-blue-50 text-blue-700 px-3 py-1 rounded-md text-sm border border-blue-100">
                        <span className="mr-2 font-bold">#1289</span>
                        <span>prod-db-01 (2025-12-09)</span>
                        <button className="ml-2 hover:text-blue-900"><X size={14}/></button>
                    </div>
                    <div className="flex items-center bg-blue-50 text-blue-700 px-3 py-1 rounded-md text-sm border border-blue-100">
                        <span className="mr-2 font-bold">#1285</span>
                        <span>prod-db-01 (2025-12-07)</span>
                        <button className="ml-2 hover:text-blue-900"><X size={14}/></button>
                    </div>
                </div>
            </div>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 font-medium">
                {t('comp.new')}
            </button>
        </div>

        <div className="flex items-center space-x-4 pb-4 border-b border-gray-100">
             <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('comp.name')}</label>
                <input type="text" className="w-full border rounded px-2 py-1.5 text-sm" placeholder="e.g. Weekly Check" />
             </div>
             <div className="flex-[2]">
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('comp.desc')}</label>
                <input type="text" className="w-full border rounded px-2 py-1.5 text-sm" placeholder="Analysis of traffic spike..." />
             </div>
             <div className="self-end">
                 <button className="flex items-center px-4 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50 text-gray-700">
                     <Save size={16} className="mr-2" /> {t('comp.save')}
                 </button>
             </div>
        </div>
      </div>

      {/* Analysis Summary */}
      {renderSummary()}

      {/* Overview Charts */}
      {OverviewSection()}

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100">
         <div className="flex border-b border-gray-200">
            {TABS.map((tab) => (
                <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === tab.id 
                        ? 'border-blue-600 text-blue-600' 
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                >
                    {tab.label}
                </button>
            ))}
         </div>

         <div className="p-6">
            {renderTableContent()}
         </div>
      </div>
    </div>
  );
};

export default ComparisonAnalysis;
