
# WDRProbe 设计规格说明书 (SDS)

## 1. 架构概览
WDRProbe 采用基于 Web 技术栈的桌面应用架构，前后端分离设计。

*   **前端 (Frontend)**: React 19 + TypeScript + Tailwind CSS。负责 UI 渲染、状态管理及用户交互。
*   **后端 (Backend)**: Tauri (Rust)。负责系统底层交互、SQLite/本地数据库访问、WDR 文件解析及重计算逻辑。
*   **通信层**: Tauri IPC (Inter-Process Communication)。

## 2. 前端设计

### 2.1 目录结构
```text
/src
  /components    # 通用组件 (Layout, Nav, etc.)
  /context       # 全局上下文 (I18nProvider)
  /pages         # 页面级组件 (Dashboard, ReportDetail, etc.)
  /services      # API 服务层 (Tauri invoke 封装)
  types.ts       # TypeScript 类型定义
```

### 2.2 核心模块设计

#### 2.2.1 布局模块 (Layout)
*   **侧边栏 (Sidebar)**: 实现收缩/展开功能，包含 Logo 及各功能模块导航。
*   **顶部导航 (Header)**: 包含面包屑导航、语言切换 (I18n)、通知中心及用户信息。
*   **颜色体系**: 扩展 Tailwind 配置，定义 `huawei-blue` 系列主色调 (#0f4c81)。

#### 2.2.2 报告详情模块 (ReportDetail)
*   **数据模型**: `WdrReportDetail`。
*   **视图设计**: 采用 Tab 页签模式 (Overview, SQL Stats, Object Stats)。
*   **组件**:
    *   `EfficiencyGauge`: 自定义圆环进度条组件，根据阈值动态显示绿/黄/红状态。
    *   `TopSQL Table`: 支持前端排序，点击行弹出右侧抽屉显示完整 SQL 和性能拆解。

#### 2.2.3 对比分析模块 (ComparisonAnalysis)
*   **逻辑**: 基于 `sourceId` 和 `targetId` 获取差异数据。
*   **可视化**: 使用 `recharts` 库绘制对比柱状图 (`BarChart`)，直观展示 CPU/IO/DBTime 的 R1 vs R2 差异。
*   **数据展示**: 表格中增加 `Diff` 列，使用红绿箭头 (`ArrowUp`/`ArrowDown`) 标识性能变化方向。

#### 2.2.4 执行计划可视化 (Plan Visualizer)
*   **布局**: 三栏布局（SQL 编辑器、文本计划、可视化树），支持最大化/最小化/隐藏特定面板。
*   **树形渲染**: 递归组件 `TreeNode`，根据 Cost 值动态改变节点边框颜色（Red/Green）。
*   **交互**: 点击节点在右下角显示详细属性（Output, Filter, Buffers）。

### 2.3 数据模型 (关键 Types)

*   **WdrReport**: 报告元数据。
*   **WdrReportDetail**: 包含 Snapshot 范围、Load Profile、Top SQL 列表。
*   **SqlComparisonMetric**: 包含执行次数、CPU 时间、物理读/逻辑读的对比数据。
*   **ExecutionPlanNode**: 递归结构，包含 `operation`, `cost`, `rows`, `children`。

## 3. UI/UX 设计规范
*   **字体**: Sans-serif, Antialiased。
*   **图标库**: Lucide React。
*   **加载状态**: 全局使用 `Loader2` 动画组件。
*   **反馈**: 关键操作使用模态框 (Modal) 确认。

## 4. 国际化设计
*   使用 `React Context` (`I18nContext`) 管理当前语言状态。
*   字典对象 `translations` 存储 `en`/`zh` 键值对。
*   组件内通过 `t('key')` 函数获取文本。
