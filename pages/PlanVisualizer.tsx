
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { EnhancedNode, PlanIssue, PlanType, VisHistoryItem } from '../types';
import { 
  Play, AlertCircle, Database, Zap, FileCode, MousePointer2, 
  GitBranch, AlignLeft, ChevronDown, ChevronRight, ChevronUp,
  Maximize2, Minimize2, X, Eye, EyeOff,
  BarChart2, Link as LinkIcon, RefreshCw, Layers,
  ZoomIn, ZoomOut, RotateCcw, Search, Table, Scan,
  BookOpen, ThumbsUp, ThumbsDown, HardDrive, XOctagon, 
  FunctionSquare, ListOrdered, Sigma, CheckCircle, Info,
  Maximize, Minimize, ChevronsDown, ChevronsUp,
  Lightbulb, AlertTriangle, History, Trash2, Clock
} from 'lucide-react';
import { useI18n } from '../context/I18nContext';
import { usePlanContext } from '../context/PlanContext';
import { PLAN_OPERATORS_KB } from '../utils/knowledgeBaseData';

// --- Types ---
// PanelType is local UI state
type PanelType = 'sql' | 'text' | 'visual';

interface NodeViewProps {
    node: EnhancedNode;
    maxCost: number;
    selectedNode: EnhancedNode | null;
    onSelect: (node: EnhancedNode) => void;
    hoveredCte: string | null;
    onHoverCte: (cte: string | null) => void;
    highlightedTable: string | null;
    highlightedIssueNodes: string[];
    // Tree view specific props
    expandedIds?: Set<string>;
    onToggle?: (uId: string) => void;
    planType?: PlanType;
}

// --- Knowledge Base Types & Data ---

interface KnowledgeEntry {
    key: string;
    icon: any;
    keywords: string[];
}

function ArrowUpDownIcon(props: any) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/></svg> }
function CheckIcon(props: any) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> }

// Map keys to icons (Text content moved to utils/knowledgeBaseData.ts)
const KB_ICONS: Record<string, any> = {
    'hintLeading': GitBranch,
    'hintJoinMethod': RefreshCw,
    'hintRows': ListOrdered,
    'hintScan': Search,
    'hintStream': LinkIcon,
    'hintBlock': Layers,
    'hintOther': FileCode,
    'diskSpill': HardDrive,
    'cartesian': XOctagon,
    'userFunc': FunctionSquare,
    'rownum': ListOrdered,
    'idxOnlyScan': Zap,
    'bitmapScan': Layers,
    'partIter': Layers,
    'idxScan': Search,
    'seqScan': AlignLeft,
    'cteScan': FileCode,
    'subqueryScan': FileCode,
    'nestLoop': RefreshCw,
    'hashJoin': GitBranch,
    'mergeJoin': GitBranch,
    'append': LinkIcon,
    'result': CheckIcon,
    'materialize': Database,
    'agg': Sigma,
    'sort': ArrowUpDownIcon,
    'limit': Minimize2,
};

// --- Hint Analysis ---
const detectHints = (sql: string) => {
    const hints = new Set<string>();
    const matches = sql.matchAll(/\/\*\+\s*([\s\S]*?)\s*\*\//g);
    for (const match of matches) {
        const content = match[1].toLowerCase();
        if (content.includes('leading')) hints.add('hintLeading');
        if (content.match(/(nestloop|hashjoin|mergejoin|nestloop_index)/)) hints.add('hintJoinMethod');
        if (content.includes('rows')) hints.add('hintRows');
        if (content.match(/(tablescan|indexscan|indexonlyscan|bitmapscan)/)) hints.add('hintScan');
        if (content.match(/(broadcast|redistribute)/)) hints.add('hintStream');
        if (content.match(/(blockname)/)) hints.add('hintBlock');
        if (content.match(/(no_expand|no_gpc|predpush|wlmrule|use_cplan|use_gplan|material_subplan|materialize_inner|use_hash_agg|use_sort_agg)/)) hints.add('hintOther');
    }
    return Array.from(hints);
};

// --- Analysis Engine ---

const analyzePlan = (root: EnhancedNode, t: (key: string, params?: any) => string): PlanIssue[] => {
    const issues: PlanIssue[] = [];
    const ruleHits: Record<string, string[]> = {};
    const initHits = (id: string) => { if (!ruleHits[id]) ruleHits[id] = []; };
    
    // Rule 001: High Cost (Root check) - Risk
    if (root.totalCost > 1000) { 
        issues.push({
            ruleId: 'Gauss-XN-001',
            title: t('vis.rule.001.title'),
            severity: 'High',
            type: 'Risk',
            description: t('vis.rule.001.desc', { cost: root.totalCost.toFixed(0) }),
            suggestion: t('vis.rule.001.sugg'),
            nodeUIds: [root.uId]
        });
    }

    // Rule 006: Long Execution Time (Root check) - Risk
    if (root.actualTime !== undefined && root.actualTime > 3000) {
        issues.push({
            ruleId: 'Gauss-XN-006',
            title: t('vis.rule.006.title'),
            severity: 'High',
            type: 'Risk',
            description: t('vis.rule.006.desc', { time: root.actualTime.toFixed(2) }),
            suggestion: t('vis.rule.006.sugg'),
            nodeUIds: [root.uId]
        });
    }

    const traverseCheck = (node: EnhancedNode) => {
        const op = node.operation.toLowerCase();
        const details = (node.details || '').toLowerCase();

        // 002: Seq Scan > 10000 rows - Suggestion
        if (op.includes('seq scan') && node.rows > 10000 && node.cost > 100) {
            initHits('Gauss-XN-002'); ruleHits['Gauss-XN-002'].push(node.uId);
        }

        // 003: SubPlan - Suggestion
        if (op.includes('subplan') || op.includes('subquery scan')) {
             initHits('Gauss-XN-003'); ruleHits['Gauss-XN-003'].push(node.uId);
        }

        // 004: Cartesian (Nested Loop heuristic) - Risk
        if (op.includes('nested loop')) {
             const hasIndexChild = node.children.some(c => c.operation.toLowerCase().includes('index scan'));
             if (!hasIndexChild && !details.includes('join filter') && !details.includes('index cond')) {
                 initHits('Gauss-XN-004'); ruleHits['Gauss-XN-004'].push(node.uId);
             }
        }

        // 005: Partition Iterator - Risk
        if (op.includes('partition iterator')) {
            const iterMatch = details.match(/iterations:?\s*(\d+|part)/i);
            if (iterMatch) {
                const count = iterMatch[1].toLowerCase().includes('part') ? 9999 : parseInt(iterMatch[1]);
                if (count > 5) { initHits('Gauss-XN-005'); ruleHits['Gauss-XN-005'].push(node.uId); }
            } else if (!details.includes('iterations: 1')) {
                // Fallback: if details don't explicitly say 1, and it's an iterator, could be high risk
                initHits('Gauss-XN-005'); ruleHits['Gauss-XN-005'].push(node.uId); 
            }
        }

        // 007: Bitmap - Suggestion
        if (op.includes('bitmap heap scan')) {
            initHits('Gauss-XN-007'); ruleHits['Gauss-XN-007'].push(node.uId);
        }

        // 008: Disk Spill - Risk
        if (details.includes('disk') || details.includes('spill') || details.includes('external merge')) {
            initHits('Gauss-XN-008'); ruleHits['Gauss-XN-008'].push(node.uId);
        }

        // 009: Index Scan Filter - Suggestion
        if (op.includes('index scan') && details.includes('filter:')) {
            initHits('Gauss-XN-009'); ruleHits['Gauss-XN-009'].push(node.uId);
        }

        // 011: User Function - Risk
        if (details.includes('func') || details.includes('fnc')) {
            initHits('Gauss-XN-011'); ruleHits['Gauss-XN-011'].push(node.uId);
        }

        // 012: Update Set Subquery - Suggestion
        if (node.children.length >= 3) {
             const subplans = node.children.filter(c => c.operation.toLowerCase().includes('subquery') || c.operation.toLowerCase().includes('initplan'));
             if (subplans.length >= 3) {
                 initHits('Gauss-XN-012'); ruleHits['Gauss-XN-012'].push(node.uId);
             }
        }

        // 013: Rownum - Risk
        if (op.includes('rownum') && node.rows > 10000) {
            initHits('Gauss-XN-013'); ruleHits['Gauss-XN-013'].push(node.uId);
        }

        node.children.forEach(traverseCheck);
    };

    traverseCheck(root);

    const addRule = (id: string, ruleKeyPart: string, severity: 'High'|'Medium', type: 'Risk'|'Suggestion') => {
        if (ruleHits[id] && ruleHits[id].length > 0) {
            issues.push({ 
                ruleId: id, 
                title: t(`vis.rule.${ruleKeyPart}.title`), 
                severity,
                type, 
                description: `${t(`vis.rule.${ruleKeyPart}.desc`)} (Count: ${ruleHits[id].length})`, 
                suggestion: t(`vis.rule.${ruleKeyPart}.sugg`), 
                nodeUIds: ruleHits[id] 
            });
        }
    };

    addRule('Gauss-XN-002', '002', 'Medium', 'Suggestion');
    addRule('Gauss-XN-003', '003', 'Medium', 'Suggestion');
    addRule('Gauss-XN-004', '004', 'High', 'Risk');
    addRule('Gauss-XN-005', '005', 'High', 'Risk');
    addRule('Gauss-XN-007', '007', 'Medium', 'Suggestion');
    addRule('Gauss-XN-008', '008', 'High', 'Risk');
    addRule('Gauss-XN-009', '009', 'High', 'Suggestion');
    addRule('Gauss-XN-011', '011', 'High', 'Risk');
    addRule('Gauss-XN-012', '012', 'High', 'Suggestion');
    addRule('Gauss-XN-013', '013', 'High', 'Risk');

    return issues;
};

// --- Components ---

const HistorySidebar: React.FC<{ isOpen: boolean; onClose: () => void; onLoad: (item: VisHistoryItem) => void }> = ({ isOpen, onClose, onLoad }) => {
    const { t } = useI18n();
    const [history, setHistory] = useState<VisHistoryItem[]>([]);

    useEffect(() => {
        if (isOpen) {
            const saved = localStorage.getItem('wdr_vis_history');
            if (saved) {
                setHistory(JSON.parse(saved));
            }
        }
    }, [isOpen]);

    const handleDelete = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const newHistory = history.filter(h => h.id !== id);
        setHistory(newHistory);
        localStorage.setItem('wdr_vis_history', JSON.stringify(newHistory));
    };

    const handleClearAll = () => {
        setHistory([]);
        localStorage.removeItem('wdr_vis_history');
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-y-0 right-0 w-80 bg-white shadow-2xl z-50 flex flex-col transform transition-transform duration-300 animate-in slide-in-from-right">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                <h3 className="font-bold text-gray-700 flex items-center">
                    <History size={18} className="mr-2 text-blue-600"/>
                    History
                </h3>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                    <X size={18} />
                </button>
            </div>
            <div className="p-2 border-b border-gray-100 flex justify-end">
                <button onClick={handleClearAll} className="text-xs text-red-500 hover:text-red-700 flex items-center px-2 py-1">
                    <Trash2 size={12} className="mr-1"/> Clear All
                </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
                {history.length === 0 ? (
                    <div className="text-center text-gray-400 text-sm py-8">No history found.</div>
                ) : (
                    history.map(item => (
                        <div 
                            key={item.id}
                            onClick={() => { onLoad(item); onClose(); }}
                            className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm cursor-pointer hover:border-blue-400 hover:shadow-md transition-all group"
                        >
                            <div className="flex justify-between items-start mb-1">
                                <span className="text-xs font-bold text-gray-700 truncate max-w-[180px]">{item.name}</span>
                                <button onClick={(e) => handleDelete(item.id, e)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <X size={14}/>
                                </button>
                            </div>
                            <div className="flex items-center text-[10px] text-gray-400 mb-2">
                                <Clock size={10} className="mr-1"/>
                                {new Date(item.timestamp).toLocaleString()}
                            </div>
                            <div className="text-[10px] text-gray-500 font-mono bg-gray-100 p-1.5 rounded truncate">
                                {item.planText.substring(0, 50)}...
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

const KnowledgePanel: React.FC<{ isOpen: boolean; onClose: () => void; activeKey: string | null; detectedHints: string[] }> = ({ isOpen, onClose, activeKey, detectedHints }) => {
    const { t, language } = useI18n();
    const [searchTerm, setSearchTerm] = useState('');
    const refs = useRef<Record<string, HTMLDivElement | null>>({});

    useEffect(() => {
        if (isOpen && activeKey && refs.current[activeKey]) {
            refs.current[activeKey]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [isOpen, activeKey]);

    if (!isOpen) return null;

    // Use centralized PLAN_OPERATORS_KB
    const lang = language === 'zh' ? 'zh' : 'en';
    
    // Construct display list
    const listItems = Object.entries(PLAN_OPERATORS_KB).map(([key, data]) => ({
        key,
        icon: KB_ICONS[key] || Info, // Fallback icon
        ...data
    }));

    const filteredItems = listItems.filter(k => 
        k.title[lang].toLowerCase().includes(searchTerm.toLowerCase()) ||
        k.key.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Sort to show detected hints first if detectedHints is present
    const sortedItems = [...filteredItems].sort((a, b) => {
        const aDetected = detectedHints.includes(a.key);
        const bDetected = detectedHints.includes(b.key);
        if (aDetected && !bDetected) return -1;
        if (!aDetected && bDetected) return 1;
        return 0;
    });

    return (
        <div className="w-80 bg-white border-l border-gray-200 flex flex-col h-full shadow-xl z-20 transition-all duration-300">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h3 className="font-semibold text-gray-800 flex items-center">
                    <BookOpen size={18} className="mr-2 text-blue-600"/>
                    {t('vis.kb.title')}
                </h3>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                    <X size={18} />
                </button>
            </div>
            <div className="p-3 border-b border-gray-100 bg-white">
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-2.5 text-gray-400"/>
                    <input 
                        type="text" 
                        placeholder={t('vis.kb.search')}
                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
                {sortedItems.map(item => {
                    const isActive = item.key === activeKey;
                    const isDetected = detectedHints.includes(item.key);
                    const Icon = item.icon;
                    return (
                        <div 
                            key={item.key}
                            ref={el => { refs.current[item.key] = el; }}
                            className={`bg-white rounded-lg p-4 shadow-sm border transition-all duration-300 ${isActive ? 'border-blue-500 ring-2 ring-blue-100 transform scale-[1.02]' : isDetected ? 'border-purple-300 ring-2 ring-purple-50' : 'border-gray-100 hover:shadow-md'}`}
                        >
                            <div className="flex items-center mb-2">
                                <div className={`p-2 rounded-lg mr-3 ${isActive ? 'bg-blue-100 text-blue-600' : isDetected ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-600'}`}>
                                    <Icon size={18} />
                                </div>
                                <div>
                                    <h4 className={`font-bold text-sm ${isActive ? 'text-blue-700' : isDetected ? 'text-purple-700' : 'text-gray-800'}`}>{item.title[lang]}</h4>
                                    {isDetected && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-bold">Detected</span>}
                                </div>
                            </div>
                            <p className="text-xs text-gray-600 mb-3 leading-relaxed">{item.desc[lang]}</p>
                            <div className="space-y-2">
                                <div className="bg-green-50 p-2 rounded border border-green-100">
                                    <div className="flex items-center text-xs font-semibold text-green-700 mb-1"><ThumbsUp size={12} className="mr-1.5"/> {t('vis.kb.pros')}</div>
                                    <p className="text-[10px] text-green-800 leading-snug">{item.pros[lang]}</p>
                                </div>
                                <div className="bg-red-50 p-2 rounded border border-red-100">
                                    <div className="flex items-center text-xs font-semibold text-red-700 mb-1"><ThumbsDown size={12} className="mr-1.5"/> {t('vis.kb.cons')}</div>
                                    <p className="text-[10px] text-red-800 leading-snug">{item.cons[lang]}</p>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const TreeNode: React.FC<NodeViewProps> = ({ 
    node, maxCost, selectedNode, onSelect, hoveredCte, onHoverCte, highlightedTable, highlightedIssueNodes,
    expandedIds, onToggle, planType
}) => {
    const isSelected = selectedNode?.uId === node.uId;
    const isHighCost = node.percentage > 20;
    const isCte = node.isCteDef || node.isCteScan;
    const isHoveredCte = hoveredCte && (node.cteName === hoveredCte);
    const relatesToTable = highlightedTable && node.operation.includes(highlightedTable);
    const isIssueNode = highlightedIssueNodes.includes(node.uId);

    // Tree collapse state
    const isExpanded = expandedIds ? expandedIds.has(node.uId) : true;
    const hasChildren = node.children.length > 0;
    const hasSingleChild = node.children.length === 1;

    // Heuristics for icon display
    const detailsLower = (node.details || '').toLowerCase();
    const hasDiskSpill = detailsLower.includes('disk') || detailsLower.includes('spill') || detailsLower.includes('external merge');

    const handleCteEnter = () => { if (node.isCteDef || node.isCteScan) onHoverCte(node.cteName); };
    const handleCteLeave = () => { if (node.isCteDef || node.isCteScan) onHoverCte(null); };

    // Display Logic: For Analyze/Performance plans, Actual values are primary
    const showActual = planType !== 'Explain Only' && node.actualRows !== undefined;

    return (
        <div className="flex flex-col items-center">
            <div 
                id={`plan-node-${node.uId}`}
                onClick={(e) => { e.stopPropagation(); onSelect(node); }}
                onMouseEnter={handleCteEnter}
                onMouseLeave={handleCteLeave}
                className={`
                    relative p-3 rounded-lg border-2 shadow-sm cursor-pointer transition-all min-w-[200px] z-10 group
                    ${
                        isIssueNode ? 'border-red-500 ring-4 ring-yellow-400 bg-yellow-100 scale-105 z-20 animate-pulse' :
                        relatesToTable ? 'border-yellow-500 ring-4 ring-yellow-400 bg-yellow-100 scale-105 z-20' :
                        isHoveredCte ? 'border-gray-200 ring-2 ring-purple-400 bg-purple-50' :
                        isSelected ? 'border-blue-500 ring-2 ring-blue-200 bg-blue-50' : 
                        'border-gray-200 bg-white hover:border-blue-300'
                    }
                    ${isCte ? 'border-dashed' : ''}
                `}
            >
                <div className="absolute top-0 left-0 h-1 bg-gray-100 w-full rounded-t-lg overflow-hidden">
                    <div className={`h-full ${isHighCost ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${(node.totalCost / maxCost) * 100}%` }}></div>
                </div>
                <div className="mt-1 flex items-center justify-between">
                    <div className="flex items-center">
                         {node.nodeId && <span className="text-[9px] text-gray-400 mr-1.5 font-mono">#{node.nodeId}</span>}
                         <span className="font-bold text-xs text-gray-700 truncate max-w-[160px]" title={node.operation}>{node.operation}</span>
                    </div>
                    {isHighCost && <AlertCircle size={12} className="text-red-500 ml-1" />}
                    {hasDiskSpill && <span title="Disk Spill" className="ml-1"><HardDrive size={12} className="text-purple-600" /></span>}
                </div>
                
                <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px]">
                    {showActual ? (
                        <>
                            {/* Actual Values Primary */}
                            <div className="col-span-1 text-blue-700 font-bold" title="Actual Time">
                                A-Time: <span className="font-mono">{node.actualTime?.toFixed(2)}ms</span>
                            </div>
                            <div className="col-span-1 text-blue-700 font-bold" title="Actual Rows">
                                A-Rows: <span className="font-mono">{node.actualRows}</span>
                            </div>
                            
                            {/* Estimated Values Secondary */}
                            <div className="col-span-1 text-gray-400" title="Estimated Cost">
                                Cost: <span className="font-mono">{node.cost.toFixed(0)}</span>
                            </div>
                            <div className="col-span-1 text-gray-400" title="Estimated Rows">
                                E-Rows: <span className="font-mono">{node.rows}</span>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Estimated Values Primary */}
                            <div className="col-span-1 text-gray-600 font-medium" title="Estimated Cost">
                                Cost: <span className="font-mono">{node.cost.toFixed(1)}</span>
                            </div>
                            <div className="col-span-1 text-gray-600 font-medium" title="Estimated Rows">
                                Rows: <span className="font-mono">{node.rows}</span>
                            </div>
                            <div className="col-span-2 h-3"></div> {/* Spacer to keep card height consistent */}
                        </>
                    )}
                </div>

                {node.isCteDef && <div className="mt-1 text-[9px] bg-purple-100 text-purple-700 px-1 rounded w-fit">CTE: {node.cteName}</div>}

                {/* Expand/Collapse Toggle */}
                {hasChildren && onToggle && (
                    <div 
                        className="absolute -bottom-3 left-1/2 transform -translate-x-1/2 z-20"
                        onClick={(e) => { e.stopPropagation(); onToggle(node.uId); }}
                    >
                        <div className="bg-white border border-gray-300 rounded-full p-0.5 shadow-sm hover:bg-gray-100 cursor-pointer flex items-center justify-center w-5 h-5 text-gray-500 hover:text-blue-600">
                            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </div>
                    </div>
                )}
            </div>
            
            {/* Recursively render children if expanded */}
            {hasChildren && isExpanded && (
                <div className="flex flex-col items-center animate-in fade-in zoom-in-95 duration-200">
                    {hasSingleChild ? (
                        <>
                           {/* Direct single line connection */}
                           <div className="w-px h-6 bg-gray-300"></div>
                           <TreeNode 
                               node={node.children[0]} 
                               maxCost={maxCost} 
                               selectedNode={selectedNode} 
                               onSelect={onSelect}
                               hoveredCte={hoveredCte}
                               onHoverCte={onHoverCte}
                               highlightedTable={highlightedTable}
                               highlightedIssueNodes={highlightedIssueNodes}
                               expandedIds={expandedIds}
                               onToggle={onToggle}
                               planType={planType}
                           />
                        </>
                    ) : (
                        <>
                           {/* Multi-branch connection optimized for clean lines */}
                           <div className="w-px h-4 bg-gray-300"></div>
                           
                           <div className="flex w-full justify-center">
                               {node.children.map((child, index) => {
                                    const isFirst = index === 0;
                                    const isLast = index === node.children.length - 1;
                                    
                                    return (
                                         <div key={child.uId} className="flex flex-col items-center relative">
                                             {/* Connector Lines */}
                                             <div className="w-full h-4 relative">
                                                 {!isFirst && <div className="absolute top-0 left-0 w-1/2 h-px bg-gray-300"></div>}
                                                 {!isLast && <div className="absolute top-0 right-0 w-1/2 h-px bg-gray-300"></div>}
                                                 <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-full bg-gray-300"></div>
                                             </div>
                                             
                                             <div className="px-2">
                                                 <TreeNode 
                                                     node={child} 
                                                     maxCost={maxCost} 
                                                     selectedNode={selectedNode} 
                                                     onSelect={onSelect}
                                                     hoveredCte={hoveredCte}
                                                     onHoverCte={onHoverCte}
                                                     highlightedTable={highlightedTable}
                                                     highlightedIssueNodes={highlightedIssueNodes}
                                                     expandedIds={expandedIds}
                                                     onToggle={onToggle}
                                                     planType={planType}
                                                 />
                                             </div>
                                         </div>
                                    );
                               })}
                           </div>
                        </>
                    )}
                </div>
            )}
            
            {/* Show a small indicator if collapsed but children exist */}
            {hasChildren && !isExpanded && (
                <div className="w-px h-2 bg-gray-300 mb-0"></div>
            )}
        </div>
    );
};

const CostFlowView: React.FC<NodeViewProps> = ({ 
    node, maxCost, selectedNode, onSelect, highlightedTable, highlightedIssueNodes, planType
}) => {
    const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

    const toggleCollapse = (uId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setCollapsedIds(prev => {
            const next = new Set(prev);
            if (next.has(uId)) next.delete(uId);
            else next.add(uId);
            return next;
        });
    };

    const flatList = useMemo(() => {
        const res: Array<{ node: EnhancedNode; depth: number }> = [];
        const traverse = (n: EnhancedNode, depth: number) => {
            res.push({ node: n, depth });
            if (!collapsedIds.has(n.uId)) {
                n.children.forEach(c => traverse(c, depth + 1));
            }
        };
        traverse(node, 0);
        return res;
    }, [node, collapsedIds]);

    const isAnalyze = planType !== 'Explain Only';

    return (
        <div className="bg-white rounded border border-gray-200 overflow-hidden min-w-[800px]">
            <div className="grid grid-cols-12 gap-4 p-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600">
                <div className="col-span-6">Operation</div>
                {isAnalyze ? (
                    <>
                         <div className="col-span-2 text-right">Time (Act)</div>
                         <div className="col-span-2 text-right">Rows (Act/Est)</div>
                    </>
                ) : (
                    <>
                        <div className="col-span-2 text-right">Cost</div>
                        <div className="col-span-2 text-right">Rows (Est)</div>
                    </>
                )}
                <div className="col-span-2">Cost Distribution</div>
            </div>
            <div className="divide-y divide-gray-100">
                {flatList.map(({ node: item, depth }) => {
                    const isSelected = selectedNode?.uId === item.uId;
                    const isHighlighted = highlightedTable && item.operation.includes(highlightedTable);
                    const isIssue = highlightedIssueNodes.includes(item.uId);
                    
                    let rowBg = 'hover:bg-gray-50';
                    if (isSelected) rowBg = 'bg-blue-50';
                    if (isHighlighted) rowBg = 'bg-yellow-100 text-gray-900 font-medium';
                    if (isIssue) rowBg = 'bg-yellow-100 border-l-4 border-red-500';

                    return (
                        <div 
                            key={item.uId}
                            id={`plan-node-${item.uId}`}
                            onClick={() => onSelect(item)}
                            className={`grid grid-cols-12 gap-4 p-2 text-xs cursor-pointer items-center ${rowBg}`}
                        >
                            <div className="col-span-6 flex items-center" style={{ paddingLeft: `${depth * 16}px` }}>
                                <div 
                                    className="mr-2 text-gray-400 cursor-pointer hover:text-gray-600 w-4 flex justify-center"
                                    onClick={(e) => item.children.length > 0 && toggleCollapse(item.uId, e)}
                                >
                                    {item.children.length > 0 ? (
                                        collapsedIds.has(item.uId) ? <ChevronRight size={12}/> : <ChevronDown size={12}/>
                                    ) : <div className="w-3"/>}
                                </div>
                                <div className="flex items-center min-w-0">
                                    <span 
                                        className={`truncate font-mono ${item.percentage > 20 ? 'text-red-600 font-bold' : 'text-gray-700'}`}
                                        title={item.operation}
                                    >
                                        {item.operation}
                                    </span>
                                    {item.nodeId && <span className="ml-2 text-[10px] text-gray-400 font-mono shrink-0">#{item.nodeId}</span>}
                                </div>
                            </div>
                            
                            {isAnalyze ? (
                                <>
                                    <div className="col-span-2 text-right font-mono text-gray-800 font-medium">
                                        {item.actualTime?.toFixed(2)}ms
                                    </div>
                                    <div className="col-span-2 text-right font-mono">
                                        <span className="text-gray-900 font-bold">{item.actualRows}</span>
                                        <span className="text-gray-400 mx-1">/</span>
                                        <span className="text-gray-500">{item.rows}</span>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="col-span-2 text-right font-mono text-gray-600">{item.cost.toFixed(1)}</div>
                                    <div className="col-span-2 text-right font-mono text-gray-600">{item.rows}</div>
                                </>
                            )}

                            <div className="col-span-2 flex items-center">
                                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div className={`h-full ${item.percentage > 20 ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${(item.cost / maxCost) * 100}%` }}></div>
                                </div>
                                <span className="ml-2 w-8 text-right text-[10px] text-gray-500">{item.percentage.toFixed(1)}%</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// --- Main Component ---

const PlanVisualizer: React.FC = () => {
  const { t } = useI18n();
  // State from Context
  const { 
      visSql: sql, setVisSql: setSql,
      visRawPlanText: rawPlanText, setVisRawPlanText: setRawPlanText,
      visPlan: plan, setVisPlan: setPlan,
      visPlanType: planType, setVisPlanType: setPlanType,
      visIssues: planIssues, setVisIssues: setPlanIssues,
      visViewMode: viewMode, setVisViewMode: setViewMode
  } = usePlanContext();

  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<EnhancedNode | null>(null);
  // View mode is now global
  const [hoveredCte, setHoveredCte] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [highlightedTable, setHighlightedTable] = useState<string | null>(null);
  const [highlightedIssueNodes, setHighlightedIssueNodes] = useState<string[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // History State
  const [showHistory, setShowHistory] = useState(false);
  
  // Tree View State
  const [treeExpandedIds, setTreeExpandedIds] = useState<Set<string>>(new Set());

  const [showKnowledgeBase, setShowKnowledgeBase] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const issuesPanelRef = useRef<HTMLDivElement>(null);
  
  const [visiblePanels, setVisiblePanels] = useState<Record<PanelType, boolean>>({ sql: false, text: true, visual: true });
  const [maximizedPanel, setMaximizedPanel] = useState<PanelType | null>(null);
  // Removed unused setter setShowBottomPanel
  const [showBottomPanel] = useState(true);

  // Initialize tree expansion state when plan loads
  useEffect(() => {
    if (plan) {
        const allIds = new Set<string>();
        let count = 0;
        const traverse = (n: EnhancedNode) => {
            count++;
            allIds.add(n.uId);
            n.children.forEach(traverse);
        };
        traverse(plan);
        
        // Rule: If plan is large (>10 nodes), only expand first 2 levels initially
        if (count > 10) {
            const initialExpanded = new Set<string>();
            initialExpanded.add(plan.uId); // Level 0
            plan.children.forEach(c => {
                initialExpanded.add(c.uId); // Level 1
                // c.children.forEach(gc => initialExpanded.add(gc.uId)); // Level 2 (optional)
            });
            setTreeExpandedIds(initialExpanded);
        } else {
            setTreeExpandedIds(allIds);
        }
    }
  }, [plan]);

  // If there's already a plan (from context), ensure we hide text input if desired, or keep default
  useEffect(() => {
      if (plan) {
          setVisiblePanels(prev => ({ ...prev, text: false, sql: false }));
      }
  }, []); // Only run once on mount

  const saveToHistory = (s: string, p: string) => {
      if (!p.trim()) return;
      const historyKey = 'wdr_vis_history';
      const existingStr = localStorage.getItem(historyKey);
      let history: VisHistoryItem[] = existingStr ? JSON.parse(existingStr) : [];
      
      // Avoid dups if content is same as most recent
      if (history.length > 0 && history[0].planText === p && history[0].sql === s) {
          return;
      }

      const newItem: VisHistoryItem = {
          id: Date.now().toString(),
          timestamp: Date.now(),
          name: `Analysis ${new Date().toLocaleTimeString()}`,
          sql: s,
          planText: p
      };

      history = [newItem, ...history].slice(0, 30); // Keep last 30
      localStorage.setItem(historyKey, JSON.stringify(history));
  };

  const handleHistoryLoad = (item: VisHistoryItem) => {
      setSql(item.sql);
      setRawPlanText(item.planText);
      // Trigger parse with slight delay to ensure state updates
      setTimeout(() => {
          handleParseText(true); // pass true to skip save
      }, 50);
  };

  // Handle Tree Toggle
  const handleToggleTree = (uId: string) => {
      setTreeExpandedIds(prev => {
          const next = new Set(prev);
          if (next.has(uId)) next.delete(uId);
          else next.add(uId);
          return next;
      });
  };

  const handleExpandAll = () => {
      if (!plan) return;
      const allIds = new Set<string>();
      const traverse = (n: EnhancedNode) => {
          allIds.add(n.uId);
          n.children.forEach(traverse);
      };
      traverse(plan);
      setTreeExpandedIds(allIds);
  };

  const handleCollapseAll = () => {
      if (!plan) return;
      // Collapse all but root
      const rootOnly = new Set<string>([plan.uId]);
      setTreeExpandedIds(rootOnly);
  };

  const handleTableClick = (tableName: string | null) => {
      if (tableName === highlightedTable) {
          setHighlightedTable(null);
          return;
      }
      setHighlightedTable(tableName);

      // Auto-expand logic for Tree View
      if (tableName && plan && viewMode === 'tree') {
          const newExpanded = new Set(treeExpandedIds);
          let found = false;
          
          const findAndExpand = (n: EnhancedNode, path: string[]): boolean => {
              const currentPath = [...path, n.uId];
              const match = n.operation.includes(tableName);
              let childMatch = false;
              
              n.children.forEach(c => {
                  if (findAndExpand(c, currentPath)) childMatch = true;
              });

              if (match || childMatch) {
                  // Add self and all parents to expanded set
                  currentPath.forEach(id => newExpanded.add(id));
                  found = true;
                  return true;
              }
              return false;
          };

          findAndExpand(plan, []);
          
          if (found) {
              setTreeExpandedIds(newExpanded);
          }
      }
  };

  const scrollToIssues = () => {
      if (issuesPanelRef.current) {
          issuesPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Optionally highlight the issues panel slightly
          issuesPanelRef.current.classList.add('ring-2', 'ring-blue-400');
          setTimeout(() => issuesPanelRef.current?.classList.remove('ring-2', 'ring-blue-400'), 1000);
      }
  };

  // Auto-scroll to highlighted issue
  useEffect(() => {
    if (highlightedIssueNodes.length > 0) {
        // Small delay to ensure render
        setTimeout(() => {
            const targetId = highlightedIssueNodes[0];
            const element = document.getElementById(`plan-node-${targetId}`);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    }
  }, [highlightedIssueNodes, viewMode]);

  const detectedHints = useMemo(() => detectHints(sql), [sql]);

  const activeKnowledgeKey = useMemo(() => {
    if (!selectedNode) return null;
    const op = selectedNode.operation.toLowerCase();
    const details = (selectedNode.details || '').toLowerCase();
    if (details.includes('disk') || details.includes('spill') || details.includes('external merge')) return 'diskSpill';
    const match = Object.entries(PLAN_OPERATORS_KB).find(([key, data]) => data.keywords.some(kw => op.includes(kw)));
    return match ? match[0] : null;
  }, [selectedNode]);

  const maxSeverity = useMemo(() => {
      if (planIssues.some(i => i.severity === 'High')) return 'High';
      if (planIssues.some(i => i.severity === 'Medium')) return 'Medium';
      return 'Low';
  }, [planIssues]);

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.1, 2));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.5));
  const handleResetZoom = () => setZoom(1);
  const handleZoomToFit = () => {
      if (!containerRef.current || !contentRef.current) return;
      const container = containerRef.current;
      const content = contentRef.current;
      const padding = 48; 
      const availableW = container.clientWidth - padding;
      const availableH = container.clientHeight - padding;
      const rect = content.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const unscaledW = rect.width / zoom;
      const unscaledH = rect.height / zoom;
      const scaleX = availableW / unscaledW;
      const scaleY = availableH / unscaledH;
      let newScale = Math.min(scaleX, scaleY);
      newScale = Math.min(Math.max(newScale, 0.2), 2);
      setZoom(newScale);
      setTimeout(() => {
          if (container) {
              const scrollLeft = (container.scrollWidth - container.clientWidth) / 2;
              container.scrollTo({ left: scrollLeft, top: 0, behavior: 'smooth' });
          }
      }, 50);
  };

  const extractedTables = useMemo(() => {
      if (!plan) return [];
      const tables = new Set<string>();
      const traverse = (node: EnhancedNode) => {
          const match = node.operation.match(/\son\s+([^\s]+)/);
          if (match && match[1] && !match[1].startsWith('"*SELECT*')) tables.add(match[1]);
          node.children.forEach(traverse);
      };
      traverse(plan);
      return Array.from(tables).sort();
  }, [plan]);

  // Parsing Logic (Tabular & Text)
  const parseGaussDBPlan = (text: string): { root: EnhancedNode | null, type: PlanType } => {
      const isTabular = text.includes('|') && (text.includes('operation') || text.match(/^\s*\d+\s*\|/m));
      if (isTabular) {
          const root = parseTabularFormat(text);
          // Tabular in GaussDB is typically "Explain Performance" if it has A-time/A-rows
          return { root, type: 'Explain Performance' };
      } else {
          return parseTextFormat(text);
      }
  };

  const parseTextFormat = (text: string): { root: EnhancedNode | null, type: PlanType } => {
      const lines = text.split('\n').filter(l => l.trim() !== '');
      const nodeStack: { node: EnhancedNode; indent: number }[] = [];
      let root: EnhancedNode | null = null;
      let uidCounter = 0;
      let detectedType: PlanType = 'Explain Only';
      
      const costRegex = /\(cost=([\d\.]+)\.\.([\d\.]+) rows=(\d+) width=(\d+)\)/;
      // Regex for Analyze output e.g. (actual time=0.012..0.012 rows=1 loops=1)
      const analyzeRegex = /\(actual time=([\d\.]+)\.\.([\d\.]+) rows=(\d+) loops=(\d+)\)/;

      const findParent = (indent: number) => {
          for (let i = nodeStack.length - 1; i >= 0; i--) { if (nodeStack[i].indent < indent) return nodeStack[i].node; }
          return null;
      };
      
      lines.forEach((line) => {
          const cleanLine = line.replace(/^[\s\|]*/, ''); 
          const indentMatch = line.match(/^[\s\|]*/);
          let indent = indentMatch ? indentMatch[0].length : 0;
          if (line.includes('->')) indent = line.indexOf('->');
          else if (line.trim().startsWith('CTE')) indent = line.indexOf('CTE');
          
          const costMatch = line.match(costRegex);
          const analyzeMatch = line.match(analyzeRegex);
          
          if (analyzeMatch) detectedType = 'Explain Analyze';

          let operation = cleanLine.split('(')[0].trim();
          if (operation.startsWith('->')) operation = operation.substring(2).trim();
          let isCteDef = false, isCteScan = false, cteName = '';
          if (operation.startsWith('CTE Scan on')) { isCteScan = true; cteName = operation.replace('CTE Scan on', '').split(' ')[0].trim(); } 
          else if (operation.startsWith('CTE') && !operation.startsWith('CTE Scan')) { isCteDef = true; cteName = operation.replace('CTE', '').trim(); }
          
          const newNode: EnhancedNode = {
              id: `node_${uidCounter++}`, uId: `uid_${uidCounter}`, operation,
              cost: costMatch ? parseFloat(costMatch[2]) : 0, 
              rows: costMatch ? parseInt(costMatch[3]) : 0, 
              width: costMatch ? parseInt(costMatch[4]) : 0,
              children: [], totalCost: costMatch ? parseFloat(costMatch[2]) : 0, selfCost: 0, percentage: 0, details: line.trim(),
              isCteDef, isCteScan, cteName,
              actualTime: analyzeMatch ? parseFloat(analyzeMatch[2]) : undefined,
              actualRows: analyzeMatch ? parseInt(analyzeMatch[3]) : undefined,
              loops: analyzeMatch ? parseInt(analyzeMatch[4]) : undefined
          };

          if (nodeStack.length === 0) { root = newNode; nodeStack.push({ node: newNode, indent: -1 }); } 
          else {
              const parent = findParent(indent);
              if (parent) { parent.children.push(newNode); nodeStack.push({ node: newNode, indent }); } 
              else {
                  if (!costMatch && !analyzeMatch && nodeStack.length > 0) { 
                      nodeStack[nodeStack.length - 1].node.details += '\n' + line.trim(); 
                  } 
                  else if (root) { root.children.push(newNode); nodeStack.push({node: newNode, indent}); }
              }
          }
      });
      // Fixed: Cast root to EnhancedNode to access totalCost
      if(root) calcStats(root, (root as EnhancedNode).totalCost);
      return { root, type: detectedType };
  };

  const parseTabularFormat = (text: string): EnhancedNode | null => {
      const parts = text.split(/Predicate Information \(identified by plan id\)/i);
      const planPart = parts[0];
      const predicatePart = parts.length > 1 ? parts[1] : '';
      const predicateMap = new Map<string, string>();
      if (predicatePart) {
          const pLines = predicatePart.split('\n');
          let currentId = '';
          pLines.forEach(line => {
             const idMatch = line.match(/^\s*(\d+)\s*--/);
             if (idMatch) { currentId = idMatch[1]; predicateMap.set(currentId, line.trim()); } 
             else if (currentId && line.trim()) { predicateMap.set(currentId, predicateMap.get(currentId) + '\n' + line.trim()); }
          });
      }
      const lines = planPart.split('\n').filter(l => l.trim() && !l.includes('operation') && !l.startsWith('---'));
      const nodeStack: { node: EnhancedNode; indent: number }[] = [];
      let root: EnhancedNode | null = null;
      let uidCounter = 0;
      const findParent = (indent: number) => {
          for (let i = nodeStack.length - 1; i >= 0; i--) { if (nodeStack[i].indent < indent) return nodeStack[i].node; }
          return null;
      };
      lines.forEach(line => {
          const cols = line.split('|');
          if (cols.length < 2) return;
          const id = cols[0].trim();
          const opRaw = cols[1]; 
          // Tabular columns: id | operation | A-time | A-rows | E-rows | E-costs
          const aTime = cols.length > 2 ? parseFloat(cols[2].trim()) : undefined;
          const aRows = cols.length > 3 ? parseInt(cols[3].trim()) : undefined;
          const eRows = cols.length > 4 ? parseInt(cols[4].trim()) : 0;
          const lastCol = cols[cols.length - 1].trim();
          const costMatch = lastCol.match(/([\d\.]+)\.\.([\d\.]+)/);
          const totalCost = costMatch ? parseFloat(costMatch[2]) : (cols.length > 5 ? parseFloat(cols[5].trim()) : 0);
          
          let indent = 0;
          const arrowIdx = opRaw.indexOf('->');
          if (arrowIdx !== -1) { indent = arrowIdx; } else { indent = opRaw.search(/\S/); }
          let operation = opRaw.trim();
          if (operation.startsWith('->')) operation = operation.substring(2).trim();
          let isCteDef = false, isCteScan = false, cteName = '';
          if (operation.startsWith('CTE Scan on')) { isCteScan = true; cteName = operation.replace('CTE Scan on', '').split(' ')[0].trim(); } 
          else if (operation.startsWith('CTE') && !operation.startsWith('CTE Scan')) { isCteDef = true; cteName = operation.replace('CTE', '').trim(); }
          const newNode: EnhancedNode = {
              id: `node_${uidCounter++}`, uId: `uid_${uidCounter}`, nodeId: id, operation,
              cost: totalCost, rows: eRows, actualRows: aRows, actualTime: aTime, width: 0,
              children: [], totalCost: totalCost, selfCost: 0, percentage: 0,
              details: predicateMap.get(id) || line.trim(), isCteDef, isCteScan, cteName
          };
          if (nodeStack.length === 0) { root = newNode; nodeStack.push({ node: newNode, indent: -1 }); } 
          else {
              const parent = findParent(indent);
              if (parent) { parent.children.push(newNode); nodeStack.push({ node: newNode, indent }); } 
              else { if(root) root.children.push(newNode); nodeStack.push({node: newNode, indent}); }
          }
      });
      // Fixed: Cast root to EnhancedNode to access totalCost
      if(root) calcStats(root, (root as EnhancedNode).totalCost);
      return root;
  };

  const calcStats = (n: EnhancedNode, total: number) => {
      let childCost = 0;
      n.children.forEach(c => { calcStats(c, total); childCost += c.totalCost; });
      n.selfCost = Math.max(0, n.totalCost - childCost); 
      if (n.children.length === 0) n.selfCost = n.totalCost;
      n.percentage = total > 0 ? (n.totalCost / total) * 100 : 0;
  };

  const handleParseText = (skipSave = false) => {
      setLoading(true);
      setPlanIssues([]);
      setHighlightedIssueNodes([]);
      setTimeout(() => {
          const { root, type } = parseGaussDBPlan(rawPlanText);
          setPlan(root);
          setPlanType(type);
          if (root) {
              const issues = analyzePlan(root, t);
              setPlanIssues(issues);
              if (!skipSave) saveToHistory(sql, rawPlanText);
          }
          setLoading(false);
          setVisiblePanels({ ...visiblePanels, text: false, sql: false });
      }, 500);
  };

  const togglePanel = (type: PanelType) => {
    setVisiblePanels(prev => { const next = { ...prev, [type]: !prev[type] }; if (!next[type] && maximizedPanel === type) setMaximizedPanel(null); return next; });
  };
  const toggleMaximize = (type: PanelType) => { setMaximizedPanel(prev => prev === type ? null : type); };
  const getPanelClasses = (type: PanelType) => {
    if (maximizedPanel) return maximizedPanel === type ? 'w-full flex-1' : 'hidden';
    if (!visiblePanels[type]) return 'hidden';
    if (type === 'visual') return 'flex-1 min-w-[400px]';
    return 'w-[350px] shrink-0';
  };

  const PanelHeader = ({ title, icon: Icon, subtitle, type, customAction }: any) => (
    <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex justify-between items-center shrink-0 h-10">
        <span className="text-xs font-semibold text-gray-700 flex items-center"><Icon size={14} className="mr-2 text-blue-600"/> {title}</span>
        <div className="flex items-center space-x-2">
            {customAction}
            {subtitle && <span className="text-[10px] text-gray-400 mr-2 hidden sm:inline">{subtitle}</span>}
            <button onClick={() => toggleMaximize(type)} className="text-gray-400 hover:text-blue-600">{maximizedPanel === type ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</button>
            <button onClick={() => togglePanel(type)} className="text-gray-400 hover:text-red-500"><X size={14} /></button>
        </div>
    </div>
  );

  return (
    <div className={isFullscreen ? "fixed inset-0 z-50 bg-gray-50 flex flex-col p-4 h-screen w-screen overflow-hidden" : "flex flex-col h-[calc(100vh-100px)] gap-4"}>
        {/* Header */}
        <div className="flex justify-between items-center bg-white p-3 rounded-lg border border-gray-200 shadow-sm shrink-0">
            <div className="flex items-center space-x-3">
                 <h2 className="font-bold text-gray-700 flex items-center"><Zap className="mr-2 text-yellow-500" size={20}/>{t('vis.title')}</h2>
                 <span className="text-gray-300">|</span>
                 <button onClick={() => { setRawPlanText(`id | operation | A-time | A-rows | E-rows | E-costs\n 1 | -> Seq Scan on t1 | 3001 | 200000 | 200000 | 15000\n 2 | -> Nested Loop | 20 | 1 | 1 | 500\n 3 |    -> Index Scan | 10 | 1 | 1 | 50`); }} className="text-sm text-blue-600 hover:text-blue-800 font-medium px-2">Load Demo</button>
            </div>
            <div className="flex items-center space-x-3">
                 <button onClick={() => setShowHistory(true)} className="p-1.5 rounded text-gray-500 hover:text-blue-600 hover:bg-gray-100 mr-2" title="History">
                    <History size={18} />
                 </button>
                 <div className="flex items-center space-x-2 text-[10px] text-gray-500 bg-gray-50 px-2 py-1 rounded border border-gray-200 mr-2">
                    <span className="font-semibold text-gray-400 uppercase tracking-wider">Impact:</span>
                    <div className="flex items-center" title=">50% Cost"><span className="w-2 h-2 rounded-full bg-[#b91c1c] mr-1"></span>&gt;50%</div>
                    <div className="flex items-center" title=">20% Cost"><span className="w-2 h-2 rounded-full bg-orange-500 mr-1"></span>&gt;20%</div>
                 </div>
                 <div className="flex items-center bg-gray-50 rounded border border-gray-200 p-0.5 mr-2">
                    {(['sql', 'text', 'visual'] as PanelType[]).map(type => (
                        <button key={type} onClick={() => togglePanel(type)} className={`px-2 py-1 rounded text-xs font-medium flex items-center transition-colors ${visiblePanels[type] ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
                            {visiblePanels[type] ? <Eye size={12} className="mr-1"/> : <EyeOff size={12} className="mr-1"/>}{type.toUpperCase()}
                        </button>
                    ))}
                 </div>
                 <button 
                    onClick={() => setIsFullscreen(!isFullscreen)} 
                    className={`p-1.5 rounded border transition-colors ${isFullscreen ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-gray-400 border-gray-200 hover:text-blue-600'}`}
                    title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                 >
                    {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
                 </button>
                 <button onClick={() => handleParseText(false)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded text-sm flex items-center shadow-sm"><Play size={14} className="mr-2"/> {t('vis.explain')}</button>
            </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 gap-4 min-h-0 relative">
            <div className={`${getPanelClasses('sql')} flex flex-col bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden`}>
                <PanelHeader 
                    title={t('vis.sqlEditor')} 
                    icon={FileCode} 
                    subtitle={t('vis.syntax')} 
                    type="sql" 
                    customAction={
                        detectedHints.length > 0 && (
                            <button 
                                onClick={() => { 
                                    setShowKnowledgeBase(true); 
                                    // Ensure visual panel is visible to show KB 
                                    if (!visiblePanels.visual) togglePanel('visual');
                                }}
                                className="flex items-center px-2 py-0.5 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded text-[10px] mr-2 hover:bg-yellow-100 transition-colors animate-pulse"
                                title={`${detectedHints.length} Hints Detected`}
                            >
                                <Lightbulb size={10} className="mr-1 fill-yellow-500 text-yellow-600"/>
                                {detectedHints.length} Hints
                            </button>
                        )
                    }
                />
                <textarea className="flex-1 p-4 font-mono text-sm resize-none focus:outline-none text-gray-700 bg-[#fbfbfb]" value={sql} onChange={(e) => setSql(e.target.value)} placeholder={t('vis.pastePlaceholder')}/>
            </div>
            <div className={`${getPanelClasses('text')} flex flex-col bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden`}>
                <PanelHeader title={t('vis.planText')} icon={AlignLeft} subtitle="Paste Explain Output" type="text" />
                <textarea className="flex-1 p-4 font-mono text-xs text-gray-600 whitespace-pre leading-relaxed bg-white focus:outline-none resize-none" value={rawPlanText} onChange={(e) => setRawPlanText(e.target.value)} placeholder="Paste GaussDB explain plan here"/>
            </div>
            <div className={`${getPanelClasses('visual')} flex flex-row bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden relative`}>
                 <div className="flex-1 flex flex-col min-w-0">
                    <div className="bg-gray-100 px-4 py-2 border-b border-gray-200 flex justify-between items-center shrink-0">
                        <div className="flex items-center space-x-4">
                            <span className="text-xs font-semibold text-gray-600 flex items-center">
                                {viewMode === 'tree' ? <GitBranch size={14} className="mr-2"/> : <BarChart2 size={14} className="mr-2"/>}
                                {viewMode === 'tree' ? t('vis.visualTree') : 'Cost Flow Analysis'}
                            </span>
                            <div className="flex bg-gray-200 rounded p-0.5">
                                <button onClick={() => setViewMode('tree')} className={`px-2 py-0.5 text-[10px] rounded font-medium ${viewMode === 'tree' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>Tree</button>
                                <button onClick={() => setViewMode('flow')} className={`px-2 py-0.5 text-[10px] rounded font-medium ${viewMode === 'flow' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>Cost Flow</button>
                            </div>
                            {viewMode === 'tree' && (
                                <div className="flex items-center bg-gray-200 rounded p-0.5">
                                    <button onClick={handleExpandAll} className="p-0.5 text-gray-600 hover:bg-white rounded" title="Expand All"><ChevronsDown size={12}/></button>
                                    <button onClick={handleCollapseAll} className="p-0.5 text-gray-600 hover:bg-white rounded" title="Collapse All"><ChevronsUp size={12}/></button>
                                    <div className="w-px h-3 bg-gray-300 mx-1"></div>
                                    <button onClick={handleZoomOut} className="p-0.5 text-gray-600 hover:bg-white rounded"><ZoomOut size={12}/></button>
                                    <span className="text-[10px] w-8 text-center font-mono text-gray-600">{Math.round(zoom * 100)}%</span>
                                    <button onClick={handleZoomIn} className="p-0.5 text-gray-600 hover:bg-white rounded"><ZoomIn size={12}/></button>
                                    <div className="w-px h-3 bg-gray-300 mx-1"></div>
                                    <button onClick={handleResetZoom} className="p-0.5 text-gray-600 hover:bg-white rounded"><RotateCcw size={12}/></button>
                                    <button onClick={handleZoomToFit} className="p-0.5 text-gray-600 hover:bg-white rounded"><Scan size={12}/></button>
                                </div>
                            )}
                            <button onClick={() => setShowKnowledgeBase(!showKnowledgeBase)} className={`flex items-center px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${showKnowledgeBase ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'}`}><BookOpen size={12} className="mr-1.5"/> Knowledge</button>
                        </div>
                        <div className="flex items-center space-x-2">
                             {planIssues.length > 0 && (
                                <button 
                                    onClick={scrollToIssues}
                                    className={`flex items-center space-x-1 px-2 py-0.5 rounded border text-xs font-bold mr-2 hover:bg-opacity-80 transition-colors animate-pulse
                                        ${maxSeverity === 'High' 
                                            ? 'bg-red-100 text-red-700 border-red-200' 
                                            : maxSeverity === 'Medium' 
                                                ? 'bg-orange-100 text-orange-700 border-orange-200'
                                                : 'bg-blue-100 text-blue-700 border-blue-200'
                                        }
                                    `}
                                    title={`${planIssues.length} issues found. Click to view.`}
                                >
                                    <AlertTriangle size={12} />
                                    <span>{planIssues.length}</span>
                                </button>
                             )}
                             {plan && planType && (
                                <span className={`mr-2 px-2 py-0.5 rounded text-[10px] font-bold border ${
                                    planType === 'Explain Only' 
                                    ? 'bg-gray-100 text-gray-600 border-gray-200' 
                                    : 'bg-green-100 text-green-700 border-green-200'
                                }`}>
                                    {planType}
                                </span>
                            )}
                            {plan && <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 font-medium mr-2">{t('vis.totalCost')}: {plan.cost.toLocaleString()}</span>}
                            <button onClick={() => toggleMaximize('visual')} className="text-gray-400 hover:text-blue-600">{maximizedPanel === 'visual' ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</button>
                        </div>
                    </div>
                    <div className="flex-1 relative min-h-0">
                        <div ref={containerRef} className="h-full w-full overflow-auto bg-gray-50 p-6">
                            {loading ? (
                                <div className="h-full flex flex-col items-center justify-center text-gray-400 animate-pulse"><Database size={48} className="mb-4 text-blue-300"/><span>{t('vis.analyzing')}</span></div>
                            ) : plan ? (
                                viewMode === 'tree' ? (
                                    <div ref={contentRef} className="flex justify-center items-start min-w-max transition-transform duration-200 origin-top" style={{ transform: `scale(${zoom})` }}>
                                        <TreeNode 
                                            node={plan} 
                                            maxCost={plan.totalCost} 
                                            selectedNode={selectedNode} 
                                            onSelect={setSelectedNode} 
                                            hoveredCte={hoveredCte} 
                                            onHoverCte={setHoveredCte} 
                                            highlightedTable={highlightedTable} 
                                            highlightedIssueNodes={highlightedIssueNodes}
                                            expandedIds={treeExpandedIds}
                                            onToggle={handleToggleTree}
                                            planType={planType}
                                        />
                                    </div>
                                ) : (
                                    <div className="w-full">
                                        <CostFlowView 
                                            node={plan} 
                                            maxCost={plan.totalCost} 
                                            selectedNode={selectedNode} 
                                            onSelect={setSelectedNode} 
                                            hoveredCte={hoveredCte}
                                            onHoverCte={setHoveredCte}
                                            highlightedTable={highlightedTable} 
                                            highlightedIssueNodes={highlightedIssueNodes}
                                            planType={planType} 
                                        />
                                    </div>
                                )
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-gray-400"><MousePointer2 size={48} className="mb-4 text-gray-300"/><span>{t('vis.selectSql')} or Paste Plan</span></div>
                            )}
                        </div>
                        {viewMode === 'tree' && extractedTables.length > 0 && plan && (
                            <div className="absolute top-4 left-4 z-10 bg-white/95 backdrop-blur shadow-lg border border-gray-200 rounded-lg max-h-[300px] overflow-y-auto w-48 animate-in slide-in-from-left-5">
                                <div className="sticky top-0 bg-white border-b border-gray-100 px-3 py-2 flex items-center text-xs font-semibold text-gray-600"><Table size={12} className="mr-1.5"/> Tables ({extractedTables.length})</div>
                                <div className="py-1">
                                    {extractedTables.map(tableName => (
                                        <div key={tableName} onClick={() => handleTableClick(tableName)} className={`px-3 py-1.5 text-xs cursor-pointer flex items-center justify-between group transition-colors ${highlightedTable === tableName ? 'bg-yellow-100 text-yellow-800' : 'hover:bg-gray-50 text-gray-600'}`}>
                                            <span className="truncate" title={tableName}>{tableName}</span>
                                            {highlightedTable === tableName && <div className="w-1.5 h-1.5 rounded-full bg-yellow-500"></div>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {selectedNode && (
                            <div className="absolute bottom-4 right-4 bg-white/95 backdrop-blur border border-gray-200 shadow-xl rounded-lg p-4 w-80 text-sm z-10 animate-in slide-in-from-bottom-5">
                                <h4 className="font-bold text-gray-800 border-b pb-2 mb-2 flex justify-between items-center">
                                    <span className="flex items-center truncate max-w-[200px]"><Zap size={14} className="text-yellow-500 mr-2"/> {selectedNode.operation}</span>
                                    <button onClick={() => setSelectedNode(null)} className="text-gray-400 hover:text-gray-600"><ChevronDown size={16}/></button>
                                </h4>
                                <div className="space-y-2 text-xs">
                                    <div className="grid grid-cols-2 gap-2 bg-gray-50 p-2 rounded">
                                        <div><div className="text-gray-400 text-[10px]">Total Cost</div><div className="font-mono font-bold text-gray-700">{selectedNode.cost.toFixed(2)}</div></div>
                                        <div className="text-right"><div className="text-gray-400 text-[10px]">Est. Rows</div><div className="font-mono font-bold text-gray-700">{selectedNode.rows}</div></div>
                                    </div>
                                    {selectedNode.isCteDef && <div className="bg-purple-50 p-2 rounded border border-purple-100 text-purple-800 font-medium">CTE Definition: {selectedNode.cteName}</div>}
                                    <div className="max-h-32 overflow-y-auto bg-gray-100 p-2 rounded border border-gray-200 font-mono text-[10px] text-gray-600 whitespace-pre-wrap">{selectedNode.details}</div>
                                </div>
                            </div>
                        )}
                    </div>
                 </div>
                 <KnowledgePanel 
                    isOpen={showKnowledgeBase} 
                    onClose={() => setShowKnowledgeBase(false)} 
                    activeKey={activeKnowledgeKey} 
                    detectedHints={detectedHints} 
                 />
            </div>
            
            <HistorySidebar 
                isOpen={showHistory} 
                onClose={() => setShowHistory(false)} 
                onLoad={handleHistoryLoad} 
            />
        </div>

        {/* Bottom Panel: Optimization Suggestions */}
        {showBottomPanel && !isFullscreen && (
            <div ref={issuesPanelRef} className="h-48 flex gap-4 min-h-[150px] shrink-0 animate-in slide-in-from-bottom-5 fade-in duration-300">
                <div className="w-full bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                    <div className="bg-orange-50 px-4 py-2 border-b border-orange-100 shrink-0 flex justify-between">
                        <span className="text-xs font-semibold text-orange-700 flex items-center"><Zap size={14} className="mr-2"/> {t('vis.opt.suggestions')} & Risks</span>
                        {planIssues.length > 0 && <span className="text-xs font-bold text-orange-600 bg-orange-100 px-2 rounded-full">{planIssues.length} Issues Found</span>}
                    </div>
                    <div className="p-4 overflow-y-auto flex-1">
                        {planIssues.length > 0 ? (
                            <div className="space-y-3">
                                {planIssues.map((issue, idx) => {
                                    const isRisk = issue.type === 'Risk';
                                    const Icon = isRisk ? AlertTriangle : Lightbulb;
                                    const borderColor = isRisk ? 'border-red-100' : 'border-blue-100';
                                    const bgColor = isRisk ? 'bg-red-50' : 'bg-blue-50';
                                    const hoverBg = isRisk ? 'hover:bg-red-100' : 'hover:bg-blue-100';
                                    const iconColor = isRisk ? (issue.severity === 'High' ? 'text-red-600' : 'text-orange-500') : 'text-blue-600';
                                    const badgeColor = isRisk ? (issue.severity === 'High' ? 'bg-red-500' : 'bg-orange-400') : 'bg-blue-500';

                                    return (
                                        <div 
                                            key={idx} 
                                            onClick={() => setHighlightedIssueNodes(issue.nodeUIds)}
                                            className={`flex items-start p-3 rounded-md border cursor-pointer transition-colors ${bgColor} ${borderColor} ${hoverBg}`}
                                        >
                                            <Icon size={16} className={`mr-2 mt-0.5 flex-shrink-0 ${iconColor}`}/>
                                            <div>
                                                <div className="flex items-center space-x-2">
                                                    <span className="text-sm font-bold text-gray-800">{issue.title}</span>
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded text-white font-medium ${badgeColor}`}>{issue.severity}</span>
                                                    <span className="text-[10px] text-gray-400 font-mono">({issue.ruleId})</span>
                                                </div>
                                                <p className="text-xs text-gray-700 mt-1">{issue.description}</p>
                                                <p className="text-xs text-blue-600 mt-1 font-medium flex items-center"><Info size={12} className="mr-1"/> Suggestion: {issue.suggestion}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-gray-400">
                                <CheckCircle size={32} className="text-green-400 mb-2" />
                                <span className="text-sm">No critical issues detected by WDRProbe rules.</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default PlanVisualizer;
