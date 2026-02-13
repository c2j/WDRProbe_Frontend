
// Centralized Knowledge Base Data

// --- 1. Wait Events Knowledge Base ---
export const WAIT_EVENTS_KB: Record<string, { 
    type: string;
    direction: { en: string; zh: string };
    analysis: { en: string; zh: string };
    risk: { en: string; zh: string };
    suggestion: { en: string; zh: string };
}> = {
    'LockMgrLock': {
        type: 'LWLOCK_EVENT',
        direction: { en: 'Lock Contention', zh: '锁竞争' },
        analysis: {
            en: 'High concurrency transaction conflicts or table-level lock requests.',
            zh: '高并发事务冲突：频繁的显式锁操作、DDL 操作或表级锁请求。'
        },
        risk: { en: 'Transaction blocking, reduced throughput.', zh: '事务阻塞、吞吐量下降。' },
        suggestion: { en: 'Reduce explicit locking, split long transactions.', zh: '减少显式锁、拆分长事务。' }
    },
    'DataFileRead': {
        type: 'IO_EVENT',
        direction: { en: 'Physical I/O Bottleneck', zh: '物理 I/O 瓶颈' },
        analysis: {
            en: 'Disk performance insufficient or full table scans not hitting indexes.',
            zh: '磁盘性能不足或全表扫描。特别注意：若原本走索引的SQL突然转为全表扫描，可能是由于数据倾斜导致的统计信息偏差。'
        },
        risk: { en: 'High query latency.', zh: '查询延迟增加，系统响应变慢。' },
        suggestion: { en: 'Optimize queries, check statistics (ANALYZE).', zh: '优化查询、检查统计信息是否失效、执行 ANALYZE。' }
    }
};

// --- 2. Efficiency Metrics Knowledge Base ---
export const EFFICIENCY_KB: Record<string, { title: {en: string, zh: string}, desc: {en: string, zh: string} }> = {
    'efficiency': { 
        title: { en: 'Instance Efficiency', zh: '实例效率百分比' },
        desc: { en: 'Target is 100%. The closer to 100%, the healthier.', zh: '目标值是100%，越接近100%运行越健康。' }
    },
    'bufferHit': { 
        title: { en: 'Buffer Hit', zh: '缓存命中率' },
        desc: { en: 'Ratio of data found in buffer.', zh: '数据库请求在Buffer中命中的比例。' }
    }
};

// --- 3. Plan Operators Knowledge Base ---
export const PLAN_OPERATORS_KB: Record<string, { 
    title: {en: string, zh: string}, 
    desc: {en: string, zh: string},
    pros: {en: string, zh: string},
    cons: {en: string, zh: string},
    keywords: string[] 
}> = {
    'dataSkew': {
        title: { en: 'Stats Misalignment / Skew', zh: '数据倾斜/统计信息失真' },
        desc: { 
            en: 'Optimizer uses stale or biased stats (often in skewed partitions) leading to Seq Scan instead of Index Scan.', 
            zh: '在极度倾斜的分区表场景下，由于随机采样偏差，优化器可能误判表行数极小，从而将索引扫描退化为全表扫描，引发系统崩溃。' 
        },
        pros: { en: 'Sampling is fast for balanced tables.', zh: '平衡分布下采样速度快。' },
        cons: { en: 'Lethal plan regressions in skewed tables.', zh: '极度倾斜下采样极易失真。' },
        keywords: ['stats', 'skew', 'regression', 'analyze']
    },
    'seqScan': {
        title: { en: 'Seq Scan', zh: '全表扫描 (Seq Scan)' },
        desc: { en: 'Sequential scan of the table.', zh: '顺序扫描全表。当估算行数远小于实际行数时，全扫是导致 CPU 和 IO 爆表的罪魁祸首。' },
        pros: { en: 'Fast for small tables.', zh: '对极小表或全量检索最快。' },
        cons: { en: 'Killer for OLTP workloads.', zh: '在大表点查场景下效率极低。' },
        keywords: ['seq scan', 'table scan']
    }
};

// --- 4. Skew Diagnostics (CV/SR) ---
export const SKEW_STANDARDS = {
    CV: { 
        threshold: 1, 
        desc: { 
            en: 'Coefficient of Variation (StdDev/Mean). > 1 indicates severe skew.', 
            zh: '变异系数 (标准差/平均值)。大于1表示数据分布极度离散。' 
        } 
    },
    SR: { 
        threshold: 10, 
        desc: { 
            en: 'Skew Ratio (Max/Mean). > 10 indicates severe skew.', 
            zh: '倾斜比例 (最大分区/平均值)。大于10表示存在“超级分区”。' 
        } 
    }
};
