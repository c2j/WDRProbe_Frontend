
import { WdrReportDetail, WdrEfficiency, WdrWaitEvent, WdrTopSqlItem, WdrObjectStat, WdrConfigSetting, WdrHostCpu, WdrIoProfile, WdrMemory } from '../types';

export const parseWdrHtml = (html: string): WdrReportDetail => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Helper to find table by ID or Title content
    const findTable = (ids: string[], keywords: string[]): HTMLTableElement | null => {
        // Try IDs first
        for (const id of ids) {
            const div = doc.getElementById(id);
            if (div) {
                const table = div.querySelector('table');
                if (table) return table;
            }
        }
        // Try searching all tables by previous element text or content
        const allTables = Array.from(doc.querySelectorAll('table'));
        for (const table of allTables) {
            // Check previous sibling for title
            let prev = table.previousElementSibling;
            let foundTitle = false;
            let attempts = 0;
            while(prev && attempts < 3) {
                if (prev.textContent && keywords.some(k => prev!.textContent!.toLowerCase().includes(k.toLowerCase()))) {
                    foundTitle = true;
                    break;
                }
                prev = prev.previousElementSibling;
                attempts++;
            }
            if (foundTitle) return table;

            // Check parent ID
            if (table.parentElement && keywords.some(k => table.parentElement!.id.toLowerCase().includes(k.toLowerCase().replace(/ /g, '_')))) {
                return table;
            }
        }
        return null;
    };

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
    const effTable = findTable(['Instance_Efficiency_Percentages_(Target_100%)2', 'Instance_Efficiency_Percentages'], ['Instance Efficiency Percentages']);
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
    const loadTable = findTable(['Load_Profile2', 'Load_Profile'], ['Load Profile']);
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

    // --- NEW: Host CPU ---
    const hostCpuTable = findTable(['Host_CPU2', 'Host_CPU'], ['Host CPU']);
    let hostCpu: WdrHostCpu | null = null;
    if (hostCpuTable) {
        const rows = hostCpuTable.rows;
        if (rows.length >= 2) {
            const headers = Array.from(rows[0].cells).map(c => c.textContent?.trim().toLowerCase() || '');
            const cells = rows[1].cells;
            
            const getVal = (keys: string[]) => {
                const idx = headers.findIndex(h => keys.some(k => h.includes(k.toLowerCase())));
                if (idx !== -1 && idx < cells.length) {
                    return parseFloat(cells[idx].textContent?.trim() || '0');
                }
                return 0;
            };

            hostCpu = {
                cpus: getVal(['CPUs']),
                cores: getVal(['Cores']),
                sockets: getVal(['Sockets']),
                loadAvgBegin: getVal(['Load Average Begin']),
                loadAvgEnd: getVal(['Load Average End']),
                user: getVal(['%User']),
                system: getVal(['%System']),
                wio: getVal(['%WIO']),
                idle: getVal(['%Idle'])
            };
        }
    }

    // --- NEW: IO Profile ---
    const ioProfileTable = findTable(['IO_Profile2', 'IO_Profile'], ['IO Profile']);
    const ioProfile: WdrIoProfile[] = [];
    if (ioProfileTable) {
        const rows = Array.from(ioProfileTable.querySelectorAll('tr'));
        if (rows.length > 1) {
            const headers = Array.from(rows[0].cells).map(c => c.textContent?.trim().toLowerCase() || '');
            const idxType = headers.findIndex(h => h.includes('io type') || h.includes('type'));
            const idxReadReq = headers.findIndex(h => h.includes('read requests'));
            const idxWriteReq = headers.findIndex(h => h.includes('write requests'));
            const idxReadBytes = headers.findIndex(h => h.includes('read bytes'));
            const idxWriteBytes = headers.findIndex(h => h.includes('write bytes'));

            rows.slice(1).forEach(row => {
                const cells = row.cells;
                if (cells.length > 1) {
                    const getNum = (idx: number) => (idx !== -1 && idx < cells.length) ? parseFloat(cells[idx].textContent?.replace(/,/g, '') || '0') : 0;
                    ioProfile.push({
                        ioType: idxType !== -1 ? cells[idxType].textContent?.trim() || '' : '',
                        readReqs: getNum(idxReadReq),
                        writeReqs: getNum(idxWriteReq),
                        readBytes: getNum(idxReadBytes),
                        writeBytes: getNum(idxWriteBytes)
                    });
                }
            });
        }
    }

    // --- NEW: Memory Statistics ---
    const memStatTable = findTable(['Memory_Statistics2', 'Memory_Statistics'], ['Memory Statistics']);
    const memoryStats: WdrMemory[] = [];
    if (memStatTable) {
        const rows = Array.from(memStatTable.querySelectorAll('tr'));
        if (rows.length > 1) {
            const headers = Array.from(rows[0].cells).map(c => c.textContent?.trim().toLowerCase() || '');
            const idxName = headers.findIndex(h => h.includes('memory name') || h.includes('component'));
            const idxBegin = headers.findIndex(h => h.includes('begin snap') || h.includes('begin'));
            const idxEnd = headers.findIndex(h => h.includes('end snap') || h.includes('end'));

            rows.slice(1).forEach(row => {
                const cells = row.cells;
                if (cells.length > 1) {
                    memoryStats.push({
                        component: idxName !== -1 ? cells[idxName].textContent?.trim() || '' : '',
                        beginVal: idxBegin !== -1 ? cells[idxBegin].textContent?.trim() || '' : '',
                        endVal: idxEnd !== -1 ? cells[idxEnd].textContent?.trim() || '' : ''
                    });
                }
            });
        }
    }

    // 3.5 Wait Events
    const waitTable = findTable(
        ['Top_10_Foreground_Events_by_Total_Wait_Time2', 'Top_10_Foreground_Events_by_Total_Wait_Time', 'Wait_Events(by_wait_time)2'],
        ['Top 10 Foreground Events by Total Wait Time', 'Wait Events (by wait time)']
    );

    const waitEvents: WdrWaitEvent[] = [];
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
            let idxMax = findCol(['max wait time', 'max time']); 
            let idxPct = findCol(['% db time', 'pct']);

            if (idxEvent === -1) {
                // Heuristic fallback for headerless or specific structures
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
    const textTable = findTable(['SQL_Text2', 'SQL_Text'], ['SQL Text']);
    if (textTable) {
        const rows = textTable.rows;
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

    // 4. Top SQL
    const topSqlTable = findTable(
        ['SQL_ordered_by_Elapsed_Time2', 'SQL_ordered_by_Elapsed_Time'], 
        ['SQL ordered by Elapsed Time']
    );
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
            const idxText = getIdx(['sql text']);

            rows.slice(1).forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length < 5) return; 

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
                });
            });
        }
    }

    // 5. Object Stats (Tables & Indexes)
    const objectStatsMap = new Map<string, WdrObjectStat>();

    const processStatsTable = (table: HTMLTableElement, type: 'Table' | 'Index') => {
        const rows = Array.from(table.querySelectorAll('tr'));
        if (rows.length < 2) return;

        const headerRow = rows[0];
        const headers = Array.from(headerRow.cells).map(c => c.textContent?.trim().toLowerCase() || '');
        const getColIdx = (candidates: string[]) => headers.findIndex(h => candidates.some(c => h === c || h.startsWith(c) || h.endsWith(c)));

        const idxSchema = getColIdx(['schema']);
        const idxRelname = getColIdx(['relname', 'table name', 'table']); 
        const idxIndexRelname = getColIdx(['index relname', 'index name', 'index']);
        const idxName = getColIdx(['name']);

        const idxSeqScan = getColIdx(['seq scan']);
        const idxIdxScan = getColIdx(['index scan']);
        const idxTupIns = getColIdx(['tuple insert', 'insert', 'tup insert']);
        const idxTupUpd = getColIdx(['tuple update', 'update', 'tup update']);
        const idxTupDel = getColIdx(['tuple delete', 'delete', 'tup delete']);
        const idxLive = getColIdx(['live tuple', 'live tup']);
        const idxDead = getColIdx(['dead tuple', 'dead tup']);
        const idxIdxTupRead = getColIdx(['index tuple read', 'index tup read']);
        const idxIdxTupFetch = getColIdx(['index tuple fetch', 'index tup fetch']);

        rows.slice(1).forEach(row => {
            const cells = row.cells;
            const getVal = (idx: number) => {
                if (idx === -1 || idx >= cells.length) return undefined;
                const txt = cells[idx].textContent?.trim().replace(/,/g, '');
                return txt ? parseFloat(txt) : 0;
            };
            const getTxt = (idx: number) => (idx !== -1 && idx < cells.length) ? cells[idx].textContent?.trim() || '' : '';

            let schema = getTxt(idxSchema);
            let name = '';
            let tableNameStr = undefined;

            if (type === 'Table') {
                if (idxRelname !== -1) name = getTxt(idxRelname);
                else if (idxName !== -1) name = getTxt(idxName);
            } else {
                if (idxIndexRelname !== -1) name = getTxt(idxIndexRelname);
                else if (idxName !== -1) name = getTxt(idxName);
                if (idxRelname !== -1 && name !== getTxt(idxRelname)) tableNameStr = getTxt(idxRelname);
            }

            if (!name) return;

            const uniqueKey = `${type}:${schema}.${name}`;
            if (!objectStatsMap.has(uniqueKey)) {
                objectStatsMap.set(uniqueKey, {
                    schema,
                    name,
                    tableName: tableNameStr,
                    type,
                    seqScan: getVal(idxSeqScan),
                    idxScan: getVal(idxIdxScan),
                    tupIns: getVal(idxTupIns),
                    tupUpd: getVal(idxTupUpd),
                    tupDel: getVal(idxTupDel),
                    liveTup: getVal(idxLive),
                    deadTup: getVal(idxDead),
                    idxTupRead: getVal(idxIdxTupRead),
                    idxTupFetch: getVal(idxIdxTupFetch)
                });
            }
        });
    };

    const allTables = Array.from(doc.querySelectorAll('table'));
    allTables.forEach(table => {
        let title = '';
        let prev = table.previousElementSibling;
        let attempts = 0;
        while(prev && attempts < 3) {
             const tag = prev.tagName.toLowerCase();
             if (['h1','h2','h3','h4','h5','h6','div'].includes(tag)) {
                 title += ' ' + (prev.textContent || '');
                 if (prev.id) title += ' ' + prev.id;
             }
             prev = prev.previousElementSibling;
             attempts++;
        }
        if (table.parentElement && table.parentElement.id) title += ' ' + table.parentElement.id;
        if (table.rows.length > 0 && table.rows[0].cells.length === 1) {
            title += ' ' + table.rows[0].cells[0].textContent;
        }
        title = title.replace(/_/g, ' ').replace(/\s+/g, ' ').toLowerCase();

        if (title.includes('user tables stats')) {
            processStatsTable(table, 'Table');
        } else if (title.includes('user index stats') || title.includes('user indexes stats')) {
            processStatsTable(table, 'Index');
        }
    });

    const objectStats = Array.from(objectStatsMap.values());

    // 6. Configs
    const configsTable = findTable(['Settings2', 'Settings', 'Configuration_settings2', 'Configuration_settings'], ['Configuration settings']);
    const configs: WdrConfigSetting[] = [];
    if (configsTable) {
        const rows = Array.from(configsTable.querySelectorAll('tr'));
        if (rows.length > 1) {
            const headerCells = Array.from(rows[0].cells).map(c => c.textContent?.trim().toLowerCase() || '');
            const findCol = (candidates: string[]) => headerCells.findIndex(h => candidates.some(c => h === c || h.includes(c)));
            
            const idxName = findCol(['name']);
            const idxValue = findCol(['curent value', 'current value', 'value']);
            const idxType = findCol(['type', 'vartype']);
            const idxCategory = findCol(['category', 'context']);
            
            if (idxName !== -1 && idxValue !== -1) {
                rows.slice(1).forEach(row => {
                    const cells = row.cells;
                    if (cells.length > Math.max(idxName, idxValue)) {
                        configs.push({
                            name: cells[idxName].textContent?.trim() || '',
                            value: cells[idxValue].textContent?.trim() || '',
                            type: idxType !== -1 ? (cells[idxType]?.textContent?.trim() || '') : '',
                            category: idxCategory !== -1 ? (cells[idxCategory]?.textContent?.trim() || '') : ''
                        });
                    }
                });
            }
        }
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
        hostCpu,
        ioProfile,
        memoryStats,
        waitEvents,
        topSql: topSql.slice(0, 100),
        objectStats: objectStats.slice(0, 500), 
        configs: configs
    };
};
