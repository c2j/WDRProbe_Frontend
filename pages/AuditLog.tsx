import React, { useEffect, useState } from 'react';
import { ApiService } from '../services/apiService';
import { AuditLog } from '../types';
import { Download } from 'lucide-react';
import { useI18n } from '../context/I18nContext';

const AuditLogPage: React.FC = () => {
  const { t } = useI18n();
  const [logs, setLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    ApiService.getAuditLogs().then(res => setLogs(res.content));
  }, []);

  return (
    <div className="space-y-4">
        <div className="flex justify-between items-center">
            <div className="flex space-x-2">
                <input type="date" className="border rounded px-2 py-1 text-sm text-gray-600" />
                <select className="border rounded px-2 py-1 text-sm text-gray-600 bg-white">
                    <option>{t('log.allOps')}</option>
                    <option>{t('log.updateThr')}</option>
                </select>
            </div>
            <button className="flex items-center px-3 py-1.5 border border-gray-300 rounded bg-white text-sm hover:bg-gray-50">
                <Download size={14} className="mr-2"/> {t('log.export')}
            </button>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                        <th className="px-6 py-3 font-medium text-gray-500">{t('log.time')}</th>
                        <th className="px-6 py-3 font-medium text-gray-500">{t('log.user')}</th>
                        <th className="px-6 py-3 font-medium text-gray-500">{t('log.op')}</th>
                        <th className="px-6 py-3 font-medium text-gray-500">{t('log.target')}</th>
                        <th className="px-6 py-3 font-medium text-gray-500">{t('log.result')}</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {logs.map(log => (
                        <tr key={log.id} className="hover:bg-gray-50">
                             <td className="px-6 py-3 text-gray-500">{log.time}</td>
                             <td className="px-6 py-3 text-gray-900 font-medium">{log.user}</td>
                             <td className="px-6 py-3 text-blue-600">{log.operationType}</td>
                             <td className="px-6 py-3 text-gray-500">{log.target}</td>
                             <td className="px-6 py-3">
                                 <span className="text-green-600 text-xs px-2 py-0.5 bg-green-50 rounded-full border border-green-100">
                                     {log.result}
                                 </span>
                             </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
  );
};

export default AuditLogPage;
