
# Desktop 前后台 IPC 交互接口设计

本文档定义了前端 (React) 与 后端 (Tauri/Rust) 之间的通信接口。前端通过 `window.__TAURI__.invoke` 调用下列命令。

## 1. 仪表盘相关 (Dashboard)

### `get_instance_summaries`
*   **描述**: 获取所有纳管实例的概览信息。
*   **输入**: 无
*   **输出**: `InstanceSummary[]`
    ```json
    [
      { "instanceName": "prod-db-01", "status": "Healthy", "healthScore": 92, "activeIssues": 2, ... }
    ]
    ```

### `get_dashboard_metrics`
*   **描述**: 获取仪表盘核心指标及趋势数据。
*   **输入**: `{ instanceName?: string }` (可选，不传则返回全局聚合数据)
*   **输出**: `DashboardMetrics` (包含 CPU/Mem/TPS/QPS, trendData, hotIssues 等)

## 2. 报告管理 (Report Management)

### `get_wdr_reports`
*   **描述**: 获取 WDR 报告列表。
*   **输入**: 无
*   **输出**: `WdrReport[]`

### `get_wdr_report_detail`
*   **描述**: 获取指定 ID 报告的详细数据（用于详情页）。
*   **输入**: `{ id: number }`
*   **输出**: `WdrReportDetail`
    *   包含 `efficiency`, `loadProfile`, `topSql`, `objectStats` 等详细结构。

### `delete_wdr_report`
*   **描述**: 删除指定报告。
*   **输入**: `{ id: number }`
*   **输出**: `void`

## 3. 对比分析 (Comparison)

### `get_comparisons`
*   **描述**: 获取已保存的对比分析历史。
*   **输入**: 无
*   **输出**: `WdrComparison[]`

### `get_comparison_summary`
*   **描述**: 获取对比分析的智能摘要结论。
*   **输入**: `{ comparisonId: number }`
*   **输出**: `ComparisonSummary`
    ```json
    { "status": "Degraded", "scoreChange": -12, "conclusion": "...", "keyFindings": [...] }
    ```

### `get_comparison_details`
*   **描述**: 获取特定类别的详细对比数据。
*   **输入**:
    *   `comparisonId`: number
    *   `category`: 'sql' | 'wait' | 'obj' | 'sys'
*   **输出**: `BaseComparisonMetric[]` (根据 category 返回不同的扩展类型，如 `SqlComparisonMetric` 包含 `physicalReads1/2` 等)

## 4. 执行计划 (Visualizer)

### `get_wdr_hot_sqls`
*   **描述**: 获取 WDR 报告中识别出的 Top/Hot SQL 列表，用于快速导入。
*   **输入**: 无
*   **输出**: `WdrHotSql[]`

### `get_execution_plan`
*   **描述**: 获取指定 SQL ID 或文本的执行计划树结构。
*   **输入**: `{ sqlId: string }` (如果是手动输入的 SQL，ID 可传特定标识)
*   **输出**: `ExecutionPlanNode` (递归树结构)

## 5. 阈值与配置 (Thresholds)

### `get_threshold_configs`
*   **描述**: 获取所有阈值配置项。
*   **输入**: 无
*   **输出**: `ThresholdConfig[]`

### `update_threshold`
*   **描述**: 更新单个阈值。
*   **输入**:
    *   `key`: string
    *   `value`: number
*   **输出**: `void`

### `batch_update_thresholds`
*   **描述**: 批量更新阈值。
*   **输入**: `{ map: Record<string, number> }`
*   **输出**: `void`

## 6. 审计与日志 (Audit)

### `get_sql_audit_issues`
*   **描述**: 获取 SQL 审计发现的问题列表。
*   **输入**: 无
*   **输出**: `SqlAuditIssue[]`

### `get_audit_logs`
*   **描述**: 获取系统操作审计日志。
*   **输入**: 分页参数 (隐含)
*   **输出**: `{ content: AuditLog[], totalElements: number }`
