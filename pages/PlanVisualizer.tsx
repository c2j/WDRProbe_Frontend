import React, { useEffect, useState, useMemo, useRef } from 'react';
import { ApiService } from '../services/apiService';
import { ExecutionPlanNode, WdrHotSql } from '../types';
import { 
  Play, AlertCircle, Database, Zap, FileCode, MousePointer2, 
  GitBranch, AlignLeft, ChevronDown, ChevronRight, 
  Maximize2, Minimize2, X, Eye, EyeOff, PanelBottom,
  BarChart2, Link as LinkIcon, RefreshCw, Layers,
  ZoomIn, ZoomOut, RotateCcw, Search, Table, Scan
} from 'lucide-react';
import { useI18n } from '../context/I18nContext';

// --- Types ---

interface EnhancedNode extends Omit<ExecutionPlanNode, 'children'> {
    uId: string;
    width: number;
    totalCost: number; // This is usually the same as 'cost' in standard output but we make it explicit
    selfCost: number;
    percentage: number;
    isCteDef: boolean;
    isCteScan: boolean;
    cteName: string;
    children: EnhancedNode[];
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
}

// --- Helper Components ---

const TreeNode: React.FC<NodeViewProps> = ({ 
    node, maxCost, selectedNode, onSelect, hoveredCte, onHoverCte, highlightedTable 
}) => {
    const isSelected = selectedNode?.uId === node.uId;
    const isHighCost = node.percentage > 20;
    const isCte = node.isCteDef || node.isCteScan;
    const isHoveredCte = hoveredCte && (node.cteName === hoveredCte);
    
    // Check if node relates to highlighted table
    const relatesToTable = highlightedTable && node.operation.includes(highlightedTable);

    const handleCteEnter = () => {
        if (node.isCteDef || node.isCteScan) onHoverCte(node.cteName);
    };
    const handleCteLeave = () => {
        if (node.isCteDef || node.isCteScan) onHoverCte(null);
    };

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
                    ${relatesToTable ? 'ring-2 ring-purple-500 bg-purple-50' : ''}
                `}
            >
                {/* Cost Indicator Bar */}
                <div className="absolute top-0 left-0 h-1 bg-gray-100 w-full rounded-t-lg overflow-hidden">
                    <div 
                        className={`h-full ${isHighCost ? 'bg-red-500' : 'bg-blue-500'}`} 
                        style={{ width: `${(node.totalCost / maxCost) * 100}%` }}
                    ></div>
                </div>

                <div className="mt-1 flex items-center justify-between">
                    <span className="font-bold text-xs text-gray-700 truncate max-w-[140px]" title={node.operation}>
                        {node.operation}
                    </span>
                    {isHighCost && <AlertCircle size={12} className="text-red-500" />}
                </div>

                <div className="mt-1 grid grid-cols-2 gap-x-2 text-[10px] text-gray-500">
                    <div>Cost: <span className="font-mono text-gray-700">{node.cost.toFixed(1)}</span></div>
                    <div>Rows: <span className="font-mono text-gray-700">{node.rows}</span></div>
                </div>

                {node.isCteDef && (
                    <div className="mt-1 text-[9px] bg-purple-100 text-purple-700 px-1 rounded w-fit">CTE: {node.cteName}</div>
                )}
            </div>

            {/* Connecting Lines & Children */}
            {node.children.length > 0 && (
                <div className="flex flex-col items-center mt-4">
                    <div className="w-px h-4 bg-gray-300 mb-0"></div> {/* Line from parent to bar */}
                    <div className="relative flex space-x-4 pt-4 border-t border-gray-300"> {/* Horizontal bar */}
                        {node.children.map((child) => (
                             <div key={child.uId} className="relative flex flex-col items-center">
                                 {/* Vertical line from horizontal bar to child */}
                                 <div className="absolute -top-4 w-px h-4 bg-gray-300"></div>
                                 <TreeNode 
                                     node={child} 
                                     maxCost={maxCost} 
                                     selectedNode={selectedNode} 
                                     onSelect={onSelect}
                                     hoveredCte={hoveredCte}
                                     onHoverCte={onHoverCte}
                                     highlightedTable={highlightedTable}
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
    node, maxCost, selectedNode, onSelect, hoveredCte, onHoverCte, highlightedTable
}) => {
    // Flatten the tree for list view
    const flatten = (n: EnhancedNode, depth: number = 0): Array<{ node: EnhancedNode; depth: number }> => {
        let res = [{ node: n, depth }];
        n.children.forEach(c => {
            res = res.concat(flatten(c, depth + 1));
        });
        return res;
    };

    const flatList = useMemo(() => flatten(node), [node]);

    return (
        <div className="bg-white rounded border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-12 gap-4 p-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600">
                <div className="col-span-5">Operation</div>
                <div className="col-span-2 text-right">Cost</div>
                <div className="col-span-2 text-right">Rows</div>
                <div className="col-span-3">Cost Distribution</div>
            </div>
            <div className="divide-y divide-gray-100">
                {flatList.map(({ node: item, depth }) => {
                    const isSelected = selectedNode?.uId === item.uId;
                    const isHighlighted = highlightedTable && item.operation.includes(highlightedTable);
                    return (
                        <div 
                            key={item.uId}
                            onClick={() => onSelect(item)}
                            className={`grid grid-cols-12 gap-4 p-2 text-xs hover:bg-gray-50 cursor-pointer items-center ${isSelected ? 'bg-blue-50' : ''} ${isHighlighted ? 'bg-purple-50' : ''}`}
                        >
                            <div className="col-span-5 flex items-center" style={{ paddingLeft: `${depth * 16}px` }}>
                                <div className="mr-2 text-gray-400">
                                    {item.children.length > 0 ? <ChevronDown size={12}/> : <div className="w-3"/>}
                                </div>
                                <span className={`truncate font-mono ${item.percentage > 20 ? 'text-red-600 font-bold' : 'text-gray-700'}`}>
                                    {item.operation}
                                </span>
                            </div>
                            <div className="col-span-2 text-right font-mono text-gray-600">{item.cost.toFixed(1)}</div>
                            <div className="col-span-2 text-right font-mono text-gray-600">{item.rows}</div>
                            <div className="col-span-3 flex items-center">
                                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div 
                                        className={`h-full ${item.percentage > 20 ? 'bg-red-500' : 'bg-blue-500'}`} 
                                        style={{ width: `${(item.cost / maxCost) * 100}%` }}
                                    ></div>
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
  const [hotSqls, setHotSqls] = useState<WdrHotSql[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<EnhancedNode | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('tree');
  const [hoveredCte, setHoveredCte] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [highlightedTable, setHighlightedTable] = useState<string | null>(null);
  
  // Refs for Zoom to Fit
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Layout State
  const [visiblePanels, setVisiblePanels] = useState<Record<PanelType, boolean>>({
    sql: false, 
    text: true,
    visual: true
  });
  const [maximizedPanel, setMaximizedPanel] = useState<PanelType | null>(null);
  const [showBottomPanel, setShowBottomPanel] = useState(true);

  useEffect(() => {
    ApiService.getWdrHotSqls().then(setHotSqls);
  }, []);

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.1, 2));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.5));
  const handleResetZoom = () => setZoom(1);

  const handleZoomToFit = () => {
      if (!containerRef.current || !contentRef.current) return;
      
      const container = containerRef.current;
      const content = contentRef.current;
      
      // Approximate padding allowance
      const padding = 48; 
      const availableW = container.clientWidth - padding;
      const availableH = container.clientHeight - padding;
      
      const rect = content.getBoundingClientRect();
      // Avoid division by zero
      if (rect.width === 0 || rect.height === 0) return;

      // Get unscaled dimensions based on current zoom
      const unscaledW = rect.width / zoom;
      const unscaledH = rect.height / zoom;
      
      const scaleX = availableW / unscaledW;
      const scaleY = availableH / unscaledH;
      
      // Use the smaller scale to fit both dimensions
      let newScale = Math.min(scaleX, scaleY);
      // Clamp values
      newScale = Math.min(Math.max(newScale, 0.2), 2);
      
      setZoom(newScale);

      // Center the view after zoom update
      setTimeout(() => {
          if (container) {
              const scrollLeft = (container.scrollWidth - container.clientWidth) / 2;
              container.scrollTo({
                  left: scrollLeft,
                  top: 0, 
                  behavior: 'smooth'
              });
          }
      }, 50);
  };

  // Extract unique table names from the plan
  const extractedTables = useMemo(() => {
      if (!plan) return [];
      const tables = new Set<string>();
      
      const traverse = (node: EnhancedNode) => {
          // Regex to find table names (roughly: word after ' on ')
          const match = node.operation.match(/\son\s+([^\s]+)/);
          if (match && match[1] && !match[1].startsWith('"*SELECT*')) { // Exclude subquery placeholders
              tables.add(match[1]);
          }
          node.children.forEach(traverse);
      };
      
      traverse(plan);
      return Array.from(tables).sort();
  }, [plan]);

  // Parsing Logic
  const parseGaussDBPlan = (text: string): EnhancedNode | null => {
    const lines = text.split('\n').filter(l => l.trim() !== '');
    const nodeStack: { node: EnhancedNode; indent: number }[] = [];
    let root: EnhancedNode | null = null;
    let uidCounter = 0;

    // Added capture group 4 for width
    const costRegex = /\(cost=([\d\.]+)\.\.([\d\.]+) rows=(\d+) width=(\d+)\)/;
    
    // Helper to find parent
    const findParent = (indent: number) => {
        // Parent must have strictly less indent
        for (let i = nodeStack.length - 1; i >= 0; i--) {
            if (nodeStack[i].indent < indent) {
                return nodeStack[i].node;
            }
        }
        return null;
    };

    lines.forEach((line) => {
        const cleanLine = line.replace(/^[\s\|]*/, ''); 
        const indentMatch = line.match(/^[\s\|]*/);
        let indent = indentMatch ? indentMatch[0].length : 0;
        
        if (line.includes('->')) {
            indent = line.indexOf('->');
        } else if (line.trim().startsWith('CTE')) {
             indent = line.indexOf('CTE');
        }

        const costMatch = line.match(costRegex);
        let operation = cleanLine.split('(')[0].trim();
        if (operation.startsWith('->')) operation = operation.substring(2).trim();

        let isCteDef = false;
        let isCteScan = false;
        let cteName = '';

        if (operation.startsWith('CTE Scan on')) {
            isCteScan = true;
            cteName = operation.replace('CTE Scan on', '').split(' ')[0].trim();
        } else if (operation.startsWith('CTE') && !operation.startsWith('CTE Scan')) {
            isCteDef = true;
            cteName = operation.replace('CTE', '').trim();
        }

        const newNode: EnhancedNode = {
            id: `node_${uidCounter++}`,
            uId: `uid_${uidCounter}`,
            operation: operation,
            cost: costMatch ? parseFloat(costMatch[2]) : 0,
            rows: costMatch ? parseInt(costMatch[3]) : 0,
            width: costMatch ? parseInt(costMatch[4]) : 0, // Extract Width
            children: [],
            totalCost: costMatch ? parseFloat(costMatch[2]) : 0,
            selfCost: 0,
            percentage: 0,
            details: line.trim(),
            isCteDef,
            isCteScan,
            cteName
        };

        if (nodeStack.length === 0) {
            root = newNode;
            nodeStack.push({ node: newNode, indent: -1 }); 
        } else {
            const parent = findParent(indent);
            if (parent) {
                parent.children!.push(newNode);
                nodeStack.push({ node: newNode, indent });
            } else {
                if (!costMatch && nodeStack.length > 0) {
                    nodeStack[nodeStack.length - 1].node.details += '\n' + line.trim();
                } else {
                     if(root) root.children!.push(newNode);
                     nodeStack.push({node: newNode, indent});
                }
            }
        }
    });

    // Stats Calculation
    const calcStats = (n: EnhancedNode, total: number) => {
        let childCost = 0;
        n.children.forEach(c => {
            calcStats(c, total);
            childCost += c.totalCost;
        });
        n.selfCost = Math.max(0, n.totalCost - childCost); 
        if (n.children.length === 0) n.selfCost = n.totalCost;
        n.percentage = total > 0 ? (n.totalCost / total) * 100 : 0;
    };

    if (root) {
        calcStats(root, root.totalCost);
    }

    return root;
  };

  const handleParseText = () => {
      setLoading(true);
      setTimeout(() => {
          const parsed = parseGaussDBPlan(rawPlanText);
          setPlan(parsed);
          setLoading(false);
          setVisiblePanels({ ...visiblePanels, text: false, sql: false });
      }, 500);
  };

  const togglePanel = (type: PanelType) => {
    setVisiblePanels(prev => {
        const next = { ...prev, [type]: !prev[type] };
        if (!next[type] && maximizedPanel === type) {
            setMaximizedPanel(null);
        }
        return next;
    });
  };

  const toggleMaximize = (type: PanelType) => {
    setMaximizedPanel(prev => prev === type ? null : type);
  };

  const getPanelClasses = (type: PanelType) => {
    if (maximizedPanel) {
        return maximizedPanel === type ? 'w-full flex-1' : 'hidden';
    }
    if (!visiblePanels[type]) return 'hidden';
    
    const visibleCount = Object.values(visiblePanels).filter(Boolean).length;
    if (visibleCount === 1) return 'w-full flex-1';
    
    if (type === 'visual') return 'flex-1 min-w-[400px]';
    return 'w-[350px] shrink-0';
  };

  const PanelHeader = ({ title, icon: Icon, subtitle, type, customAction }: any) => (
    <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex justify-between items-center shrink-0 h-10">
        <span className="text-xs font-semibold text-gray-700 flex items-center">
            <Icon size={14} className="mr-2 text-blue-600"/> {title}
        </span>
        <div className="flex items-center space-x-2">
            {customAction}
            {subtitle && <span className="text-[10px] text-gray-400 mr-2 hidden sm:inline">{subtitle}</span>}
            <button onClick={() => toggleMaximize(type)} className="text-gray-400 hover:text-blue-600">
                {maximizedPanel === type ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button onClick={() => togglePanel(type)} className="text-gray-400 hover:text-red-500">
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
                 <button 
                    onClick={() => {
                        const demoPlan = `
                       Insert on gtd_trx_iam_manu_input  (cost=11157.38..11157.48 rows=4 width=110)
                         ->  Subquery Scan on "*SELECT*"  (cost=11157.38..11157.48 rows=4 width=110)
                               ->  HashAggregate  (cost=11157.38..11157.42 rows=4 width=100)
                                     Group By Key: "*SELECT* 1".seqno
                                     CTE phy_input
                                       ->  Nested Loop  (cost=0.00..18.86 rows=1 width=93)
                                             ->  Seq Scan on gtd_trx_iam_manu_input gis  (cost=0.00..14.23 rows=2 width=82)
                                             ->  Index Scan using idx_zoneno_brno on par_organ o  (cost=0.00..2.31 rows=1 width=21)
                                     ->  Append  (cost=0.00..11138.46 rows=4 width=100)
                                           ->  Subquery Scan on "*SELECT* 1"  (cost=0.00..9.08 rows=1 width=100)
                                                 ->  Nested Loop Anti Join  (cost=0.00..9.07 rows=1 width=64)
                                                       ->  Nested Loop  (cost=0.00..4.66 rows=1 width=64)
                                                             ->  CTE Scan on phy_input i  (cost=0.00..0.03 rows=1 width=82)
                                                             ->  Partition Iterator  (cost=0.00..2.31 rows=1 width=37)
                                                                   Iterations: PART
                                                                   ->  Partitioned Index Scan using ind2_dm_iam_net_host_d on dm_iam_net_host_d z  (cost=0.00..2.31 rows=1 width=37)
                                                       ->  Index Scan using pk_par_subprod on par_subprod p  (cost=0.00..4.40 rows=1 width=7)
                                           ->  Subquery Scan on "*SELECT* 2"  (cost=5.00..26.98 rows=1 width=100)
                                                 ->  Nested Loop  (cost=5.00..22.56 rows=1 width=66)
                                                       ->  CTE Scan on phy_input i  (cost=0.00..0.03 rows=1 width=82)
                                                       ->  Index Scan using pk_par_iam_prof_subcode on par_iam_prof_subcode p  (cost=0.00..2.29 rows=1 width=9)
                        `;
                        setRawPlanText(demoPlan);
                    }}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium px-2"
                 >
                    Load Complex Demo
                 </button>
            </div>
            <div className="flex items-center space-x-3">
                 {/* Cost Legend */}
                 <div className="flex items-center space-x-2 text-[10px] text-gray-500 bg-gray-50 px-2 py-1 rounded border border-gray-200 mr-2">
                    <span className="font-semibold text-gray-400 uppercase tracking-wider">Impact:</span>
                    <div className="flex items-center" title=">50% of Total Cost"><span className="w-2 h-2 rounded-full bg-[#b91c1c] mr-1"></span>&gt;50%</div>
                    <div className="flex items-center" title=">20% of Total Cost"><span className="w-2 h-2 rounded-full bg-orange-500 mr-1"></span>&gt;20%</div>
                    <div className="flex items-center" title=">5% of Total Cost"><span className="w-2 h-2 rounded-full bg-yellow-400 mr-1"></span>&gt;5%</div>
                    <div className="flex items-center" title=">1% of Total Cost"><span className="w-2 h-2 rounded-full bg-blue-400 mr-1"></span>&gt;1%</div>
                 </div>

                 <div className="flex items-center bg-gray-50 rounded border border-gray-200 p-0.5 mr-2">
                    {(['sql', 'text', 'visual'] as PanelType[]).map(type => (
                        <button
                            key={type}
                            onClick={() => togglePanel(type)}
                            className={`px-2 py-1 rounded text-xs font-medium flex items-center transition-colors ${
                                visiblePanels[type] ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                            }`}
                        >
                            {visiblePanels[type] ? <Eye size={12} className="mr-1"/> : <EyeOff size={12} className="mr-1"/>}
                            {type.toUpperCase()}
                        </button>
                    ))}
                 </div>
                 
                 <button
                    onClick={() => setShowBottomPanel(!showBottomPanel)}
                    className={`p-1.5 rounded border transition-colors ${showBottomPanel ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-white text-gray-400'}`}
                >
                    <PanelBottom size={16} />
                </button>

                <button onClick={handleParseText} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded text-sm flex items-center shadow-sm">
                    <Play size={14} className="mr-2"/> {t('vis.explain')}
                </button>
            </div>
        </div>

        {/* Main Content */}
        <div className="flex flex-1 gap-4 min-h-0">
            {/* SQL Editor */}
            <div className={`${getPanelClasses('sql')} flex flex-col bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden transition-all duration-300`}>
                <PanelHeader title={t('vis.sqlEditor')} icon={FileCode} subtitle={t('vis.syntax')} type="sql" />
                <textarea 
                    className="flex-1 p-4 font-mono text-sm resize-none focus:outline-none text-gray-700 bg-[#fbfbfb]"
                    value={sql}
                    onChange={(e) => setSql(e.target.value)}
                    placeholder={t('vis.pastePlaceholder')}
                />
            </div>

            {/* Raw Text Plan Input */}
            <div className={`${getPanelClasses('text')} flex flex-col bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden transition-all duration-300`}>
                <PanelHeader title={t('vis.planText')} icon={AlignLeft} subtitle="Paste Explain Output" type="text" />
                <textarea
                    className="flex-1 p-4 font-mono text-xs text-gray-600 whitespace-pre leading-relaxed bg-white focus:outline-none resize-none"
                    value={rawPlanText}
                    onChange={(e) => setRawPlanText(e.target.value)}
                    placeholder="Paste GaussDB explain plan here (Insert on ... -> ...)"
                />
            </div>

            {/* Visualizer Area */}
            <div className={`${getPanelClasses('visual')} flex flex-col bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden relative transition-all duration-300`}>
                 <div className="bg-gray-100 px-4 py-2 border-b border-gray-200 flex justify-between items-center shrink-0">
                    <div className="flex items-center space-x-4">
                        <span className="text-xs font-semibold text-gray-600 flex items-center">
                            {viewMode === 'tree' ? <GitBranch size={14} className="mr-2"/> : <BarChart2 size={14} className="mr-2"/>}
                            {viewMode === 'tree' ? t('vis.visualTree') : 'Cost Flow Analysis'}
                        </span>
                        {/* View Switcher */}
                        <div className="flex bg-gray-200 rounded p-0.5">
                            <button 
                                onClick={() => setViewMode('tree')}
                                className={`px-2 py-0.5 text-[10px] rounded font-medium ${viewMode === 'tree' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
                            >Tree</button>
                            <button 
                                onClick={() => setViewMode('flow')}
                                className={`px-2 py-0.5 text-[10px] rounded font-medium ${viewMode === 'flow' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
                            >Cost Flow</button>
                        </div>

                         {/* Zoom Controls (Only for Tree) */}
                         {viewMode === 'tree' && (
                            <div className="flex items-center bg-gray-200 rounded p-0.5 animate-in fade-in">
                                <button onClick={handleZoomOut} className="p-0.5 text-gray-600 hover:bg-white rounded shadow-sm" title="Zoom Out"><ZoomOut size={12}/></button>
                                <span className="text-[10px] w-8 text-center font-mono text-gray-600">{Math.round(zoom * 100)}%</span>
                                <button onClick={handleZoomIn} className="p-0.5 text-gray-600 hover:bg-white rounded shadow-sm" title="Zoom In"><ZoomIn size={12}/></button>
                                <div className="w-px h-3 bg-gray-300 mx-1"></div>
                                <button onClick={handleResetZoom} className="p-0.5 text-gray-600 hover:bg-white rounded shadow-sm" title="Reset"><RotateCcw size={12}/></button>
                                <div className="w-px h-3 bg-gray-300 mx-1"></div>
                                <button onClick={handleZoomToFit} className="p-0.5 text-gray-600 hover:bg-white rounded shadow-sm" title="Zoom to Fit"><Scan size={12}/></button>
                            </div>
                        )}
                    </div>
                    
                    <div className="flex items-center space-x-2">
                        {plan && <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 font-medium mr-2">{t('vis.totalCost')}: {plan.cost.toLocaleString()}</span>}
                        <button onClick={() => toggleMaximize('visual')} className="text-gray-400 hover:text-blue-600">
                            {maximizedPanel === 'visual' ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                        </button>
                    </div>
                </div>

                <div ref={containerRef} className="flex-1 overflow-auto bg-gray-50 p-6 relative">
                    {loading ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 animate-pulse">
                            <Database size={48} className="mb-4 text-blue-300"/>
                            <span>{t('vis.analyzing')}</span>
                        </div>
                    ) : plan ? (
                        viewMode === 'tree' ? (
                            <div 
                                ref={contentRef}
                                className="flex justify-center items-start min-w-max transition-transform duration-200 origin-top"
                                style={{ transform: `scale(${zoom})` }}
                            >
                                <TreeNode 
                                    node={plan} 
                                    maxCost={plan.totalCost} 
                                    selectedNode={selectedNode}
                                    onSelect={setSelectedNode}
                                    hoveredCte={hoveredCte}
                                    onHoverCte={setHoveredCte}
                                    highlightedTable={highlightedTable}
                                />
                            </div>
                        ) : (
                            <div className="w-full max-w-4xl mx-auto">
                                <CostFlowView 
                                    node={plan} 
                                    maxCost={plan.totalCost}
                                    selectedNode={selectedNode}
                                    onSelect={setSelectedNode}
                                    hoveredCte={hoveredCte}
                                    onHoverCte={setHoveredCte}
                                    highlightedTable={highlightedTable}
                                />
                            </div>
                        )
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400">
                            <MousePointer2 size={48} className="mb-4 text-gray-300"/>
                            <span>{t('vis.selectSql')} or Paste Plan</span>
                        </div>
                    )}
                </div>

                {/* Table List Overlay (Moved here, outside scroll container) */}
                {viewMode === 'tree' && extractedTables.length > 0 && (
                    <div className="absolute top-12 left-4 z-20 bg-white/95 backdrop-blur shadow-lg border border-gray-200 rounded-lg max-h-[300px] overflow-y-auto w-48 animate-in slide-in-from-left-5">
                        <div className="sticky top-0 bg-white border-b border-gray-100 px-3 py-2 flex items-center text-xs font-semibold text-gray-600">
                            <Table size={12} className="mr-1.5"/> Tables ({extractedTables.length})
                        </div>
                        <div className="py-1">
                            {extractedTables.map(tableName => (
                                <div 
                                    key={tableName}
                                    onClick={() => setHighlightedTable(highlightedTable === tableName ? null : tableName)}
                                    className={`px-3 py-1.5 text-xs cursor-pointer flex items-center justify-between group transition-colors ${
                                        highlightedTable === tableName ? 'bg-purple-100 text-purple-700' : 'hover:bg-gray-50 text-gray-600'
                                    }`}
                                >
                                    <span className="truncate" title={tableName}>{tableName}</span>
                                    {highlightedTable === tableName && <div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div>}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                
                {/* Node Details Overlay */}
                {selectedNode && (
                    <div className="absolute bottom-4 right-4 bg-white/95 backdrop-blur border border-gray-200 shadow-xl rounded-lg p-4 w-80 text-sm z-20 animate-in slide-in-from-bottom-5">
                         <h4 className="font-bold text-gray-800 border-b pb-2 mb-2 flex justify-between items-center">
                            <span className="flex items-center truncate max-w-[200px]">
                                <Zap size={14} className="text-yellow-500 mr-2"/> {selectedNode.operation}
                            </span>
                            <button onClick={() => setSelectedNode(null)} className="text-gray-400 hover:text-gray-600"><ChevronDown size={16}/></button>
                         </h4>
                         <div className="space-y-2 text-xs">
                             <div className="grid grid-cols-2 gap-2 bg-gray-50 p-2 rounded">
                                 <div>
                                     <div className="text-gray-400 text-[10px]">Total Cost</div>
                                     <div className="font-mono font-bold text-gray-700">{selectedNode.cost.toFixed(2)}</div>
                                 </div>
                                 <div className="text-right">
                                      <div className="text-gray-400 text-[10px]">Est. Rows</div>
                                      <div className="font-mono font-bold text-gray-700">{selectedNode.rows}</div>
                                 </div>
                             </div>
                             
                             {selectedNode.isCteDef && (
                                 <div className="bg-purple-50 p-2 rounded border border-purple-100 text-purple-800 font-medium">
                                     CTE Definition: {selectedNode.cteName}
                                 </div>
                             )}
                             
                             <div className="max-h-32 overflow-y-auto bg-gray-100 p-2 rounded border border-gray-200 font-mono text-[10px] text-gray-600 whitespace-pre-wrap">
                                 {selectedNode.details}
                             </div>
                         </div>
                    </div>
                )}
            </div>
        </div>

        {/* Bottom Panel */}
        {showBottomPanel && (
            <div className="h-48 flex gap-4 min-h-[150px] shrink-0 animate-in slide-in-from-bottom-5 fade-in duration-300">
                <div className="w-1/2 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                    <div className="bg-orange-50 px-4 py-2 border-b border-orange-100 shrink-0">
                        <span className="text-xs font-semibold text-orange-700 flex items-center">
                            <Zap size={14} className="mr-2"/> {t('vis.opt.suggestions')}
                        </span>
                    </div>
                    <div className="p-4 overflow-y-auto">
                        {plan && plan.cost > 10000 && (
                            <div className="flex items-start p-3 bg-red-50 rounded-md border border-red-100 mb-2">
                                <AlertCircle size={16} className="text-red-500 mr-2 mt-0.5 flex-shrink-0"/>
                                <div>
                                    <p className="text-sm font-medium text-red-800">Performance Warning</p>
                                    <p className="text-xs text-red-600 mt-1">
                                        Total cost is very high ({plan.cost.toFixed(0)}). The 'HashAggregate' and 'Subquery Scan' nodes contribute significantly. Check if partition pruning is effective.
                                    </p>
                                </div>
                            </div>
                        )}
                        <p className="text-xs text-gray-500 italic">Load a specific SQL to see more targeted indexing advice.</p>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default PlanVisualizer;