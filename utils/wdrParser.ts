import { 
    WdrReportDetail, 
    WdrTopSqlItem, 
    WdrWaitEvent, 
    WdrObjectStat, 
    WdrEfficiency, 
    WdrReport,
    WdrIoProfile,
    WdrMemory,
    WdrHostCpu,
    WdrConfigSetting
} from '../types';

export const parseWdrHtml = (html: string): WdrReportDetail => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Helper to find table by ID, Header text, or Summary attribute
    const findTable = (ids: string[], summaryTexts: string[]): HTMLTableElement | null => {
        // 1. Try by ID (robust check for wrappers)
        for (const id of ids) {
            const el = doc.getElementById(id);
            if (el) {
                if (el instanceof HTMLTableElement) return el;
                // If ID is on a wrapper DIV/SPAN
                const tbl = el.querySelector('table');
                if (tbl) return tbl;
                
                // If ID is on a Header (h3), look at next siblings for the table/wrapper
                let next = el.nextElementSibling;
                // Skip common non-container siblings like form or ul if strictly adjacent
                let attempts = 0;
                while (next && attempts < 3) {
                    if (next instanceof HTMLTableElement) return next;
                    const innerTbl = next.querySelector('table');
                    if (innerTbl) return innerTbl;
                    next = next.nextElementSibling;
                    attempts++;
                }
            }
        }
        
        // 2. Try by Header/Summary Text scanning
        const tables = Array.from(doc.querySelectorAll('table'));
        for (const tbl of tables) {
            // Check summary attribute
            const summary = tbl.getAttribute('summary') || '';
            if (summaryTexts.some(txt => summary.toLowerCase().includes(txt.toLowerCase()))) {
                return tbl;
            }

            // Check preceding headers up the tree (to handle div wrappers)
            // Traverse up to 3 levels (Table -> Div -> ? -> Header)
            let current: Element | null = tbl;
            let depth = 0;
            while (current && depth < 3) {
                let prev = current.previousElementSibling;
                let lookback = 0;
                // Look back a few siblings for a header
                while (prev && lookback < 4) {
                    const text = prev.textContent?.trim().toLowerCase() || '';
                    if (summaryTexts.some(st => text.includes(st.toLowerCase()))) {
                        return tbl;
                    }
                    prev = prev.previousElementSibling;
                    lookback++;
                }
                current = current.parentElement;
                depth++;
            }
        }
        return null;
    };

    // Helper to safely get text from cell
    const getTxt = (row: HTMLTableRowElement | undefined, idx: number) => {
        if (!row || !row.cells[idx]) return '';
        return row.cells[idx].textContent?.trim() || '';
    };
    
    // Helper to parse number from cell
    const getNum = (row: HTMLTableRowElement | undefined, idx: number) => {
        const txt = getTxt(row, idx).replace(/,/g, '').replace('%', '');
        const val = parseFloat(txt);
        return isNaN(val) ? 0 : val;
    };

    // --- 1. Meta & Snapshots ---
    const meta: WdrReport = {
        id: Date.now(),
        instanceName: 'Unknown',
        generateTime: new Date().toLocaleString(),
        period: '',
        status: 'Success'
    };
    
    let startSnap = '', endSnap = '';

    const dbInfoTable = findTable(['DB_Info'], ['Database Id', 'Database Information']);
    if (dbInfoTable && dbInfoTable.rows.length > 1) {
        meta.instanceName = getTxt(dbInfoTable.rows[1], 0) || 'Unknown';
    }

    const snapTable = findTable(['Snap_Shot'], ['Snapshot', 'Snapshot Information']);
    if (snapTable) {
        // Use querySelectorAll to handle thead/tbody splitting
        const rows = Array.from(snapTable.querySelectorAll('tr'));
        if (rows.length > 2) {
            // Assume Row 0 is header, 1 is start, 2 is end
            // Start Time is usually col 1 or 2
            const r1 = rows[1];
            const r2 = rows[2];
            // Heuristic: Find date-like string
            for (let i = 0; i < r1.cells.length; i++) {
                if (r1.cells[i].textContent?.includes(':')) {
                    startSnap = getTxt(r1, i);
                    endSnap = getTxt(r2, i);
                    break;
                }
            }
            if (!startSnap) {
                startSnap = getTxt(r1, 1); 
                endSnap = getTxt(r2, 1);
            }
            meta.period = `${getTxt(r1, 0)} - ${getTxt(r2, 0)}`;
        }
    }

    // --- 2. Efficiency ---
    const efficiency: WdrEfficiency[] = [];
    const effTable = findTable(['Instance_Efficiency_Percentages', 'Instance_Efficiency_Percentages_(Target_100%)'], ['Instance Efficiency Percentages']);
    if (effTable) {
        const rows = Array.from(effTable.querySelectorAll('tr'));
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            for (let j = 0; j < row.cells.length; j += 2) {
                if (j + 1 < row.cells.length) {
                    const name = getTxt(row, j);
                    const val = getNum(row, j+1);
                    if (name) efficiency.push({ name, value: val, target: 100 });
                }
            }
        }
    }

    // --- 3. Load Profile ---
    const loadProfile: { metric: string; perSec: number; perTxn: number; perExec?: number }[] = [];
    const loadTable = findTable(['Load_Profile'], ['Load Profile']);
    if (loadTable) {
        const rows = Array.from(loadTable.querySelectorAll('tr'));
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            // Skip secondary headers if they exist in body
            if (row.cells[0]?.tagName === 'TH') continue;
            
            if (row.cells.length >= 2) {
                loadProfile.push({
                    metric: getTxt(row, 0),
                    perSec: getNum(row, 1),
                    perTxn: getNum(row, 2),
                    perExec: row.cells.length > 3 ? getNum(row, 3) : undefined
                });
            }
        }
    }

    // --- 4. Top SQL ---
    const topSql: WdrTopSqlItem[] = [];
    const sqlTextMap = new Map<number, string>();

    // 4.1 Parse Full SQL Text (Optional Table)
    const textTable = findTable(['SQL_Text', 'SQL_Text2'], ['SQL Text', 'Full SQL Text']);
    if (textTable) {
        const rows = Array.from(textTable.querySelectorAll('tr'));
        let idIdx = -1, textIdx = -1, startRow = -1;

        // Scan first 5 rows for header
        for(let i=0; i<Math.min(rows.length, 5); i++) {
            const cells = rows[i].cells;
            for(let j=0; j<cells.length; j++) {
                const txt = cells[j].textContent?.toLowerCase() || '';
                if(txt.includes('sql') && (txt.includes('id') || txt.includes('unique'))) idIdx = j;
                if(txt.includes('text') || txt.includes('statement')) textIdx = j;
            }
            if(idIdx > -1 && textIdx > -1) {
                startRow = i + 1;
                break;
            }
        }

        if(startRow > -1) {
            for(let i=startRow; i<rows.length; i++) {
                const cells = rows[i].cells;
                if(cells.length > Math.max(idIdx, textIdx)) {
                    const idVal = parseInt(cells[idIdx].textContent?.trim() || '0');
                    let sqlVal = '';
                    const textCell = cells[textIdx];
                    if(textCell.innerHTML.includes('<br')) {
                        sqlVal = textCell.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
                        const txtArea = document.createElement('textarea');
                        txtArea.innerHTML = sqlVal;
                        sqlVal = txtArea.value;
                    } else {
                        sqlVal = textCell.textContent || '';
                    }
                    if(idVal) sqlTextMap.set(idVal, sqlVal.trim());
                }
            }
        }
    }

    // 4.2 Parse Top SQL Stats
    const sqlTable = findTable(
        ['SQL_ordered_by_Elapsed_Time', 'SQL_ordered_by_Elapsed_Time2', 'SQL_Statistics', 'Top_SQL_By_Elapsed_Time', 'Top_SQL'], 
        ['SQL ordered by Elapsed Time', 'Top 10 SQL', 'SQL Statistics']
    );

    if (sqlTable) {
        const rows = Array.from(sqlTable.querySelectorAll('tr'));
        let headerRowIdx = -1;
        
        const colMap = { id: -1, user: -1, total: -1, calls: -1, cpu: -1, io: -1, rows: -1, text: -1 };

        // Scan for header row
        for(let i=0; i<Math.min(rows.length, 5); i++) {
            const cells = rows[i].cells;
            let matchCount = 0;
            for(let j=0; j<cells.length; j++) {
                const h = cells[j].textContent?.toLowerCase() || '';
                if (h.includes('sql') && (h.includes('id') || h.includes('unique'))) { colMap.id = j; matchCount++; }
                else if (h.includes('user') || h.includes('schema')) { colMap.user = j; matchCount++; }
                // Handle "Elapse" vs "Elapsed"
                else if ((h.includes('elapse') || h.includes('total time')) && !h.includes('avg') && !h.includes('max') && !h.includes('min')) { colMap.total = j; matchCount++; }
                else if (h.includes('call') || h.includes('exec')) { colMap.calls = j; matchCount++; }
                else if (h.includes('cpu')) { colMap.cpu = j; matchCount++; }
                else if (h.includes('io') || h.includes('read')) { colMap.io = j; matchCount++; }
                else if (h.includes('row') || h.includes('tuple')) { colMap.rows = j; matchCount++; }
                else if (h.includes('text') || h.includes('statement')) { colMap.text = j; matchCount++; }
            }
            if (colMap.id > -1 && colMap.total > -1) {
                headerRowIdx = i;
                break;
            }
        }

        if (headerRowIdx > -1) {
            for(let i = headerRowIdx + 1; i < rows.length; i++) {
                const row = rows[i];
                if (row.cells.length <= Math.max(colMap.id, colMap.total)) continue;

                const idStr = getTxt(row, colMap.id);
                const uniqueId = parseInt(idStr) || 0;
                if (!uniqueId) continue;

                const totalTime = getNum(row, colMap.total);
                const calls = colMap.calls > -1 ? getNum(row, colMap.calls) : 1;
                
                let text = sqlTextMap.get(uniqueId) || (colMap.text > -1 ? getTxt(row, colMap.text) : '');
                
                topSql.push({
                    sqlId: idStr,
                    uniqueSqlId: uniqueId,
                    userName: colMap.user > -1 ? getTxt(row, colMap.user) : '',
                    text: text,
                    totalTime: totalTime,
                    calls: calls,
                    avgTime: calls > 0 ? totalTime / calls : 0,
                    cpuTime: colMap.cpu > -1 ? getNum(row, colMap.cpu) : 0,
                    ioTime: colMap.io > -1 ? getNum(row, colMap.io) : 0,
                    rows: colMap.rows > -1 ? getNum(row, colMap.rows) : 0,
                });
            }
        }
    }

    // --- 5. Wait Events ---
    const waitEvents: WdrWaitEvent[] = [];
    const waitTable = findTable(
        ['Wait_Events', 'Top_10_Foreground_Wait_Events', 'Wait_Events(by_wait_time)2'], 
        ['Top 10 Foreground Wait Events', 'Wait Events', 'Wait Events (by wait time)']
    );
    if (waitTable) {
        const rows = Array.from(waitTable.querySelectorAll('tr'));
        let headerRowIdx = -1;
        const colMap = { event: -1, class: -1, waits: -1, total: -1, avg: -1, pct: -1, max: -1 };

        for(let i=0; i<Math.min(rows.length, 5); i++) {
            const cells = rows[i].cells;
            for(let j=0; j<cells.length; j++) {
                const h = cells[j].textContent?.toLowerCase() || '';
                if(h.includes('event')) colMap.event = j;
                else if(h.includes('class') || h.includes('type')) colMap.class = j;
                else if((h === 'waits' || h.includes('waits')) && !h.includes('time') && !h.includes('avg')) colMap.waits = j;
                else if(h.includes('total') || (h.includes('time') && !h.includes('avg') && !h.includes('max') && !h.includes('%'))) colMap.total = j;
                else if(h.includes('avg')) colMap.avg = j;
                else if(h.includes('max')) colMap.max = j;
                else if(h.includes('%') || h.includes('pct')) colMap.pct = j;
            }
            if(colMap.event > -1 && (colMap.total > -1 || colMap.waits > -1)) {
                headerRowIdx = i;
                break;
            }
        }

        if(headerRowIdx > -1) {
            for(let i = headerRowIdx + 1; i < rows.length; i++) {
                const row = rows[i];
                if (row.cells.length < 2) continue;
                
                waitEvents.push({
                    event: getTxt(row, colMap.event),
                    waitClass: colMap.class > -1 ? getTxt(row, colMap.class) : 'Other',
                    waits: colMap.waits > -1 ? getNum(row, colMap.waits) : 0,
                    totalWaitTime: colMap.total > -1 ? getNum(row, colMap.total) : 0,
                    avgWaitTime: colMap.avg > -1 ? getNum(row, colMap.avg) : 0,
                    maxWaitTime: colMap.max > -1 ? getNum(row, colMap.max) : undefined,
                    pctDBTime: colMap.pct > -1 ? getNum(row, colMap.pct) : 0
                });
            }
        }
    }

    // --- 6. Object Stats ---
    const objectStats: WdrObjectStat[] = [];
    const objMap = new Map<string, WdrObjectStat>(); 

    const parseObjTable = (identifiers: string[], type: 'Table' | 'Index') => {
        const tbl = findTable(identifiers, identifiers); // pass headers as both args for simplicity
        if (!tbl) return;

        const rows = Array.from(tbl.querySelectorAll('tr'));
        let headerRowIdx = -1;
        const colMap = { schema: -1, name: -1, seq: -1, idx: -1, ins: -1, upd: -1, del: -1, live: -1, dead: -1, parent: -1, read: -1, fetch: -1 };

        for(let i=0; i<Math.min(rows.length, 5); i++) {
            const cells = rows[i].cells;
            for(let j=0; j<cells.length; j++) {
                const h = cells[j].textContent?.toLowerCase() || '';
                if(h.includes('schema')) colMap.schema = j;
                else if(h.includes('relname') || (h.includes('name') && !h.includes('parent') && !h.includes('table'))) colMap.name = j; 
                else if(h.includes('parent') || (type === 'Index' && h.includes('table'))) colMap.parent = j;
                else if(h.includes('seq') && h.includes('scan')) colMap.seq = j;
                else if(h.includes('index') && h.includes('scan')) colMap.idx = j;
                else if(h.includes('insert')) colMap.ins = j;
                else if(h.includes('update')) colMap.upd = j;
                else if(h.includes('delete')) colMap.del = j;
                else if(h.includes('live')) colMap.live = j;
                else if(h.includes('dead')) colMap.dead = j;
                else if(h.includes('tuple') && h.includes('read')) colMap.read = j; 
                else if(h.includes('tuple') && h.includes('fetch')) colMap.fetch = j;
            }
            if(colMap.name > -1) { // Schema is sometimes optional or merged
                headerRowIdx = i;
                break;
            }
        }

        if(headerRowIdx > -1) {
            for(let i = headerRowIdx + 1; i < rows.length; i++) {
                const row = rows[i];
                if(row.cells.length < 2) continue;

                const schema = colMap.schema > -1 ? (getTxt(row, colMap.schema) || 'public') : 'public';
                const name = getTxt(row, colMap.name);
                const key = `${schema}.${name}`;

                if(!name) continue;

                let existing = objMap.get(key);
                if(!existing) {
                    existing = {
                        schema, 
                        name, 
                        type,
                        tableName: colMap.parent > -1 ? getTxt(row, colMap.parent) : undefined
                    };
                    objMap.set(key, existing);
                }

                if(colMap.seq > -1) existing.seqScan = (existing.seqScan || 0) + getNum(row, colMap.seq);
                if(colMap.idx > -1) existing.idxScan = (existing.idxScan || 0) + getNum(row, colMap.idx);
                if(colMap.ins > -1) existing.tupIns = getNum(row, colMap.ins);
                if(colMap.upd > -1) existing.tupUpd = getNum(row, colMap.upd);
                if(colMap.del > -1) existing.tupDel = getNum(row, colMap.del);
                if(colMap.live > -1) existing.liveTup = getNum(row, colMap.live);
                if(colMap.dead > -1) existing.deadTup = getNum(row, colMap.dead);
                if(colMap.read > -1) existing.idxTupRead = getNum(row, colMap.read);
                if(colMap.fetch > -1) existing.idxTupFetch = getNum(row, colMap.fetch);
            }
        }
    };

    // Specific IDs from user reports
    parseObjTable(['Top_Tables_by_Seq_Scan', 'Top Tables by Seq Scan', 'Table_Scan_Statistics', 'Table Scan Statistics', 'User_Tables_stats', 'User Tables stats'], 'Table');
    parseObjTable(['Top_Tables_by_Index_Scan', 'Top Tables by Index Scan'], 'Table');
    parseObjTable(['Table_DML_Statistics', 'Table DML Statistics'], 'Table'); 
    parseObjTable(['Top_Indexes_by_Scan', 'Top Indexes by Scan', 'Index_Statistics', 'Index Statistics', 'User_Index_stats', 'User Index stats'], 'Index');

    objectStats.push(...Array.from(objMap.values()));

    // --- 7. Configuration ---
    const configs: any[] = [];
    const configTable = findTable(['Parameter_Setting', 'Settings', 'Configuration_settings', 'Configuration_settings2'], ['Parameter Setting', 'Configuration Settings', 'Configuration settings']);
    if (configTable) {
        const rows = Array.from(configTable.querySelectorAll('tr'));
        if (rows.length > 1) {
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if(row.cells.length >= 2) {
                    configs.push({
                        name: getTxt(row, 0),
                        value: getTxt(row, 1),
                        type: row.cells.length > 2 ? getTxt(row, 2) : undefined,
                        category: row.cells.length > 3 ? getTxt(row, 3) : undefined
                    });
                }
            }
        }
    }

    // --- 8. Host CPU (Basic) ---
    let hostCpu: WdrHostCpu | null = null;
    const cpuTable = findTable(['Host_CPU', 'Host_CPU2'], ['Host CPU']);
    if (cpuTable) {
        const rows = Array.from(cpuTable.querySelectorAll('tr'));
        if(rows.length > 1) {
            const r = rows[1]; // data row
            // Try to be smart about columns, but fallback to indices
            const getVal = (idx: number) => getNum(r, idx);
            // Typically: Node | CPUs | Cores | Sockets | Memory ...
            hostCpu = {
                cpus: getVal(1),
                cores: getVal(2),
                sockets: getVal(3),
                loadAvgBegin: 0, 
                loadAvgEnd: 0,
                user: 0, system: 0, wio: 0, idle: 0
            };
        }
    }

    // --- 9. IO Profile (Added) ---
    const ioProfile: WdrIoProfile[] = [];
    const ioTable = findTable(['IO_Profile', 'IO_Profile2'], ['I/O Profile', 'IO Profile']);
    if (ioTable) {
        const rows = Array.from(ioTable.querySelectorAll('tr'));
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (row.cells.length >= 4) {
                ioProfile.push({
                    ioType: getTxt(row, 0),
                    readReqs: getNum(row, 2),
                    writeReqs: getNum(row, 3),
                    readBytes: 0,
                    writeBytes: 0
                });
            }
        }
    }

    // --- 10. Memory (Added) ---
    const memoryStats: WdrMemory[] = [];
    const memTable = findTable(['Memory_Statistics', 'Memory_Statistics2'], ['Memory Statistics']);
    if (memTable) {
        const rows = Array.from(memTable.querySelectorAll('tr'));
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (row.cells.length >= 3) {
                memoryStats.push({
                    component: getTxt(row, 0),
                    beginVal: getTxt(row, 1),
                    endVal: getTxt(row, 2)
                });
            }
        }
    }

    return {
        id: meta.id,
        meta,
        snapshots: { start: startSnap, end: endSnap },
        efficiency,
        loadProfile,
        hostCpu,
        ioProfile,
        memoryStats,
        waitEvents,
        topSql,
        objectStats,
        configs
    };
};
