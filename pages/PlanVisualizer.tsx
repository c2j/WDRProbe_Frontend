import React, { useEffect, useState, useMemo } from 'react';
import { ApiService } from '../services/apiService';
import { ExecutionPlanNode, WdrHotSql } from '../types';
import { 
  Play, Upload, AlertCircle, Database, Zap, FileCode, MousePointer2, 
  GitBranch, AlignLeft, ChevronDown, ChevronRight, 
  Maximize2, Minimize2, X, Columns, Eye, EyeOff, PanelBottom,
  BookOpen, Search, Activity, Layers
} from 'lucide-react';
import { useI18n } from '../context/I18nContext';

type PanelType = 'sql' | 'text' | 'visual';

const PlanVisualizer: React.FC = () => {
  const { t } = useI18n();
  const [sql, setSql] = useState<string>('');
  const [plan, setPlan] = useState<ExecutionPlanNode | null>(null);
  const [hotSqls, setHotSqls] = useState<WdrHotSql[]>([]);
  const [costThreshold, setCostThreshold] = useState<number>(1000);
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<ExecutionPlanNode | null>(null);
  
  // Layout State
  const [visiblePanels, setVisiblePanels] = useState<Record<PanelType, boolean>>({
    sql: true,
    text: true,
    visual: true
  });
  const [maximizedPanel, setMaximizedPanel] = useState<PanelType | null>(null);
  const [showBottomPanel, setShowBottomPanel] = useState(true);
  
  // Help Modal State
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    ApiService.getWdrHotSqls().then(setHotSqls);
  }, []);

  const handleLoadSql = async (item: WdrHotSql) => {
    setSql(item.fullSql);
    setLoading(true);
    const planData = await ApiService.getExecutionPlan(item.id);
    setPlan(planData);
    setLoading(false);
  };

  const handleManualPlan = () => {
    setLoading(true);
    ApiService.getExecutionPlan('manual').then(data => {
      setPlan(data);
      setLoading(false);
    });
  };

  const togglePanel = (type: PanelType) => {
    setVisiblePanels(prev => {
        const next = { ...prev, [type]: !prev[type] };
        // If we are hiding the maximized panel, reset maximization
        if (!next[type] && maximizedPanel === type) {
            setMaximizedPanel(null);
        }
        return next;
    });
  };

  const toggleMaximize = (type: PanelType) => {
    setMaximizedPanel(prev => prev === type ? null : type);
  };

  // Helper to determine panel classes based on layout state
  const getPanelClasses = (type: PanelType) => {
    // If ANY panel is maximized
    if (maximizedPanel) {
        return maximizedPanel === type 
            ? 'w-full flex-1' 
            : 'hidden';
    }

    // If this panel is hidden
    if (!visiblePanels[type]) return 'hidden';

    // Calculate how many are visible to distribute width
    const visibleCount = (visiblePanels.sql ? 1 : 0) + (visiblePanels.text ? 1 : 0) + (visiblePanels.visual ? 1 : 0);

    if (visibleCount === 1) return 'w-full flex-1';

    // Visual Tree usually gets priority for space
    if (type === 'visual') return 'flex-1'; 

    // Specific logic for 3 columns
    if (visibleCount === 3) {
        if (type === 'sql') return 'w-[30%] shrink-0';
        if (type === 'text') return 'w-[25%] shrink-0';
    }

    // Specific logic for 2 columns
    if (visibleCount === 2) {
        // If Visual is present, SQL/Text take ~35%
        if (visiblePanels.visual) return 'w-[35%] shrink-0';
        // If Visual is NOT present (SQL + Text), split evenly
        return 'w-1/2 shrink-0';
    }

    return 'flex-1'; // Fallback
  };

  const generatePlanText = (node: ExecutionPlanNode, depth = 0): string => {
    const indent = '  '.repeat(depth);
    let text = `${indent}->  ${node.operation}`;
    if (node.target) text += ` on ${node.target}`;
    text += `  (cost=${node.cost} rows=${node.rows})`;
    if (node.details) text += `\n${indent}      ${node.details}`;
    
    if (node.children) {
      node.children.forEach(child => {
        text += '\n' + generatePlanText(child, depth + 1);
      });
    }
    return text;
  };

  const planText = useMemo(() => {
      if (!plan) return '';
      return 'Plan hash: 123456789\n' + generatePlanText(plan);
  }, [plan]);

  // Recursive Tree Component
  const TreeNode: React.FC<{ node: ExecutionPlanNode }> = ({ node }) => {
    const isHighCost = node.cost > costThreshold;
    const isOptimized = node.operation.includes('Index'); 

    return (
      <div className="flex flex-col items-center relative p-4">
        {/* Node Box */}
        <div 
            onClick={(e) => { e.stopPropagation(); setSelectedNode(node); }}
            className={`
                relative z-10 p-3 rounded-lg shadow-md border-2 cursor-pointer transition-transform hover:scale-105 min-w-[160px] bg-white
                ${selectedNode?.id === node.id ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
                ${isHighCost ? 'border-red-400 bg-red-50' : isOptimized ? 'border-green-400 bg-green-50' : 'border-gray-200'}
            `}
        >
            <div className="font-semibold text-xs text-gray-700 mb-1 flex items-center justify-between">
                <span>{node.operation}</span>
                {isHighCost && <AlertCircle size={12} className="text-red-500" />}
            </div>
            {node.target && (
                <div className="text-xs font-mono text-blue-600 mb-1 truncate max-w-[140px]" title={node.target}>
                    {node.target}
                </div>
            )}
            <div className="flex justify-between text-[10px] text-gray-500 mt-2 border-t pt-1 border-gray-100">
                <span>{t('vis.node.cost')}: <span className={isHighCost ? 'font-bold text-red-600' : ''}>{node.cost}</span></span>
                <span>{t('vis.node.rows')}: {node.rows}</span>
            </div>
        </div>

        {/* Children Connector Lines */}
        {node.children && node.children.length > 0 && (
          <>
            <div className="w-px h-6 bg-gray-300"></div>
            <div className="flex space-x-4 relative">
                {node.children.length > 1 && (
                     <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[calc(100%-4rem)] h-px bg-gray-300" style={{top: -1}}></div> 
                )}
                {node.children.map((child, idx) => (
                    <div key={idx} className="flex flex-col items-center">
                        {node.children!.length > 1 && <div className="w-px h-4 bg-gray-300 absolute top-[-1px]"></div>} 
                        <TreeNode node={child} />
                    </div>
                ))}
            </div>
          </>
        )}
      </div>
    );
  };

  // Reusable Header for Panels
  const PanelHeader = ({ 
      title, 
      icon: Icon, 
      subtitle, 
      type 
  }: { title: string, icon: any, subtitle?: string, type: PanelType }) => (
    <div className="bg-gray-100 px-4 py-2 border-b border-gray-200 flex justify-between items-center shrink-0">
        <span className="text-xs font-semibold text-gray-600 flex items-center">
            <Icon size={14} className="mr-2"/> {title}
        </span>
        <div className="flex items-center space-x-2">
            {subtitle && <span className="text-[10px] text-gray-400 mr-2 hidden sm:inline">{subtitle}</span>}
            <button 
                onClick={() => toggleMaximize(type)}
                className="text-gray-400 hover:text-blue-600 transition-colors"
                title={maximizedPanel === type ? "Restore" : "Maximize"}
            >
                {maximizedPanel === type ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button 
                onClick={() => togglePanel(type)}
                className="text-gray-400 hover:text-red-500 transition-colors"
                title="Hide Panel"
            >
                <X size={14} />
            </button>
        </div>
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] gap-4">
        {/* Header Control */}
        <div className="flex justify-between items-center bg-white p-3 rounded-lg border border-gray-200 shadow-sm shrink-0">
            <div className="flex items-center space-x-3">
                 <h2 className="font-bold text-gray-700 flex items-center">
                    <Zap className="mr-2 text-yellow-500" size={20}/>
                    {t('vis.title')}
                 </h2>
                 <span className="text-gray-300">|</span>
                 <button className="text-sm text-gray-600 hover:text-blue-600 flex items-center bg-gray-50 px-3 py-1.5 rounded border border-gray-200 transition-colors">
                    <Upload size={14} className="mr-2"/> {t('vis.import')}
                 </button>
            </div>
            <div className="flex items-center space-x-3">
                 {/* Panel Toggles */}
                 <div className="flex items-center bg-gray-50 rounded border border-gray-200 p-0.5 mr-2">
                    <div className="px-2 text-xs text-gray-400 flex items-center border-r border-gray-200 mr-1">
                        <Columns size={12} className="mr-1" /> {t('vis.view')}
                    </div>
                    {(['sql', 'text', 'visual'] as PanelType[]).map(type => (
                        <button
                            key={type}
                            onClick={() => togglePanel(type)}
                            className={`px-2 py-1 rounded text-xs font-medium flex items-center transition-colors ${
                                visiblePanels[type] ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                            }`}
                            title={`Toggle ${type.toUpperCase()}`}
                        >
                            {visiblePanels[type] ? <Eye size={12} className="mr-1"/> : <EyeOff size={12} className="mr-1"/>}
                            {type === 'sql' ? 'SQL' : type === 'text' ? 'Text' : 'Visual'}
                        </button>
                    ))}
                 </div>
                 
                 <button
                    onClick={() => setShowBottomPanel(!showBottomPanel)}
                    className={`p-1.5 rounded border transition-colors mr-2 ${
                        showBottomPanel 
                            ? 'bg-blue-50 text-blue-600 border-blue-200' 
                            : 'bg-white text-gray-400 border-gray-200 hover:text-gray-600'
                    }`}
                    title={showBottomPanel ? "Hide Details Panel" : "Show Details Panel"}
                >
                    <PanelBottom size={16} />
                </button>

                <div className="flex items-center bg-gray-50 px-2 py-1 rounded border border-gray-200">
                    <span className="text-xs text-gray-500 mr-2">{t('vis.costThreshold')}:</span>
                    <input 
                        type="number" 
                        value={costThreshold} 
                        onChange={(e) => setCostThreshold(Number(e.target.value))}
                        className="w-16 text-xs border-b border-gray-300 bg-transparent focus:outline-none text-right"
                    />
                </div>
                
                {/* Help Button */}
                <button
                    onClick={() => setShowHelp(true)}
                    className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors mr-2"
                    title={t('vis.help')}
                >
                    <BookOpen size={20} />
                </button>

                <button 
                    onClick={handleManualPlan}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded text-sm flex items-center shadow-sm"
                >
                    <Play size={14} className="mr-2"/> {t('vis.explain')}
                </button>
            </div>
        </div>

        {/* Top Section: Editor, Text Plan & Tree */}
        <div className="flex flex-1 gap-4 min-h-0">
            {/* SQL Editor */}
            <div className={`${getPanelClasses('sql')} flex flex-col bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden transition-all duration-300`}>
                <PanelHeader title={t('vis.sqlEditor')} icon={FileCode} subtitle={t('vis.syntax')} type="sql" />
                <div className="flex-1 relative">
                    <textarea 
                        className="w-full h-full p-4 font-mono text-sm resize-none focus:outline-none text-gray-700 bg-[#fbfbfb]"
                        value={sql}
                        onChange={(e) => setSql(e.target.value)}
                        placeholder={t('vis.pastePlaceholder')}
                    />
                </div>
            </div>

            {/* Text Plan */}
            <div className={`${getPanelClasses('text')} flex flex-col bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden transition-all duration-300`}>
                <PanelHeader title={t('vis.planText')} icon={AlignLeft} subtitle={t('vis.rawExplain')} type="text" />
                <div className="flex-1 overflow-auto bg-[#2d2d2d] p-4">
                    {planText ? (
                        <pre className="font-mono text-xs text-green-400 whitespace-pre leading-relaxed">
                            {planText}
                        </pre>
                    ) : (
                        <div className="h-full flex items-center justify-center text-gray-500 text-xs italic">
                            {t('vis.noPlan')}
                        </div>
                    )}
                </div>
            </div>

            {/* Visual Tree */}
            <div className={`${getPanelClasses('visual')} flex flex-col bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden relative transition-all duration-300`}>
                 <div className="bg-gray-100 px-4 py-2 border-b border-gray-200 flex justify-between items-center shrink-0">
                    <span className="text-xs font-semibold text-gray-600 flex items-center">
                        <GitBranch size={14} className="mr-2"/> {t('vis.visualTree')}
                    </span>
                    <div className="flex items-center space-x-2">
                        {plan && <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 font-medium mr-2">{t('vis.totalCost')}: {plan.cost}</span>}
                        <button 
                            onClick={() => toggleMaximize('visual')}
                            className="text-gray-400 hover:text-blue-600 transition-colors"
                        >
                            {maximizedPanel === 'visual' ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                        </button>
                        <button 
                            onClick={() => togglePanel('visual')}
                            className="text-gray-400 hover:text-red-500 transition-colors"
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-auto bg-[url('https://www.transparenttextures.com/patterns/graphy.png')] bg-gray-50 p-8 flex justify-center items-start">
                    {loading ? (
                        <div className="text-gray-400 mt-20 flex flex-col items-center animate-pulse">
                            <Database size={48} className="mb-4 text-blue-300"/>
                            <span>{t('vis.analyzing')}</span>
                        </div>
                    ) : plan ? (
                        <TreeNode node={plan} />
                    ) : (
                        <div className="text-gray-400 mt-20 flex flex-col items-center">
                            <MousePointer2 size={48} className="mb-4 text-gray-300"/>
                            <span>{t('vis.selectSql')}</span>
                        </div>
                    )}
                </div>
                
                {/* Node Details Overlay */}
                {selectedNode && (
                    <div className="absolute bottom-4 right-4 bg-white/95 backdrop-blur border border-gray-200 shadow-xl rounded-lg p-4 w-72 text-sm z-20 animate-in slide-in-from-bottom-5">
                         <h4 className="font-bold text-gray-800 border-b pb-2 mb-2 flex justify-between items-center">
                            <span className="flex items-center"><Zap size={14} className="text-yellow-500 mr-2"/> {selectedNode.operation}</span>
                            <button onClick={() => setSelectedNode(null)} className="text-gray-400 hover:text-gray-600"><ChevronDown size={16}/></button>
                         </h4>
                         <div className="space-y-2 text-xs">
                             <div className="grid grid-cols-3 gap-2 bg-gray-50 p-2 rounded">
                                 <div className="text-center border-r border-gray-200">
                                     <div className="text-gray-400 text-[10px]">{t('vis.node.cost')}</div>
                                     <div className="font-semibold text-gray-700">{selectedNode.cost}</div>
                                 </div>
                                 <div className="text-center border-r border-gray-200">
                                      <div className="text-gray-400 text-[10px]">{t('vis.node.rows')}</div>
                                      <div className="font-semibold text-gray-700">{selectedNode.rows}</div>
                                 </div>
                                 <div className="text-center">
                                      <div className="text-gray-400 text-[10px]">{t('vis.node.width')}</div>
                                      <div className="font-semibold text-gray-700">--</div>
                                 </div>
                             </div>
                             
                             <div className="pt-2">
                                <span className="text-gray-500 block mb-1">{t('vis.node.target')}:</span>
                                <span className="font-mono bg-blue-50 text-blue-700 px-2 py-1 rounded block truncate">
                                    {selectedNode.target || 'N/A'}
                                </span>
                             </div>

                             {selectedNode.details && (
                                <div className="mt-2">
                                    <span className="text-gray-500 block mb-1">{t('vis.node.details')}:</span>
                                    <div className="p-2 bg-gray-100 rounded text-gray-600 font-mono text-[10px] break-all border border-gray-200">
                                        {selectedNode.details}
                                    </div>
                                </div>
                             )}
                         </div>
                    </div>
                )}
            </div>
        </div>

        {/* Bottom Section */}
        {showBottomPanel && (
            <div className="h-2/5 flex gap-4 min-h-[200px] shrink-0 animate-in slide-in-from-bottom-5 fade-in duration-300">
                {/* Optimization Suggestions */}
                <div className="w-1/2 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                    <div className="bg-orange-50 px-4 py-2 border-b border-orange-100 shrink-0">
                        <span className="text-xs font-semibold text-orange-700 flex items-center">
                            <Zap size={14} className="mr-2"/> {t('vis.opt.suggestions')}
                        </span>
                    </div>
                    <div className="p-4 overflow-y-auto space-y-3">
                        {plan ? (
                            <>
                                {plan.cost > 1000 && (
                                    <div className="flex items-start p-3 bg-red-50 rounded-md border border-red-100">
                                        <AlertCircle size={16} className="text-red-500 mr-2 mt-0.5 flex-shrink-0"/>
                                        <div>
                                            <p className="text-sm font-medium text-red-800">{t('vis.opt.highCost')}</p>
                                            <p className="text-xs text-red-600 mt-1">
                                                {t('vis.opt.highCostDesc', {cost: plan.cost})}
                                            </p>
                                        </div>
                                    </div>
                                )}
                                <div className="flex items-start p-3 bg-blue-50 rounded-md border border-blue-100">
                                    <Zap size={16} className="text-blue-500 mr-2 mt-0.5 flex-shrink-0"/>
                                    <div>
                                        <p className="text-sm font-medium text-blue-800">{t('vis.opt.indexOpp')}</p>
                                        <p className="text-xs text-blue-600 mt-1">
                                            {t('vis.opt.indexOppDesc')}
                                        </p>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-gray-400 italic">
                                <Zap size={24} className="mb-2 opacity-50"/>
                                {t('vis.opt.loadToSee')}
                            </div>
                        )}
                    </div>
                </div>

                {/* WDR Hot SQLs */}
                <div className="w-1/2 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                    <div className="bg-gray-100 px-4 py-2 border-b border-gray-200 flex justify-between items-center shrink-0">
                        <span className="text-xs font-semibold text-gray-600 flex items-center">
                            <Database size={14} className="mr-2"/> {t('vis.hot.title')}
                        </span>
                        <button className="text-xs text-blue-600 hover:underline">{t('vis.hot.viewFull')}</button>
                    </div>
                    <div className="flex-1 overflow-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-gray-50 border-b sticky top-0">
                                <tr>
                                    <th className="px-4 py-2 text-gray-500">{t('vis.hot.preview')}</th>
                                    <th className="px-4 py-2 text-gray-500 text-right">{t('vis.hot.time')}</th>
                                    <th className="px-4 py-2 text-gray-500 text-right">{t('vis.hot.cost')}</th>
                                    <th className="px-4 py-2 text-center text-gray-500">{t('vis.hot.action')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {hotSqls.map(sql => (
                                    <tr key={sql.id} className="hover:bg-gray-50 group">
                                        <td className="px-4 py-2 font-mono text-gray-600 truncate max-w-[200px]" title={sql.sqlShort}>
                                            {sql.sqlShort}
                                        </td>
                                        <td className="px-4 py-2 text-right">{sql.totalTime}</td>
                                        <td className="px-4 py-2 text-right">{sql.cost}</td>
                                        <td className="px-4 py-2 text-center">
                                            <button 
                                                onClick={() => handleLoadSql(sql)}
                                                className="text-blue-600 hover:bg-blue-100 px-2 py-1 rounded transition-colors flex items-center justify-center mx-auto"
                                            >
                                                <ChevronRight size={14} /> {t('vis.hot.load')}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )}

        {/* Help Modal */}
        {showHelp && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden transform transition-all animate-in zoom-in-95 duration-200">
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                        <h3 className="font-semibold text-gray-800 text-lg flex items-center">
                            <BookOpen size={20} className="mr-2 text-blue-600" />
                            {t('vis.guide.title')}
                        </h3>
                        <button 
                            onClick={() => setShowHelp(false)} 
                            className="text-gray-400 hover:text-gray-600 transition-colors rounded-full p-1 hover:bg-gray-200"
                        >
                            <X size={20} />
                        </button>
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {/* Section: Scans */}
                            <div className="bg-white p-5 rounded-lg border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                                <h4 className="flex items-center text-blue-700 font-semibold mb-3 border-b border-blue-100 pb-2">
                                    <Search size={16} className="mr-2" /> {t('vis.guide.scans')}
                                </h4>
                                <div className="space-y-4">
                                    <div>
                                        <h5 className="text-sm font-bold text-gray-800">{t('vis.guide.seqScan')}</h5>
                                        <p className="text-xs text-gray-600 mt-1 leading-relaxed">{t('vis.guide.seqScanDesc')}</p>
                                    </div>
                                    <div>
                                        <h5 className="text-sm font-bold text-gray-800">{t('vis.guide.indexScan')}</h5>
                                        <p className="text-xs text-gray-600 mt-1 leading-relaxed">{t('vis.guide.indexScanDesc')}</p>
                                    </div>
                                    <div>
                                        <h5 className="text-sm font-bold text-gray-800">{t('vis.guide.bitmapScan')}</h5>
                                        <p className="text-xs text-gray-600 mt-1 leading-relaxed">{t('vis.guide.bitmapScanDesc')}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Section: Joins */}
                            <div className="bg-white p-5 rounded-lg border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                                <h4 className="flex items-center text-purple-700 font-semibold mb-3 border-b border-purple-100 pb-2">
                                    <Activity size={16} className="mr-2" /> {t('vis.guide.joins')}
                                </h4>
                                <div className="space-y-4">
                                    <div>
                                        <h5 className="text-sm font-bold text-gray-800">{t('vis.guide.nestLoop')}</h5>
                                        <p className="text-xs text-gray-600 mt-1 leading-relaxed">{t('vis.guide.nestLoopDesc')}</p>
                                    </div>
                                    <div>
                                        <h5 className="text-sm font-bold text-gray-800">{t('vis.guide.hashJoin')}</h5>
                                        <p className="text-xs text-gray-600 mt-1 leading-relaxed">{t('vis.guide.hashJoinDesc')}</p>
                                    </div>
                                    <div>
                                        <h5 className="text-sm font-bold text-gray-800">{t('vis.guide.mergeJoin')}</h5>
                                        <p className="text-xs text-gray-600 mt-1 leading-relaxed">{t('vis.guide.mergeJoinDesc')}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Section: Others */}
                            <div className="bg-white p-5 rounded-lg border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                                <h4 className="flex items-center text-green-700 font-semibold mb-3 border-b border-green-100 pb-2">
                                    <Layers size={16} className="mr-2" /> {t('vis.guide.others')}
                                </h4>
                                <div className="space-y-4">
                                    <div>
                                        <h5 className="text-sm font-bold text-gray-800">{t('vis.guide.agg')}</h5>
                                        <p className="text-xs text-gray-600 mt-1 leading-relaxed">{t('vis.guide.aggDesc')}</p>
                                    </div>
                                    <div className="p-3 bg-blue-50 rounded border border-blue-100 mt-4">
                                        <h5 className="text-xs font-bold text-blue-800 mb-1">Expert Tip</h5>
                                        <p className="text-[10px] text-blue-700 leading-normal">
                                            Cost is a dimensionless unit. <code className="font-mono bg-white px-1 rounded">1.0</code> represents the cost of reading one page sequentially. It combines CPU and I/O costs.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default PlanVisualizer;
