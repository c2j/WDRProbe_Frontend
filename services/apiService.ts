import { 
  ThresholdConfig, 
  AuditLog, 
  WdrReport, 
  WdrReportDetail,
  WdrComparison, 
  SqlAuditIssue, 
  ExecutionPlanNode, 
  WdrHotSql,
  SqlComparisonMetric,
  WaitEventComparison,
  ObjectStatComparison,
  SystemMetricComparison,
  ComparisonCategory,
  BaseComparisonMetric,
  ComparisonSummary,
  InstanceSummary,
  DashboardMetrics
} from '../types';

// Mock Data
const MOCK_THRESHOLDS: ThresholdConfig[] = [
  { configKey: 'sql_top_time', configName: 'Top SQL Time', value: 1000, unit: 'ms', description: 'Threshold for slow SQL', recommendRange: '500~5000', category: 'SQL' },
  { configKey: 'sql_scan_rows', configName: 'Full Table Scan Rows', value: 100000, unit: 'rows', description: 'Alert if scan exceeds this', recommendRange: '10000~1000000', category: 'SQL' },
  { configKey: 'wait_max_lock', configName: 'Max Lock Wait', value: 3000, unit: 'ms', description: 'Maximum lock wait time', recommendRange: '1000~10000', category: 'WAIT' },
  { configKey: 'sys_cpu_usage', configName: 'CPU Usage', value: 80, unit: '%', description: 'CPU usage alert threshold', recommendRange: '60~90', category: 'SYSTEM' },
];

const MOCK_REPORTS: WdrReport[] = [
  { id: 1289, instanceName: 'prod-db-01', generateTime: '2025-12-09 02:00', period: '01:00-02:00', status: 'Success' },
  { id: 1288, instanceName: 'prod-db-01', generateTime: '2025-12-08 02:00', period: '01:00-02:00', status: 'Success' },
  { id: 1287, instanceName: 'prod-db-02', generateTime: '2025-12-08 02:00', period: '01:00-02:00', status: 'Failed' },
  { id: 1286, instanceName: 'prod-db-02', generateTime: '2025-12-07 02:00', period: '01:00-02:00', status: 'Success' },
];

const MOCK_AUDIT_LOGS: AuditLog[] = [
  { id: 1, time: '2025-12-09 14:32:11', user: 'Zhang San', operationType: 'Update Threshold', target: 'top_sql_time', result: 'Success' },
  { id: 2, time: '2025-12-09 14:30:05', user: 'Li Si', operationType: 'Apply Template', target: 'High Concurrency Template', result: 'Success' },
];

const MOCK_ISSUES: SqlAuditIssue[] = [
  { id: 'P1289', severity: 'High', type: 'Slow SQL', target: 'SELECT ... FROM t_order', time: '2025-12-09', status: 'Pending' },
  { id: 'P1288', severity: 'Medium', type: 'Full Table Scan', target: 't_order', time: '2025-12-09', status: 'Processing' },
];

const MOCK_HOT_SQLS: WdrHotSql[] = [
  { 
    id: 'SQL_1001', 
    sqlShort: 'SELECT * FROM users u JOIN orders o...', 
    fullSql: "SELECT * FROM users u JOIN orders o ON u.id = o.user_id WHERE u.age > 18 AND o.date > '2025-01-01';",
    totalTime: '5.2s', 
    executionCount: 150, 
    cost: 1200 
  },
  { 
    id: 'SQL_1002', 
    sqlShort: 'UPDATE products SET stock = stock - 1...', 
    fullSql: "UPDATE products SET stock = stock - 1 WHERE id IN (SELECT product_id FROM order_items WHERE order_id = 999);",
    totalTime: '1.8s', 
    executionCount: 5000, 
    cost: 450 
  }
];

// --- Detail Comparison Mocks (ENHANCED with WDR fields) ---
const MOCK_COMP_SQL: SqlComparisonMetric[] = [
  { 
    id: '1', name: 'SELECT * FROM t_order WHERE status = ?', 
    value1: 1234, value2: 890, changeRate: -27.9, diff: -344, 
    executionCount1: 100, executionCount2: 105,
    cpuTime1: 800, cpuTime2: 750, // CPU component
    ioTime1: 434, ioTime2: 140,   // IO component (improved in R2)
    physicalReads1: 5000, physicalReads2: 1200, // Significant drop in physical IO
    logicalReads1: 150000, logicalReads2: 155000
  },
  { 
    id: '2', name: 'UPDATE user SET login_time = ? WHERE id = ?', 
    value1: 567, value2: 890, changeRate: 56.9, diff: 323, 
    executionCount1: 5000, executionCount2: 5020,
    cpuTime1: 300, cpuTime2: 320,
    ioTime1: 267, ioTime2: 570,    // IO degraded in R2
    physicalReads1: 200, physicalReads2: 800,
    logicalReads1: 52000, logicalReads2: 52100
  },
  { 
    id: '3', name: 'INSERT INTO audit_log VALUES (...)', 
    value1: 45, value2: 46, changeRate: 2.2, diff: 1, 
    executionCount1: 200, executionCount2: 210,
    cpuTime1: 20, cpuTime2: 21,
    ioTime1: 25, ioTime2: 25,
    physicalReads1: 10, physicalReads2: 12,
    logicalReads1: 2000, logicalReads2: 2100
  },
];

const MOCK_COMP_WAIT: WaitEventComparison[] = [
  { id: 'w1', name: 'LockWait: tuple_lock', waitClass: 'Lock', value1: 5000, value2: 1200, changeRate: -76.0, diff: -3800, time1: 5000, time2: 1200 },
  { id: 'w2', name: 'DataFileRead', waitClass: 'IO', value1: 2300, value2: 2400, changeRate: 4.3, diff: 100, time1: 2300, time2: 2400 },
  { id: 'w3', name: 'WALSync', waitClass: 'IO', value1: 100, value2: 150, changeRate: 50.0, diff: 50, time1: 100, time2: 150 },
];

const MOCK_COMP_OBJ: ObjectStatComparison[] = [
  { 
    id: 'o1', name: 't_order', schema: 'public', scanType: 'Table', 
    value1: 50, value2: 200, changeRate: 300, diff: 150,
    // Detailed Breakdown
    seqScan1: 50, seqScan2: 200, // Degraded: more seq scans
    idxScan1: 0, idxScan2: 0,
    tupleIns1: 100, tupleIns2: 120,
    tupleUpd1: 500, tupleUpd2: 550,
    tupleDel1: 10, tupleDel2: 10,
    heapBlksRead1: 1200, heapBlksRead2: 4500, // More disk read due to seq scan
    heapBlksHit1: 50000, heapBlksHit2: 52000,
    idxBlksRead1: 0, idxBlksRead2: 0,
    idxBlksHit1: 0, idxBlksHit2: 0
  },
  { 
    id: 'o2', name: 'idx_user_id', schema: 'public', scanType: 'Index', 
    value1: 5000, value2: 5200, changeRate: 4.0, diff: 200,
    seqScan1: 0, seqScan2: 0,
    idxScan1: 5000, idxScan2: 5200,
    tupleIns1: 0, tupleIns2: 0,
    tupleUpd1: 0, tupleUpd2: 0,
    tupleDel1: 0, tupleDel2: 0,
    heapBlksRead1: 0, heapBlksRead2: 0,
    heapBlksHit1: 0, heapBlksHit2: 0,
    idxBlksRead1: 50, idxBlksRead2: 55,
    idxBlksHit1: 15000, idxBlksHit2: 15600
  },
];

const MOCK_COMP_SYS: SystemMetricComparison[] = [
  { id: 's1', name: 'Buffer Hit Ratio', unit: '%', value1: 99.2, value2: 98.5, changeRate: -0.7, diff: -0.7 },
  { id: 's2', name: 'Average CPU Usage', unit: '%', value1: 45.0, value2: 65.0, changeRate: 44.4, diff: 20.0 },
  { id: 's3', name: 'TPS', unit: '', value1: 1200, value2: 1500, changeRate: 25.0, diff: 300 },
  { id: 's4', name: 'IOPS', unit: '', value1: 800, value2: 950, changeRate: 18.75, diff: 150 },
  { id: 's5', name: 'DB Time', unit: 's', value1: 3400, value2: 4200, changeRate: 23.5, diff: 800 },
];

const MOCK_COMP_SUMMARY: ComparisonSummary = {
  id: 's1',
  status: 'Degraded',
  scoreChange: -12,
  conclusion: 'The system performance has degraded compared to the previous period. The primary bottleneck appears to be related to severe lock contention on table "t_order", resulting in a spike in "LockWait" events and decreased throughput.',
  keyFindings: [
    'Lock Wait time significantly increased by 76%, primarily due to "LockWait: tuple_lock".',
    'Average CPU Usage increased by 44.4%, indicating higher system load.',
    'A new slow SQL pattern was detected on table "t_order" causing full table scans.'
  ]
};

const MOCK_PLAN_TREE: ExecutionPlanNode = {
  id: 'root',
  operation: 'Hash Join',
  cost: 1500,
  rows: 5000,
  details: 'Hash Cond: (o.user_id = u.id)',
  children: [
    {
      id: 'n1',
      operation: 'Seq Scan',
      target: 'users',
      cost: 600,
      rows: 10000,
      details: 'Filter: (age > 18)',
      children: []
    },
    {
      id: 'n2',
      operation: 'Hash',
      cost: 400,
      rows: 2000,
      children: [
        {
          id: 'n3',
          operation: 'Index Scan',
          target: 'orders',
          cost: 300,
          rows: 2000,
          details: 'Index Cond: (date > \'2025-01-01\')',
          children: []
        }
      ]
    }
  ]
};

const MOCK_INSTANCES: InstanceSummary[] = [
  { instanceName: 'prod-db-01', status: 'Healthy', healthScore: 92, lastReportTime: '2025-12-09', activeIssues: 2 },
  { instanceName: 'prod-db-02', status: 'Warning', healthScore: 78, lastReportTime: '2025-12-08', activeIssues: 5 }
];

// Tauri IPC Helper
const isTauri = () => !!(window as any).__TAURI__;
const invoke = (window as any).__TAURI__?.invoke;

export const ApiService = {
  // Thresholds
  getThresholdConfigs: async (): Promise<ThresholdConfig[]> => {
    return new Promise((resolve) => setTimeout(() => resolve([...MOCK_THRESHOLDS]), 300));
  },
  
  updateThresholdConfig: async (key: string, payload: { value: number }): Promise<void> => {
    console.log(`Updating ${key} to ${payload.value}`);
    if (isTauri()) {
        return invoke('update_threshold', { key, value: payload.value });
    }
    const item = MOCK_THRESHOLDS.find(t => t.configKey === key);
    if (item) item.value = payload.value;
    return Promise.resolve();
  },

  batchUpdateThresholdConfigs: async (map: Record<string, number>): Promise<void> => {
    console.log('Batch updating', map);
    if (isTauri()) {
        return invoke('batch_update_thresholds', { map });
    }
    Object.entries(map).forEach(([key, val]) => {
      const item = MOCK_THRESHOLDS.find(t => t.configKey === key);
      if (item) item.value = val;
    });
    return Promise.resolve();
  },

  // Reports
  getWdrReports: async (): Promise<WdrReport[]> => {
    if (isTauri()) return invoke('get_wdr_reports');
    return Promise.resolve(MOCK_REPORTS);
  },

  getWdrReportDetail: async (id: number): Promise<WdrReportDetail | null> => {
    if (isTauri()) return invoke('get_wdr_report_detail', { id });
    await new Promise(resolve => setTimeout(resolve, 500));
    const meta = MOCK_REPORTS.find(r => r.id === id);
    if (!meta) return null;

    // Derived from the WDR HTML Example
    return {
      id,
      meta,
      snapshots: { start: '2025-08-26 11:09:10', end: '2025-08-26 11:10:41' },
      efficiency: [
          { name: 'Buffer Hit %', value: 99.08, target: 99 },
          { name: 'Effective CPU %', value: 95, target: 90 },
          { name: 'WalWrite NoWait %', value: 100, target: 99 },
          { name: 'Soft Parse %', value: 11, target: 95 },
          { name: 'Non-Parse CPU %', value: 99, target: 90 }
      ],
      loadProfile: [
        { metric: 'DB Time(us)', perSec: 5709, perTxn: 2045, perExec: 5356 },
        { metric: 'CPU Time(us)', perSec: 5443, perTxn: 1950, perExec: 5106 },
        { metric: 'Redo size(blocks)', perSec: 7, perTxn: 3, perExec: 7 },
        { metric: 'Logical read (blocks)', perSec: 1131, perTxn: 405, perExec: 1061 },
        { metric: 'Write IO requests', perSec: 7, perTxn: 3, perExec: 7 },
        { metric: 'Executes (SQL)', perSec: 1, perTxn: 0, perExec: 1 },
        { metric: 'Transactions', perSec: 3, perTxn: 1, perExec: 0 },
      ],
      waitEvents: [
        { event: 'CPU', waitClass: 'CPU', waits: 0, totalWaitTime: 5443, avgWaitTime: 0, pctDBTime: 95.3 },
        { event: 'db_file_sequential_read', waitClass: 'User I/O', waits: 100, totalWaitTime: 200, avgWaitTime: 2, pctDBTime: 3.5 },
      ],
      topSql: [
        { sqlId: '159002238', uniqueSqlId: 159002238, userName: 'omm', text: 'select ?, ?, t.* from dbe', totalTime: 66077, calls: 3, avgTime: 22026, cpuTime: 66973, ioTime: 0, rows: 652 },
        { sqlId: '1291065786', uniqueSqlId: 1291065786, userName: 'omm', text: 'select ?, ?, t.* from dbe', totalTime: 60761, calls: 3, avgTime: 20254, cpuTime: 61576, ioTime: 0, rows: 958 },
        { sqlId: '3808672519', uniqueSqlId: 3808672519, userName: 'omm', text: 'select ?, ?, t.* from dbe', totalTime: 57535, calls: 3, avgTime: 19178, cpuTime: 58286, ioTime: 0, rows: 652 },
        { sqlId: '3677705883', uniqueSqlId: 3677705883, userName: 'omm', text: 'select ?, ?, t.* from dbe', totalTime: 52269, calls: 3, avgTime: 17423, cpuTime: 53066, ioTime: 0, rows: 958 },
      ],
      objectStats: [
          { schema: 'public', name: 'bmsql_customer', type: 'Table', seqScan: 20, idxScan: 5000, tupIns: 0, tupUpd: 150, tupDel: 0, liveTup: 30000, deadTup: 20 },
          { schema: 'public', name: 'bmsql_stock', type: 'Table', seqScan: 5, idxScan: 12000, tupIns: 0, tupUpd: 2500, tupDel: 0, liveTup: 100000, deadTup: 1500 },
          { schema: 'public', name: 'bmsql_oorder_idx1', type: 'Index', idxScan: 8500 }
      ],
      configs: [
        { name: 'work_mem', value: '64MB' },
        { name: 'shared_buffers', value: '1GB' }
      ]
    };
  },

  deleteWdrReport: async (id: number): Promise<void> => {
    if (isTauri()) return invoke('delete_wdr_report', { id });
    await new Promise(resolve => setTimeout(resolve, 500));
    // In a real app, you'd delete from state/DB here
    console.log(`Report ${id} deleted`);
    const idx = MOCK_REPORTS.findIndex(r => r.id === id);
    if(idx > -1) MOCK_REPORTS.splice(idx, 1);
    return Promise.resolve();
  },

  // Comparisons
  getComparisons: async (): Promise<WdrComparison[]> => {
    if (isTauri()) return invoke('get_comparisons');
    return Promise.resolve([
        { id: 1, name: 'Dec Week 1 vs Week 2', description: 'Performance check', reportIds: [1288, 1289], createdAt: '2025-12-09' }
    ]);
  },

  getComparisonSummary: async (comparisonId: number): Promise<ComparisonSummary> => {
      if (isTauri()) {
          return invoke('get_comparison_summary', { comparisonId });
      }
      await new Promise(resolve => setTimeout(resolve, 300));
      return MOCK_COMP_SUMMARY;
  },

  getComparisonDetails: async (comparisonId: number, category: ComparisonCategory): Promise<BaseComparisonMetric[]> => {
      if (isTauri()) {
          return invoke('get_comparison_details', { comparisonId, category });
      }

      // Mock delay
      await new Promise(resolve => setTimeout(resolve, 400));

      switch (category) {
          case 'sql': return MOCK_COMP_SQL;
          case 'wait': return MOCK_COMP_WAIT;
          case 'obj': return MOCK_COMP_OBJ;
          case 'sys': return MOCK_COMP_SYS;
          default: return [];
      }
  },

  // Audit Logs
  getAuditLogs: async (): Promise<{ content: AuditLog[], totalElements: number }> => {
    if (isTauri()) return invoke('get_audit_logs');
    return Promise.resolve({ content: MOCK_AUDIT_LOGS, totalElements: MOCK_AUDIT_LOGS.length });
  },

  // SQL Audit
  getSqlAuditIssues: async (): Promise<SqlAuditIssue[]> => {
    if (isTauri()) return invoke('get_sql_audit_issues');
    return Promise.resolve(MOCK_ISSUES);
  },

  // Visualizer
  getWdrHotSqls: async (): Promise<WdrHotSql[]> => {
    if (isTauri()) return invoke('get_wdr_hot_sqls');
    return Promise.resolve(MOCK_HOT_SQLS);
  },

  getExecutionPlan: async (sqlId: string): Promise<ExecutionPlanNode> => {
    if (isTauri()) return invoke('get_execution_plan', { sqlId });
    return new Promise(resolve => setTimeout(() => resolve(MOCK_PLAN_TREE), 500));
  },

  // Dashboard
  getInstanceSummaries: async (): Promise<InstanceSummary[]> => {
    if (isTauri()) return invoke('get_instance_summaries');
    return Promise.resolve(MOCK_INSTANCES);
  },

  getDashboardMetrics: async (instanceName?: string): Promise<DashboardMetrics> => {
    if (isTauri()) return invoke('get_dashboard_metrics', { instanceName });
    await new Promise(resolve => setTimeout(resolve, 300));

    // Simulate different data for different instances
    if (instanceName === 'prod-db-02') {
        return {
            cpu: '85%',
            mem: '72%',
            tps: '8.4k',
            qps: '32.1k',
            healthDistribution: [
                { name: 'Healthy', value: 60 },
                { name: 'Warning', value: 30 },
                { name: 'Critical', value: 10 },
            ],
            trendData: [
                { time: '08:00', value: 60 }, { time: '09:00', value: 75 }, 
                { time: '10:00', value: 92 }, { time: '11:00', value: 85 }, 
                { time: '12:00', value: 70 }, { time: '13:00', value: 78 },
            ],
            hotIssues: [
                { title: 'Lock Wait Timeout', desc: 'Duration: > 5s' },
                { title: 'Deadlock Detected', desc: 'Table: t_payment' },
            ]
        };
    }

    // Default or prod-db-01
    return {
        cpu: '45%',
        mem: '65%',
        tps: '12.3k',
        qps: '45.6k',
        healthDistribution: [
            { name: 'Healthy', value: 90 },
            { name: 'Warning', value: 8 },
            { name: 'Critical', value: 2 },
        ],
        trendData: [
            { time: '08:00', value: 45 }, { time: '09:00', value: 52 }, 
            { time: '10:00', value: 48 }, { time: '11:00', value: 65 }, 
            { time: '12:00', value: 50 }, { time: '13:00', value: 48 },
        ],
        hotIssues: [
            { title: 'High CPU SQL - SELECT * FROM...', desc: 'Duration: 1234s' },
            { title: 'Full Table Scan - t_order', desc: 'Scanned: 1.2B rows' },
            { title: 'Lock Wait Ratio', desc: 'Value: 32%' },
        ]
    };
  }
};