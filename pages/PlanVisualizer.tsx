
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
        if (content.includes('blockname')) hints.add('hintBlock');
    }
    return Array.from(hints);
};

const analyzePlan = (root: EnhancedNode, t: (key: string, params?: any) => string): PlanIssue[] => {
    const issues: PlanIssue[] = [];
    
    const traverseCheck = (node: EnhancedNode) => {
        const op = node.operation.toLowerCase();

        // 001: High Cost
        if (node.totalCost > 1000000) {
            issues.push({
                ruleId: 'Gauss-XN-001',
                title: 'High Cost Node',
                severity: 'High',
                type: 'Risk',
                description: `Node cost ${node.totalCost.toLocaleString()} exceeds safety threshold.`,
                suggestion: 'Optimize index or join method.',
                nodeUIds: [node.uId]
            });
        }

        // 014: Stats/Skew Risk (Core expert logic from the doc)
        // Detect misalignment between planner estimates and reality
        if (node.actualRows !== undefined && node.rows > 0) {
            const ratio = node.actualRows / node.rows;
            // If actual is 10x larger OR 0.1x smaller for large numbers, it's a huge risk
            if ((ratio > 10 || ratio < 0.1) && (node.actualRows > 1000 || node.rows > 1000)) {
                issues.push({
                    ruleId: 'Gauss-XN-014',
                    title: t('vis.rule.014.title'),
                    severity: 'High',
                    type: 'Risk',
                    description: t('vis.rule.014.desc', { est: node.rows, act: node.actualRows }),
                    suggestion: t('vis.rule.014.sugg'),
                    nodeUIds: [node.uId]
                });
            }
        }

        // 002: Large Seq Scan on table with potential skew
        if (op.includes('seq scan') && node.rows > 50000) {
            issues.push({
                ruleId: 'Gauss-XN-002',
                title: 'Potential Inefficient Scan',
                severity: 'Medium',
                type: 'Suggestion',
                description: 'Full table scan on large estimated row count.',
                suggestion: 'Check if index exists. If stats are biased (actual rows >> est), ANALYZE is needed.',
                nodeUIds: [node.uId]
            });
        }

        node.children.forEach(traverseCheck);
    };

    traverseCheck(root);
    return issues;
};

const PlanVisualizer: React.FC = () => {
    const { t } = useI18n();
    const { visPlan, visIssues, setVisIssues } = usePlanContext();

    useEffect(() => {
        if (visPlan) {
            const detected = analyzePlan(visPlan, t);
            setVisIssues(detected);
        }
    }, [visPlan, t, setVisIssues]);

    return (
        <div className="flex flex-col h-full space-y-4">
             {/* Component UI implementation would follow, focus here is logic integration */}
             <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
                <h2 className="font-bold text-gray-700 flex items-center mb-4">
                    <Zap className="mr-2 text-blue-600" size={20}/>
                    Plan Diagnostics
                </h2>
                <div className="space-y-3">
                    {visIssues.map(issue => (
                        <div key={issue.ruleId} className={`p-3 rounded-lg border ${issue.severity === 'High' ? 'bg-red-50 border-red-100' : 'bg-yellow-50 border-yellow-100'}`}>
                            <div className="flex items-center font-bold text-sm mb-1">
                                <AlertTriangle className="mr-2" size={16}/>
                                {issue.title}
                            </div>
                            <p className="text-xs text-gray-600 mb-2">{issue.description}</p>
                            <div className="text-xs font-medium text-blue-700 bg-blue-50/50 p-2 rounded">
                                <span className="font-bold">Expert Suggestion:</span> {issue.suggestion}
                            </div>
                        </div>
                    ))}
                    {visIssues.length === 0 && (
                        <div className="text-center py-8 text-gray-400 text-sm italic">
                            No plan regressions detected.
                        </div>
                    )}
                </div>
             </div>
        </div>
    );
};

export default PlanVisualizer;
