
import { WdrReportDetail, WdrEfficiency, WdrWaitEvent, WdrTopSqlItem, WdrObjectStat, WdrConfigSetting } from '../types';

export const parseWdrHtml = (html: string): WdrReportDetail => {
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
                cpu = cells[1].textContent?.trim() || ''; 
            }

            if (memIdx !== -1 && cells.length > memIdx) {
                memory = cells[memIdx].textContent?.trim() || '';
            } else if (cells.length > 4) {
                memory = cells[4].textContent?.trim() || '';
            }

            if (verIdx !== -1 && cells.length > verIdx) {
                version = cells[verIdx].textContent?.trim() || '';
            } else if (cells.length >= 6) {
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
            let idxMax = findCol(['max wait time', 'max time']); // New check for Max Time
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
                        maxWaitTime: idxMax !== -1 ? getNum(idxMax) : undefined,
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
    };
};
