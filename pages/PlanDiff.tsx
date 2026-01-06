
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  GitCompare, ArrowRight, ArrowDown, ArrowUp, AlertCircle, 
  CheckCircle, Minus, RotateCcw, ChevronDown, ChevronRight,
  Activity, Database, AlertTriangle, BarChart2, Columns, FileText, Split,
  X, Maximize, Minimize
} from 'lucide-react';
import { useI18n } from '../context/I18nContext';
import { usePlanContext } from '../context/PlanContext';
import { DiffNode } from '../types';

interface NodePair {
    left: DiffNode | null;
    right: DiffNode | null;
}

// --- Helpers ---

const normalizeOp = (op: string) => {
    return op.replace(/^->/, '')
             .replace(/\(\d+(,\d+)*\)/g, '') 
             .replace(/\s+/g, ' ')
             .trim()
             .toLowerCase();
};

const extractTarget = (op: string) => {
    // Matches "on <target>" or similar patterns in GaussDB plans
    // e.g. "Seq Scan on public.users" -> "public.users"
    const match = op.match(/\s+on\s+([^\s\(\)]+)/i);
    return match ? match[1].toLowerCase() : null;
};

const getNodeType = (op: string) => {
    const lower = op.toLowerCase();
    if (lower.includes('scan')) return 'Scan';
    if (lower.includes('join') || lower.includes('loop')) return 'Join';
    if (lower.includes('sort')) return 'Sort';
    if (lower.includes('agg') || lower.includes('group')) return 'Agg';
    return 'Other';
};

const flatten = (node: DiffNode): DiffNode[] => {
    let list = [node];
    node.children.forEach(c => list = list.concat(flatten(c)));
    return list;
};

const findNode = (root: DiffNode, uId: string): DiffNode | null => {
    if (root.uId === uId) return root;
    for (const child of root.children) {
        const found = findNode(child, uId);
        if (found) return found;
    }
    return null;
};

// Heuristic matching algorithm
const calculateMatches = (left: DiffNode, right: DiffNode): Map<string, string> => {
    const matches = new Map<string, string>();
    const leftNodes = flatten(left);
    const rightNodes = flatten(right);
    
    // Sort by cost descending to prioritize matching expensive nodes first (often the root or main scans)
    leftNodes.sort((a, b) => b.totalCost - a.totalCost);
    rightNodes.sort((a, b) => b.totalCost - a.totalCost);

    const matchedRightIds = new Set<string>();

    for (const lNode of leftNodes) {
        const lOp = normalizeOp(lNode.operation);
        const lTarget = extractTarget(lNode.operation);
        const lType = getNodeType(lNode.operation);

        let bestMatch: DiffNode | null = null;
        let bestScore = -1;

        for (const rNode of rightNodes) {
            if (matchedRightIds.has(rNode.uId)) continue;

            const rOp = normalizeOp(rNode.operation);
            const rTarget = extractTarget(rNode.operation);
            const rType = getNodeType(rNode.operation);

            let score = 0;

            // 1. Exact Name Match
            if (lOp === rOp) {
                score += 50;
            } else if (lOp.includes(rOp) || rOp.includes(lOp)) {
                score += 25;
            }

            // 2. ID Match (if available and reliable)
            if (lNode.nodeId && rNode.nodeId && lNode.nodeId === rNode.nodeId) {
                score += 30;
            }

            // 3. Target Object Match (Critical for optimization detection)
            // e.g., Seq Scan on T1 -> Index Scan on T1
            if (lTarget && rTarget && lTarget === rTarget) {
                score += 60;
            }

            // 4. Type Match
            // Only reward if target matches or it's a structural node like Join
            if (lType === rType) {
                if (lType === 'Join') score += 20; // Joins often change type (Hash -> NestedLoop)
                if (lType === 'Scan' && lTarget === rTarget) score += 20;
            }

            if (score > bestScore) {
                bestScore = score;
                bestMatch = rNode;
            }
        }

        // Threshold to accept a match
        if (bestMatch && bestScore >= 40) {
            matches.set(lNode.uId, bestMatch.uId);
            matchedRightIds.add(bestMatch.uId);
        }
    }

    return matches;
};

const getRiskAssessment = (node: DiffNode, t: (k: string, p?: any) => string): string[] => {
    const risks: string[] = [];
    const op = node.operation.toLowerCase();
    const details = node.details.toLowerCase();

    // Rule: Disk Spill
    if (details.includes('spill') || details.includes('disk') || details.includes('external merge')) {
        risks.push(t('diff.risk.diskSpill'));
    }

    // Rule: Large Seq Scan
    if (op.includes('seq scan') && node.rows > 10000) {
        risks.push(t('diff.risk.largeSeqScan', { rows: (node.rows/1000).toFixed(1) }));
    }

    // Rule: High Cost
    if (node.totalCost > 10000) {
        risks.push(t('diff.risk.highCost'));
    }

    // Rule: NestLoop Risk
    if (op.includes('nested loop') && node.rows > 10000) {
        risks.push(t('diff.risk.nestLoop'));
    }

    // Rule: Bad Estimate (if Actual exists)
    if (node.actualRows !== undefined && node.rows > 0) {
        const ratio = node.actualRows / node.rows;
        if (ratio > 10 || ratio < 0.1) {
            risks.push(t('diff.risk.badEst'));
        }
    }

    return risks;
};

// --- Components ---

const MetricCard = ({ label, val1, val2, unit, inverse = false }: { label: string, val1: number, val2: number, unit?: string, inverse?: boolean }) => {
    if (val1 === 0 && val2 === 0) return null;
    
    const diff = val2 - val1;
    const percent = val1 > 0 ? (diff / val1) * 100 : 0;
    
    let color = 'text-gray-500';
    let bg = 'bg-gray-50';
    let icon = <Minus size={16} />;

    if (diff < 0) {
        color = inverse ? 'text-red-600' : 'text-green-600';
        bg = inverse ? 'bg-red-50' : 'bg-green-50';
        icon = <ArrowDown size={16} />;
    } else if (diff > 0) {
        color = inverse ? 'text-green-600' : 'text-red-600';
        bg = inverse ? 'bg-green-50' : 'bg-red-50';
        icon = <ArrowUp size={16} />;
    }

    return (
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm flex-1">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">{label}</div>
            <div className="flex items-end justify-between">
                <div>
                    <div className="flex items-baseline space-x-2">
                        <span className="text-gray-400 text-sm line-through decoration-gray-300">{val1.toLocaleString()}</span>
                        <ArrowRight size={14} className="text-gray-300" />
                        <span className="text-xl font-bold text-gray-800">{val2.toLocaleString()}</span>
                        {unit && <span className="text-xs text-gray-500 font-medium">{unit}</span>}
                    </div>
                </div>
                <div className={`flex items-center px-2 py-1 rounded text-xs font-bold ${bg} ${color}`}>
                    {icon}
                    <span className="ml-1">{Math.abs(percent).toFixed(1)}%</span>
                </div>
            </div>
        </div>
    );
};

const DiffAnalysisCard = ({ left, right, onClose }: { left: DiffNode | null, right: DiffNode | null, onClose: () => void }) => {
    const { t } = useI18n();
    if (!left && !right) return null;

    const opName = (right || left)?.operation || 'Unknown';
    const leftRisks = left ? getRiskAssessment(left, t) : [];
    const rightRisks = right ? getRiskAssessment(right, t) : [];
    
    // Determine Verdict
    let verdictKey = 'similar';
    if (!left) verdictKey = 'new';
    else if (!right) verdictKey = 'removed';
    else {
        // Compare Time first, then Cost
        const v1 = left.actualTime ?? left.totalCost;
        const v2 = right.actualTime ?? right.totalCost;
        if (v2 < v1 * 0.9) verdictKey = 'improved';
        else if (v2 > v1 * 1.1) verdictKey = 'regressed';
    }

    const verdictColors: Record<string, string> = {
        improved: 'bg-green-100 text-green-800 border-green-200',
        regressed: 'bg-red-100 text-red-800 border-red-200',
        similar: 'bg-gray-100 text-gray-800 border-gray-200',
        new: 'bg-blue-100 text-blue-800 border-blue-200',
        removed: 'bg-gray-200 text-gray-600 border-gray-300'
    };

    const formatVal = (n: number | undefined) => n !== undefined ? n.toLocaleString() : '-';
    
    return (
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 w-[600px] bg-white rounded-xl shadow-2xl border border-gray-200 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                <div className="flex items-center space-x-3">
                    <span className={`px-2 py-0.5 text-xs font-bold uppercase rounded border ${verdictColors[verdictKey]}`}>
                        {t(`diff.verdict.${verdictKey}`)}
                    </span>
                    <h3 className="font-bold text-gray-800 text-sm truncate max-w-[300px]" title={opName}>
                        {opName}
                    </h3>
                </div>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded p-1">
                    <X size={16} />
                </button>
            </div>

            <div className="p-4 space-y-4">
                {/* Metric Comparison */}
                <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="bg-gray-50 p-2 rounded border border-gray-100">
                        <div className="text-xs text-gray-500 mb-1">{t('diff.metric.time')} (ms)</div>
                        <div className="flex items-center justify-between">
                            <span className="text-gray-400 line-through text-xs">{formatVal(left?.actualTime)}</span>
                            <ArrowRight size={12} className="text-gray-300"/>
                            <span className="font-bold text-gray-800">{formatVal(right?.actualTime)}</span>
                        </div>
                    </div>
                    <div className="bg-gray-50 p-2 rounded border border-gray-100">
                        <div className="text-xs text-gray-500 mb-1">{t('vis.node.cost')}</div>
                        <div className="flex items-center justify-between">
                            <span className="text-gray-400 line-through text-xs">{formatVal(left?.totalCost)}</span>
                            <ArrowRight size={12} className="text-gray-300"/>
                            <span className="font-bold text-gray-800">{formatVal(right?.totalCost)}</span>
                        </div>
                    </div>
                    <div className="bg-gray-50 p-2 rounded border border-gray-100">
                        <div className="text-xs text-gray-500 mb-1">{t('vis.node.rows')}</div>
                        <div className="flex items-center justify-between">
                            <span className="text-gray-400 line-through text-xs">{formatVal(left?.rows)}</span>
                            <ArrowRight size={12} className="text-gray-300"/>
                            <span className="font-bold text-gray-800">{formatVal(right?.rows)}</span>
                        </div>
                    </div>
                </div>

                {/* Risk Analysis */}
                {(leftRisks.length > 0 || rightRisks.length > 0) && (
                    <div className="border-t border-gray-100 pt-3">
                        <h4 className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center">
                            <AlertTriangle size={12} className="mr-1"/> {t('diff.analysis.title')}
                        </h4>
                        <div className="space-y-2 text-xs">
                            {/* Comparison of risks */}
                            {Array.from(new Set([...leftRisks, ...rightRisks])).map((risk, idx) => {
                                const inLeft = leftRisks.includes(risk);
                                const inRight = rightRisks.includes(risk);
                                
                                if (inLeft && inRight) {
                                    return <div key={idx} className="flex items-center text-gray-600"><div className="w-1.5 h-1.5 bg-gray-400 rounded-full mr-2"></div>{risk}</div>;
                                } else if (!inLeft && inRight) {
                                    return <div key={idx} className="flex items-center text-red-600 font-medium bg-red-50 px-2 py-1 rounded"><AlertCircle size={12} className="mr-1.5"/> {t('diff.analysis.newRisk', {risk})}</div>;
                                } else if (inLeft && !inRight) {
                                    return <div key={idx} className="flex items-center text-green-600 font-medium bg-green-50 px-2 py-1 rounded"><CheckCircle size={12} className="mr-1.5"/> {t('diff.analysis.resolved', {risk})}</div>;
                                }
                                return null;
                            })}
                        </div>
                    </div>
                )}
                
                {/* Details Peek */}
                {(right?.details || left?.details) && (
                    <div className="border-t border-gray-100 pt-3">
                         <div className="text-[10px] text-gray-400 font-mono bg-gray-50 p-2 rounded max-h-20 overflow-y-auto whitespace-pre-wrap">
                             {right?.details || left?.details}
                         </div>
                    </div>
                )}
            </div>
        </div>
    );
};

interface DiffFlowNodeProps {
    node: DiffNode;
    maxCost: number;
    depth?: number;
    side: 'left' | 'right';
    onLayoutChange: () => void;
    highlightedUids: Set<string>;
    onSelect: (uId: string, side: 'left' | 'right') => void;
}

const DiffFlowNode: React.FC<DiffFlowNodeProps> = ({ node, maxCost, depth = 0, side, onLayoutChange, highlightedUids, onSelect }) => {
    const { t } = useI18n();
    const [expanded, setExpanded] = useState(true);
    const hasChildren = node.children.length > 0;
    const isMajorNode = node.percentage > 30; 
    const isSelected = highlightedUids.has(node.uId);
    
    useEffect(() => {
        const timer = setTimeout(onLayoutChange, 20);
        return () => clearTimeout(timer);
    }, [expanded, onLayoutChange]);

    const showTime = node.actualTime !== undefined;
    const primaryMetric = showTime ? `${node.actualTime?.toFixed(2)}ms` : node.totalCost.toFixed(0);
    const metricLabel = showTime ? t('diff.metric.time') : t('vis.node.cost');

    return (
        <div className="flex flex-col font-sans">
            <div 
                id={`node-${side}-${node.uId}`}
                className={`
                    grid grid-cols-12 gap-2 py-1.5 px-2 border-b items-center text-xs transition-colors cursor-pointer relative z-10
                    ${isSelected 
                        ? 'bg-yellow-100 border-yellow-200 ring-1 ring-inset ring-yellow-300' 
                        : isMajorNode 
                            ? 'bg-red-50/50 border-gray-100 hover:bg-gray-50' 
                            : 'bg-white border-gray-100 hover:bg-gray-50'
                    }
                `}
                onClick={(e) => { 
                    e.stopPropagation(); 
                    onSelect(node.uId, side); 
                }}
            >
                {/* Operation */}
                <div className="col-span-6 flex items-center overflow-hidden" style={{ paddingLeft: `${depth * 14}px` }}>
                    <div 
                        className="mr-1 text-gray-400 cursor-pointer w-4 flex justify-center shrink-0 hover:text-gray-600"
                        onClick={(e) => {
                            e.stopPropagation();
                            setExpanded(!expanded);
                        }}
                    >
                        {hasChildren ? (expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />) : <div className="w-3" />}
                    </div>
                    <span className={`truncate font-mono ${isMajorNode ? 'text-red-700 font-bold' : 'text-gray-700'}`} title={node.operation}>
                        {node.operation}
                        {node.nodeId && <span className="ml-1 text-gray-400 text-[10px]">#{node.nodeId}</span>}
                    </span>
                </div>

                {/* Metric (Cost or Time) */}
                <div className="col-span-2 text-right font-mono text-gray-600 truncate" title={metricLabel}>
                    {primaryMetric}
                </div>

                {/* Rows */}
                <div className="col-span-2 text-right font-mono text-gray-600 truncate">
                    {node.actualRows !== undefined ? node.actualRows : node.rows}
                </div>

                {/* Bar */}
                <div className="col-span-2 flex items-center pl-2">
                     <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                            className={`h-full ${isMajorNode ? 'bg-red-500' : 'bg-blue-500'}`} 
                            style={{ width: `${(node.totalCost / maxCost) * 100}%` }}
                        ></div>
                    </div>
                </div>
            </div>
            {hasChildren && expanded && (
                <div>
                    {node.children.map(child => (
                        <DiffFlowNode 
                            key={child.uId} 
                            node={child} 
                            maxCost={maxCost} 
                            depth={depth + 1} 
                            side={side}
                            onLayoutChange={onLayoutChange}
                            highlightedUids={highlightedUids}
                            onSelect={onSelect}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

// --- Logic ---

const PlanDiff: React.FC = () => {
    const { t } = useI18n();
    // Context State
    const {
        diffInputMode: inputMode, setDiffInputMode: setInputMode,
        diffLeftText: leftText, setDiffLeftText: setLeftText,
        diffRightText: rightText, setDiffRightText: setRightText,
        diffUnifiedText: unifiedText, setDiffUnifiedText: setUnifiedText,
        diffPlanLeft: planLeft, setDiffPlanLeft: setPlanLeft,
        diffPlanRight: planRight, setDiffPlanRight: setPlanRight,
        diffVerdict: verdict, setDiffVerdict: setVerdict,
    } = usePlanContext();

    const [isFullscreen, setIsFullscreen] = useState(false);
    
    // State for matches and highlighting
    const [matches, setMatches] = useState<Map<string, string>>(new Map());
    const [highlightedUids, setHighlightedUids] = useState<Set<string>>(new Set());
    const [selectedPair, setSelectedPair] = useState<NodePair | null>(null);

    // Line drawing state and refs
    const [connections, setConnections] = useState<React.ReactElement[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);
    const leftScrollRef = useRef<HTMLDivElement>(null);
    const rightScrollRef = useRef<HTMLDivElement>(null);

    // Calc matches when plans change
    useEffect(() => {
        if (planLeft && planRight) {
            const m = calculateMatches(planLeft, planRight);
            setMatches(m);
            // Don't auto-reset highlighted UIDs unless necessary, to preserve selection if possible, 
            // but for simplicity resetting on new plan is safer.
            setHighlightedUids(new Set()); 
            setSelectedPair(null);
        } else {
            setMatches(new Map());
        }
    }, [planLeft, planRight]);

    const handleNodeClick = (uId: string, side: 'left' | 'right') => {
        const newHighlights = new Set<string>();
        newHighlights.add(uId);
        
        let leftUid = side === 'left' ? uId : null;
        let rightUid = side === 'right' ? uId : null;

        if (side === 'left') {
            const match = matches.get(uId);
            if (match) {
                newHighlights.add(match);
                rightUid = match;
            }
        } else {
            // Find key for value
            for (const [k, v] of matches.entries()) {
                if (v === uId) {
                    newHighlights.add(k);
                    leftUid = k;
                    break;
                }
            }
        }
        setHighlightedUids(newHighlights);

        // Resolve Node Objects
        const leftNode = leftUid && planLeft ? findNode(planLeft, leftUid) : null;
        const rightNode = rightUid && planRight ? findNode(planRight, rightUid) : null;
        setSelectedPair({ left: leftNode, right: rightNode });
    };

    // Helper to clean GaussDB numbers which might be ranges like "[378.601,378.601]"
    const cleanNum = (str: string | undefined): number => {
        if (!str) return 0;
        const s = str.trim();
        if (s.startsWith('[')) {
            const parts = s.replace(/[\[\]]/g, '').split(',');
            if (parts.length > 1) return parseFloat(parts[1]); 
            return parseFloat(parts[0]);
        }
        return parseFloat(s);
    };

    // Parsing Logic
    const parsePlan = (text: string): DiffNode | null => {
        if (!text.trim()) return null;
        
        const isIgnoredLine = (line: string): boolean => {
            const l = line.trim().toLowerCase();
            return l.startsWith('set ') || 
                   l.startsWith('explain ') || 
                   l.startsWith('select ') || 
                   l.startsWith('insert ') || 
                   l.startsWith('update ') || 
                   l.startsWith('delete ') || 
                   l.startsWith('create ') || 
                   l.startsWith('drop ') || 
                   l.startsWith('--') ||
                   l.match(/^-+$/) !== null;
        };

        const isTabular = text.includes('|') && (text.includes('operation') || text.match(/^\s*\d+\s*\|/m));
        
        let root: DiffNode | null = null;
        let uidCounter = 0;
        const nodeStack: { node: DiffNode; indent: number }[] = [];

        const createNode = (op: string, cost: number, rows: number, aTime?: number, aRows?: number, nodeId?: string): DiffNode => ({
            uId: `diff_${Math.random().toString(36).substr(2, 9)}_${uidCounter++}`,
            id: `n_${uidCounter}`,
            nodeId,
            operation: op,
            cost: cost,
            totalCost: cost,
            selfCost: 0,
            rows: rows,
            width: 0,
            actualTime: aTime,
            actualRows: aRows,
            percentage: 0,
            details: '',
            children: []
        });

        const findParent = (indent: number) => {
            for (let i = nodeStack.length - 1; i >= 0; i--) { 
                if (nodeStack[i].indent < indent) return nodeStack[i].node; 
            }
            return null;
        };

        if (isTabular) {
            const lines = text.split('\n').filter(l => l.trim() && !l.startsWith('---') && !isIgnoredLine(l));
            
            for (const line of lines) {
                const cols = line.split('|');
                if (cols.length < 2) continue;
                
                if (cols[0].toLowerCase().includes('id') && cols[1].toLowerCase().includes('operation')) continue;

                const idStr = cols[0].trim();
                if (!/^\d+$/.test(idStr)) continue;

                const opRaw = cols[1];
                const lastCol = cols[cols.length - 1].trim();
                let totalCost = cleanNum(lastCol);
                const costMatch = lastCol.match(/([\d\.]+)\.\.([\d\.]+)/);
                if (costMatch) totalCost = parseFloat(costMatch[2]);

                const aTime = cols.length > 2 ? cleanNum(cols[2]) : undefined;
                const aRows = cols.length > 3 ? cleanNum(cols[3]) : undefined;
                const eRows = cols.length > 4 ? cleanNum(cols[4]) : 0;

                let indent = 0;
                const arrowIdx = opRaw.indexOf('->');
                if (arrowIdx !== -1) { indent = arrowIdx; } else { indent = opRaw.search(/\S/); }
                
                let operation = opRaw.trim();
                if (operation.startsWith('->')) operation = operation.substring(2).trim();

                const newNode = createNode(operation, totalCost, eRows, aTime, aRows, idStr);
                
                if (nodeStack.length === 0) { root = newNode; nodeStack.push({ node: newNode, indent: -1 }); }
                else {
                    const parent = findParent(indent);
                    if (parent) { parent.children.push(newNode); nodeStack.push({ node: newNode, indent }); }
                    else {
                        if (root) { root.children.push(newNode); nodeStack.push({ node: newNode, indent }); }
                    }
                }
            }
        } else {
            const lines = text.split('\n').filter(l => l.trim() !== '' && !isIgnoredLine(l));
            const costRegex = /\(cost=([\d\.]+)\.\.([\d\.]+)/;
            const rowsRegex = /rows=(\d+)/;
            const analyzeRegex = /\(actual time=([\d\.]+)\.\.([\d\.]+)/;
            const analyzeRowsRegex = /rows=(\d+)\s+loops=(\d+)/;

            for (const line of lines) {
                const cleanLine = line.replace(/^[\s\|]*/, ''); 
                const indentMatch = line.match(/^[\s\|]*/);
                let indent = indentMatch ? indentMatch[0].length : 0;
                if (line.includes('->')) indent = line.indexOf('->');
                
                const costMatch = line.match(costRegex);
                const rowsMatch = line.match(rowsRegex);
                const analyzeMatch = line.match(analyzeRegex);
                const analyzeRowsMatch = line.match(analyzeRowsRegex);
                
                if (!costMatch && !analyzeMatch && !line.includes('->')) continue;

                let operation = cleanLine.split('(')[0].trim();
                if (operation.startsWith('->')) operation = operation.substring(2).trim();
                if (!operation) continue;

                const newNode = createNode(
                    operation, 
                    costMatch ? parseFloat(costMatch[2]) : 0, 
                    rowsMatch ? parseInt(rowsMatch[1]) : 0,
                    analyzeMatch ? parseFloat(analyzeMatch[2]) : undefined,
                    analyzeRowsMatch ? parseInt(analyzeRowsMatch[1]) : undefined
                );

                if (nodeStack.length === 0) { root = newNode; nodeStack.push({ node: newNode, indent: -1 }); }
                else {
                    const parent = findParent(indent);
                    if (parent) { parent.children.push(newNode); nodeStack.push({ node: newNode, indent }); }
                    else {
                         if (root) { root.children.push(newNode); nodeStack.push({ node: newNode, indent }); }
                    }
                }
            }
        }

        if (root) {
            const calc = (n: DiffNode, total: number) => {
                n.children.forEach(c => calc(c, total));
                n.percentage = total > 0 ? (n.totalCost / total) * 100 : 0;
            };
            calc(root, root.totalCost);
        }
        return root;
    };

    const detectAndSplit = (text: string): { left: string, right: string } => {
        const lines = text.split('\n');
        
        const explainIndices: number[] = [];
        const explainRegex = /^\s*explain\s+(performance|analyze|verbose)?/i;
        
        lines.forEach((line, idx) => {
            if (explainRegex.test(line)) explainIndices.push(idx);
        });

        if (explainIndices.length >= 2) {
            const splitAt = explainIndices[1];
            return {
                left: lines.slice(0, splitAt).join('\n').trim(),
                right: lines.slice(splitAt).join('\n').trim()
            };
        }

        const tabularHeader = /id\s*\|\s*operation/i;
        const matches = [...text.matchAll(new RegExp(tabularHeader, 'g'))];
        if (matches.length >= 2) {
            const splitIdx = matches[1].index!;
            const lastNewline = text.lastIndexOf('\n', splitIdx);
            const cutPoint = lastNewline > -1 ? lastNewline : splitIdx;
            return { left: text.slice(0, cutPoint).trim(), right: text.slice(cutPoint).trim() };
        }

        const rootIndices: number[] = [];
        const textRootRegex = /^[\s]{0,2}[a-zA-Z].+\((cost|actual time)=/;
        const tabularRootRegex = /^[\s]*1\s*\|\s*(->)?/;

        lines.forEach((line, idx) => {
            if (textRootRegex.test(line) || tabularRootRegex.test(line)) {
                if (rootIndices.length === 0 || idx > rootIndices[rootIndices.length - 1] + 10) {
                    rootIndices.push(idx);
                }
            }
        });

        if (rootIndices.length >= 2) {
            const rootIdx = rootIndices[1];
            let splitAt = rootIdx;
            for (let i = rootIdx - 1; i > rootIndices[0]; i--) {
                const l = lines[i].trim();
                if (l === '' || l.startsWith('set explain') || l.startsWith('--')) {
                    splitAt = i;
                } else if (l.match(/^-+$/)) {
                    break; 
                }
            }
            return {
                left: lines.slice(0, splitAt).join('\n').trim(),
                right: lines.slice(splitAt).join('\n').trim()
            };
        }

        const separators = [/^-{10,}$/m, /^={10,}$/m, /^Plan\s*2:?$/im, /^Optimized\s*Plan:?$/im];
        for (const regex of separators) {
            const parts = text.split(regex);
            const validParts = parts.filter(p => p.trim().length > 20);
            if (validParts.length >= 2) {
                return { left: validParts[0].trim(), right: validParts[1].trim() };
            }
        }

        return { left: text, right: '' };
    };

    const drawConnections = useCallback(() => {
        if (!containerRef.current || !planLeft || !planRight) return;
        
        const containerRect = containerRef.current.getBoundingClientRect();
        const newConnections: React.ReactElement[] = [];
        
        matches.forEach((rightUid, leftUid) => {
            const leftEl = document.getElementById(`node-left-${leftUid}`);
            const rightEl = document.getElementById(`node-right-${rightUid}`);
            
            if (leftEl && rightEl) {
                const leftRect = leftEl.getBoundingClientRect();
                const rightRect = rightEl.getBoundingClientRect();
                
                const x1 = leftRect.right - containerRect.left;
                const y1 = leftRect.top + (leftRect.height / 2) - containerRect.top;
                const x2 = rightRect.left - containerRect.left;
                const y2 = rightRect.top + (rightRect.height / 2) - containerRect.top;

                const controlOffset = 40;
                const pathData = `M ${x1} ${y1} C ${x1 + controlOffset} ${y1}, ${x2 - controlOffset} ${y2}, ${x2} ${y2}`;

                const isHighlighted = highlightedUids.has(leftUid);
                const color = isHighlighted ? '#f59e0b' : '#e2e8f0'; 
                const width = isHighlighted ? '2' : '1';
                const opacity = isHighlighted ? '1' : '0.5';

                newConnections.push(
                    <path 
                        key={`${leftUid}-${rightUid}`}
                        d={pathData} 
                        stroke={color} 
                        strokeWidth={width} 
                        strokeOpacity={opacity}
                        fill="none" 
                        className={`transition-all duration-300 pointer-events-none ${isHighlighted ? 'z-50' : 'z-0'}`}
                    />
                );
            }
        });
        setConnections(newConnections);
    }, [planLeft, planRight, matches, highlightedUids]);

    useEffect(() => {
        drawConnections();
        
        const handleResize = () => requestAnimationFrame(drawConnections);
        const lScroll = leftScrollRef.current;
        const rScroll = rightScrollRef.current;
        
        window.addEventListener('resize', handleResize);
        lScroll?.addEventListener('scroll', handleResize);
        rScroll?.addEventListener('scroll', handleResize);
        
        return () => {
            window.removeEventListener('resize', handleResize);
            lScroll?.removeEventListener('scroll', handleResize);
            rScroll?.removeEventListener('scroll', handleResize);
        };
    }, [drawConnections]);

    const handleCompare = () => {
        let t1 = '';
        let t2 = '';

        if (inputMode === 'unified') {
            const split = detectAndSplit(unifiedText);
            t1 = split.left;
            t2 = split.right;
        } else {
            t1 = leftText;
            t2 = rightText;
        }

        const p1 = parsePlan(t1);
        const p2 = parsePlan(t2);

        setPlanLeft(p1);
        setPlanRight(p2);
        
        // Reset selections
        setConnections([]);
        setHighlightedUids(new Set());
        setSelectedPair(null);
        
        // Determine Verdict
        if (p1 && p2) {
            const v1 = p1.actualTime ?? p1.totalCost;
            const v2 = p2.actualTime ?? p2.totalCost;
            
            if (v2 < v1 * 0.95) setVerdict('Improved');
            else if (v2 > v1 * 1.05) setVerdict('Regressed');
            else setVerdict('Similar');
        } else {
            setVerdict(null);
        }
    };

    const handleLoadSample = () => {
        const p1 = `Seq Scan on users  (cost=0.00..183.00 rows=10000 width=45)`;
        const p2 = `Index Scan using idx_users_id on users  (cost=0.00..8.27 rows=1 width=45)`;
        
        if (inputMode === 'unified') {
            setUnifiedText(`Baseline Plan:\n${p1}\n\n----------------------------------------\n\nOptimized Plan:\n${p2}`);
        } else {
            setLeftText(p1);
            setRightText(p2);
        }
        setTimeout(handleCompare, 100);
    };

    return (
        <div className={isFullscreen ? "fixed inset-0 z-50 bg-gray-50 flex flex-col p-4 h-screen w-screen overflow-hidden" : "flex flex-col h-[calc(100vh-100px)] gap-4"}>
            {/* Header */}
            <div className="flex justify-between items-center bg-white p-3 rounded-lg border border-gray-200 shadow-sm shrink-0 relative z-20">
                <h2 className="font-bold text-gray-700 flex items-center">
                    <GitCompare className="mr-2 text-blue-600" size={20}/>
                    {t('diff.title')}
                </h2>
                <div className="flex space-x-3 items-center">
                    <button onClick={handleLoadSample} className="text-sm text-gray-500 hover:text-blue-600 font-medium">{t('diff.loadSample')}</button>
                    
                    {/* Fullscreen Toggle Button */}
                    <button 
                        onClick={() => setIsFullscreen(!isFullscreen)} 
                        className={`p-1.5 rounded border transition-colors ${isFullscreen ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-gray-400 border-gray-200 hover:text-blue-600'}`}
                        title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                    >
                        {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
                    </button>

                    <button 
                        onClick={handleCompare}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded text-sm flex items-center shadow-sm"
                    >
                        <Activity size={14} className="mr-2"/> {t('diff.compare')}
                    </button>
                </div>
            </div>

            {/* Main Content */}
            {planLeft && planRight ? (
                <div className="flex flex-col flex-1 min-h-0 gap-4">
                    {/* KPI & Verdict Banner */}
                    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex items-center space-x-6 animate-in slide-in-from-top-2 relative z-20">
                        {/* Verdict Badge */}
                        <div className={`
                            flex flex-col items-center justify-center p-4 rounded-lg min-w-[120px] border
                            ${verdict === 'Improved' ? 'bg-green-50 border-green-200 text-green-700' : 
                              verdict === 'Regressed' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-gray-50 border-gray-200 text-gray-600'}
                        `}>
                            {verdict === 'Improved' && <CheckCircle size={28} className="mb-1" />}
                            {verdict === 'Regressed' && <AlertTriangle size={28} className="mb-1" />}
                            {verdict === 'Similar' && <Minus size={28} className="mb-1" />}
                            <span className="font-bold text-sm uppercase">{t(`diff.verdict.${(verdict || 'Similar').toLowerCase()}`)}</span>
                        </div>

                        {/* Metrics */}
                        <div className="flex-1 grid grid-cols-3 gap-4">
                            <MetricCard 
                                label={t('vis.totalCost')} 
                                val1={planLeft.totalCost} 
                                val2={planRight.totalCost} 
                            />
                            {(planLeft.actualTime || planRight.actualTime) && (
                                <MetricCard 
                                    label={t('diff.metric.execTime')}
                                    val1={planLeft.actualTime || 0} 
                                    val2={planRight.actualTime || 0} 
                                    unit="ms"
                                />
                            )}
                            <MetricCard 
                                label={t('vis.node.rows')} 
                                val1={planLeft.rows} 
                                val2={planRight.rows} 
                            />
                        </div>
                        
                        <button onClick={() => { setPlanLeft(null); setPlanRight(null); setConnections([]); setHighlightedUids(new Set()); setSelectedPair(null); }} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-gray-100 rounded-full">
                            <RotateCcw size={20} />
                        </button>
                    </div>

                    {/* Comparison Trees Container */}
                    <div className="relative flex-1 flex gap-4 min-h-0" ref={containerRef}>
                        {/* SVG Layer for lines */}
                        <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
                            {connections}
                        </svg>

                        {/* Analysis Card */}
                        {selectedPair && (
                            <DiffAnalysisCard 
                                left={selectedPair.left} 
                                right={selectedPair.right} 
                                onClose={() => setSelectedPair(null)} 
                            />
                        )}

                        {/* Left Tree */}
                        <div className="flex-1 bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col overflow-hidden relative z-0">
                            <div className="p-3 bg-gray-50 border-b border-gray-200 font-semibold text-xs text-gray-600 flex justify-between items-center relative z-20">
                                <span className="flex items-center"><Database size={14} className="mr-2 text-blue-500"/>{t('diff.baseline')}</span>
                                {planLeft.actualTime && <span className="text-blue-600 font-mono">{planLeft.actualTime.toFixed(2)}ms</span>}
                            </div>
                            <div className="grid grid-cols-12 gap-2 px-2 py-1.5 bg-gray-100 border-b border-gray-200 text-[10px] font-bold text-gray-500 uppercase relative z-20">
                                <div className="col-span-6 pl-6">{t('diff.col.operation')}</div>
                                <div className="col-span-2 text-right">{t('diff.col.costTime')}</div>
                                <div className="col-span-2 text-right">{t('diff.col.rows')}</div>
                                <div className="col-span-2">{t('diff.col.costPct')}</div>
                            </div>
                            <div className="flex-1 overflow-auto p-0 relative z-0" ref={leftScrollRef}>
                                <DiffFlowNode 
                                    node={planLeft} 
                                    maxCost={planLeft.totalCost} 
                                    side="left"
                                    onLayoutChange={drawConnections}
                                    highlightedUids={highlightedUids}
                                    onSelect={handleNodeClick}
                                />
                            </div>
                        </div>
                        
                        <div className="flex items-center justify-center text-gray-300 relative z-0">
                            <ArrowRight size={24} />
                        </div>

                        {/* Right Tree */}
                        <div className="flex-1 bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col overflow-hidden relative z-0">
                            <div className="p-3 bg-gray-50 border-b border-gray-200 font-semibold text-xs text-gray-600 flex justify-between items-center relative z-20">
                                <span className="flex items-center"><BarChart2 size={14} className="mr-2 text-green-500"/>{t('diff.target')}</span>
                                {planRight.actualTime && <span className="text-green-600 font-mono">{planRight.actualTime.toFixed(2)}ms</span>}
                            </div>
                            <div className="grid grid-cols-12 gap-2 px-2 py-1.5 bg-gray-100 border-b border-gray-200 text-[10px] font-bold text-gray-500 uppercase relative z-20">
                                <div className="col-span-6 pl-6">{t('diff.col.operation')}</div>
                                <div className="col-span-2 text-right">{t('diff.col.costTime')}</div>
                                <div className="col-span-2 text-right">{t('diff.col.rows')}</div>
                                <div className="col-span-2">{t('diff.col.costPct')}</div>
                            </div>
                            <div className="flex-1 overflow-auto p-0 relative z-0" ref={rightScrollRef}>
                                <DiffFlowNode 
                                    node={planRight} 
                                    maxCost={planRight.totalCost} 
                                    side="right"
                                    onLayoutChange={drawConnections}
                                    highlightedUids={highlightedUids}
                                    onSelect={handleNodeClick}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col flex-1 min-h-0 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                    {/* Input Mode Tabs */}
                    <div className="flex border-b border-gray-100 bg-gray-50">
                        <button 
                            onClick={() => setInputMode('unified')}
                            className={`flex items-center px-4 py-3 text-sm font-medium transition-colors ${
                                inputMode === 'unified' 
                                    ? 'bg-white border-b-2 border-blue-600 text-blue-600' 
                                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                            <FileText size={16} className="mr-2"/> {t('diff.mode.unified')}
                        </button>
                        <button 
                            onClick={() => setInputMode('split')}
                            className={`flex items-center px-4 py-3 text-sm font-medium transition-colors ${
                                inputMode === 'split' 
                                    ? 'bg-white border-b-2 border-blue-600 text-blue-600' 
                                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                            <Columns size={16} className="mr-2"/> {t('diff.mode.split')}
                        </button>
                    </div>

                    {/* Input Content */}
                    <div className="flex-1 p-0 flex flex-col min-h-0">
                        {inputMode === 'unified' ? (
                            <div className="flex-1 flex flex-col">
                                <div className="bg-blue-50 px-4 py-2 text-xs text-blue-700 border-b border-blue-100 flex items-center">
                                    <Split size={14} className="mr-2"/>
                                    {t('diff.tip.unified')}
                                </div>
                                <textarea 
                                    className="flex-1 p-4 font-mono text-xs resize-none focus:outline-none bg-white text-gray-700" 
                                    placeholder={t('diff.placeholder.unified')}
                                    value={unifiedText}
                                    onChange={e => setUnifiedText(e.target.value)}
                                />
                            </div>
                        ) : (
                            <div className="flex flex-1 gap-0">
                                <div className="flex-1 flex flex-col border-r border-gray-200">
                                    <div className="p-2 bg-gray-50 border-b border-gray-200 font-bold text-gray-600 text-xs uppercase tracking-wide text-center">{t('diff.baseline')}</div>
                                    <textarea 
                                        className="flex-1 p-4 font-mono text-xs resize-none focus:outline-none bg-white" 
                                        placeholder={t('diff.placeholder.left')}
                                        value={leftText}
                                        onChange={e => setLeftText(e.target.value)}
                                    />
                                </div>
                                <div className="flex-1 flex flex-col">
                                    <div className="p-2 bg-gray-50 border-b border-gray-200 font-bold text-gray-600 text-xs uppercase tracking-wide text-center">{t('diff.target')}</div>
                                    <textarea 
                                        className="flex-1 p-4 font-mono text-xs resize-none focus:outline-none bg-white" 
                                        placeholder={t('diff.placeholder.right')}
                                        value={rightText}
                                        onChange={e => setRightText(e.target.value)}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default PlanDiff;
