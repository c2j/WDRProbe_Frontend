
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
        direction: {
            en: 'Lock Contention',
            zh: '锁竞争'
        },
        analysis: {
            en: 'High concurrency transaction conflicts (e.g., SELECT ... FOR UPDATE, DDL operations) or table-level lock requests. May also involve global resource contention like XID allocation.',
            zh: '高并发事务冲突：频繁的显式锁操作（如 SELECT ... FOR UPDATE）、DDL 操作（如索引创建/删除）或表级锁请求。全局资源争用：可能涉及事务 ID 分配、子事务控制等全局锁。临时表操作：若涉及全局临时表（GTT）的元数据变更，可能触发锁竞争。'
        },
        risk: {
            en: 'Transaction blocking, reduced throughput.',
            zh: '事务阻塞、吞吐量下降。'
        },
        suggestion: {
            en: 'Reduce explicit locking, split long transactions, optimize global temp table usage.',
            zh: '减少显式锁、拆分长事务、优化全局临时表使用（改用会话级）。'
        }
    },
    'SInvalReadLock': {
        type: 'LWLOCK_EVENT',
        direction: {
            en: 'System Catalog Invalidation Sync',
            zh: '系统目录失效消息同步'
        },
        analysis: {
            en: 'Frequent metadata changes (DDL, ANALYZE) causing plan cache invalidation. Shared invalidation queue congestion under high concurrency.',
            zh: '元数据频繁变更：大量 DDL 操作（如临时表创建/删除）、ANALYZE、计划缓存失效。共享失效队列（SI Message）拥堵：高并发下会话读取失效消息时排队。'
        },
        risk: {
            en: 'Query plan invalidation, unstable execution efficiency.',
            zh: '查询计划失效、执行效率波动。'
        },
        suggestion: {
            en: 'Reduce frequency of DDLs and Analyze on hot tables.',
            zh: '减少 DDL 频率，避免在业务高峰期进行元数据变更。'
        }
    },
    'DataFileRead': {
        type: 'IO_EVENT',
        direction: {
            en: 'Physical I/O Bottleneck',
            zh: '物理 I/O 瓶颈'
        },
        analysis: {
            en: 'Disk performance insufficient (low throughput/high latency). shared_buffers too small causing frequent disk reads. Full table scans not hitting indexes.',
            zh: '磁盘性能不足：机械盘 I/O 吞吐低或延迟高。内存配置不足：shared_buffers 过小，导致频繁从磁盘读取数据页。全表扫描/大查询：未命中索引的大范围扫描。'
        },
        risk: {
            en: 'High query latency.',
            zh: '查询延迟增加，系统响应变慢。'
        },
        suggestion: {
            en: 'Expand memory, optimize queries to use indexes, upgrade to SSD.',
            zh: '扩容内存、优化查询、使用 SSD。'
        }
    },
    'BufHashTableSearch': {
        type: 'IO_EVENT',
        direction: {
            en: 'Buffer Management Efficiency',
            zh: '缓冲区管理效率'
        },
        analysis: {
            en: 'Contention for shared_buffers hash locks due to high concurrency. Hot spot data access (e.g., index root pages).',
            zh: '共享缓冲区哈希表争用：高并发查询竞争 shared_buffers 的哈希锁。热点数据访问：大量会话频繁访问相同数据页（如索引根页）。'
        },
        risk: {
            en: 'CPU spikes due to spinlocks.',
            zh: 'CPU 冲高（自旋锁）。'
        },
        suggestion: {
            en: 'Increase shared_buffers, optimize hot queries.',
            zh: '增大 shared_buffers、优化热点查询。'
        }
    },
    'WALSync': { // Normalized key from "wait wal sync"
        type: 'STATUS',
        direction: {
            en: 'WAL Write Latency',
            zh: 'WAL 写入延迟'
        },
        analysis: {
            en: 'Disk I/O bottleneck for WAL logs (slow flush). Replication delay if synchronous commit is enabled.',
            zh: '磁盘 I/O 瓶颈：WAL 日志写入慢（synchronous_commit=on 时同步刷盘）。复制延迟：备库同步 WAL 时等待（若涉及同步复制）。'
        },
        risk: {
            en: 'Transaction commit latency, HA failover risk.',
            zh: '事务提交延迟、高可用切换风险。'
        },
        suggestion: {
            en: 'Adjust synchronous_commit, upgrade disk I/O.',
            zh: '调整 synchronous_commit、升级 I/O。'
        }
    },
    'BufMappingLock': {
        type: 'LWLOCK_EVENT',
        direction: {
            en: 'Buffer Mapping Lock Contention',
            zh: '缓冲区映射锁争用'
        },
        analysis: {
            en: 'Conflict accessing data pages under high concurrency. I/O intensive workload causing frequent buffer mapping updates.',
            zh: '数据页访问冲突：高并发会话访问不同数据页时竞争缓冲区映射表锁。IO 密集型负载：大量物理读导致缓冲区映射频繁更新。'
        },
        risk: {
            en: 'Often appears with DataFileRead.',
            zh: '常伴随 DataFileRead 出现。'
        },
        suggestion: {
            en: 'Reduce physical I/O, partition large tables.',
            zh: '减少物理 I/O，考虑大表分区。'
        }
    },
    'SInvalWriteLock': {
        type: 'LWLOCK_EVENT',
        direction: {
            en: 'System Catalog Change Broadcast',
            zh: '系统目录变更广播'
        },
        analysis: {
            en: 'Frequent DDLs (Create/Drop Table/Index/Temp Table) broadcasting invalidation messages. High concurrency sessions registering invalidation.',
            zh: 'DDL 操作频繁：创建/删除表、索引、临时表等操作广播失效消息。高并发会话注册失效：大量会话同时处理目录变更消息。'
        },
        risk: {
            en: 'Catalog sync congestion combined with SInvalReadLock.',
            zh: '与 SInvalReadLock 共同导致目录同步拥堵。'
        },
        suggestion: {
            en: 'Avoid frequent DDLs on temp tables (e.g. ON COMMIT DELETE ROWS).',
            zh: '避免频繁 DDL，检查全局临时表使用逻辑（如 ON COMMIT DELETE ROWS）。'
        }
    },
    'BufferContentLock': {
        type: 'LWLOCK_EVENT',
        direction: {
            en: 'Data Page Access Conflict',
            zh: '数据页访问冲突'
        },
        analysis: {
            en: 'Row/Page level lock contention on hot data pages. Long transaction holding locks causing queuing.',
            zh: '行级锁/页级锁竞争：热点数据页上的 ROW EXCLUSIVE 或 SHARE 锁争用。长事务阻塞：某会话长期持有锁导致其他会话排队。典型场景：高频更新的小表（如计数器表）。'
        },
        risk: {
            en: 'Hotspot contention.',
            zh: '热点争用。'
        },
        suggestion: {
            en: 'Avoid long transactions, optimize update logic.',
            zh: '避免长事务、优化更新逻辑。'
        }
    },
    'FlushData': { // Normalized from "flush data"
        type: 'STATUS',
        direction: {
            en: 'BgWriter Pressure',
            zh: '后台写进程（BgWriter）压力'
        },
        analysis: {
            en: 'Frequent checkpoints or insufficient max_wal_size triggering dirty page flushes. Memory pressure (too many dirty pages).',
            zh: '检查点密集：checkpoint_timeout 过短或 max_wal_size 不足触发频繁刷脏页。内存压力：shared_buffers 中脏页过多，需紧急写入磁盘。'
        },
        risk: {
            en: 'I/O storm, query performance jitter.',
            zh: 'I/O 风暴、查询性能抖动。'
        },
        suggestion: {
            en: 'Tune checkpoint parameters, increase max_wal_size.',
            zh: '调整检查点参数，增大 max_wal_size。'
        }
    },
    'HashAgg': { // Normalized "HashAgg - build hash"
        type: 'STATUS',
        direction: {
            en: 'Query Execution Efficiency',
            zh: '查询执行效率'
        },
        analysis: {
            en: 'Latency in building hash table for aggregation (GROUP BY) on large tables. work_mem insufficient causing spill to disk.',
            zh: '哈希聚合操作延迟：大表分组聚合时构建哈希表耗时（如 GROUP BY）。内存不足：work_mem 过小导致哈希表无法完全放入内存，需写临时文件。'
        },
        risk: {
            en: 'Slow complex queries.',
            zh: '复杂查询变慢。'
        },
        suggestion: {
            en: 'Increase work_mem, optimize aggregation queries.',
            zh: '增大 work_mem、优化聚合查询。'
        }
    }
};

// --- 2. Efficiency Metrics Knowledge Base ---
export const EFFICIENCY_KB: Record<string, { title: {en: string, zh: string}, desc: {en: string, zh: string} }> = {
    'efficiency': { 
        title: { en: 'Instance Efficiency', zh: '实例效率百分比' },
        desc: { en: 'Target is 100%. The closer to 100%, the healthier the database.', zh: '目标值是100%，即越接近100%，数据库运行越健康。' }
    },
    'bufferHit': { 
        title: { en: 'Buffer Hit', zh: 'Buffer Hit (缓存命中率)' },
        desc: { en: 'Ratio of data found in buffer. High is better.', zh: '数据库请求在Buffer中命中的比例。越高代表性能越好。' }
    },
    'effectiveCpu': { 
        title: { en: 'Effective CPU', zh: 'Effective CPU (有效CPU)' },
        desc: { en: 'Ratio of non-idle/wait CPU usage.', zh: '有效CPU使用比例。偏小说明等待状态比例较高。' }
    },
    'walWrite': { 
        title: { en: 'WalWrite NoWait', zh: 'WalWrite NoWait' },
        desc: { en: 'Ratio of WAL writes without waiting. <100% implies need for larger buffer.', zh: 'WAL写不等待比例。小于100%可能需要调大buffer。' }
    },
    'softParse': { 
        title: { en: 'Soft Parse', zh: 'Soft Parse (软解析)' },
        desc: { en: 'Ratio of soft parses. Low values indicate hard parsing.', zh: 'SQL软解析比例。偏小说明存在大量硬解析。' }
    },
    'nonParseCpu': { 
        title: { en: 'Non-Parse CPU', zh: 'Non-Parse CPU' },
        desc: { en: 'Ratio of CPU not used for parsing.', zh: '非解析占用CPU比例。' }
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
    'diskSpill': {
        title: { en: 'Disk Spill', zh: '下盘 (Disk Spill)' },
        desc: { en: 'Operation spilled to disk due to insufficient memory (work_mem).', zh: '由于内存不足(work_mem)，操作溢出到磁盘。' },
        pros: { en: 'Allows execution of large queries.', zh: '允许执行超大内存的查询。' },
        cons: { en: 'Extremely slow I/O.', zh: '极慢的 I/O 操作。' },
        keywords: ['disk', 'spill', 'external merge']
    },
    'nestLoop': {
        title: { en: 'Nested Loop', zh: 'Nested Loop (嵌套循环)' },
        desc: { en: 'Joins two tables by looping.', zh: '通过循环外表并在内表中寻找匹配来连接两个表。' },
        pros: { en: 'Efficient for small outer tables.', zh: '外表较小时效率高。' },
        cons: { en: 'Slow for large tables without indexes.', zh: '如果表很大且无索引，效率极低。' },
        keywords: ['nested loop']
    },
    'hashJoin': {
        title: { en: 'Hash Join', zh: 'Hash Join (哈希连接)' },
        desc: { en: 'Joins by hashing one table.', zh: '哈希连接。' },
        pros: { en: 'Fast for large unsorted sets.', zh: '处理大规模未排序数据集很快。' },
        cons: { en: 'High memory usage.', zh: '内存占用高。' },
        keywords: ['hash join', 'hash right join', 'hash left join']
    },
    'seqScan': {
        title: { en: 'Seq Scan', zh: 'Seq Scan (全表扫描)' },
        desc: { en: 'Sequential scan of the table.', zh: '全表顺序扫描。' },
        pros: { en: 'Fast for small tables or reading all rows.', zh: '小表或读取全量数据时最快。' },
        cons: { en: 'Inefficient for single row lookup.', zh: '单行查找效率低。' },
        keywords: ['seq scan']
    },
    'idxScan': {
        title: { en: 'Index Scan', zh: 'Index Scan (索引扫描)' },
        desc: { en: 'Scanning an index.', zh: '索引扫描。' },
        pros: { en: 'Fast for selective queries.', zh: '高选择性查询非常快。' },
        cons: { en: 'Random I/O if data is scattered.', zh: '如果数据分散，会产生随机 I/O。' },
        keywords: ['index scan']
    },
    // Add more as needed based on the original KNOWLEDGE_KEYS
};
