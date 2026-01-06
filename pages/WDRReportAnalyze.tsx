import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useI18n } from '../context/I18nContext';
import { useWDRContext } from '../context/WDRContext';
import { 
  FileText, Upload, AlertCircle, CheckCircle, Database, 
  Activity, Layers, Clock, Server, FileSearch, Zap,
  AlertTriangle, ChevronRight, BarChart2, X, ArrowUp, ArrowDown, ArrowUpDown, Table, Settings, Timer,
  Maximize2, Minimize2, Cpu, HardDrive, History, Trash2, ChevronLeft, ExternalLink, BookOpen, Search, Info
} from 'lucide-react';
import { WdrReportDetail, WdrEfficiency, WdrObjectStat, WdrWaitEvent, WdrConfigSetting, RiskIssue, WdrTopSqlItem } from '../types';

type SortDirection = 'asc' | 'desc';
interface SortConfig {
    key: string;
    direction: SortDirection;
}

// Knowledge Base Data Definition
const WDR_KB_DATA = [
    { key: 'efficiency', i18nKey: 'wdr.kb.efficiency', icon: Zap },
    { key: 'bufferHit', i18nKey: 'wdr.kb.bufferHit', icon: Activity },
    { key: 'effectiveCpu', i18nKey: 'wdr.kb.effectiveCpu', icon: Cpu },
    { key: 'walWrite', i18nKey: 'wdr.kb.walWrite', icon: HardDrive },
    { key: 'softParse', i18nKey: 'wdr.kb.softParse', icon: FileText }, 
    { key: 'nonParseCpu', i18nKey: 'wdr.kb.nonParseCpu', icon: Cpu },
];

const WDRKnowledgePanel: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    const { t } = useI18n();
    const [searchTerm, setSearchTerm] = useState('');

    if (!isOpen) return null;

    const filteredItems = WDR_KB_DATA.filter(k => 
        t(`${k.i18nKey}.title`).toLowerCase().includes(searchTerm.toLowerCase()) ||
        t(`${k.i18nKey}.desc`).toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="absolute top-0 right-0 h-full w-80 bg-white shadow-2xl z-40 flex flex-col animate-in slide-in-from-right border-l border-gray-200">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h3 className="font-semibold text-gray-800 flex items-center">
                    <BookOpen size={18} className="mr-2 text-blue-600"/>
                    {t('wdr.kb.title')}
                </h3>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                    <X size={18} />
                </button>
            </div>
            <div className="p-3 border-b border-gray-100 bg-white">
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-2.5 text-gray-400"/>
                    <input 
                        type="text" 
                        placeholder={t('wdr.kb.search')}
                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
                {filteredItems.length === 0 ? (
                    <div className="text-center text-gray-400 text-sm py-4">No matching items.</div>
                ) : (
                    filteredItems.map(item => {
                        const Icon = item.icon;
                        return (
                            <div key={item.key} className="bg-white rounded-lg p-4 shadow-sm border border-gray-100 hover:shadow-md transition-all">
                                <div className="flex items-center mb-2">
                                    <div className="p-2 rounded-lg mr-3 bg-blue-50 text-blue-600">
                                        <Icon size={18} />
                                    </div>
                                    <h4 className="font-bold text-sm text-gray-800">{t(`${item.i18nKey}.title`)}</h4>
                                </div>
                                <p className="text-xs text-gray-600 leading-relaxed text-justify">
                                    {t(`${item.i18nKey}.desc`)}
                                </p>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

const WDRReportAnalyze: React.FC = () => {
  const { t } = useI18n();
  // Use Context for persistent state
  const {
      report, setReport,
      risks, setRisks,
      activeTab, setActiveTab,
      selectedSql, setSelectedSql,
      selectedObject, setSelectedObject,
      objTypeFilter, setObjTypeFilter,
      reportHistory, setReportHistory
  } = useWDRContext();

  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showKnowledgeBase, setShowKnowledgeBase] = useState(false);
  
  // Risk Panel State
  const [activeRiskCategory, setActiveRiskCategory] = useState<string | null>(null);

  // Sorting State
  const [sqlSort, setSqlSort] = useState<SortConfig>({ key: 'totalTime', direction: 'desc' });
  const [objSort, setObjSort] = useState<SortConfig>({ key: 'deadTup', direction: 'desc' });
  const [waitSort, setWaitSort] = useState<SortConfig>({ key: 'pctDBTime', direction: 'desc' });
  const [riskSort, setRiskSort] = useState<SortConfig>({ key: 'severity', direction: 'desc' });

  // UI State
  const [isMaximized, setIsMaximized] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Parser Logic ---
  
  const parseHtml = (html: string) => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // 1. Meta Data (Host Info table)
      const tables = doc.querySelectorAll('table.tdiff');
      let instanceName = 'Unknown Instance';
      let version = '';
      let cpu = '';
      let memory = '';
      const hostTable = Array.from(tables).find(tbl => tbl.textContent?.includes('Host Node Name'));
      
      if (hostTable) {
          const headerRow = hostTable.querySelector('tr');
          let nameIdx = 0;
          let verIdx = -1;
          let cpuIdx = -1;
          let memIdx = -1;
          
          if (headerRow) {
              const headers = Array.from(headerRow.cells).map(c => c.textContent?.trim().toLowerCase() || '');
              nameIdx = headers.findIndex(h => h.includes('host node name'));
              if (nameIdx === -1) nameIdx = 0;
              
              // CPU
              cpuIdx = headers.findIndex(h => h.includes('cpus') || h.includes('cores'));
              // Memory
              memIdx = headers.findIndex(h => h.includes('memory') || h.includes('physical memory'));
              // Version
              verIdx = headers.findIndex(h => h.includes('version'));
          }

          const row = hostTable.querySelectorAll('tr')[1];
          if (row) {
              const cells = row.querySelectorAll('td');
              if (cells.length > nameIdx) instanceName = cells[nameIdx].textContent?.trim() || 'Unknown';
              
              if (cpuIdx !== -1 && cells.length > cpuIdx) {
                  cpu = cells[cpuIdx].textContent?.trim() || '';
              } else if (cells.length > 1) {
                  // Fallback: 2nd column often CPU info if headers ambiguous
                  cpu = cells[1].textContent?.trim() || ''; 
              }

              if (memIdx !== -1 && cells.length > memIdx) {
                  memory = cells[memIdx].textContent?.trim() || '';
              } else if (cells.length > 4) {
                  // Fallback: 5th column often Memory if headers ambiguous
                  memory = cells[4].textContent?.trim() || '';
              }

              if (verIdx !== -1 && cells.length > verIdx) {
                  version = cells[verIdx].textContent?.trim() || '';
              } else if (cells.length >= 6) {
                  // Fallback: usually the last column in standard WDR reports
                  version = cells[cells.length - 1].textContent?.trim() || '';
              }
          }
      }

      // Snapshot Info
      const snapTable = Array.from(tables).find(tbl => tbl.textContent?.includes('Snapshot Id'));
      let snapshots = { start: '', end: '' };
      if (snapTable) {
          const rows = snapTable.querySelectorAll('tr');
          if (rows.length >= 3) {
             const r1 = rows[1].querySelectorAll('td');
             const r2 = rows[2].querySelectorAll('td');
             snapshots.start = r1[1]?.textContent?.trim() || '';
             snapshots.end = r2[2]?.textContent?.trim() || '';
          }
      }

      // 2. Efficiency
      const effTable = doc.getElementById('Instance_Efficiency_Percentages_(Target_100%)2')?.querySelector('table');
      const efficiency: WdrEfficiency[] = [];
      if (effTable) {
          effTable.querySelectorAll('tr').forEach((row, idx) => {
              if (idx === 0) return;
              const cells = row.querySelectorAll('td');
              if (cells.length >= 2) {
                  efficiency.push({
                      name: cells[0].textContent?.trim() || '',
                      value: parseFloat(cells[1].textContent?.trim() || '0'),
                      target: 90
                  });
              }
          });
      }

      // 3. Load Profile
      const loadTable = doc.getElementById('Load_Profile2')?.querySelector('table');
      const loadProfile: any[] = [];
      if (loadTable) {
          loadTable.querySelectorAll('tr').forEach((row, idx) => {
              if (idx === 0) return;
              const cells = row.querySelectorAll('td');
              if (cells.length >= 2) {
                  loadProfile.push({
                      metric: cells[0].textContent?.trim() || '',
                      perSec: parseFloat(cells[1].textContent?.trim() || '0'),
                      perTxn: parseFloat(cells[2].textContent?.trim() || '0'),
                      perExec: parseFloat(cells[3]?.textContent?.trim() || '0')
                  });
              }
          });
      }

      // 3.5 Wait Events
      const waitEvents: WdrWaitEvent[] = [];
      const waitEventContainerIds = [
          'Top_10_Foreground_Events_by_Total_Wait_Time2',
          'Top_10_Foreground_Events_by_Total_Wait_Time',
          'Top_10_Events_by_Total_Wait_Time2',
          'Top_10_Events_by_Total_Wait_Time',
          'Wait_Events(by_wait_time)2',
          'Wait_Events(by_wait_time)'
      ];

      let waitTable: HTMLTableElement | null = null;
      for (const id of waitEventContainerIds) {
          const div = doc.getElementById(id);
          if (div) {
              waitTable = div.querySelector('table');
              if (waitTable) break;
          }
      }

      if (waitTable) {
          const rows = Array.from(waitTable.querySelectorAll('tr'));
          if (rows.length > 1) {
              const headerCells = Array.from(rows[0].querySelectorAll('th, td')).map(cell => cell.textContent?.trim().toLowerCase() || '');
              
              const findCol = (keywords: string[]) => headerCells.findIndex(h => keywords.some(k => h === k || h.includes(k)));
              const findStrict = (keyword: string) => headerCells.findIndex(h => h === keyword);

              let idxEvent = findCol(['event']);
              let idxClass = findCol(['class', 'type']);
              let idxWaits = findStrict('waits'); 
              if (idxWaits === -1) idxWaits = findCol(['waits']);
              
              let idxTotal = findCol(['total wait time', 'time(us)']);
              let idxAvg = findCol(['avg wait time']);
              let idxPct = findCol(['% db time', 'pct']);

              if (idxEvent === -1) {
                  if (headerCells[0]?.includes('type') && headerCells[1]?.includes('event')) {
                      idxClass = 0; idxEvent = 1; idxTotal = 2; idxWaits = 3; idxAvg = 5;
                  } else if (headerCells[0]?.includes('event')) {
                      idxEvent = 0; idxClass = 1; idxWaits = 2; idxTotal = 3;
                  }
              }

              rows.slice(1).forEach(row => {
                  const cells = row.querySelectorAll('td');
                  if (cells.length === 0) return;

                  const getText = (i: number) => (i >= 0 && i < cells.length) ? cells[i].textContent?.trim() || '' : '';
                  const getNum = (i: number) => {
                      const t = getText(i);
                      return t ? parseFloat(t.replace(/,/g, '')) : 0;
                  };

                  const event = getText(idxEvent);
                  if (event) {
                      waitEvents.push({
                          event,
                          waitClass: getText(idxClass) || 'Other',
                          waits: getNum(idxWaits),
                          totalWaitTime: getNum(idxTotal),
                          avgWaitTime: getNum(idxAvg),
                          pctDBTime: getNum(idxPct)
                      });
                  }
              });
          }
      }

      // 3.6 Parse Full SQL Text Map
      const sqlTextMap = new Map<number, string>();
      let sqlTextTable: HTMLTableElement | null = null;
      const textDiv = doc.getElementById('SQL_Text2') || doc.getElementById('SQL_Text');
      if (textDiv) sqlTextTable = textDiv.querySelector('table');
      if (!sqlTextTable) {
          doc.querySelectorAll('table').forEach(tbl => {
              const header = tbl.rows[0]?.textContent || '';
              if (header.includes('Unique SQL Id') && header.includes('SQL Text')) {
                  sqlTextTable = tbl;
              }
          });
      }
      if (sqlTextTable) {
          const rows = sqlTextTable.rows;
          const headerCells = rows[0].cells;
          let idColIdx = -1;
          let textColIdx = -1;
          for(let i=0; i<headerCells.length; i++) {
              const txt = headerCells[i].textContent?.trim() || '';
              if (txt.includes('Unique SQL Id')) idColIdx = i;
              if (txt.includes('SQL Text')) textColIdx = i;
          }
          if (idColIdx >= 0 && textColIdx >= 0) {
              for (let i = 1; i < rows.length; i++) {
                  const cells = rows[i].cells;
                  if (cells.length > Math.max(idColIdx, textColIdx)) {
                      const idVal = parseInt(cells[idColIdx].textContent?.trim() || '0');
                      let sqlVal = '';
                      const textCell = cells[textColIdx];
                      if (textCell.innerHTML.includes('<br')) {
                          sqlVal = textCell.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
                          const txtArea = document.createElement('textarea');
                          txtArea.innerHTML = sqlVal;
                          sqlVal = txtArea.value;
                      } else {
                          sqlVal = textCell.textContent || '';
                      }
                      if (idVal && sqlVal) {
                          sqlTextMap.set(idVal, sqlVal.trim());
                      }
                  }
              }
          }
      }

      // 4. Top SQL (Enhanced Parsing)
      const topSqlDiv = doc.getElementById('SQL_ordered_by_Elapsed_Time2') || doc.getElementById('SQL_ordered_by_Elapsed_Time');
      const topSqlTable = topSqlDiv?.querySelector('table');
      const topSql: WdrTopSqlItem[] = [];
      if (topSqlTable) {
          const rows = Array.from(topSqlTable.querySelectorAll('tr'));
          if (rows.length > 1) {
              const headerCells = Array.from(rows[0].querySelectorAll('th, td')).map(cell => cell.textContent?.trim().toLowerCase() || '');
              const getIdx = (keywords: string[]) => headerCells.findIndex(h => keywords.some(k => h.includes(k.toLowerCase())));
              
              // Mapping headers to indices
              const idxUniqueId = getIdx(['unique sql id']);
              const idxUser = getIdx(['user name']);
              const idxTotalTime = getIdx(['total elapse time']);
              const idxCpu = getIdx(['cpu time']);
              const idxAvgTime = getIdx(['avg elapse time']);
              const idxRows = getIdx(['returned rows']);
              const idxCalls = getIdx(['calls']);
              const idxTuplesRead = getIdx(['tuples read']);
              const idxPhyRead = getIdx(['physical read']);
              const idxLogRead = getIdx(['logical read']);
              const idxMinTime = getIdx(['min elapse time']);
              const idxMaxTime = getIdx(['max elapse time']);
              const idxTuplesAff = getIdx(['tuples affected']);
              const idxIoTime = getIdx(['data io time']);
              const idxSortCnt = getIdx(['sort count']);
              const idxSortTime = getIdx(['sort time']);
              const idxSortMem = getIdx(['sort mem used']);
              const idxSortSpillCnt = getIdx(['sort spill count']);
              const idxSortSpillSz = getIdx(['sort spill size']);
              const idxHashCnt = getIdx(['hash count']);
              const idxHashTime = getIdx(['hash time']);
              const idxHashMem = getIdx(['hash mem used']);
              const idxHashSpillCnt = getIdx(['hash spill count']);
              const idxHashSpillSz = getIdx(['hash spill size']);
              const idxText = getIdx(['sql text']);

              rows.slice(1).forEach(row => {
                  const cells = row.querySelectorAll('td');
                  if (cells.length < 5) return; // Basic validation

                  const getText = (i: number) => (i >= 0 && i < cells.length) ? cells[i].textContent?.trim() || '' : '';
                  const getNum = (i: number) => {
                      if (i < 0 || i >= cells.length) return 0;
                      const t = cells[i].textContent?.trim() || '';
                      return t ? parseFloat(t.replace(/,/g, '')) : 0;
                  };

                  const uniqueSqlId = getNum(idxUniqueId);
                  const truncatedText = getText(idxText);
                  const fullText = sqlTextMap.get(uniqueSqlId) || truncatedText;

                  topSql.push({
                      uniqueSqlId,
                      sqlId: String(uniqueSqlId),
                      userName: getText(idxUser),
                      text: fullText,
                      
                      totalTime: getNum(idxTotalTime),
                      cpuTime: getNum(idxCpu),
                      avgTime: getNum(idxAvgTime),
                      minTime: getNum(idxMinTime),
                      maxTime: getNum(idxMaxTime),
                      ioTime: getNum(idxIoTime),
                      
                      rows: getNum(idxRows),
                      calls: getNum(idxCalls),
                      tuplesRead: getNum(idxTuplesRead),
                      tuplesAffected: getNum(idxTuplesAff),
                      
                      physicalRead: getNum(idxPhyRead),
                      logicalRead: getNum(idxLogRead),
                      
                      sortCount: getNum(idxSortCnt),
                      sortTime: getNum(idxSortTime),
                      sortMemUsed: getNum(idxSortMem),
                      sortSpillCount: getNum(idxSortSpillCnt),
                      sortSpillSize: getNum(idxSortSpillSz),
                      
                      hashCount: getNum(idxHashCnt),
                      hashTime: getNum(idxHashTime),
                      hashMemUsed: getNum(idxHashMem),
                      hashSpillCount: getNum(idxHashSpillCnt),
                      hashSpillSize: getNum(idxHashSpillSz),
                  });
              });
          }
      }

      // 5. Object Stats (Tables & Indexes)
      const objectStats: WdrObjectStat[] = [];
      
      // 5.1 User Tables
      const tablesDiv = doc.getElementById('User_Tables_stats2') || doc.getElementById('User_Tables_stats');
      const tablesTable = tablesDiv?.querySelector('table');
      if (tablesTable) {
          tablesTable.querySelectorAll('tr').forEach((row, idx) => {
              if (idx === 0) return;
              const cells = row.querySelectorAll('td');
              if (cells.length > 10) {
                  objectStats.push({
                      schema: cells[1].textContent?.trim() || '',
                      name: cells[2].textContent?.trim() || '',
                      type: 'Table',
                      seqScan: parseInt(cells[3].textContent?.trim() || '0'),
                      idxScan: parseInt(cells[5].textContent?.trim() || '0'),
                      tupIns: parseInt(cells[7].textContent?.trim() || '0'),
                      tupUpd: parseInt(cells[8].textContent?.trim() || '0'),
                      tupDel: parseInt(cells[9].textContent?.trim() || '0'),
                      liveTup: parseInt(cells[11].textContent?.trim() || '0'),
                      deadTup: parseInt(cells[12].textContent?.trim() || '0')
                  });
              }
          });
      }

      // 5.2 User Indexes (Added)
      const indexesDiv = doc.getElementById('User_Indexes_stats2') || doc.getElementById('User_Indexes_stats');
      const indexesTable = indexesDiv?.querySelector('table');
      if (indexesTable) {
          indexesTable.querySelectorAll('tr').forEach((row, idx) => {
              if (idx === 0) return;
              const cells = row.querySelectorAll('td');
              if (cells.length > 5) {
                  // Assuming: Schema, Table, Index, Idx Scan, Idx Tup Read, Idx Tup Fetch
                  objectStats.push({
                      schema: cells[1].textContent?.trim() || '',
                      tableName: cells[2].textContent?.trim() || '',
                      name: cells[3].textContent?.trim() || '',
                      type: 'Index',
                      idxScan: parseInt(cells[4].textContent?.trim() || '0'),
                      idxTupRead: parseInt(cells[5].textContent?.trim() || '0'),
                      idxTupFetch: parseInt(cells[6]?.textContent?.trim() || '0')
                  });
              }
          });
      }

      // 6. Configs
      const configsDiv = doc.getElementById('Configuration_settings2') || doc.getElementById('Configuration_settings');
      const configsTable = configsDiv?.querySelector('table');
      const configs: WdrConfigSetting[] = [];
      if (configsTable) {
          configsTable.querySelectorAll('tr').forEach((row, idx) => {
              if (idx === 0) return;
              const cells = row.querySelectorAll('td');
              if (cells.length >= 2) {
                  configs.push({
                      name: cells[0].textContent?.trim() || '',
                      value: cells[1].textContent?.trim() || ''
                  });
              }
          });
      }

      return {
          id: Date.now(),
          meta: {
              id: Date.now(),
              instanceName,
              version,
              cpu,
              memory,
              generateTime: new Date().toLocaleString(),
              period: `${snapshots.start} - ${snapshots.end}`,
              status: 'Success'
          },
          snapshots,
          efficiency,
          loadProfile,
          waitEvents,
          topSql: topSql.slice(0, 100),
          objectStats: objectStats.slice(0, 200), // Limit for performace
          configs: configs
      } as WdrReportDetail;
  };

  const analyzeRisks = (data: WdrReportDetail): RiskIssue[] => {
      const risks: RiskIssue[] = [];

      // 1. Efficiency Checks
      const bufHit = data.efficiency.find(e => e.name.includes('Buffer Hit'));
      if (bufHit && bufHit.value < 95) {
          risks.push({
              severity: bufHit.value < 90 ? 'High' : 'Medium',
              title: t('wdr.issue.bufferHit'),
              description: t('wdr.issue.bufferHitDesc', { val: bufHit.value }),
              category: 'System',
              relatedType: 'system'
          });
      }

      // 2. Load Profile Checks
      const cpuTime = data.loadProfile.find(l => l.metric.includes('CPU Time'));
      const dbTime = data.loadProfile.find(l => l.metric.includes('DB Time'));
      if (cpuTime && dbTime && dbTime.perSec > 0) {
          const ratio = cpuTime.perSec / dbTime.perSec;
          if (ratio > 0.9) {
              risks.push({
                  severity: 'Medium',
                  title: t('wdr.issue.cpu'),
                  description: t('wdr.issue.cpuDesc'),
                  category: 'System',
                  relatedType: 'system'
              });
          }
      }

      // 3. Object Stats (Dead Tuples)
      data.objectStats.forEach(obj => {
          if (obj.type === 'Table' && obj.deadTup && obj.deadTup > 10000 && obj.liveTup && obj.deadTup > obj.liveTup * 0.1) {
              risks.push({
                  severity: 'High',
                  title: t('wdr.issue.deadTup'),
                  description: t('wdr.issue.deadTupDesc', { table: obj.name, count: obj.deadTup }),
                  category: 'Object',
                  relatedId: obj.name,
                  relatedType: 'object',
                  extra: {
                      'Dead Tuples': obj.deadTup.toLocaleString(),
                      'Live Tuples': obj.liveTup ? obj.liveTup.toLocaleString() : '0'
                  }
              });
          }
      });

      // 4. Slow SQL
      data.topSql.forEach(sql => {
          if (sql.avgTime > 3000000) { // 3s
              risks.push({
                  severity: 'High',
                  title: t('wdr.issue.slowSql'),
                  description: t('wdr.issue.slowSqlDesc', { id: sql.uniqueSqlId, time: (sql.avgTime/1000).toFixed(0) }),
                  category: 'SQL',
                  relatedId: sql.uniqueSqlId,
                  relatedType: 'sql',
                  extra: {
                      'Calls': sql.calls,
                      'Avg Time': `${(sql.avgTime/1000).toFixed(0)}ms`
                  }
              });
          }
      });

      return risks;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) processFile(file);
  };

  const processFile = (file: File) => {
      setLoading(true);
      const reader = new FileReader();
      reader.onload = (ev) => {
          const html = ev.target?.result as string;
          try {
              const parsedData = parseHtml(html);
              const riskAnalysis = analyzeRisks(parsedData);
              setReport(parsedData);
              setRisks(riskAnalysis);
              setActiveRiskCategory(null);
              
              // Add to history if unique
              setReportHistory(prev => {
                  const exists = prev.some(r => 
                      r.meta.instanceName === parsedData.meta.instanceName && 
                      r.meta.generateTime === parsedData.meta.generateTime
                  );
                  if (exists) return prev;
                  return [parsedData, ...prev];
              });
          } catch (err) {
              console.error(err);
              alert('Error parsing WDR report. Please ensure it is a valid OpenGauss WDR HTML file.');
          } finally {
              setLoading(false);
          }
      };
      reader.readAsText(file);
  };

  const loadFromHistory = (item: WdrReportDetail) => {
      setReport(item);
      setRisks(analyzeRisks(item));
      setActiveRiskCategory(null);
      setShowHistory(false);
  };

  const deleteFromHistory = (id: number, e: React.MouseEvent) => {
      e.stopPropagation();
      setReportHistory(reportHistory.filter(r => r.id !== id));
  };

  const getHealthScore = () => {
      if (!report) return 0;
      let score = 100;
      risks.forEach(r => {
          if (r.severity === 'High') score -= 15;
          if (r.severity === 'Medium') score -= 5;
          if (r.severity === 'Low') score -= 2;
      });
      return Math.max(0, score);
  };

  // --- Sort Logic ---
  const handleSort = (setter: React.Dispatch<React.SetStateAction<SortConfig>>, key: string) => {
      setter(prev => ({
          key,
          direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
      }));
  };

  const sortedTopSql = useMemo(() => {
      if (!report) return [];
      const data = [...report.topSql];
      return data.sort((a: any, b: any) => {
          const valA = a[sqlSort.key];
          const valB = b[sqlSort.key];
          if (valA < valB) return sqlSort.direction === 'asc' ? -1 : 1;
          if (valA > valB) return sqlSort.direction === 'asc' ? 1 : -1;
          return 0;
      });
  }, [report, sqlSort]);

  const sortedObjectStats = useMemo(() => {
      if (!report) return [];
      let data = report.objectStats;
      if (objTypeFilter !== 'All') {
          data = data.filter(o => o.type === objTypeFilter);
      }
      return data.sort((a: any, b: any) => {
          const valA = a[objSort.key] ?? -1;
          const valB = b[objSort.key] ?? -1;
          if (valA < valB) return objSort.direction === 'asc' ? -1 : 1;
          if (valA > valB) return objSort.direction === 'asc' ? 1 : -1;
          return 0;
      });
  }, [report, objSort, objTypeFilter]);

  const sortedWaitEvents = useMemo(() => {
      if (!report) return [];
      const data = [...report.waitEvents];
      return data.sort((a: any, b: any) => {
          const valA = a[waitSort.key];
          const valB = b[waitSort.key];
          if (valA < valB) return waitSort.direction === 'asc' ? -1 : 1;
          if (valA > valB) return waitSort.direction === 'asc' ? 1 : -1;
          return 0;
      });
  }, [report, waitSort]);

  const riskGroups = useMemo(() => {
      const groups: Record<string, RiskIssue[]> = {};
      risks.forEach(r => {
          if (!groups[r.category]) groups[r.category] = [];
          groups[r.category].push(r);
      });
      return groups;
  }, [risks]);

  const sortedRisks = useMemo(() => {
      if (!activeRiskCategory) return [];
      const items = riskGroups[activeRiskCategory] || [];
      
      return [...items].sort((a, b) => {
          const key = riskSort.key;
          let valA: any = '';
          let valB: any = '';

          // Determine values
          if (key === 'severity') {
              const weights = { High: 3, Medium: 2, Low: 1 };
              valA = weights[a.severity] || 0;
              valB = weights[b.severity] || 0;
          } else if (['title', 'description'].includes(key)) {
              valA = a[key as keyof RiskIssue];
              valB = b[key as keyof RiskIssue];
          } else {
              // Dynamic extra fields
              valA = a.extra?.[key] ?? '';
              valB = b.extra?.[key] ?? '';
              
              // Try numeric parsing for things like "15021ms" or "1,234"
              const numA = typeof valA === 'string' ? parseFloat(valA.replace(/[^\d.-]/g, '')) : valA;
              const numB = typeof valB === 'string' ? parseFloat(valB.replace(/[^\d.-]/g, '')) : valB;
              
              if (!isNaN(numA) && !isNaN(numB) && valA !== '' && valB !== '') {
                  valA = numA;
                  valB = numB;
              }
          }

          if (valA < valB) return riskSort.direction === 'asc' ? -1 : 1;
          if (valA > valB) return riskSort.direction === 'asc' ? 1 : -1;
          return 0;
      });
  }, [riskGroups, activeRiskCategory, riskSort]);

  // Find related SQLs for selected object
  const relatedSqls = useMemo(() => {
      if (!report || !selectedObject) return [];
      const searchName = selectedObject.type === 'Index' && selectedObject.tableName 
          ? selectedObject.tableName // If index, search for parent table usage
          : selectedObject.name;
          
      return report.topSql.filter(sql => 
          sql.text.toLowerCase().includes(searchName.toLowerCase())
      );
  }, [report, selectedObject]);

  const handleRiskClick = (risk: RiskIssue) => {
      if (!report) return;
      if (risk.relatedType === 'sql' && risk.relatedId) {
          const sql = report.topSql.find(s => s.uniqueSqlId === risk.relatedId);
          if (sql) {
              setSelectedSql(sql);
          }
      } else if (risk.relatedType === 'object' && risk.relatedId) {
          // Assume relatedId is name for now
          const obj = report.objectStats.find(o => o.name === risk.relatedId);
          if (obj) {
              setSelectedObject(obj);
          }
      }
  };

  // Helper for rendering sort headers
  const SortHeader = ({ label, sortKey, currentSort, onSort, align = 'left' }: any) => {
      const isActive = currentSort.key === sortKey;
      return (
          <th 
              className={`px-4 py-2 cursor-pointer hover:bg-gray-100 transition-colors group select-none text-${align}`}
              onClick={() => onSort(sortKey)}
          >
              <div className={`flex items-center ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
                  {label}
                  <span className="ml-1 text-gray-400">
                      {isActive ? (
                          currentSort.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                      ) : (
                          <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-50 transition-opacity" />
                      )}
                  </span>
              </div>
          </th>
      );
  };

  const DetailItem = ({ label, value, unit, highlight = false }: any) => (
      <div className="flex flex-col border-b border-gray-100 pb-2 last:border-0">
          <span className="text-xs text-gray-500 font-medium mb-0.5">{label}</span>
          <span className={`text-sm font-mono ${highlight ? 'font-bold text-gray-800' : 'text-gray-600'}`}>
              {value !== undefined ? value.toLocaleString() : '-'}
              {unit && <span className="text-xs text-gray-400 ml-1">{unit}</span>}
          </span>
      </div>
  );

  if (loading) {
      return (
          <div className="flex h-full flex-col justify-center items-center">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mb-4"></div>
              <p className="text-gray-600">{t('wdr.analyzing')}</p>
          </div>
      );
  }

  if (!report && reportHistory.length === 0) {
      return (
          <div 
            className="flex flex-col items-center justify-center h-full border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 m-4 transition-colors hover:bg-gray-100 hover:border-blue-300"
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
          >
              <FileSearch size={64} className="text-blue-400 mb-6" />
              <h2 className="text-2xl font-bold text-gray-700 mb-2">{t('wdr.upload.title')}</h2>
              <p className="text-gray-500 mb-8 max-w-md text-center">{t('wdr.upload.desc')}</p>
              
              <input 
                  type="file" 
                  accept=".html,.wdr" 
                  ref={fileInputRef} 
                  className="hidden"
                  onChange={handleFileUpload}
              />
              <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 shadow-sm flex items-center transition-transform hover:scale-105"
              >
                  <Upload size={20} className="mr-2" />
                  {t('wdr.upload.btn')}
              </button>
              <p className="text-sm text-gray-400 mt-4">{t('wdr.upload.drag')}</p>
          </div>
      );
  }

  const healthScore = getHealthScore();
  const scoreColor = healthScore >= 80 ? 'text-green-600' : healthScore >= 60 ? 'text-yellow-600' : 'text-red-600';

  return (
    <div className={`h-full flex flex-col ${isMaximized ? 'space-y-0' : 'space-y-4'} relative`}>
        {/* Header Summary */}
        {!isMaximized && report && (
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 flex justify-between items-start shrink-0 relative">
                <div>
                    <div className="flex items-center space-x-3 mb-1">
                        <h2 className="text-lg font-bold text-gray-800">{report.meta.instanceName}</h2>
                        {(report.meta.cpu || report.meta.memory) && (
                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded border border-gray-200 flex items-center">
                                {report.meta.cpu && <span className="mr-2"><Cpu size={10} className="inline mr-1"/>{report.meta.cpu} Cores</span>}
                                {report.meta.memory && <span><HardDrive size={10} className="inline mr-1"/>{report.meta.memory}</span>}
                            </span>
                        )}
                        {report.meta.version && (
                             <span className="text-xs text-gray-500 bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100 max-w-[200px] truncate" title={report.meta.version}>
                                {report.meta.version}
                            </span>
                        )}
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                            {report.meta.period}
                        </span>
                    </div>
                    <p className="text-sm text-gray-500 flex items-center">
                        <Server size={14} className="mr-1"/> OpenGauss 
                        <span className="mx-2">|</span>
                        <Clock size={14} className="mr-1"/> {report.meta.generateTime}
                    </p>
                </div>
                
                <div className="flex space-x-4">
                    <div className="text-right mr-2">
                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{t('wdr.score')}</p>
                        <div className={`text-3xl font-bold ${scoreColor}`}>{healthScore}</div>
                    </div>
                    <div className="flex items-start space-x-2">
                        <button 
                            onClick={() => setShowKnowledgeBase(!showKnowledgeBase)}
                            className={`p-2 rounded-full transition-colors ${showKnowledgeBase ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:text-blue-600 hover:bg-gray-50'}`}
                            title="Knowledge Base"
                        >
                            <BookOpen size={20} />
                        </button>
                        <button 
                            onClick={() => setShowHistory(true)}
                            className="text-gray-400 hover:text-blue-600 hover:bg-gray-50 p-2 rounded-full transition-colors relative"
                            title="Analysis History"
                        >
                            <History size={20} />
                            {reportHistory.length > 0 && <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-blue-500 rounded-full border-2 border-white"></span>}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Empty state but with history - show simplified upload + history button */}
        {!report && reportHistory.length > 0 && (
             <div className="flex-1 flex flex-col items-center justify-center space-y-6">
                 <div className="absolute top-4 right-4">
                    <button onClick={() => setShowHistory(true)} className="flex items-center text-gray-500 hover:text-blue-600">
                        <History size={20} className="mr-2"/> View History ({reportHistory.length})
                    </button>
                 </div>
                 <div onClick={() => fileInputRef.current?.click()} className="cursor-pointer bg-white p-12 rounded-xl border-2 border-dashed border-gray-300 hover:border-blue-400 text-center">
                     <FileSearch size={48} className="mx-auto text-gray-400 mb-4" />
                     <h3 className="text-lg font-medium text-gray-700">No report active</h3>
                     <p className="text-gray-500 text-sm mt-2">Upload a new report or select from history</p>
                     <input type="file" accept=".html,.wdr" ref={fileInputRef} className="hidden" onChange={handleFileUpload}/>
                 </div>
             </div>
        )}

        {/* Risks Panel - Grouped */}
        {!isMaximized && report && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 shrink-0 max-h-60 overflow-y-auto">
                <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center justify-between">
                    <div className="flex items-center">
                        <AlertTriangle size={16} className="mr-2 text-orange-500"/> 
                        {activeRiskCategory ? (
                            <>
                                <span className="text-gray-400 mr-2">Risk Analysis</span> / <span className="ml-2 text-gray-800">{activeRiskCategory === 'Object' ? 'Table Bloat' : activeRiskCategory === 'SQL' ? 'Slow SQL' : 'System'} Risks</span>
                            </>
                        ) : 'Risk Analysis'}
                    </div>
                    {activeRiskCategory && (
                        <button 
                            onClick={() => setActiveRiskCategory(null)} 
                            className="text-xs flex items-center text-blue-600 hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                        >
                            <ChevronLeft size={12} className="mr-1"/> Back
                        </button>
                    )}
                </h3>
                
                {activeRiskCategory ? (
                    /* Detailed Table View */
                    <div className="overflow-x-auto animate-in fade-in slide-in-from-right-2">
                        {(() => {
                            const categoryRisks = riskGroups[activeRiskCategory] || [];
                            // Extract dynamic headers from the first item's extra field, if any
                            // Using the first item in the SORTED list to maintain consistency if possible, 
                            // or fallback to original group for stable headers
                            const sampleExtra = categoryRisks[0]?.extra || {};
                            const extraHeaders = Object.keys(sampleExtra);

                            return (
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50 text-gray-600 sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            <SortHeader label="Severity" sortKey="severity" currentSort={riskSort} onSort={(k: string) => handleSort(setRiskSort, k)} />
                                            <SortHeader label="Issue" sortKey="title" currentSort={riskSort} onSort={(k: string) => handleSort(setRiskSort, k)} />
                                            <SortHeader label="Description" sortKey="description" currentSort={riskSort} onSort={(k: string) => handleSort(setRiskSort, k)} />
                                            {extraHeaders.map(h => (
                                                <SortHeader key={h} label={h} sortKey={h} currentSort={riskSort} onSort={(k: string) => handleSort(setRiskSort, k)} align="right"/>
                                            ))}
                                            <th className="px-4 py-2 font-medium w-20 text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {sortedRisks.map((risk, idx) => {
                                            const canLink = risk.relatedId && (risk.relatedType === 'sql' || risk.relatedType === 'object');
                                            const badgeColors = {
                                                High: 'bg-red-100 text-red-700',
                                                Medium: 'bg-yellow-100 text-yellow-700',
                                                Low: 'bg-blue-100 text-blue-700'
                                            };
                                            return (
                                                <tr key={idx} className={canLink ? "hover:bg-blue-50 cursor-pointer" : "hover:bg-gray-50"} onClick={() => canLink && handleRiskClick(risk)}>
                                                    <td className="px-4 py-2">
                                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${badgeColors[risk.severity]}`}>
                                                            {risk.severity}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2 font-medium text-gray-700">{risk.title}</td>
                                                    <td className="px-4 py-2 text-gray-600 text-xs">{risk.description}</td>
                                                    {extraHeaders.map(h => (
                                                        <td key={h} className="px-4 py-2 text-right font-mono text-xs text-gray-700">
                                                            {risk.extra ? risk.extra[h] : '-'}
                                                        </td>
                                                    ))}
                                                    <td className="px-4 py-2 text-right">
                                                        {canLink && <ExternalLink size={14} className="text-blue-500 inline-block"/>}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            );
                        })()}
                    </div>
                ) : (
                    /* Summary Group View */
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {Object.keys(riskGroups).length > 0 ? (
                            Object.entries(riskGroups).map(([cat, items]) => {
                                const count = items.length;
                                const maxSeverity = items.some(i => i.severity === 'High') ? 'High' : items.some(i => i.severity === 'Medium') ? 'Medium' : 'Low';
                                
                                const labels: Record<string, string> = {
                                    'SQL': 'Slow SQL Risks',
                                    'Object': 'Table Bloat Risks',
                                    'System': 'System Risks'
                                };
                                const icons: Record<string, any> = {
                                    'SQL': Activity,
                                    'Object': Database,
                                    'System': Cpu
                                };
                                const Icon = icons[cat] || AlertCircle;
                                
                                const borderClass = maxSeverity === 'High' ? 'border-red-200 hover:border-red-400 bg-red-50/50' 
                                    : maxSeverity === 'Medium' ? 'border-yellow-200 hover:border-yellow-400 bg-yellow-50/50' 
                                    : 'border-blue-200 hover:border-blue-400 bg-blue-50/50';
                                
                                return (
                                    <div 
                                        key={cat}
                                        onClick={() => setActiveRiskCategory(cat)}
                                        className={`flex items-center p-4 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md ${borderClass}`}
                                    >
                                        <div className={`p-3 rounded-full mr-4 bg-white shadow-sm ${maxSeverity === 'High' ? 'text-red-500' : maxSeverity === 'Medium' ? 'text-yellow-500' : 'text-blue-500'}`}>
                                            <Icon size={24} />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-gray-700 text-sm">{labels[cat] || `${cat} Risks`}</h4>
                                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full mt-1 inline-block ${maxSeverity === 'High' ? 'bg-red-100 text-red-700' : maxSeverity === 'Medium' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-700'}`}>
                                                {count} Items
                                            </span>
                                        </div>
                                        <ChevronRight size={16} className="ml-auto text-gray-400" />
                                    </div>
                                );
                            })
                        ) : (
                            <div className="text-green-600 flex items-center text-sm col-span-full bg-green-50 p-4 rounded border border-green-100">
                                <CheckCircle size={20} className="mr-2" /> {t('wdr.risk.none')}
                            </div>
                        )}
                    </div>
                )}
            </div>
        )}

        {/* Details Tabs */}
        {report && (
        <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-100 flex flex-col min-h-0 overflow-hidden relative">
            <div className="flex justify-between items-center border-b border-gray-100 px-4 pt-2 bg-white shrink-0">
                <div className="flex space-x-1">
                    {(['overview', 'wait', 'sql', 'obj'] as const).map(tab => (
                        <button 
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                        >
                            {tab === 'wait' ? t('comp.tab.wait') : t(`wdr.tab.${tab}`)}
                        </button>
                    ))}
                </div>
                <button
                    onClick={() => setIsMaximized(!isMaximized)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-gray-50 rounded mb-1 transition-colors"
                    title={isMaximized ? "Restore" : "Maximize"}
                >
                    {isMaximized ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                </button>
            </div>

            <div className="flex-1 flex flex-col min-h-0 relative">
                {activeTab === 'overview' && (
                    <div className="flex-1 overflow-auto p-4 space-y-6">
                        <div>
                            <div className="flex justify-between items-center mb-3">
                                <h4 className="font-bold text-gray-700 flex items-center">
                                    <Zap size={16} className="mr-2 text-yellow-500"/> 
                                    {t('rep.summary.efficiency')}
                                    <button 
                                        onClick={() => setShowKnowledgeBase(true)}
                                        className="ml-2 text-blue-500 hover:text-blue-700" 
                                        title="View Knowledge Base"
                                    >
                                        <Info size={14} />
                                    </button>
                                </h4>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {report.efficiency.map((eff, idx) => (
                                    <div key={idx} className="bg-gray-50 p-3 rounded border border-gray-100 text-center">
                                        <div className="text-2xl font-bold text-blue-600">{eff.value}%</div>
                                        <div className="text-xs text-gray-500 mt-1">{eff.name}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div>
                            <h4 className="font-bold text-gray-700 mb-3 flex items-center"><Activity size={16} className="mr-2 text-blue-500"/> {t('rep.summary.workload')}</h4>
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 text-gray-600">
                                    <tr>
                                        <th className="px-4 py-2">Metric</th>
                                        <th className="px-4 py-2 text-right">Per Sec</th>
                                        <th className="px-4 py-2 text-right">Per Txn</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {report.loadProfile.map((item, idx) => (
                                        <tr key={idx}>
                                            <td className="px-4 py-2 text-gray-800">{item.metric}</td>
                                            <td className="px-4 py-2 text-right font-mono">{item.perSec.toLocaleString()}</td>
                                            <td className="px-4 py-2 text-right font-mono">{item.perTxn.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {report.configs.length > 0 && (
                            <div>
                                <h4 className="font-bold text-gray-700 mb-3 flex items-center"><Settings size={16} className="mr-2 text-gray-500"/> Configuration</h4>
                                <div className="bg-gray-50 rounded border border-gray-100 p-2 max-h-48 overflow-y-auto">
                                    <div className="grid grid-cols-2 gap-2">
                                        {report.configs.map((cfg, idx) => (
                                            <div key={idx} className="flex justify-between text-xs p-1 border-b border-gray-200 last:border-0">
                                                <span className="text-gray-600 font-medium">{cfg.name}</span>
                                                <span className="text-gray-800 font-mono">{cfg.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'wait' && (
                    <div className="flex-1 overflow-auto">
                        <table className="w-full text-sm text-left whitespace-nowrap">
                            <thead className="bg-gray-50 text-gray-600 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <SortHeader label="Event" sortKey="event" currentSort={waitSort} onSort={(k: string) => handleSort(setWaitSort, k)} />
                                    <SortHeader label="Class" sortKey="waitClass" currentSort={waitSort} onSort={(k: string) => handleSort(setWaitSort, k)} />
                                    <SortHeader label="Waits" sortKey="waits" currentSort={waitSort} onSort={(k: string) => handleSort(setWaitSort, k)} align="right"/>
                                    <SortHeader label="Total Time (us)" sortKey="totalWaitTime" currentSort={waitSort} onSort={(k: string) => handleSort(setWaitSort, k)} align="right"/>
                                    <SortHeader label="Avg Time (us)" sortKey="avgWaitTime" currentSort={waitSort} onSort={(k: string) => handleSort(setWaitSort, k)} align="right"/>
                                    <SortHeader label="% DB Time" sortKey="pctDBTime" currentSort={waitSort} onSort={(k: string) => handleSort(setWaitSort, k)} align="right"/>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {sortedWaitEvents.map((evt, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50">
                                        <td className="px-4 py-2 font-medium text-gray-700">{evt.event}</td>
                                        <td className="px-4 py-2 text-gray-500 text-xs">{evt.waitClass}</td>
                                        <td className="px-4 py-2 text-right">{evt.waits.toLocaleString()}</td>
                                        <td className="px-4 py-2 text-right">{evt.totalWaitTime.toLocaleString()}</td>
                                        <td className="px-4 py-2 text-right">{evt.avgWaitTime.toFixed(2)}</td>
                                        <td className="px-4 py-2 text-right">
                                            <div className="flex items-center justify-end">
                                                <span className="mr-2">{evt.pctDBTime}%</span>
                                                <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                                    <div className="h-full bg-blue-500" style={{ width: `${Math.min(evt.pctDBTime, 100)}%` }}></div>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {activeTab === 'sql' && (
                    <div className="flex-1 overflow-auto">
                        <table className="w-full text-sm text-left whitespace-nowrap">
                            <thead className="bg-gray-50 text-gray-600 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <SortHeader label="Unique ID" sortKey="uniqueSqlId" currentSort={sqlSort} onSort={(k: string) => handleSort(setSqlSort, k)} />
                                    <th className="px-4 py-2">SQL Text</th>
                                    <SortHeader label="Calls" sortKey="calls" currentSort={sqlSort} onSort={(k: string) => handleSort(setSqlSort, k)} align="right"/>
                                    <SortHeader label="Total Time (us)" sortKey="totalTime" currentSort={sqlSort} onSort={(k: string) => handleSort(setSqlSort, k)} align="right"/>
                                    <SortHeader label="Avg Time (us)" sortKey="avgTime" currentSort={sqlSort} onSort={(k: string) => handleSort(setSqlSort, k)} align="right"/>
                                    <SortHeader label="Rows" sortKey="rows" currentSort={sqlSort} onSort={(k: string) => handleSort(setSqlSort, k)} align="right"/>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {sortedTopSql.map((sql, idx) => (
                                    <tr key={idx} className="hover:bg-blue-50 cursor-pointer group" onClick={() => setSelectedSql(sql)}>
                                        <td className="px-4 py-2 font-mono text-xs text-blue-600 group-hover:underline">{sql.uniqueSqlId}</td>
                                        <td className="px-4 py-2 font-mono text-xs text-gray-600 max-w-md truncate" title={sql.text}>{sql.text}</td>
                                        <td className="px-4 py-2 text-right">{sql.calls}</td>
                                        <td className="px-4 py-2 text-right">{sql.totalTime.toLocaleString()}</td>
                                        <td className="px-4 py-2 text-right font-bold text-gray-700">{sql.avgTime.toLocaleString()}</td>
                                        <td className="px-4 py-2 text-right">{sql.rows}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {activeTab === 'obj' && (
                    <div className="flex-1 flex flex-col min-h-0">
                        {/* Filter Toolbar */}
                        <div className="flex space-x-2 p-2 border-b border-gray-100 shrink-0">
                            {(['All', 'Table', 'Index'] as const).map(type => (
                                <button
                                    key={type}
                                    onClick={() => setObjTypeFilter(type)}
                                    className={`px-3 py-1 text-xs rounded-full border transition-colors ${objTypeFilter === type ? 'bg-blue-100 text-blue-700 border-blue-200 font-bold' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                                >
                                    {type}
                                </button>
                            ))}
                        </div>
                        <div className="flex-1 overflow-auto">
                            <table className="w-full text-sm text-left whitespace-nowrap">
                                <thead className="bg-gray-50 text-gray-600 sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        <SortHeader label="Schema" sortKey="schema" currentSort={objSort} onSort={(k: string) => handleSort(setObjSort, k)} />
                                        <SortHeader label="Object" sortKey="name" currentSort={objSort} onSort={(k: string) => handleSort(setObjSort, k)} />
                                        <SortHeader label="Type" sortKey="type" currentSort={objSort} onSort={(k: string) => handleSort(setObjSort, k)} />
                                        <SortHeader label="Seq Scan" sortKey="seqScan" currentSort={objSort} onSort={(k: string) => handleSort(setObjSort, k)} align="right"/>
                                        <SortHeader label="Idx Scan" sortKey="idxScan" currentSort={objSort} onSort={(k: string) => handleSort(setObjSort, k)} align="right"/>
                                        <SortHeader label="Live/Fetch" sortKey="liveTup" currentSort={objSort} onSort={(k: string) => handleSort(setObjSort, k)} align="right"/>
                                        <SortHeader label="Dead/Read" sortKey="deadTup" currentSort={objSort} onSort={(k: string) => handleSort(setObjSort, k)} align="right"/>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {sortedObjectStats.map((obj, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedObject(obj)}>
                                            <td className="px-4 py-2 text-gray-500">{obj.schema}</td>
                                            <td className="px-4 py-2 font-medium text-gray-700">
                                                {obj.name}
                                                {obj.tableName && <span className="text-gray-400 text-xs ml-1">({obj.tableName})</span>}
                                            </td>
                                            <td className="px-4 py-2"><span className={`text-[10px] px-2 py-0.5 rounded ${obj.type==='Table'?'bg-blue-50 text-blue-600':'bg-purple-50 text-purple-600'}`}>{obj.type}</span></td>
                                            <td className="px-4 py-2 text-right">{obj.seqScan ?? '-'}</td>
                                            <td className="px-4 py-2 text-right">{obj.idxScan ?? '-'}</td>
                                            <td className="px-4 py-2 text-right text-gray-600">
                                                {obj.type === 'Table' ? obj.liveTup?.toLocaleString() : obj.idxTupFetch?.toLocaleString()}
                                            </td>
                                            <td className={`px-4 py-2 text-right ${obj.deadTup && obj.deadTup > 1000 ? 'text-red-600 font-bold' : ''}`}>
                                                {obj.type === 'Table' ? obj.deadTup?.toLocaleString() : obj.idxTupRead?.toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* SQL Detail Overlay */}
            {selectedSql && (
                <div className="absolute inset-0 bg-white z-20 flex flex-col animate-in slide-in-from-right-10 shadow-xl">
                    <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
                        <div className="flex flex-col">
                            <h3 className="font-bold text-gray-800 flex items-center">
                                <FileText size={18} className="mr-2 text-blue-600"/>
                                SQL Details: <span className="font-mono ml-2 text-blue-700 select-all">{selectedSql.uniqueSqlId}</span>
                            </h3>
                            <span className="text-xs text-gray-500 ml-7">User: {selectedSql.userName}</span>
                        </div>
                        <button onClick={() => setSelectedSql(null)} className="p-1 hover:bg-gray-200 rounded-full transition-colors text-gray-500">
                            <X size={20} />
                        </button>
                    </div>
                    
                    <div className="flex-1 overflow-auto p-6 space-y-6">
                        {/* Text */}
                        <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-2">SQL Text</h4>
                            <div className="bg-gray-800 rounded-lg p-4 font-mono text-sm text-gray-200 overflow-x-auto border border-gray-700 shadow-inner whitespace-pre-wrap max-h-48 overflow-y-auto">
                                {selectedSql.text}
                            </div>
                        </div>

                        {/* Metrics Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {/* Time Stats */}
                            <div className="bg-blue-50/50 rounded-lg border border-blue-100 p-4">
                                <h5 className="text-sm font-bold text-blue-800 mb-3 flex items-center"><Clock size={14} className="mr-1.5"/> Execution Time</h5>
                                <div className="space-y-2">
                                    <DetailItem label="Total Time" value={selectedSql.totalTime} unit="us" highlight />
                                    <DetailItem label="Avg Time" value={selectedSql.avgTime} unit="us" />
                                    <DetailItem label="CPU Time" value={selectedSql.cpuTime} unit="us" />
                                    <DetailItem label="Data IO Time" value={selectedSql.ioTime} unit="us" />
                                    <div className="grid grid-cols-2 gap-2 pt-1">
                                        <DetailItem label="Min Time" value={selectedSql.minTime} unit="us" />
                                        <DetailItem label="Max Time" value={selectedSql.maxTime} unit="us" />
                                    </div>
                                </div>
                            </div>

                            {/* IO & Rows */}
                            <div className="bg-green-50/50 rounded-lg border border-green-100 p-4">
                                <h5 className="text-sm font-bold text-green-800 mb-3 flex items-center"><Database size={14} className="mr-1.5"/> IO & Rows</h5>
                                <div className="space-y-2">
                                    <DetailItem label="Calls" value={selectedSql.calls} highlight />
                                    <DetailItem label="Returned Rows" value={selectedSql.rows} />
                                    <DetailItem label="Tuples Read" value={selectedSql.tuplesRead} />
                                    <DetailItem label="Tuples Affected" value={selectedSql.tuplesAffected} />
                                    <div className="grid grid-cols-2 gap-2 pt-1">
                                        <DetailItem label="Logical Read" value={selectedSql.logicalRead} />
                                        <DetailItem label="Physical Read" value={selectedSql.physicalRead} />
                                    </div>
                                </div>
                            </div>

                            {/* Ops (Sort/Hash) */}
                            <div className="bg-purple-50/50 rounded-lg border border-purple-100 p-4">
                                <h5 className="text-sm font-bold text-purple-800 mb-3 flex items-center"><Layers size={14} className="mr-1.5"/> Operations</h5>
                                <div className="grid grid-cols-2 gap-x-4">
                                    <div className="space-y-2">
                                        <span className="text-xs font-bold text-purple-600 block mb-1">Sort</span>
                                        <DetailItem label="Count" value={selectedSql.sortCount} />
                                        <DetailItem label="Time" value={selectedSql.sortTime} unit="us" />
                                        <DetailItem label="Mem Used" value={selectedSql.sortMemUsed} unit="KB" />
                                        {selectedSql.sortSpillCount > 0 && <DetailItem label="Spill Count" value={selectedSql.sortSpillCount} highlight />}
                                    </div>
                                    <div className="space-y-2 border-l border-purple-200 pl-4">
                                        <span className="text-xs font-bold text-purple-600 block mb-1">Hash</span>
                                        <DetailItem label="Count" value={selectedSql.hashCount} />
                                        <DetailItem label="Time" value={selectedSql.hashTime} unit="us" />
                                        <DetailItem label="Mem Used" value={selectedSql.hashMemUsed} unit="KB" />
                                        {selectedSql.hashSpillCount > 0 && <DetailItem label="Spill Count" value={selectedSql.hashSpillCount} highlight />}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Object Detail Overlay */}
            {selectedObject && (
                <div className="absolute inset-0 bg-white z-20 flex flex-col animate-in slide-in-from-right-10 shadow-xl">
                    <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                        <h3 className="font-bold text-gray-800 flex items-center">
                            <Table size={18} className="mr-2 text-indigo-600"/>
                            Object Details: <span className="font-mono ml-2 text-indigo-700">{selectedObject.name}</span>
                        </h3>
                        <button onClick={() => setSelectedObject(null)} className="p-1 hover:bg-gray-200 rounded-full transition-colors text-gray-500">
                            <X size={20} />
                        </button>
                    </div>
                    <div className="flex-1 overflow-auto p-6 space-y-6">
                        {/* Key Stats */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                             <div className="p-3 bg-gray-50 rounded border border-gray-200">
                                <div className="text-xs text-gray-500 uppercase font-bold mb-1">Seq Scans</div>
                                <div className="text-lg font-bold text-gray-800">{selectedObject.seqScan ?? '-'}</div>
                             </div>
                             <div className="p-3 bg-gray-50 rounded border border-gray-200">
                                <div className="text-xs text-gray-500 uppercase font-bold mb-1">Index Scans</div>
                                <div className="text-lg font-bold text-gray-800">{selectedObject.idxScan ?? '-'}</div>
                             </div>
                             {selectedObject.type === 'Table' ? (
                                <>
                                    <div className="p-3 bg-gray-50 rounded border border-gray-200">
                                        <div className="text-xs text-gray-500 uppercase font-bold mb-1">Live Tuples</div>
                                        <div className="text-lg font-bold text-green-700">{selectedObject.liveTup?.toLocaleString()}</div>
                                    </div>
                                    <div className="p-3 bg-gray-50 rounded border border-gray-200">
                                        <div className="text-xs text-gray-500 uppercase font-bold mb-1">Dead Tuples</div>
                                        <div className="text-lg font-bold text-red-700">{selectedObject.deadTup?.toLocaleString()}</div>
                                    </div>
                                </>
                             ) : (
                                <>
                                    <div className="p-3 bg-gray-50 rounded border border-gray-200">
                                        <div className="text-xs text-gray-500 uppercase font-bold mb-1">Idx Tup Read</div>
                                        <div className="text-lg font-bold text-blue-700">{selectedObject.idxTupRead?.toLocaleString()}</div>
                                    </div>
                                    <div className="p-3 bg-gray-50 rounded border border-gray-200">
                                        <div className="text-xs text-gray-500 uppercase font-bold mb-1">Idx Tup Fetch</div>
                                        <div className="text-lg font-bold text-green-700">{selectedObject.idxTupFetch?.toLocaleString()}</div>
                                    </div>
                                </>
                             )}
                        </div>
                        
                        {/* Tuple Changes (Table only) */}
                        {selectedObject.type === 'Table' && (
                            <div className="bg-white border border-gray-200 rounded-lg p-4">
                                <h4 className="text-sm font-semibold text-gray-700 mb-3">Tuple Activity</h4>
                                <div className="flex space-x-8">
                                    <div><span className="text-xs text-gray-500 block">Inserts</span><span className="font-mono font-medium">{selectedObject.tupIns}</span></div>
                                    <div><span className="text-xs text-gray-500 block">Updates</span><span className="font-mono font-medium">{selectedObject.tupUpd}</span></div>
                                    <div><span className="text-xs text-gray-500 block">Deletes</span><span className="font-mono font-medium">{selectedObject.tupDel}</span></div>
                                </div>
                            </div>
                        )}

                        {/* Related SQLs */}
                        <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                                <FileText size={16} className="mr-2 text-gray-400"/>
                                Related Top SQLs
                                <span className="ml-2 text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{relatedSqls.length}</span>
                            </h4>
                            {relatedSqls.length > 0 ? (
                                <div className="border border-gray-200 rounded-lg overflow-hidden">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-gray-50 text-gray-600">
                                            <tr>
                                                <th className="px-4 py-2 w-32">Unique ID</th>
                                                <th className="px-4 py-2">SQL Text Snippet</th>
                                                <th className="px-4 py-2 text-right">Avg Time</th>
                                                <th className="px-4 py-2 text-right">Calls</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {relatedSqls.map((sql, i) => (
                                                <tr 
                                                    key={i} 
                                                    className="hover:bg-blue-50 cursor-pointer transition-colors"
                                                    onClick={() => {
                                                        setSelectedObject(null); // Close object overlay
                                                        setSelectedSql(sql);     // Open SQL overlay
                                                    }}
                                                >
                                                    <td className="px-4 py-2 font-mono text-xs text-blue-600">{sql.uniqueSqlId}</td>
                                                    <td className="px-4 py-2 font-mono text-xs text-gray-500 truncate max-w-md">{sql.text.substring(0, 100)}...</td>
                                                    <td className="px-4 py-2 text-right font-medium">{sql.avgTime.toLocaleString()}</td>
                                                    <td className="px-4 py-2 text-right">{sql.calls}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="text-sm text-gray-500 italic p-4 bg-gray-50 rounded border border-gray-100 text-center">
                                    No Top SQLs found referencing this object directly.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
        )}
        
        {/* Knowledge Base Sidebar */}
        <WDRKnowledgePanel isOpen={showKnowledgeBase} onClose={() => setShowKnowledgeBase(false)} />

        {!isMaximized && (
            <div className="flex justify-end">
                {report && <button onClick={() => setReport(null)} className="text-gray-400 hover:text-gray-600 text-sm">Upload Another Report</button>}
            </div>
        )}

        {/* History Sidebar */}
        {showHistory && (
            <div className="absolute top-0 right-0 h-full w-80 bg-white shadow-2xl z-30 flex flex-col animate-in slide-in-from-right border-l border-gray-200">
                <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                    <h3 className="font-bold text-gray-700 flex items-center">
                        <History size={18} className="mr-2 text-blue-600"/>
                        Report History
                    </h3>
                    <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-gray-600">
                        <X size={18} />
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
                    {reportHistory.length === 0 ? (
                        <div className="text-center text-gray-400 text-sm py-8">No history found.</div>
                    ) : (
                        reportHistory.map(item => (
                            <div 
                                key={item.id}
                                onClick={() => loadFromHistory(item)}
                                className={`bg-white p-3 rounded-lg border shadow-sm cursor-pointer hover:border-blue-400 hover:shadow-md transition-all group relative ${report?.id === item.id ? 'ring-2 ring-blue-100 border-blue-400' : 'border-gray-200'}`}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <span className="text-xs font-bold text-gray-700 truncate max-w-[180px]">{item.meta.instanceName}</span>
                                    <button 
                                        onClick={(e) => deleteFromHistory(item.id, e)} 
                                        className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <Trash2 size={14}/>
                                    </button>
                                </div>
                                <div className="flex items-center text-[10px] text-gray-400 mb-2">
                                    <Clock size={10} className="mr-1"/>
                                    {item.meta.generateTime}
                                </div>
                                <div className="text-[10px] text-gray-500 bg-gray-100 p-1.5 rounded truncate">
                                    Period: {item.meta.period}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        )}
    </div>
  );
};

export default WDRReportAnalyze;