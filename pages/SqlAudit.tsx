import React, { useEffect, useState } from 'react';
import { ApiService } from '../services/apiService';
import { SqlAuditIssue } from '../types';
import { X, AlertTriangle, CheckCircle, Code, Zap, FileText } from 'lucide-react';
import { useI18n } from '../context/I18nContext';

const SqlAuditPage: React.FC = () => {
  const { t } = useI18n();
  const [issues, setIssues] = useState<SqlAuditIssue[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<SqlAuditIssue | null>(null);

  useEffect(() => {
    ApiService.getSqlAuditIssues().then(setIssues);
  }, []);

  const closeLoop = () => setSelectedIssue(null);

  const STATUS_KEYS: Record<string, string> = {
    'All': 'audit.all',
    'Pending': 'audit.pending',
    'Processing': 'audit.processing',
    'Fixed': 'audit.fixed',
    'Whitelisted': 'audit.whitelisted'
  };

  return (
    <div className="space-y-4">
        <div className="flex space-x-2 pb-4 border-b border-gray-200">
             {Object.keys(STATUS_KEYS).map(status => (
                 <button key={status} className={`px-4 py-1.5 rounded-full text-sm ${status === 'All' ? 'bg-gray-800 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                     {t(STATUS_KEYS[status])}
                 </button>
             ))}
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                        <th className="px-6 py-3 font-medium text-gray-500">{t('audit.id')}</th>
                        <th className="px-6 py-3 font-medium text-gray-500">{t('audit.severity')}</th>
                        <th className="px-6 py-3 font-medium text-gray-500">{t('audit.type')}</th>
                        <th className="px-6 py-3 font-medium text-gray-500">{t('audit.target')}</th>
                        <th className="px-6 py-3 font-medium text-gray-500">{t('audit.foundTime')}</th>
                        <th className="px-6 py-3 font-medium text-gray-500">{t('audit.status')}</th>
                        <th className="px-6 py-3 font-medium text-gray-500 text-right">{t('audit.actions')}</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {issues.map(issue => (
                        <tr key={issue.id} className="hover:bg-gray-50">
                             <td className="px-6 py-3 font-mono text-gray-600">{issue.id}</td>
                             <td className="px-6 py-3">
                                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                                    issue.severity === 'High' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                                }`}>
                                    {issue.severity}
                                </span>
                             </td>
                             <td className="px-6 py-3 text-gray-700">{issue.type}</td>
                             <td className="px-6 py-3 text-gray-500 truncate max-w-xs" title={issue.target}>{issue.target}</td>
                             <td className="px-6 py-3 text-gray-500">{issue.time}</td>
                             <td className="px-6 py-3 text-gray-700">{issue.status}</td>
                             <td className="px-6 py-3 text-right">
                                 <button 
                                    onClick={() => setSelectedIssue(issue)}
                                    className="text-blue-600 hover:underline font-medium"
                                 >
                                    {t('audit.optimize')}
                                 </button>
                             </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>

        {/* Optimization Modal */}
        {selectedIssue && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                    
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                        <div className="flex items-center space-x-3">
                            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                                <Zap size={20} />
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-800 text-lg">{t('audit.modalTitle')}</h3>
                                <p className="text-xs text-gray-500">{t('audit.issueId')}: {selectedIssue.id}</p>
                            </div>
                        </div>
                        <button 
                            onClick={closeLoop} 
                            className="text-gray-400 hover:text-gray-600 transition-colors rounded-full p-1 hover:bg-gray-200"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="p-6 overflow-y-auto space-y-6">
                        {/* Issue Summary */}
                        <div className="flex items-center space-x-4">
                             <div className={`px-3 py-1 rounded-full text-sm font-medium border ${
                                selectedIssue.severity === 'High' 
                                    ? 'bg-red-50 text-red-700 border-red-100' 
                                    : 'bg-yellow-50 text-yellow-700 border-yellow-100'
                             }`}>
                                {selectedIssue.severity} Severity
                             </div>
                             <div className="text-sm text-gray-500">
                                Type: <span className="font-medium text-gray-700">{selectedIssue.type}</span>
                             </div>
                             <div className="text-sm text-gray-500">
                                Detected: <span className="font-medium text-gray-700">{selectedIssue.time}</span>
                             </div>
                        </div>

                        {/* SQL Statement */}
                        <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
                                <Code size={16} className="mr-2 text-gray-400" /> {t('audit.targetSql')}
                            </h4>
                            <div className="bg-gray-800 rounded-lg p-4 font-mono text-sm text-gray-200 overflow-x-auto shadow-inner border border-gray-700">
                                {selectedIssue.target}
                            </div>
                        </div>

                        {/* Diagnosis & Suggestion (Mocked for demo) */}
                        <div className="space-y-4">
                            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                                <h4 className="text-sm font-semibold text-blue-800 mb-1 flex items-center">
                                    <FileText size={16} className="mr-2" /> {t('audit.diagnosis')}
                                </h4>
                                <p className="text-sm text-blue-700 leading-relaxed">
                                    This query is performing a full table scan on table <code className="font-mono font-bold">t_order</code> which contains 1.2M rows. The filtering condition on column <code className="font-mono font-bold">create_time</code> is not utilizing any existing indexes.
                                </p>
                            </div>
                            
                            <div className="bg-green-50 border border-green-100 rounded-lg p-4">
                                <h4 className="text-sm font-semibold text-green-800 mb-1 flex items-center">
                                    <CheckCircle size={16} className="mr-2" /> {t('audit.recommendation')}
                                </h4>
                                <p className="text-sm text-green-700 leading-relaxed mb-3">
                                    Create a composite index on <code className="font-mono font-bold">(create_time, status)</code> to optimize range queries and filtering.
                                </p>
                                <div className="bg-white border border-green-200 rounded p-3 font-mono text-xs text-gray-600">
                                    CREATE INDEX idx_order_create_time ON t_order(create_time, status);
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end space-x-3">
                        <button 
                            onClick={closeLoop}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                        >
                            {t('audit.cancel')}
                        </button>
                        <button 
                            onClick={() => { alert('Added to Whitelist'); closeLoop(); }}
                            className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 border border-transparent rounded-md hover:bg-red-100 transition-colors"
                        >
                            {t('audit.whitelist')}
                        </button>
                        <button 
                            onClick={() => { alert('Optimization applied (simulated)'); closeLoop(); }}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 shadow-sm transition-colors flex items-center"
                        >
                            <Zap size={16} className="mr-2" />
                            {t('audit.apply')}
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default SqlAuditPage;
