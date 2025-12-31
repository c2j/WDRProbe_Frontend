
import React, { useEffect, useState } from 'react';
import { ApiService } from '../services/apiService';
import { ExecutionPlanNode, WdrHotSql } from '../types';
import { 
  Play, AlertCircle, Database, Zap, FileCode, MousePointer2, 
  GitBranch, AlignLeft, ChevronDown, ChevronRight, 
  Maximize2, Minimize2, X, Eye, EyeOff, PanelBottom,
  BarChart2, Link as LinkIcon, RefreshCw, Layers,
  ZoomIn, ZoomOut, RotateCcw, Search
} from 'lucide-react';
import { useI18n } from '../context/I18nContext';

type PanelType = 'sql' | 'text' | 'visual';
type ViewMode = 'tree' | 'flow';

// Enhanced Node type for UI state
interface EnhancedNode extends ExecutionPlanNode {
  uId: string; // Unique ID for rendering
  children: EnhancedNode[];
  totalCost: number;
  selfCost: number;
  percentage: number;
  width: number; // Added Width (Bytes)
  isCteDef?: boolean;
  cteName?: string;
  isCteScan?: boolean;
}

interface NodeViewProps {
  node: EnhancedNode;
  maxCost: number;
  selectedNode: EnhancedNode | null;
  onSelect: (node: EnhancedNode | null) => void;
  hoveredCte: string | null;
  onHoverCte: (name: string | null) => void;
  depth?: number;
}

// --- Visual Components (Defined outside to prevent re-render issues and export errors) ---

const CostFlowView: React.FC<NodeViewProps> = ({ 
  node, maxCost, selectedNode, onSelect, hoveredCte, onHoverCte, depth = 0 
}) => {
    // Cost-based Color Logic
    const ratio = maxCost > 0 ? node.cost / maxCost : 0;
    
    let barColor = 'bg-gray-300';
    let costTextColor = 'text-gray-500';

    if (ratio > 0.5) {
        barColor = 'bg-[#b91c1c]'; 
        costTextColor = 'text-[#b91c1c] font-bold';
    } else if (ratio > 0.2) {
        barColor = 'bg-orange-500';
        costTextColor = 'text-orange-600 font-semibold';
    } else if (ratio > 0.05) {
        barColor = 'bg-yellow-400'; 
        costTextColor = 'text-yellow-600';
    } else if (ratio > 0.01) {
        barColor = 'bg-blue-400';
        costTextColor = 'text-blue-600';
    } else if (node.operation.toLowerCase().includes('index')) {
        barColor = 'bg-green-500';
        costTextColor = 'text-green-600';
    } else if (ratio > 0) {
        barColor = 'bg-blue-300';
    }

    const [collapsed, setCollapsed] = useState(false);
    const isCteFocused = (node.isCteScan || node.isCteDef) && hoveredCte === node.cteName;
    
    // Icon Logic for Flow View
    const opLower = node.operation.toLowerCase();
    const isLoop = opLower.includes('nested loop');
    const isIndexScan = opLower.includes('index scan') || opLower.includes('bitmap index scan') || opLower.includes('index only scan');
    const isSeqScan = opLower.includes('seq scan');
    const isOtherScan = opLower.includes('scan') && !isIndexScan && !isSeqScan;

    return (
        <div className="flex flex-col w-full mb-1">
            <div 
              className={`flex items-center group relative h-8 rounded border transition-all duration-200 cursor-pointer overflow-hidden
                  ${selectedNode?.uId === node.uId ? 'ring-2 ring-blue-500 z-10' : 'border-white'}
                  ${isCteFocused ? 'bg-yellow-100 ring-2 ring-yellow-400' : 'bg-gray-100 hover:bg-gray-200'}
              `}
              style={{ marginLeft: `${depth * 20}px` }}
              onClick={(e) => { e.stopPropagation(); onSelect(node); }}
              onMouseEnter={() => (node.isCteScan || node.isCteDef) && onHoverCte(node.cteName || null)}
              onMouseLeave={() => onHoverCte(null)}
            >
                {/* Cost Bar Background */}
                <div 
                  className={`absolute left-0 top-0 bottom-0 transition-all opacity-20 ${barColor}`} 
                  style={{ width: `${node.percentage}%` }}
                ></div>

                <div className="flex items-center px-2 w-full z-10">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setCollapsed(!collapsed); }}
                      className={`mr-2 p-0.5 rounded hover:bg-black/10 ${node.children.length === 0 ? 'invisible' : ''}`}
                    >
                        {collapsed ? <ChevronRight size={12}/> : <ChevronDown size={12}/>}
                    </button>
                    
                    <div className="flex-1 flex justify-between items-center text-xs">
                        <div className="flex items-center truncate">
                            {/* Icon Indicator for Flow View */}
                            {isLoop && <RefreshCw size={12} className="mr-1.5 text-gray-500" />}
                            {isIndexScan && <Search size={12} className="mr-1.5 text-green-600" />}
                            {isSeqScan && <AlignLeft size={12} className="mr-1.5 text-orange-600" />}
                            {isOtherScan && <Database size={12} className="mr-1.5 text-blue-500" />}
                            {!isLoop && !isIndexScan && !isSeqScan && !isOtherScan && <Layers size={12} className="mr-1.5 text-gray-400" />}
                            
                            <span className="font-semibold mr-2">{node.operation}</span>
                            {node.isCteDef && <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] mr-2">CTE Def: {node.cteName}</span>}
                            {node.isCteScan && <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded text-[10px] mr-2">CTE Scan: {node.cteName}</span>}
                            <span className="text-gray-500 truncate">{node.details?.split('\n').filter(l=>!l.includes('cost=') && !l.includes(node.operation)).join(' ').substring(0, 50)}</span>
                        </div>
                        <div className="flex items-center space-x-3 text-gray-500 font-mono text-[10px]">
                            <span title="Estimated Rows">Rows: {node.rows}</span>
                            <span title="Estimated Row Width" className="text-gray-400">Width: {node.width}B</span>
                            <span className={`${costTextColor} text-xs`} title="Total Cost">Cost: {node.cost.toFixed(1)}</span>
                        </div>
                    </div>
                </div>
            </div>
            
            {!collapsed && node.children.map(child => (
                <CostFlowView 
                    key={child.uId} 
                    node={child} 
                    depth={depth + 1} 
                    maxCost={maxCost}
                    selectedNode={selectedNode}
                    onSelect={onSelect}
                    hoveredCte={hoveredCte}
                    onHoverCte={onHoverCte}
                />
            ))}
        </div>
    );
};

const TreeNode: React.FC<NodeViewProps> = ({ 
  node, maxCost, selectedNode, onSelect, hoveredCte, onHoverCte 
}) => {
  const [collapsed, setCollapsed] = useState(false);
  
  // Cost-based styling logic (Heatmap)
  const ratio = maxCost > 0 ? node.cost / maxCost : 0;
  
  let borderColor = 'border-gray-200';
  let bgColor = 'bg-white';
  let costTextColor = 'text-gray-500';

  if (ratio > 0.5) {
      borderColor = 'border-[#b91c1c]'; 
      bgColor = 'bg-red-50';
      costTextColor = 'text-[#b91c1c] font-bold';
  } else if (ratio > 0.2) {
      borderColor = 'border-orange-500';
      bgColor = 'bg-orange-50';
      costTextColor = 'text-orange-600 font-semibold';
  } else if (ratio > 0.05) {
      borderColor = 'border-yellow-400';
      bgColor = 'bg-yellow-50';
      costTextColor = 'text-yellow-600';
  } else if (ratio > 0.01) {
      borderColor = 'border-blue-400';
      bgColor = 'bg-blue-50/20';
      costTextColor = 'text-blue-600';
  } else if (node.operation.toLowerCase().includes('index')) {
      borderColor = 'border-green-500';
      bgColor = 'bg-green-50/20';
      costTextColor = 'text-green-600';
  }

  const isCteFocused = (node.isCteScan || node.isCteDef) && hoveredCte === node.cteName;
  
  // Shape & Icon Logic
  const opLower = node.operation.toLowerCase();
  const isLoop = opLower.includes('nested loop');
  const isIndexScan = opLower.includes('index scan') || opLower.includes('bitmap index scan') || opLower.includes('index only scan');
  const isSeqScan = opLower.includes('seq scan');
  const isOtherScan = opLower.includes('scan') && !isIndexScan && !isSeqScan;
  const isAnyScan = isIndexScan || isSeqScan || isOtherScan;

  let containerClass = '';
  let innerClass = '';
  let borderStyleClass = 'border-t border-r border-b';

  if (isLoop) {
      // Loop: Pill/Oval Shape
      containerClass = 'rounded-[1.5rem] border-2 px-3 py-2';
      borderStyleClass = ''; // Full border for pills
  } else if (isAnyScan) {
      // Scan: Parallelogram (Skewed)
      containerClass = 'rounded-sm border-l-4 -skew-x-6 px-2 py-1.5';
      innerClass = 'skew-x-6';
      borderStyleClass = 'border-t border-r border-b';
  } else {
      // Default: Rounded Rectangle
      containerClass = 'rounded-md border-l-4 px-1.5 py-1.5';
      borderStyleClass = 'border-t border-r border-b';
  }

  return (
    <div className="flex flex-col items-center relative px-1">
      {/* Node Box */}
      <div 
          onClick={(e) => { e.stopPropagation(); onSelect(node); }}
          onMouseEnter={() => (node.isCteScan || node.isCteDef) && onHoverCte(node.cteName || null)}
          onMouseLeave={() => onHoverCte(null)}
          className={`
              relative z-10 shadow-sm cursor-pointer transition-all min-w-[150px] max-w-[220px] group
              ${containerClass}
              ${borderColor}
              ${bgColor}
              ${borderStyleClass}
              ${selectedNode?.uId === node.uId ? 'ring-2 ring-blue-500 ring-offset-1' : ''}
              ${isCteFocused ? 'ring-2 ring-yellow-400 transform scale-105' : ''}
          `}
      >
          <div className={`${innerClass} flex flex-col`}>
              <div className="font-semibold text-[10px] text-gray-800 mb-0.5 flex items-center justify-between">
                  <span className="truncate mr-1 flex items-center" title={node.operation}>
                      {isLoop && <RefreshCw size={10} className="mr-1 text-gray-400"/>}
                      {isIndexScan && <Search size={10} className="mr-1 text-green-600"/>}
                      {isSeqScan && <AlignLeft size={10} className="mr-1 text-orange-600"/>}
                      {isOtherScan && <Database size={10} className="mr-1 text-blue-500"/>}
                      {!isLoop && !isIndexScan && !isSeqScan && !isOtherScan && <Layers size={10} className="mr-1 text-gray-400"/>}
                      {node.operation}
                  </span>
                  {node.children.length > 0 && (
                      <button 
                          onClick={(e) => { e.stopPropagation(); setCollapsed(!collapsed); }}
                          className="hover:bg-black/5 rounded p-0.5"
                      >
                          {collapsed ? <ChevronDown size={10}/> : <ChevronDown size={10} className="rotate-180"/>}
                      </button>
                  )}
              </div>
              
              {/* Badges - Compact */}
              {(node.isCteDef || node.isCteScan) && (
                  <div className="flex flex-wrap gap-1 mb-1">
                      {node.isCteDef && <span className="px-1 py-0 bg-purple-100 text-purple-700 rounded text-[8px] font-medium flex items-center"><Database size={8} className="mr-0.5"/>{node.cteName}</span>}
                      {node.isCteScan && <span className="px-1 py-0 bg-yellow-100 text-yellow-700 rounded text-[8px] font-medium flex items-center"><LinkIcon size={8} className="mr-0.5"/>{node.cteName}</span>}
                  </div>
              )}

              {/* Stats Grid: Now 3 Columns (Cost, Width, Rows) */}
              <div className="grid grid-cols-3 gap-1 text-[9px] text-gray-500 border-t border-black/5 pt-0.5 mt-0.5">
                  <div>
                      <span className="block text-[8px] text-gray-400 leading-none mb-0.5">Cost</span>
                      <span className={`font-mono leading-none ${costTextColor}`}>{node.cost.toFixed(0)}</span>
                  </div>
                  <div className="text-center">
                      <span className="block text-[8px] text-gray-400 leading-none mb-0.5">Width</span>
                      <span className="font-mono leading-none">{node.width}B</span>
                  </div>
                  <div className="text-right">
                      <span className="block text-[8px] text-gray-400 leading-none mb-0.5">Rows</span>
                      <span className="font-mono leading-none">{node.rows}</span>
                  </div>
              </div>
          </div>
      </div>

      {/* Connector to Children - Compact */}
      {!collapsed && node.children && node.children.length > 0 && (
        <>
          <div className="w-px h-3 bg-gray-300"></div>
          <div className="flex space-x-1 relative">
              {node.children.length > 1 && (
                   <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[calc(100%-0.5rem)] h-px bg-gray-300" style={{top: -1}}></div> 
              )}
              {node.children.map((child) => (
                  <div key={child.uId} className="flex flex-col items-center relative">
                      {node.children!.length > 1 && <div className="w-px h-2 bg-gray-300 absolute top-[-1px]"></div>} 
                      <TreeNode 
                        node={child} 
                        maxCost={maxCost}
                        selectedNode={selectedNode}
                        onSelect={onSelect}
                        hoveredCte={hoveredCte}
                        onHoverCte={onHoverCte}
                      />
                  </div>
              ))}
          </div>
        </>
      )}
      
      {collapsed && node.children.length > 0 && (
          <div className="w-px h-2 bg-gray-300 border-b-2 border-gray-300"></div>
      )}
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

                <div className="flex-1 overflow-auto bg-gray-50 p-6">
                    {loading ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 animate-pulse">
                            <Database size={48} className="mb-4 text-blue-300"/>
                            <span>{t('vis.analyzing')}</span>
                        </div>
                    ) : plan ? (
                        viewMode === 'tree' ? (
                            <div 
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
