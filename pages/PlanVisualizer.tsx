
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { ApiService } from '../services/apiService';
import { ExecutionPlanNode, WdrHotSql } from '../types';
import { 
  Play, AlertCircle, Database, Zap, FileCode, MousePointer2, 
  GitBranch, AlignLeft, ChevronDown, ChevronRight, 
  Maximize2, Minimize2, X, Eye, EyeOff, PanelBottom,
  BarChart2, Link as LinkIcon, RefreshCw, Layers,
  ZoomIn, ZoomOut, RotateCcw, Search, Table, Scan,
  BookOpen, ThumbsUp, ThumbsDown, HardDrive, XOctagon, 
  FunctionSquare, ListOrdered, Sigma, CheckCircle, Info,
  Maximize, Minimize
} from 'lucide-react';
import { useI18n } from '../context/I18nContext';

// --- Types ---

interface EnhancedNode extends Omit<ExecutionPlanNode, 'children'> {
    uId: string;
    width: number;
    totalCost: number; 
    selfCost: number;
    percentage: number;
    isCteDef: boolean;
    isCteScan: boolean;
    cteName: string;
    children: EnhancedNode[];
    nodeId?: string;
    actualRows?: number;
    actualTime?: number;
}

interface PlanIssue {
    ruleId: string;
    title: string;
    severity: 'High' | 'Medium' | 'Low';
    description: string;
    suggestion: string;
    nodeUIds: string[];
}

type ViewMode = 'tree' | 'flow';
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
}

// --- Knowledge Base Types & Data ---

interface KnowledgeEntry {
    key: string;
    i18nKey: string;
    icon: any;
    keywords: string[];
}

const KNOWLEDGE_KEYS: KnowledgeEntry[] = [
    { key: 'diskSpill', i18nKey: 'vis.kb.diskSpill', icon: HardDrive, keywords: [] },
    { key: 'cartesian', i18nKey: 'vis.kb.nestLoop', icon: XOctagon, keywords: [] },
    { key: 'userFunc', i18nKey: 'vis.kb.userFunc', icon: FunctionSquare, keywords: ['func', 'fnc'] },
    { key: 'rownum', i18nKey: 'vis.kb.rownum', icon: ListOrdered, keywords: ['rownum'] },
    { key: 'idxOnlyScan', i18nKey: 'vis.kb.idxOnlyScan', icon: Zap, keywords: ['index only scan'] },
    { key: 'bitmapScan', i18nKey: 'vis.kb.bitmapScan', icon: Layers, keywords: ['bitmap heap scan', 'bitmap index scan'] },
    { key: 'partIter', i18nKey: 'vis.kb.partIter', icon: Layers, keywords: ['partition iterator'] },
    { key: 'idxScan', i18nKey: 'vis.kb.idxScan', icon: Search, keywords: ['index scan', 'partitioned index scan'] },
    { key: 'seqScan', i18nKey: 'vis.kb.seqScan', icon: AlignLeft, keywords: ['seq scan', 'tablesample scan'] },
    { key: 'cteScan', i18nKey: 'vis.kb.cteScan', icon: FileCode, keywords: ['cte scan'] },
    { key: 'subqueryScan', i18nKey: 'vis.kb.subqueryScan', icon: FileCode, keywords: ['subquery scan', 'subplan'] },
    { key: 'nestLoop', i18nKey: 'vis.kb.nestLoop', icon: RefreshCw, keywords: ['nested loop'] },
    { key: 'hashJoin', i18nKey: 'vis.kb.hashJoin', icon: GitBranch, keywords: ['hash join', 'hash right join', 'hash left join', 'hash anti join'] },
    { key: 'mergeJoin', i18nKey: 'vis.kb.mergeJoin', icon: GitBranch, keywords: ['merge join'] },
    { key: 'append', i18nKey: 'vis.kb.append', icon: LinkIcon, keywords: ['append'] },
    { key: 'result', i18nKey: 'vis.kb.result', icon: CheckIcon, keywords: ['result'] },
    { key: 'materialize', i18nKey: 'vis.kb.materialize', icon: Database, keywords: ['materialize'] },
    { key: 'agg', i18nKey: 'vis.kb.agg', icon: Sigma, keywords: ['aggregate', 'group', 'hashaggregate', 'windowagg'] },
    { key: 'sort', i18nKey: 'vis.kb.sort', icon: ArrowUpDownIcon, keywords: ['sort'] },
    { key: 'limit', i18nKey: 'vis.kb.limit', icon: Minimize2, keywords: ['limit'] },
];

function ArrowUpDownIcon(props: any) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/></svg> }
function CheckIcon(props: any) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> }

// --- Analysis Engine ---

const analyzePlan = (root: EnhancedNode, t: (key: string, params?: any) => string): PlanIssue[] => {
    const issues: PlanIssue[] = [];
    const ruleHits: Record<string, string[]> = {};
    const initHits = (id: string) => { if (!ruleHits[id]) ruleHits[id] = []; };
    
    // Rule 001: High Cost (Root check)
    if (root.totalCost > 1000) { 
        issues.push({
            ruleId: 'Gauss-XN-001',
            title: t('vis.rule.001.title'),
            severity: 'High',
            description: t('vis.rule.001.desc', { cost: root.totalCost.toFixed(0) }),
            suggestion: t('vis.rule.001.sugg'),
            nodeUIds: [root.uId]
        });
    }

    // Rule 006: Long Execution Time (Root check)
    if (root.actualTime !== undefined && root.actualTime > 3000) {
        issues.push({
            ruleId: 'Gauss-XN-006',
            title: t('vis.rule.006.title'),
            severity: 'High',
            description: t('vis.rule.006.desc', { time: root.actualTime.toFixed(2) }),
            suggestion: t('vis.rule.006.sugg'),
            nodeUIds: [root.uId]
        });
    }

    const traverseCheck = (node: EnhancedNode) => {
        const op = node.operation.toLowerCase();
        const details = (node.details || '').toLowerCase();

        // 002: Seq Scan > 10000 rows
        if (op.includes('seq scan') && node.rows > 10000 && node.cost > 100) {
            initHits('Gauss-XN-002'); ruleHits['Gauss-XN-002'].push(node.uId);
        }

        // 003: SubPlan
        if (op.includes('subplan') || op.includes('subquery scan')) {
             initHits('Gauss-XN-003'); ruleHits['Gauss-XN-003'].push(node.uId);
        }

        // 004: Cartesian (Nested Loop heuristic)
        if (op.includes('nested loop')) {
             const hasIndexChild = node.children.some(c => c.operation.toLowerCase().includes('index scan'));
             if (!hasIndexChild && !details.includes('join filter') && !details.includes('index cond')) {
                 initHits('Gauss-XN-004'); ruleHits['Gauss-XN-004'].push(node.uId);
             }
        }

        // 005: Partition Iterator
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

        // 007: Bitmap
        if (op.includes('bitmap heap scan')) {
            initHits('Gauss-XN-007'); ruleHits['Gauss-XN-007'].push(node.uId);
        }

        // 008: Disk Spill
        if (details.includes('disk') || details.includes('spill') || details.includes('external merge')) {
            initHits('Gauss-XN-008'); ruleHits['Gauss-XN-008'].push(node.uId);
        }

        // 009: Index Scan Filter
        if (op.includes('index scan') && details.includes('filter:')) {
            // Check if filter contains columns from index? (Simplified: Just warn about Filter after Index)
            initHits('Gauss-XN-009'); ruleHits['Gauss-XN-009'].push(node.uId);
        }

        // 011: User Function
        if (details.includes('func') || details.includes('fnc')) {
            initHits('Gauss-XN-011'); ruleHits['Gauss-XN-011'].push(node.uId);
        }

        // 012: Update Set Subquery (Heuristic: Multiple identical subplans)
        if (node.children.length >= 3) {
             const subplans = node.children.filter(c => c.operation.toLowerCase().includes('subquery') || c.operation.toLowerCase().includes('initplan'));
             if (subplans.length >= 3) {
                 initHits('Gauss-XN-012'); ruleHits['Gauss-XN-012'].push(node.uId);
             }
        }

        // 013: Rownum
        if (op.includes('rownum') && node.rows > 10000) {
            initHits('Gauss-XN-013'); ruleHits['Gauss-XN-013'].push(node.uId);
        }

        node.children.forEach(traverseCheck);
    };

    traverseCheck(root);

    const addRule = (id: string, ruleKeyPart: string, severity: 'High'|'Medium') => {
        if (ruleHits[id] && ruleHits[id].length > 0) {
            issues.push({ 
                ruleId: id, 
                title: t(`vis.rule.${ruleKeyPart}.title`), 
                severity, 
                description: `${t(`vis.rule.${ruleKeyPart}.desc`)} (Count: ${ruleHits[id].length})`, 
                suggestion: t(`vis.rule.${ruleKeyPart}.sugg`), 
                nodeUIds: ruleHits[id] 
            });
        }
    };

    addRule('Gauss-XN-002', '002', 'Medium');
    addRule('Gauss-XN-003', '003', 'Medium');
    addRule('Gauss-XN-004', '004', 'High');
    addRule('Gauss-XN-005', '005', 'High');
    addRule('Gauss-XN-007', '007', 'Medium');
    addRule('Gauss-XN-008', '008', 'High');
    addRule('Gauss-XN-009', '009', 'High');
    addRule('Gauss-XN-011', '011', 'High');
    addRule('Gauss-XN-012', '012', 'High');
    addRule('Gauss-XN-013', '013', 'High');

    return issues;
};

// --- Components ---

const KnowledgePanel: React.FC<{ isOpen: boolean; onClose: () => void; activeKey: string | null }> = ({ isOpen, onClose, activeKey }) => {
    const { t } = useI18n();
    const [searchTerm, setSearchTerm] = useState('');
    const refs = useRef<Record<string, HTMLDivElement | null>>({});

    useEffect(() => {
        if (isOpen && activeKey && refs.current[activeKey]) {
            refs.current[activeKey]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [isOpen, activeKey]);

    if (!isOpen) return null;

    const filteredItems = KNOWLEDGE_KEYS.filter(k => 
        t(`${k.i18nKey}.title`).toLowerCase().includes(searchTerm.toLowerCase()) ||
        k.key.toLowerCase().includes(searchTerm.toLowerCase())
    );

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
                {filteredItems.map(item => {
                    const isActive = item.key === activeKey;
                    const Icon = item.icon;
                    return (
                        <div 
                            key={item.key}
                            ref={el => { refs.current[item.key] = el; }}
                            className={`bg-white rounded-lg p-4 shadow-sm border transition-all duration-300 ${isActive ? 'border-blue-500 ring-2 ring-blue-100 transform scale-[1.02]' : 'border-gray-100 hover:shadow-md'}`}
                        >
                            <div className="flex items-center mb-2">
                                <div className={`p-2 rounded-lg mr-3 ${isActive ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}`}>
                                    <Icon size={18} />
                                </div>
                                <h4 className={`font-bold text-sm ${isActive ? 'text-blue-700' : 'text-gray-800'}`}>{t(`${item.i18nKey}.title`)}</h4>
                            </div>
                            <p className="text-xs text-gray-600 mb-3 leading-relaxed">{t(`${item.i18nKey}.desc`)}</p>
                            <div className="space-y-2">
                                <div className="bg-green-50 p-2 rounded border border-green-100">
                                    <div className="flex items-center text-xs font-semibold text-green-700 mb-1"><ThumbsUp size={12} className="mr-1.5"/> {t('vis.kb.pros')}</div>
                                    <p className="text-[10px] text-green-800 leading-snug">{t(`${item.i18nKey}.pros`)}</p>
                                </div>
                                <div className="bg-red-50 p-2 rounded border border-red-100">
                                    <div className="flex items-center text-xs font-semibold text-red-700 mb-1"><ThumbsDown size={12} className="mr-1.5"/> {t('vis.kb.cons')}</div>
                                    <p className="text-[10px] text-red-800 leading-snug">{t(`${item.i18nKey}.cons`)}</p>
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
    node, maxCost, selectedNode, onSelect, hoveredCte, onHoverCte, highlightedTable, highlightedIssueNodes 
}) => {
    const isSelected = selectedNode?.uId === node.uId;
    const isHighCost = node.percentage > 20;
    const isCte = node.isCteDef || node.isCteScan;
    const isHoveredCte = hoveredCte && (node.cteName === hoveredCte);
    const relatesToTable = highlightedTable && node.operation.includes(highlightedTable);
    const isIssueNode = highlightedIssueNodes.includes(node.uId);

    // Heuristics for icon display
    const detailsLower = (node.details || '').toLowerCase();
    const hasDiskSpill = detailsLower.includes('disk') || detailsLower.includes('spill') || detailsLower.includes('external merge');

    const handleCteEnter = () => { if (node.isCteDef || node.isCteScan) onHoverCte(node.cteName); };
    const handleCteLeave = () => { if (node.isCteDef || node.isCteScan) onHoverCte(null); };

    return (
        <div className="flex flex-col items-center">
            <div 
                onClick={(e) => { e.stopPropagation(); onSelect(node); }}
                onMouseEnter={handleCteEnter}
                onMouseLeave={handleCteLeave}
                className={`
                    relative p-3 rounded-lg border-2 shadow-sm cursor-pointer transition-all min-w-[180px] z-10 bg-white
                    ${isSelected ? 'border-blue-500 ring-2 ring-blue-200 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}
                    ${isCte ? 'border-dashed' : ''}
                    ${isHoveredCte ? 'ring-2 ring-purple-400 bg-purple-50' : ''}
                    ${relatesToTable ? 'ring-2 ring-yellow-400 bg-yellow-50' : ''}
                    ${isIssueNode ? 'border-red-500 ring-4 ring-red-200 animate-pulse' : ''}
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
                <div className="mt-1 grid grid-cols-2 gap-x-2 text-[10px] text-gray-500">
                    <div>Cost: <span className="font-mono text-gray-700">{node.cost.toFixed(1)}</span></div>
                    <div>Rows: <span className="font-mono text-gray-700">{node.rows}</span></div>
                    {node.actualTime !== undefined && (
                        <div className="col-span-2 text-gray-400 border-t border-gray-100 mt-1 pt-1 flex justify-between">
                             <span>Time:</span> <span className="font-mono text-gray-600">{node.actualTime.toFixed(3)}ms</span>
                        </div>
                    )}
                </div>
                {node.isCteDef && <div className="mt-1 text-[9px] bg-purple-100 text-purple-700 px-1 rounded w-fit">CTE: {node.cteName}</div>}
            </div>
            {node.children.length > 0 && (
                <div className="flex flex-col items-center mt-4">
                    <div className="w-px h-4 bg-gray-300 mb-0"></div>
                    <div className="relative flex space-x-4 pt-4 border-t border-gray-300">
                        {node.children.map((child) => (
                             <div key={child.uId} className="relative flex flex-col items-center">
                                 <div className="absolute -top-4 w-px h-4 bg-gray-300"></div>
                                 <TreeNode 
                                     node={child} 
                                     maxCost={maxCost} 
                                     selectedNode={selectedNode} 
                                     onSelect={onSelect}
                                     hoveredCte={hoveredCte}
                                     onHoverCte={onHoverCte}
                                     highlightedTable={highlightedTable}
                                     highlightedIssueNodes={highlightedIssueNodes}
                                 />
                             </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

const CostFlowView: React.FC<NodeViewProps> = ({ 
    node, maxCost, selectedNode, onSelect, hoveredCte, onHoverCte, highlightedTable, highlightedIssueNodes
}) => {
    const flatten = (n: EnhancedNode, depth: number = 0): Array<{ node: EnhancedNode; depth: number }> => {
        let res = [{ node: n, depth }];
        n.children.forEach(c => { res = res.concat(flatten(c, depth + 1)); });
        return res;
    };
    const flatList = useMemo(() => flatten(node), [node]);

    return (
        <div className="bg-white rounded border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-12 gap-4 p-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600">
                <div className="col-span-5">Operation</div>
                <div className="col-span-2 text-right">Cost</div>
                <div className="col-span-2 text-right">Rows {node.actualRows !== undefined ? '(Act/Est)' : ''}</div>
                <div className="col-span-3">Cost Distribution</div>
            </div>
            <div className="divide-y divide-gray-100">
                {flatList.map(({ node: item, depth }) => {
                    const isSelected = selectedNode?.uId === item.uId;
                    const isHighlighted = highlightedTable && item.operation.includes(highlightedTable);
                    const isIssue = highlightedIssueNodes.includes(item.uId);
                    return (
                        <div 
                            key={item.uId}
                            onClick={() => onSelect(item)}
                            className={`grid grid-cols-12 gap-4 p-2 text-xs hover:bg-gray-50 cursor-pointer items-center 
                                ${isSelected ? 'bg-blue-50' : ''} 
                                ${isHighlighted ? 'bg-yellow-50' : ''}
                                ${isIssue ? 'bg-red-50 border-l-4 border-red-500' : ''}
                            `}
                        >
                            <div className="col-span-5 flex items-center" style={{ paddingLeft: `${depth * 16}px` }}>
                                <div className="mr-2 text-gray-400">{item.children.length > 0 ? <ChevronDown size={12}/> : <div className="w-3"/>}</div>
                                <div className="flex flex-col truncate">
                                    <span className={`truncate font-mono ${item.percentage > 20 ? 'text-red-600 font-bold' : 'text-gray-700'}`}>{item.operation}</span>
                                    {item.nodeId && <span className="text-[9px] text-gray-400">#{item.nodeId}</span>}
                                </div>
                            </div>
                            <div className="col-span-2 text-right font-mono text-gray-600">{item.cost.toFixed(1)}</div>
                            <div className="col-span-2 text-right font-mono text-gray-600">{item.actualRows !== undefined ? `${item.actualRows} / ${item.rows}` : item.rows}</div>
                            <div className="col-span-3 flex items-center">
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
  const [sql, setSql] = useState<string>('');
  const [rawPlanText, setRawPlanText] = useState<string>('');
  const [plan, setPlan] = useState<EnhancedNode | null>(null);
  const [planIssues, setPlanIssues] = useState<PlanIssue[]>([]);
  const [hotSqls, setHotSqls] = useState<WdrHotSql[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<EnhancedNode | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('tree');
  const [hoveredCte, setHoveredCte] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [highlightedTable, setHighlightedTable] = useState<string | null>(null);
  const [highlightedIssueNodes, setHighlightedIssueNodes] = useState<string[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const [showKnowledgeBase, setShowKnowledgeBase] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  
  const [visiblePanels, setVisiblePanels] = useState<Record<PanelType, boolean>>({ sql: false, text: true, visual: true });
  const [maximizedPanel, setMaximizedPanel] = useState<PanelType | null>(null);
  const [showBottomPanel, setShowBottomPanel] = useState(true);

  useEffect(() => { ApiService.getWdrHotSqls().then(setHotSqls); }, []);

  const activeKnowledgeKey = useMemo(() => {
    if (!selectedNode) return null;
    const op = selectedNode.operation.toLowerCase();
    const details = (selectedNode.details || '').toLowerCase();
    if (details.includes('disk') || details.includes('spill') || details.includes('external merge')) return 'diskSpill';
    const match = KNOWLEDGE_KEYS.find(k => k.keywords.some(kw => op.includes(kw)));
    return match ? match.key : null;
  }, [selectedNode]);

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
  const parseGaussDBPlan = (text: string): EnhancedNode | null => {
      const isTabular = text.includes('|') && (text.includes('operation') || text.match(/^\s*\d+\s*\|/m));
      return isTabular ? parseTabularFormat(text) : parseTextFormat(text);
  };

  const parseTextFormat = (text: string): EnhancedNode | null => {
      const lines = text.split('\n').filter(l => l.trim() !== '');
      const nodeStack: { node: EnhancedNode; indent: number }[] = [];
      let root: EnhancedNode | null = null;
      let uidCounter = 0;
      const costRegex = /\(cost=([\d\.]+)\.\.([\d\.]+) rows=(\d+) width=(\d+)\)/;
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
          let operation = cleanLine.split('(')[0].trim();
          if (operation.startsWith('->')) operation = operation.substring(2).trim();
          let isCteDef = false, isCteScan = false, cteName = '';
          if (operation.startsWith('CTE Scan on')) { isCteScan = true; cteName = operation.replace('CTE Scan on', '').split(' ')[0].trim(); } 
          else if (operation.startsWith('CTE') && !operation.startsWith('CTE Scan')) { isCteDef = true; cteName = operation.replace('CTE', '').trim(); }
          const newNode: EnhancedNode = {
              id: `node_${uidCounter++}`, uId: `uid_${uidCounter}`, operation,
              cost: costMatch ? parseFloat(costMatch[2]) : 0, rows: costMatch ? parseInt(costMatch[3]) : 0, width: costMatch ? parseInt(costMatch[4]) : 0,
              children: [], totalCost: costMatch ? parseFloat(costMatch[2]) : 0, selfCost: 0, percentage: 0, details: line.trim(),
              isCteDef, isCteScan, cteName
          };
          if (nodeStack.length === 0) { root = newNode; nodeStack.push({ node: newNode, indent: -1 }); } 
          else {
              const parent = findParent(indent);
              if (parent) { parent.children.push(newNode); nodeStack.push({ node: newNode, indent }); } 
              else {
                  if (!costMatch && nodeStack.length > 0) { nodeStack[nodeStack.length - 1].node.details += '\n' + line.trim(); } 
                  else if (root) { root.children.push(newNode); nodeStack.push({node: newNode, indent}); }
              }
          }
      });
      if(root) calcStats(root, root.totalCost);
      return root;
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
          const aTime = cols.length > 2 ? parseFloat(cols[2].trim()) : undefined;
          const aRows = cols.length > 3 ? parseInt(cols[3].trim()) : undefined;
          const eRows = cols.length > 4 ? parseInt(cols[4].trim()) : 0;
          const lastCol = cols[cols.length - 1].trim();
          const costMatch = lastCol.match(/([\d\.]+)\.\.([\d\.]+)/);
          const totalCost = costMatch ? parseFloat(costMatch[2]) : 0;
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
      if(root) calcStats(root, root.totalCost);
      return root;
  };

  const calcStats = (n: EnhancedNode, total: number) => {
      let childCost = 0;
      n.children.forEach(c => { calcStats(c, total); childCost += c.totalCost; });
      n.selfCost = Math.max(0, n.totalCost - childCost); 
      if (n.children.length === 0) n.selfCost = n.totalCost;
      n.percentage = total > 0 ? (n.totalCost / total) * 100 : 0;
  };

  const handleParseText = () => {
      setLoading(true);
      setPlanIssues([]);
      setHighlightedIssueNodes([]);
      setTimeout(() => {
          const parsed = parseGaussDBPlan(rawPlanText);
          setPlan(parsed);
          if (parsed) {
              const issues = analyzePlan(parsed, t);
              setPlanIssues(issues);
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
                 <button onClick={handleParseText} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded text-sm flex items-center shadow-sm"><Play size={14} className="mr-2"/> {t('vis.explain')}</button>
            </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 gap-4 min-h-0">
            <div className={`${getPanelClasses('sql')} flex flex-col bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden`}>
                <PanelHeader title={t('vis.sqlEditor')} icon={FileCode} subtitle={t('vis.syntax')} type="sql" />
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
                                        <TreeNode node={plan} maxCost={plan.totalCost} selectedNode={selectedNode} onSelect={setSelectedNode} hoveredCte={hoveredCte} onHoverCte={setHoveredCte} highlightedTable={highlightedTable} highlightedIssueNodes={highlightedIssueNodes} />
                                    </div>
                                ) : (
                                    <div className="w-full max-w-4xl mx-auto">
                                        <CostFlowView node={plan} maxCost={plan.totalCost} selectedNode={selectedNode} onSelect={setSelectedNode} hoveredCte={hoveredCte} onHoverCte={setHoveredCte} highlightedTable={highlightedTable} highlightedIssueNodes={highlightedIssueNodes} />
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
                                        <div key={tableName} onClick={() => setHighlightedTable(highlightedTable === tableName ? null : tableName)} className={`px-3 py-1.5 text-xs cursor-pointer flex items-center justify-between group transition-colors ${highlightedTable === tableName ? 'bg-yellow-100 text-yellow-800' : 'hover:bg-gray-50 text-gray-600'}`}>
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
                 <KnowledgePanel isOpen={showKnowledgeBase} onClose={() => setShowKnowledgeBase(false)} activeKey={activeKnowledgeKey} />
            </div>
        </div>

        {/* Bottom Panel: Optimization Suggestions */}
        {showBottomPanel && !isFullscreen && (
            <div className="h-48 flex gap-4 min-h-[150px] shrink-0 animate-in slide-in-from-bottom-5 fade-in duration-300">
                <div className="w-full bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                    <div className="bg-orange-50 px-4 py-2 border-b border-orange-100 shrink-0 flex justify-between">
                        <span className="text-xs font-semibold text-orange-700 flex items-center"><Zap size={14} className="mr-2"/> {t('vis.opt.suggestions')}</span>
                        {planIssues.length > 0 && <span className="text-xs font-bold text-orange-600 bg-orange-100 px-2 rounded-full">{planIssues.length} Issues Found</span>}
                    </div>
                    <div className="p-4 overflow-y-auto flex-1">
                        {planIssues.length > 0 ? (
                            <div className="space-y-3">
                                {planIssues.map((issue, idx) => (
                                    <div 
                                        key={idx} 
                                        onClick={() => setHighlightedIssueNodes(issue.nodeUIds)}
                                        className="flex items-start p-3 bg-red-50 rounded-md border border-red-100 cursor-pointer hover:bg-red-100 transition-colors"
                                    >
                                        <AlertCircle size={16} className={`mr-2 mt-0.5 flex-shrink-0 ${issue.severity === 'High' ? 'text-red-600' : 'text-orange-500'}`}/>
                                        <div>
                                            <div className="flex items-center space-x-2">
                                                <span className="text-sm font-bold text-gray-800">{issue.title}</span>
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded text-white font-medium ${issue.severity === 'High' ? 'bg-red-500' : 'bg-orange-400'}`}>{issue.severity}</span>
                                                <span className="text-[10px] text-gray-400 font-mono">({issue.ruleId})</span>
                                            </div>
                                            <p className="text-xs text-gray-700 mt-1">{issue.description}</p>
                                            <p className="text-xs text-blue-600 mt-1 font-medium flex items-center"><Info size={12} className="mr-1"/> Suggestion: {issue.suggestion}</p>
                                        </div>
                                    </div>
                                ))}
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
