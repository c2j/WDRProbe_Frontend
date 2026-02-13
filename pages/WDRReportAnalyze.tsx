
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
        { key: 'softParse', icon: Code, i18n: 'wdr.kb.softParse' },
    ];
    const filtered = items.filter(i => t(`${i.i18n}.title`).toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="fixed inset-y-0 right-0 w-80 bg-white shadow-2xl z-50 flex flex-col transform transition-transform duration-300 animate-in slide-in-from-right border-l border-gray-200">
             <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                <h3 className="font-semibold text-gray-800 flex items-center"><BookOpen size={18} className="mr-2 text-blue-600"/>{t('wdr.kb.title')}</h3>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-3 border-b border-gray-100 bg-white">
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-2.5 text-gray-400"/>
                    <input type="text" placeholder={t('wdr.kb.search')} className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md outline-none focus:ring-1 focus:ring-blue-500" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
                {filtered.map(item => (
                    <div key={item.key} className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center mb-1">
                            <div className="p-1.5 bg-blue-50 text-blue-600 rounded mr-2"><item.icon size={14} /></div>
                            <span className="font-bold text-sm text-gray-700">{t(`${item.i18n}.title`)}</span>
                        </div>
                        <p className="text-xs text-gray-500 leading-relaxed">{t(`${item.i18n}.desc`)}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};

const WDRReportAnalyze: React.FC = () => {
    const { t } = useI18n();
    const { report, setReport, activeTab, setActiveTab } = useWDRContext();
    const [loading, setLoading] = useState(false);
    const [showKB, setShowKB] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const risks = useMemo(() => {
        if (!report) return [];
        const r = [];
        const bufferHit = report.efficiency.find(e => e.name.includes('Buffer Hit'));
        if (bufferHit && bufferHit.value < 95) {
            r.push({ type: 'warning', title: t('wdr.issue.bufferHit', { val: bufferHit.value }), desc: t('wdr.issue.bufferHitDesc') });
        }
        const skewRiskTables = report.objectStats.filter(o => o.type === 'Table' && (o.seqScan || 0) > 1000 && (o.deadTup || 0) > 20000);
        if (skewRiskTables.length > 0) {
            skewRiskTables.slice(0, 3).forEach(tbl => {
                r.push({ type: 'error', title: t('wdr.issue.skew'), desc: t('wdr.issue.skewDesc', { table: tbl.name }) });
            });
        }
        const bloatedTables = report.objectStats.filter(o => (o.deadTup || 0) > 50000 && !skewRiskTables.find(s => s.name === o.name));
        if (bloatedTables.length > 0) {
            r.push({ type: 'warning', title: t('wdr.issue.deadTup'), desc: t('wdr.issue.deadTupDesc', { table: bloatedTables[0].name, count: bloatedTables[0].deadTup || 0 }) });
        }
        return r;
    }, [report, t]);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setLoading(true);
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const parsed = parseWdrHtml(event.target?.result as string);
                setReport(parsed);
                setActiveTab('overview');
            } catch (err) {
                alert('Parse error');
            } finally {
                setLoading(false);
            }
        };
        reader.readAsText(file);
    };

    if (!report) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-8 bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl">
                <Upload size={48} className="text-gray-400 mb-4" />
                <button onClick={() => fileInputRef.current?.click()} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">
                    {loading ? t('wdr.analyzing') : t('wdr.upload.btn')}
                </button>
                <input type="file" ref={fileInputRef} className="hidden" accept=".html" onChange={handleFileUpload} />
                <p className="text-xs text-gray-400 mt-4">{t('wdr.upload.desc')}</p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col space-y-4 relative">
            <WDRKnowledgePanel isOpen={showKB} onClose={() => setShowKB(false)} />
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 flex justify-between items-center shrink-0">
                <div className="flex items-center space-x-4">
                    <div className="p-2 bg-blue-100 text-blue-700 rounded-lg"><Activity size={24} /></div>
                    <div>
                        <h2 className="text-lg font-bold text-gray-800">{report.meta.instanceName}</h2>
                        <div className="flex items-center text-xs text-gray-500 space-x-3">
                            <span className="flex items-center"><Clock size={12} className="mr-1"/> {report.snapshots.start} - {report.snapshots.end}</span>
                        </div>
                    </div>
                </div>
                <div className="flex space-x-2">
                    <button onClick={() => setShowKB(true)} className="px-3 py-1.5 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 rounded border border-blue-100 flex items-center"><BookOpen size={14} className="mr-2"/> {t('wdr.kb.title')}</button>
                    <button onClick={() => setReport(null)} className="px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded border border-red-200">Reset</button>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-100 flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="flex border-b border-gray-100 px-4 pt-2 shrink-0">
                    {(['overview', 'wait', 'sql', 'obj'] as const).map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab as any)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                            {t(`wdr.tab.${tab}`)}
                        </button>
                    ))}
                </div>
                <div className="flex-1 overflow-auto bg-gray-50/50 p-6">
                    {activeTab === 'overview' && (
                        <div className="max-w-5xl mx-auto space-y-6">
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                {report.efficiency.map((eff, idx) => <EfficiencyGauge key={idx} {...eff} />)}
                            </div>
                            <div className="space-y-3">
                                {risks.map((risk, idx) => (
                                    <div key={idx} className={`p-4 rounded-lg border flex items-start ${risk.type === 'error' ? 'bg-red-50 border-red-100 text-red-800' : 'bg-orange-50 border-orange-100 text-orange-800'}`}>
                                        <AlertTriangle className="mr-3 shrink-0" size={20}/>
                                        <div>
                                            <h4 className="font-bold text-sm">{risk.title}</h4>
                                            <p className="text-xs mt-1 leading-relaxed">{risk.desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default WDRReportAnalyze;
