
export interface WdrReport {
  id: number;
  instanceName: string;
  generateTime: string;
  period: string;
  status: 'Success' | 'Failed' | 'Running';
  version?: string;
  cpu?: string;
  memory?: string;
}

export interface WdrEfficiency {
  name: string;
  value: number;
  target: number;
}

export interface WdrBufferStat {
  metric: string;
  value: number;
}

export interface WdrObjectStat {
  schema: string;
  name: string; // Table name or Index name
  tableName?: string; // For indexes, the parent table
  type: 'Table' | 'Index';
  seqScan?: number;
  idxScan?: number;
  tupIns?: number;
  tupUpd?: number;
  tupDel?: number;
  liveTup?: number;
  deadTup?: number;
  // Index specific
  idxTupRead?: number;
  idxTupFetch?: number;
}

export interface WdrWaitEvent {
  event: string;
  waitClass: string;
  waits: number;
  totalWaitTime: number; // us or ms depending on report
  avgWaitTime: number;
  maxWaitTime?: number; // New field
  pctDBTime: number;
}

export interface WdrConfigSetting {
  name: string;
  value: string;
}

// Expanded Top SQL Interface
export interface WdrTopSqlItem {
  sqlId: string;
  uniqueSqlId: number;
  userName: string;
  text: string;
  
  // Core Timings
  totalTime: number; // us
  calls: number;
  avgTime: number; // us
  cpuTime: number; // us
  ioTime: number; // us (Data IO Time)
  minTime?: number; // us
  maxTime?: number; // us
  
  // Rows & Tuples
  rows: number;
  tuplesRead?: number;
  tuplesAffected?: number;
  
  // IO Ops
  physicalRead?: number;
  logicalRead?: number;
  
  // Sort Stats
  sortCount?: number;
  sortTime?: number;
  sortMemUsed?: number;
  sortSpillCount?: number;
  sortSpillSize?: number;
  
  // Hash Stats
  hashCount?: number;
  hashTime?: number;
  hashMemUsed?: number;
  hashSpillCount?: number;
  hashSpillSize?: number;
}

export interface WdrReportDetail {
  id: number;
  meta: WdrReport;
  snapshots: {
    start: string;
    end: string;
  };
  efficiency: WdrEfficiency[];
  loadProfile: {
    metric: string;
    perSec: number;
    perTxn: number;
    perExec?: number;
  }[];
  waitEvents: WdrWaitEvent[];
  topSql: WdrTopSqlItem[];
  objectStats: WdrObjectStat[];
  configs: WdrConfigSetting[];
}

export interface ThresholdConfig {
  configKey: string;
  configName: string;
  value: number;
  unit: string;
  description: string;
  recommendRange: string;
  // Frontend helpers
  category?: string; 
}

export interface RiskIssue {
    severity: 'High' | 'Medium' | 'Low';
    title: string;
    description: string;
    category: 'SQL' | 'Object' | 'System';
    relatedId?: string | number;
    relatedType?: 'sql' | 'object' | 'system';
    extra?: Record<string, string | number>;
}

export interface SqlAuditIssue {
  id: string;
  severity: 'High' | 'Medium' | 'Low';
  type: string;
  target: string;
  time: string;
  status: 'Pending' | 'Processing' | 'Fixed' | 'Whitelisted';
}

export interface AuditLog {
  id: number;
  time: string;
  user: string;
  operationType: string;
  target: string;
  result: 'Success' | 'Failed';
}

export interface WdrComparison {
  id: number;
  name: string;
  description: string;
  reportIds: number[];
  createdAt: string;
}

// Comparison Detail Types
export type ComparisonCategory = 'sql' | 'wait' | 'obj' | 'sys';

export interface BaseComparisonMetric {
  id: string;
  name: string; // The primary identifier (SQL, Event Name, Obj Name, Metric Name)
  value1: number;
  value2: number;
  changeRate: number; // Percentage
  diff: number;
}

export interface SqlComparisonMetric extends BaseComparisonMetric {
  executionCount1: number;
  executionCount2: number;
  // Detailed WDR Breakdown
  cpuTime1: number;
  cpuTime2: number;
  ioTime1: number;
  ioTime2: number;
  // I/O Details
  physicalReads1: number;
  physicalReads2: number;
  logicalReads1: number;
  logicalReads2: number;
}

export interface WaitEventComparison extends BaseComparisonMetric {
  waitClass: string;
  time1: number;
  time2: number;
}

export interface ObjectStatComparison extends BaseComparisonMetric {
  schema: string;
  scanType: string;
  // Detailed WDR Breakdown
  seqScan1: number;
  seqScan2: number;
  idxScan1: number;
  idxScan2: number;
  tupleIns1: number;
  tupleIns2: number;
  tupleUpd1: number;
  tupleUpd2: number;
  tupleDel1: number;
  tupleDel2: number;
  // I/O Details
  heapBlksRead1: number;
  heapBlksRead2: number;
  heapBlksHit1: number;
  heapBlksHit2: number;
  idxBlksRead1: number;
  idxBlksRead2: number;
  idxBlksHit1: number;
  idxBlksHit2: number;
}

export interface SystemMetricComparison extends BaseComparisonMetric {
  unit: string;
}

export interface ComparisonSummary {
  id: string;
  status: 'Improved' | 'Degraded' | 'Stable';
  scoreChange: number; // e.g. -15 (points or percentage)
  conclusion: string;
  keyFindings: string[];
}

// Visualizer Types
export interface ExecutionPlanNode {
  id: string;
  operation: string;
  target?: string;
  cost: number;
  rows: number;
  children?: ExecutionPlanNode[];
  details?: string;
}

export interface WdrHotSql {
  id: string;
  sqlShort: string;
  fullSql: string;
  totalTime: string;
  executionCount: number;
  cost: number;
}

// Dashboard Types
export interface InstanceSummary {
  instanceName: string;
  status: 'Healthy' | 'Warning' | 'Critical';
  healthScore: number;
  lastReportTime: string;
  activeIssues: number;
}

export interface DashboardMetrics {
  cpu: string;
  mem: string;
  tps: string;
  qps: string;
  healthDistribution: { name: string; value: number }[];
  trendData: { time: string; value: number }[];
  hotIssues: { title: string; desc: string; }[];
}

// --- Extended Plan Types for Context ---

export type PlanType = 'Explain Only' | 'Explain Analyze' | 'Explain Performance';

export interface EnhancedNode extends Omit<ExecutionPlanNode, 'children'> {
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
    loops?: number;
}

export interface PlanIssue {
    ruleId: string;
    title: string;
    severity: 'High' | 'Medium' | 'Low';
    type: 'Risk' | 'Suggestion';
    description: string;
    suggestion: string;
    nodeUIds: string[];
}

export interface DiffNode {
    uId: string;
    id: string; // Sequential ID (n_0, n_1)
    nodeId?: string; // DB Plan ID (1, 2)
    operation: string;
    cost: number;
    totalCost: number;
    selfCost: number;
    rows: number;
    width: number;
    actualTime?: number;
    actualRows?: number;
    percentage: number;
    details: string;
    children: DiffNode[];
}

// --- History Types ---

export interface VisHistoryItem {
    id: string;
    timestamp: number;
    name: string;
    sql: string;
    planText: string;
}

export interface DiffHistoryItem {
    id: string;
    timestamp: number;
    name: string;
    mode: 'unified' | 'split';
    left: string;
    right: string;
    unified: string;
}
