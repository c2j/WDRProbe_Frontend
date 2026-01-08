
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useWDRContext } from '../context/WDRContext';
import { parseWdrHtml } from '../utils/wdrParser';
import { useI18n } from '../context/I18nContext';
import { 
    Upload, FileText, Activity, Layers, Clock, Zap, 
    AlertTriangle, CheckCircle, Search, ArrowUp, ArrowDown,
    Settings, Database, ChevronRight, X, BarChart2,
    Info, Filter, MousePointer2, Cpu, HardDrive, Server, BookOpen, Code
} from 'lucide-react';
import { WdrObjectStat, WdrReportDetail, WdrTopSqlItem, WdrWaitEvent } from '../types';
import { Link } from 'react-router-dom';

// --- Helper Components ---

const SortHeader = ({ label, sortKey, currentSort, onSort, align = 'left' }: { label: string, sortKey: string, currentSort: { key: string, dir: string }, onSort: (k: string) => void, align?: 'left' | 'right' | 'center' }) => (
    <th 
        className={`px-4 py-2 font-medium cursor-pointer hover:bg-gray-100 transition-colors select-none ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}`}
        onClick={() => onSort(sortKey)}
    >
        <div className={`flex items-center ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}>
            {label}
            {currentSort.key === sortKey && (
                currentSort.dir === 'asc' ? <ArrowUp size={12} className="ml-1 text-blue-600"/> : <ArrowDown size={12} className="ml-1 text-blue-600"/>
            )}
        </div>
    </th>
);

const EfficiencyGauge: React.FC<{ name: string; value: number; target: number }> = ({ name, value, target }) => {
    const isHealthy = value >= target;
    const isWarning = value >= target * 0.9 && value < target;
    const colorClass = isHealthy ? 'text-green-600' : isWarning ? 'text-yellow-600' : 'text-red-600';
    
    return (
        <div className="flex flex-col items-center justify-center p-4 bg-white rounded-lg border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
            <div className={`relative w-16 h-16 rounded-full flex items-center justify-center border-4 ${isHealthy ? 'border-green-100' : isWarning ? 'border-yellow-100' : 'border-red-100'} mb-2`}>
                <span className={`text-sm font-bold ${colorClass}`}>{value}%</span>
            </div>
            <span className="text-xs font-medium text-gray-700 text-center h-8 flex items-center">{name}</span>
        </div>
    );
};

const WDRKnowledgePanel = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
    const { t } = useI18n();
    const [searchTerm, setSearchTerm] = useState('');

    if (!isOpen) return null;

    const items = [
        { key: 'efficiency', icon: Zap, i18n: 'wdr.kb.efficiency' },
        { key: 'bufferHit', icon: Activity, i18n: 'wdr.kb.bufferHit' },
        { key: 'effectiveCpu', icon: Cpu, i18n: 'wdr.kb.effectiveCpu' },
        { key: 'walWrite', icon: HardDrive, i18n: 'wdr.kb.walWrite' },
        { key: 'softParse', icon: Code, i18n: 'wdr.kb.softParse' },
        { key: 'nonParseCpu', icon: Cpu, i18n: 'wdr.kb.nonParseCpu' },
    ];

    const filtered = items.filter(i => t(`${i.i18n}.title`).toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="fixed inset-y-0 right-0 w-80 bg-white shadow-2xl z-50 flex flex-col transform transition-transform duration-300 animate-in slide-in-from-right border-l border-gray-200">
             {/* Header */}
             <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                <h3 className="font-semibold text-gray-800 flex items-center">
                    <BookOpen size={18} className="mr-2 text-blue-600"/>
                    {t('wdr.kb.title')}
                </h3>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            {/* Search */}
            <div className="p-3 border-b border-gray-100 bg-white">
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-2.5 text-gray-400"/>
                    <input 
                        type="text" 
                        placeholder={t('wdr.kb.search')}
                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>
            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
                {filtered.map(item => (
                    <div key={item.key} className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center mb-1">
                            <div className="p-1.5 bg-blue-50 text-blue-600 rounded mr-2">
                                <item.icon size={14} />
                            </div>
                            <span className="font-bold text-sm text-gray-700">{t(`${item.i18n}.title`)}</span>
                        </div>
                        <p className="text-xs text-gray-500 leading-relaxed">{t(`${item.i18n}.desc`)}</p>
                    </div>
                ))}
                {filtered.length === 0 && (
                    <div className="text-center text-gray-400 text-sm mt-10">No results found.</div>
                )}
            </div>
        </div>
    );
};

// --- Main Component ---

const WDRReportAnalyze: React.FC = () => {
    const { t } = useI18n();
    const { 
        report, setReport, 
        activeTab, setActiveTab,
        selectedSql, setSelectedSql,
        objTypeFilter, setObjTypeFilter,
        selectedObject, setSelectedObject
    } = useWDRContext();

    const [loading, setLoading] = useState(false);
    const [showKB, setShowKB] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Local Sorting State - Using string for key to avoid TS union type mismatch issues
    const [sqlSort, setSqlSort] = useState<{key: string, dir: 'asc'|'desc'}>({ key: 'totalTime', dir: 'desc' });
    const [objSort, setObjSort] = useState<{key: string, dir: 'asc'|'desc'}>({ key: 'deadTup', dir: 'desc' });
    const [waitSort, setWaitSort] = useState<{key: string, dir: 'asc'|'desc'}>({ key: 'totalWaitTime', dir: 'desc' });

    // Handle Upload
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const content = event.target?.result as string;
                const parsed = parseWdrHtml(content);
                setReport(parsed);
                // Reset View
                setActiveTab('overview');
                setSelectedSql(null);
                setSelectedObject(null);
                setObjTypeFilter('Table'); // Reset to Table view by default
            } catch (err) {
                console.error(err);
                alert('Failed to parse WDR report. Please ensure it is a valid OpenGauss WDR HTML file.');
            } finally {
                setLoading(false);
            }
        };
        reader.readAsText(file);
    };

    const handleSort = (setter: React.Dispatch<React.SetStateAction<{key: string, dir: 'asc'|'desc'}>>, key: string) => {
        setter((prev) => ({
            key,
            dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc'
        }));
    };

    const sortData = <T,>(data: T[], sortState: { key: string, dir: 'asc' | 'desc' }): T[] => {
        return [...data].sort((a, b) => {
            const valA = (a as any)[sortState.key];
            const valB = (b as any)[sortState.key];
            if (valA === undefined) return 1;
            if (valB === undefined) return -1;
            
            if (valA < valB) return sortState.dir === 'asc' ? -1 : 1;
            if (valA > valB) return sortState.dir === 'asc' ? 1 : -1;
            return 0;
        });
    };

    // Derived Data
    const sortedTopSql = useMemo<WdrTopSqlItem[]>(() => {
        if (!report) return [];
        return sortData(report.topSql, sqlSort);
    }, [report, sqlSort]);

    const sortedWaitEvents = useMemo<WdrWaitEvent[]>(() => {
        if (!report) return [];
        return sortData(report.waitEvents, waitSort);
    }, [report, waitSort]);

    const sortedObjectStats = useMemo<WdrObjectStat[]>(() => {
        if (!report) return [];
        let filtered = report.objectStats;
        if (objTypeFilter !== 'All') {
            filtered = filtered.filter(o => o.type === objTypeFilter);
        }
        return sortData(filtered, objSort);
    }, [report, objTypeFilter, objSort]);

    // Simple Risk Analysis (Client-side)
    const risks = useMemo(() => {
        if (!report) return [];
        const r = [];
        
        // Check Efficiency
        const bufferHit = report.efficiency.find(e => e.name.includes('Buffer Hit'));
        if (bufferHit && bufferHit.value < 95) {
            r.push({ type: 'warning', title: t('wdr.issue.bufferHit', { val: bufferHit.value }), desc: t('wdr.issue.bufferHitDesc', { val: bufferHit.value }) });
        }

        // Check Dead Tuples
        const bloatedTables = report.objectStats.filter(o => (o.deadTup || 0) > 10000);
        if (bloatedTables.length > 0) {
            r.push({ type: 'error', title: t('wdr.issue.deadTup'), desc: t('wdr.issue.deadTupDesc', { table: bloatedTables[0].name, count: bloatedTables[0].deadTup || 0 }) });
        }

        return r;
    }, [report, t]);

    // --- Render ---

    if (!report) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                <div className="bg-white p-8 rounded-xl shadow-sm text-center max-w-lg">
                    <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Upload size={32} />
                    </div>
                    <h2 className="text-xl font-bold text-gray-800 mb-2">{t('wdr.upload.title')}</h2>
                    <p className="text-gray-500 mb-6">{t('wdr.upload.desc')}</p>
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center mx-auto"
                        disabled={loading}
                    >
                        {loading ? <Activity size={20} className="animate-spin mr-2"/> : <FileText size={20} className="mr-2"/>}
                        {loading ? t('wdr.analyzing') : t('wdr.upload.btn')}
                    </button>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept=".html,.wdr" 
                        onChange={handleFileUpload} 
                    />
                    <p className="text-xs text-gray-400 mt-4">{t('wdr.upload.drag')}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col space-y-4 relative">
            <WDRKnowledgePanel isOpen={showKB} onClose={() => setShowKB(false)} />
            
            {/* Header Info */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 flex justify-between items-center shrink-0">
                <div className="flex items-center space-x-4">
                    <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
                        <Activity size={24} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-gray-800">{report.meta.instanceName}</h2>
                        <div className="flex items-center text-sm text-gray-500 space-x-3">
                            <span className="flex items-center"><Clock size={12} className="mr-1"/> {report.snapshots.start} - {report.snapshots.end}</span>
                            <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-medium">Parsed Successfully</span>
                        </div>
                    </div>
                </div>
                <div className="flex space-x-2">
                    <button 
                        onClick={() => setShowKB(true)} 
                        className="px-3 py-1.5 text-sm text-blue-600 bg-blue-50 hover:bg-blue-100 rounded border border-blue-100 flex items-center transition-colors"
                    >
                        <BookOpen size={14} className="mr-2"/> {t('wdr.kb.title')}
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded border border-gray-200 flex items-center">
                        <Upload size={14} className="mr-2"/> Re-upload
                    </button>
                    <button onClick={() => setReport(null)} className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded border border-red-200">
                        Close
                    </button>
                    <input type="file" ref={fileInputRef} className="hidden" accept=".html,.wdr" onChange={handleFileUpload} />
                </div>
            </div>

            {/* Tabs */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="flex border-b border-gray-100 px-4 pt-2 shrink-0">
                    {(['overview', 'wait', 'sql', 'obj', 'settings'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center ${
                                activeTab === tab 
                                ? 'border-blue-600 text-blue-600' 
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            {tab === 'overview' && <Activity size={14} className="mr-2"/>}
                            {tab === 'wait' && <Clock size={14} className="mr-2"/>}
                            {tab === 'sql' && <FileText size={14} className="mr-2"/>}
                            {tab === 'obj' && <Layers size={14} className="mr-2"/>}
                            {tab === 'settings' && <Settings size={14} className="mr-2"/>}
                            {t(`wdr.tab.${tab}`)}
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-auto bg-gray-50 p-4">
                    {activeTab === 'overview' && (
                        <div className="space-y-6 max-w-6xl mx-auto">
                            {/* Risks Banner */}
                            {risks.length > 0 ? (
                                <div className="space-y-2">
                                    {risks.map((risk, idx) => (
                                        <div key={idx} className={`p-4 rounded-lg border flex items-start ${risk.type === 'error' ? 'bg-red-50 border-red-100 text-red-800' : 'bg-orange-50 border-orange-100 text-orange-800'}`}>
                                            {risk.type === 'error' ? <AlertTriangle className="mr-3 shrink-0" size={20}/> : <Info className="mr-3 shrink-0" size={20}/>}
                                            <div>
                                                <h4 className="font-bold text-sm">{risk.title}</h4>
                                                <p className="text-sm mt-1 opacity-90">{risk.desc}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="bg-green-50 border border-green-100 p-4 rounded-lg flex items-center text-green-800">
                                    <CheckCircle size={20} className="mr-3"/>
                                    <span className="font-medium">{t('wdr.risk.none')}</span>
                                </div>
                            )}

                            {/* Efficiency */}
                            <div>
                                <h3 className="text-lg font-semibold text-gray-700 mb-3 flex items-center">
                                    <Zap size={18} className="mr-2 text-yellow-500"/>
                                    {t('wdr.kb.efficiency.title')}
                                </h3>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                                    {report.efficiency.map((eff, idx) => (
                                        <EfficiencyGauge key={idx} {...eff} />
                                    ))}
                                </div>
                            </div>

                            {/* Load Profile */}
                            <div>
                                <h3 className="text-lg font-semibold text-gray-700 mb-3 flex items-center">
                                    <BarChart2 size={18} className="mr-2 text-blue-500"/>
                                    {t('rep.summary.workload')}
                                </h3>
                                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-gray-50 text-gray-600">
                                            <tr>
                                                <th className="px-6 py-3 font-medium">{t('rep.metric')}</th>
                                                <th className="px-6 py-3 font-medium text-right">{t('rep.perSec')}</th>
                                                <th className="px-6 py-3 font-medium text-right">{t('rep.perTxn')}</th>
                                                <th className="px-6 py-3 font-medium text-right">Per Exec</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {report.loadProfile.map((item, idx) => (
                                                <tr key={idx} className="hover:bg-gray-50">
                                                    <td className="px-6 py-3 font-medium text-gray-700">{item.metric}</td>
                                                    <td className="px-6 py-3 text-right font-mono text-gray-600">{item.perSec.toLocaleString()}</td>
                                                    <td className="px-6 py-3 text-right font-mono text-gray-600">{item.perTxn.toLocaleString()}</td>
                                                    <td className="px-6 py-3 text-right font-mono text-gray-600">{item.perExec?.toLocaleString() ?? '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Host CPU */}
                            {report.hostCpu && (
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-700 mb-3 flex items-center">
                                        <Cpu size={18} className="mr-2 text-purple-500"/>
                                        Host CPU
                                    </h3>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div className="p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
                                            <div className="text-xs text-gray-500 uppercase font-bold mb-1">Hardware</div>
                                            <div className="text-sm font-medium text-gray-800">
                                                {report.hostCpu.cpus} CPUs / {report.hostCpu.cores} Cores / {report.hostCpu.sockets} Sockets
                                            </div>
                                        </div>
                                        <div className="p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
                                            <div className="text-xs text-gray-500 uppercase font-bold mb-1">Load Average</div>
                                            <div className="text-sm font-medium text-gray-800">
                                                Begin: {report.hostCpu.loadAvgBegin} / End: {report.hostCpu.loadAvgEnd}
                                            </div>
                                        </div>
                                        <div className="p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
                                            <div className="text-xs text-gray-500 uppercase font-bold mb-1">CPU Usage</div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-blue-600 font-bold">User: {report.hostCpu.user}%</span>
                                                <span className="text-red-600 font-bold">Sys: {report.hostCpu.system}%</span>
                                            </div>
                                        </div>
                                        <div className="p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
                                            <div className="text-xs text-gray-500 uppercase font-bold mb-1">Idle / Wait</div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-green-600 font-bold">Idle: {report.hostCpu.idle}%</span>
                                                <span className="text-orange-600 font-bold">WIO: {report.hostCpu.wio}%</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* IO Profile */}
                            {report.ioProfile && report.ioProfile.length > 0 && (
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-700 mb-3 flex items-center">
                                        <HardDrive size={18} className="mr-2 text-indigo-500"/>
                                        IO Profile
                                    </h3>
                                    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-gray-50 text-gray-600">
                                                <tr>
                                                    <th className="px-6 py-3 font-medium">IO Type</th>
                                                    <th className="px-6 py-3 font-medium text-right">Read Reqs</th>
                                                    <th className="px-6 py-3 font-medium text-right">Write Reqs</th>
                                                    <th className="px-6 py-3 font-medium text-right">Read Bytes</th>
                                                    <th className="px-6 py-3 font-medium text-right">Write Bytes</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {report.ioProfile.map((io, idx) => (
                                                    <tr key={idx} className="hover:bg-gray-50">
                                                        <td className="px-6 py-2 font-medium text-gray-700">{io.ioType}</td>
                                                        <td className="px-6 py-2 text-right font-mono">{io.readReqs.toLocaleString()}</td>
                                                        <td className="px-6 py-2 text-right font-mono">{io.writeReqs.toLocaleString()}</td>
                                                        <td className="px-6 py-2 text-right font-mono">{io.readBytes.toLocaleString()}</td>
                                                        <td className="px-6 py-2 text-right font-mono">{io.writeBytes.toLocaleString()}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Memory Statistics */}
                            {report.memoryStats && report.memoryStats.length > 0 && (
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-700 mb-3 flex items-center">
                                        <Server size={18} className="mr-2 text-teal-500"/>
                                        Memory Statistics
                                    </h3>
                                    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-gray-50 text-gray-600">
                                                <tr>
                                                    <th className="px-6 py-3 font-medium">Component</th>
                                                    <th className="px-6 py-3 font-medium text-right">Begin Snap</th>
                                                    <th className="px-6 py-3 font-medium text-right">End Snap</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {report.memoryStats.map((mem, idx) => (
                                                    <tr key={idx} className="hover:bg-gray-50">
                                                        <td className="px-6 py-2 font-medium text-gray-700">{mem.component}</td>
                                                        <td className="px-6 py-2 text-right font-mono">{mem.beginVal}</td>
                                                        <td className="px-6 py-2 text-right font-mono">{mem.endVal}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'wait' && (
                        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden h-full flex flex-col">
                            <div className="overflow-auto flex-1">
                                <table className="w-full text-sm text-left whitespace-nowrap">
                                    <thead className="bg-gray-50 text-gray-600 sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            <SortHeader label="Event" sortKey="event" currentSort={waitSort} onSort={(k) => handleSort(setWaitSort, k)} />
                                            <SortHeader label="Class" sortKey="waitClass" currentSort={waitSort} onSort={(k) => handleSort(setWaitSort, k)} />
                                            <SortHeader label="Waits" sortKey="waits" currentSort={waitSort} onSort={(k) => handleSort(setWaitSort, k)} align="right"/>
                                            <SortHeader label="Total Time (us)" sortKey="totalWaitTime" currentSort={waitSort} onSort={(k) => handleSort(setWaitSort, k)} align="right"/>
                                            <SortHeader label="Avg Time (us)" sortKey="avgWaitTime" currentSort={waitSort} onSort={(k) => handleSort(setWaitSort, k)} align="right"/>
                                            <SortHeader label="Max Time (us)" sortKey="maxWaitTime" currentSort={waitSort} onSort={(k) => handleSort(setWaitSort, k)} align="right"/>
                                            <SortHeader label="% DB Time" sortKey="pctDBTime" currentSort={waitSort} onSort={(k) => handleSort(setWaitSort, k)} align="right"/>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {sortedWaitEvents.map((evt, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50">
                                                <td className="px-4 py-2 font-medium text-gray-700">{evt.event}</td>
                                                <td className="px-4 py-2 text-gray-500">{evt.waitClass}</td>
                                                <td className="px-4 py-2 text-right font-mono text-gray-600">{evt.waits.toLocaleString()}</td>
                                                <td className="px-4 py-2 text-right font-mono text-blue-600">{evt.totalWaitTime.toLocaleString()}</td>
                                                <td className="px-4 py-2 text-right font-mono text-gray-600">{evt.avgWaitTime.toLocaleString()}</td>
                                                <td className="px-4 py-2 text-right font-mono text-gray-600">{evt.maxWaitTime?.toLocaleString() ?? '-'}</td>
                                                <td className="px-4 py-2 text-right font-mono text-gray-600">{evt.pctDBTime.toFixed(1)}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'sql' && (
                        <div className="flex h-full gap-4">
                            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden flex-1 flex flex-col">
                                <div className="overflow-auto flex-1">
                                    <table className="w-full text-sm text-left whitespace-nowrap">
                                        <thead className="bg-gray-50 text-gray-600 sticky top-0 z-10 shadow-sm">
                                            <tr>
                                                <SortHeader label="Unique SQL ID" sortKey="uniqueSqlId" currentSort={sqlSort} onSort={(k) => handleSort(setSqlSort, k)} />
                                                <SortHeader label="User" sortKey="userName" currentSort={sqlSort} onSort={(k) => handleSort(setSqlSort, k)} />
                                                <SortHeader label="Total Time (us)" sortKey="totalTime" currentSort={sqlSort} onSort={(k) => handleSort(setSqlSort, k)} align="right"/>
                                                <SortHeader label="Avg Time (us)" sortKey="avgTime" currentSort={sqlSort} onSort={(k) => handleSort(setSqlSort, k)} align="right"/>
                                                <SortHeader label="Calls" sortKey="calls" currentSort={sqlSort} onSort={(k) => handleSort(setSqlSort, k)} align="right"/>
                                                <SortHeader label="CPU Time" sortKey="cpuTime" currentSort={sqlSort} onSort={(k) => handleSort(setSqlSort, k)} align="right"/>
                                                <SortHeader label="IO Time" sortKey="ioTime" currentSort={sqlSort} onSort={(k) => handleSort(setSqlSort, k)} align="right"/>
                                                <th className="px-4 py-2 w-10"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {sortedTopSql.map((sql, idx) => (
                                                <tr key={idx} className={`hover:bg-blue-50 cursor-pointer ${selectedSql?.uniqueSqlId === sql.uniqueSqlId ? 'bg-blue-50' : ''}`} onClick={() => setSelectedSql(sql)}>
                                                    <td className="px-4 py-2 font-mono text-xs text-blue-600">{sql.uniqueSqlId}</td>
                                                    <td className="px-4 py-2 text-gray-600">{sql.userName}</td>
                                                    <td className="px-4 py-2 text-right font-mono text-gray-800 font-medium">{sql.totalTime.toLocaleString()}</td>
                                                    <td className="px-4 py-2 text-right font-mono text-gray-600">{sql.avgTime.toLocaleString()}</td>
                                                    <td className="px-4 py-2 text-right font-mono text-gray-600">{sql.calls.toLocaleString()}</td>
                                                    <td className="px-4 py-2 text-right font-mono text-gray-600">{sql.cpuTime.toLocaleString()}</td>
                                                    <td className="px-4 py-2 text-right font-mono text-gray-600">{sql.ioTime.toLocaleString()}</td>
                                                    <td className="px-4 py-2 text-gray-400"><ChevronRight size={16}/></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            {/* SQL Details Side Panel */}
                            {selectedSql && (
                                <div className="w-96 bg-white rounded-lg border border-gray-200 shadow-xl flex flex-col animate-in slide-in-from-right-10">
                                    <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-lg">
                                        <h3 className="font-bold text-gray-700">SQL Details</h3>
                                        <button onClick={() => setSelectedSql(null)} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
                                    </div>
                                    <div className="p-4 overflow-y-auto flex-1 space-y-4">
                                        <div>
                                            <div className="text-xs font-bold text-gray-500 uppercase mb-1">SQL Text</div>
                                            <div className="bg-gray-800 text-gray-200 p-3 rounded text-xs font-mono break-all max-h-60 overflow-y-auto border border-gray-700 shadow-inner">
                                                {selectedSql.text}
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="p-3 bg-blue-50 rounded border border-blue-100">
                                                <div className="text-xs text-blue-500 font-bold uppercase">Rows Returned</div>
                                                <div className="text-lg font-bold text-blue-800">{selectedSql.rows.toLocaleString()}</div>
                                            </div>
                                            <div className="p-3 bg-green-50 rounded border border-green-100">
                                                <div className="text-xs text-green-500 font-bold uppercase">Tuples Read</div>
                                                <div className="text-lg font-bold text-green-800">{selectedSql.tuplesRead?.toLocaleString() ?? '-'}</div>
                                            </div>
                                            <div className="p-3 bg-purple-50 rounded border border-purple-100">
                                                <div className="text-xs text-purple-500 font-bold uppercase">Logical Reads</div>
                                                <div className="text-lg font-bold text-purple-800">{selectedSql.logicalRead?.toLocaleString() ?? '-'}</div>
                                            </div>
                                            <div className="p-3 bg-orange-50 rounded border border-orange-100">
                                                <div className="text-xs text-orange-500 font-bold uppercase">Physical Reads</div>
                                                <div className="text-lg font-bold text-orange-800">{selectedSql.physicalRead?.toLocaleString() ?? '-'}</div>
                                            </div>
                                        </div>
                                        <div className="pt-2 border-t border-gray-100 flex justify-end">
                                            <Link to="/visualizer" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow-sm text-sm flex items-center">
                                                <Zap size={14} className="mr-2"/> Visualize Plan
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'obj' && (
                        <div className="flex-1 flex flex-col min-h-0 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                            {/* Filter Toolbar */}
                            <div className="flex space-x-1 p-2 border-b border-gray-100 shrink-0 bg-white">
                                <button
                                    onClick={() => setObjTypeFilter('All')}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                                        objTypeFilter === 'All' 
                                        ? 'bg-blue-100 text-blue-700' 
                                        : 'text-gray-500 hover:bg-gray-50'
                                    }`}
                                >
                                    All Objects
                                </button>
                                {(['Table', 'Index'] as const).map(type => (
                                    <button
                                        key={type}
                                        onClick={() => setObjTypeFilter(type)}
                                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                                            objTypeFilter === type 
                                            ? 'bg-blue-100 text-blue-700' 
                                            : 'text-gray-500 hover:bg-gray-50'
                                        }`}
                                    >
                                        {type} Statistics
                                    </button>
                                ))}
                            </div>
                            <div className="flex-1 overflow-auto">
                                <table className="w-full text-sm text-left whitespace-nowrap">
                                    <thead className="bg-gray-50 text-gray-600 sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            <SortHeader label="Schema" sortKey="schema" currentSort={objSort} onSort={(k: string) => handleSort(setObjSort, k)} />
                                            <SortHeader label={objTypeFilter === 'Table' ? 'Table Name' : (objTypeFilter === 'Index' ? 'Index Name' : 'Object Name')} sortKey="name" currentSort={objSort} onSort={(k: string) => handleSort(setObjSort, k)} />
                                            <SortHeader label="Type" sortKey="type" currentSort={objSort} onSort={(k: string) => handleSort(setObjSort, k)} />
                                            {objTypeFilter !== 'Table' && (
                                                <SortHeader label="Parent Table" sortKey="tableName" currentSort={objSort} onSort={(k: string) => handleSort(setObjSort, k)} />
                                            )}
                                            {objTypeFilter !== 'Index' && (
                                                <>
                                                    <SortHeader label="Seq Scan" sortKey="seqScan" currentSort={objSort} onSort={(k: string) => handleSort(setObjSort, k)} align="right"/>
                                                    <SortHeader label="Idx Scan" sortKey="idxScan" currentSort={objSort} onSort={(k: string) => handleSort(setObjSort, k)} align="right"/>
                                                    <th className="px-4 py-2 text-right">I/U/D</th>
                                                    <SortHeader label="Live Tuples" sortKey="liveTup" currentSort={objSort} onSort={(k: string) => handleSort(setObjSort, k)} align="right"/>
                                                    <SortHeader label="Dead Tuples" sortKey="deadTup" currentSort={objSort} onSort={(k: string) => handleSort(setObjSort, k)} align="right"/>
                                                </>
                                            )}
                                            {objTypeFilter === 'Index' && (
                                                <>
                                                    <SortHeader label="Idx Tup Read" sortKey="idxTupRead" currentSort={objSort} onSort={(k: string) => handleSort(setObjSort, k)} align="right"/>
                                                    <SortHeader label="Idx Tup Fetch" sortKey="idxTupFetch" currentSort={objSort} onSort={(k: string) => handleSort(setObjSort, k)} align="right"/>
                                                </>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {sortedObjectStats.map((obj, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50 cursor-pointer group" onClick={() => setSelectedObject(obj)}>
                                                <td className="px-4 py-2 text-gray-500">{obj.schema}</td>
                                                <td className="px-4 py-2 font-medium text-gray-700 group-hover:text-blue-600 transition-colors">
                                                    {obj.name}
                                                </td>
                                                <td className="px-4 py-2">
                                                    <span className={`px-2 py-0.5 rounded text-xs ${obj.type === 'Table' ? 'bg-indigo-50 text-indigo-700' : 'bg-purple-50 text-purple-700'}`}>{obj.type}</span>
                                                </td>
                                                {objTypeFilter !== 'Table' && (
                                                    <td className="px-4 py-2 text-gray-600">{obj.tableName || '-'}</td>
                                                )}
                                                {objTypeFilter !== 'Index' && (
                                                    <>
                                                        <td className="px-4 py-2 text-right font-mono text-gray-600">{obj.seqScan?.toLocaleString() ?? '-'}</td>
                                                        <td className="px-4 py-2 text-right font-mono text-gray-600">{obj.idxScan?.toLocaleString() ?? '-'}</td>
                                                        <td className="px-4 py-2 text-right font-mono text-xs text-gray-500">
                                                            {obj.tupIns}/{obj.tupUpd}/{obj.tupDel}
                                                        </td>
                                                        <td className="px-4 py-2 text-right font-mono text-gray-600">{obj.liveTup?.toLocaleString() ?? '-'}</td>
                                                        <td className={`px-4 py-2 text-right font-mono ${obj.deadTup && obj.deadTup > 10000 ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
                                                            {obj.deadTup?.toLocaleString() ?? '-'}
                                                        </td>
                                                    </>
                                                )}
                                                {objTypeFilter === 'Index' && (
                                                    <>
                                                        <td className="px-4 py-2 text-right font-mono text-blue-600">{obj.idxTupRead?.toLocaleString() ?? '-'}</td>
                                                        <td className="px-4 py-2 text-right font-mono text-green-600">{obj.idxTupFetch?.toLocaleString() ?? '-'}</td>
                                                    </>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {sortedObjectStats.length === 0 && (
                                    <div className="p-8 text-center text-gray-400 italic flex flex-col items-center">
                                        <Filter size={32} className="mb-2 text-gray-300"/>
                                        No {objTypeFilter !== 'All' ? objTypeFilter : ''} statistics found.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'settings' && (
                        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 text-gray-600">
                                    <tr>
                                        <th className="px-6 py-3 font-medium">Parameter</th>
                                        <th className="px-6 py-3 font-medium">Value</th>
                                        <th className="px-6 py-3 font-medium">Type</th>
                                        <th className="px-6 py-3 font-medium">Category</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {report.configs.map((conf, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50">
                                            <td className="px-6 py-3 font-medium text-gray-700">{conf.name}</td>
                                            <td className="px-6 py-3 font-mono text-blue-600 break-all">{conf.value}</td>
                                            <td className="px-6 py-3 text-gray-500">{conf.type}</td>
                                            <td className="px-6 py-3 text-gray-500">{conf.category}</td>
                                        </tr>
                                    ))}
                                    {report.configs.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="p-8 text-center text-gray-400 italic">No configuration settings found.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default WDRReportAnalyze;