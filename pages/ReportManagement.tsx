import React, { useEffect, useState } from 'react';
import { ApiService } from '../services/apiService';
import { WdrReport } from '../types';
import { Upload, RefreshCw, Trash2, GitCompare, Eye, Search, X, FileUp, AlertTriangle } from 'lucide-react';
import { useI18n } from '../context/I18nContext';
import { useNavigate } from 'react-router-dom';

const ReportManagement: React.FC = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [reports, setReports] = useState<WdrReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  
  // Delete Modal State
  const [reportToDelete, setReportToDelete] = useState<number | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const data = await ApiService.getWdrReports();
    setReports(data);
    setLoading(false);
  };

  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
        setIsUploadModalOpen(false);
        loadData(); 
    }, 500);
  };

  const handleDelete = async () => {
      if (reportToDelete) {
          await ApiService.deleteWdrReport(reportToDelete);
          setReportToDelete(null);
          loadData();
      }
  };

  return (
    <div className="space-y-4">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-center bg-white p-4 rounded-lg shadow-sm border border-gray-100">
        <div className="flex space-x-3 w-full sm:w-auto mb-3 sm:mb-0">
            <div className="relative">
                <input 
                    type="text" 
                    placeholder={t('rep.search')} 
                    className="pl-9 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
            </div>
            <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-md" onClick={loadData}>
                <RefreshCw size={18} />
            </button>
        </div>
        <div className="flex space-x-2 w-full sm:w-auto">
            <button 
                onClick={() => setIsUploadModalOpen(true)}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 transition-colors"
            >
                <Upload size={16} className="mr-2" /> {t('rep.upload')}
            </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                    <th className="px-6 py-3 font-medium text-gray-500">{t('rep.id')}</th>
                    <th className="px-6 py-3 font-medium text-gray-500">{t('rep.instance')}</th>
                    <th className="px-6 py-3 font-medium text-gray-500">{t('rep.generated')}</th>
                    <th className="px-6 py-3 font-medium text-gray-500">{t('rep.period')}</th>
                    <th className="px-6 py-3 font-medium text-gray-500">{t('rep.status')}</th>
                    <th className="px-6 py-3 font-medium text-gray-500 text-right">{t('rep.actions')}</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
                {loading ? (
                    <tr><td colSpan={6} className="p-6 text-center text-gray-500">{t('rep.loading')}</td></tr>
                ) : (
                    reports.map(report => (
                        <tr key={report.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-3 text-gray-900 font-medium">#{report.id}</td>
                            <td className="px-6 py-3 text-gray-600">{report.instanceName}</td>
                            <td className="px-6 py-3 text-gray-600">{report.generateTime}</td>
                            <td className="px-6 py-3 text-gray-600">{report.period}</td>
                            <td className="px-6 py-3">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    report.status === 'Success' ? 'bg-green-100 text-green-800' :
                                    report.status === 'Failed' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                                }`}>
                                    {report.status}
                                </span>
                            </td>
                            <td className="px-6 py-3 text-right space-x-2">
                                <button 
                                    onClick={() => navigate(`/reports/${report.id}`)}
                                    className="text-gray-400 hover:text-blue-600 transition-colors" 
                                    title="View"
                                >
                                    <Eye size={18} />
                                </button>
                                <button 
                                    onClick={() => navigate(`/comparison?sourceId=${report.id}`)}
                                    className="text-gray-400 hover:text-blue-600 transition-colors" 
                                    title="Compare"
                                >
                                    <GitCompare size={18} />
                                </button>
                                <button 
                                    onClick={() => setReportToDelete(report.id)}
                                    className="text-gray-400 hover:text-red-600 transition-colors" 
                                    title="Delete"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </td>
                        </tr>
                    ))
                )}
            </tbody>
        </table>
        {/* Pagination Mock */}
        <div className="px-6 py-3 border-t border-gray-100 flex justify-between items-center">
            <span className="text-xs text-gray-500">{t('rep.showing', {start: 1, end: 10, total: 50})}</span>
            <div className="flex space-x-1">
                <button className="px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-50">{t('rep.prev')}</button>
                <button className="px-2 py-1 border bg-blue-50 text-blue-600 border-blue-200 rounded">1</button>
                <button className="px-2 py-1 border rounded hover:bg-gray-50">2</button>
                <button className="px-2 py-1 border rounded hover:bg-gray-50">3</button>
                <button className="px-2 py-1 border rounded hover:bg-gray-50">{t('rep.next')}</button>
            </div>
        </div>
      </div>

      {/* Upload Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <h3 className="font-semibold text-gray-800 flex items-center">
                        <FileUp size={20} className="mr-2 text-blue-600" />
                        {t('rep.uploadTitle')}
                    </h3>
                    <button 
                        onClick={() => setIsUploadModalOpen(false)} 
                        className="text-gray-400 hover:text-gray-600 transition-colors rounded-full p-1 hover:bg-gray-200"
                    >
                        <X size={20} />
                    </button>
                </div>
                
                <form onSubmit={handleUploadSubmit}>
                    <div className="p-6 space-y-5">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('rep.instanceName')}</label>
                            <input 
                                type="text" 
                                className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow" 
                                placeholder="e.g. prod-db-node-01" 
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('rep.desc')}</label>
                            <textarea 
                                className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow resize-none" 
                                rows={3}
                                placeholder="Brief description of the report context..." 
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('rep.file')}</label>
                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 flex flex-col items-center justify-center text-gray-500 hover:bg-blue-50 hover:border-blue-300 transition-all cursor-pointer group relative">
                                <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" accept=".html,.wdr" />
                                <div className="p-3 bg-gray-100 rounded-full mb-3 group-hover:bg-blue-100 transition-colors">
                                    <Upload size={24} className="text-gray-500 group-hover:text-blue-600" />
                                </div>
                                <span className="text-sm font-medium text-gray-700 group-hover:text-blue-700">{t('rep.clickUpload')}</span>
                                <span className="text-xs text-gray-400 mt-1">{t('rep.fileHint')}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="px-6 py-4 bg-gray-50 flex justify-end space-x-3 border-t border-gray-100">
                        <button 
                            type="button"
                            onClick={() => setIsUploadModalOpen(false)}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                        >
                            {t('rep.cancel')}
                        </button>
                        <button 
                            type="submit"
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-sm transition-colors"
                        >
                            {t('rep.submit')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {reportToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-lg shadow-xl w-full max-w-sm overflow-hidden transform transition-all animate-in fade-in zoom-in-95">
                  <div className="p-6">
                      <div className="flex items-center mb-4 text-red-600">
                          <AlertTriangle size={24} className="mr-2" />
                          <h3 className="text-lg font-semibold">{t('rep.deleteTitle')}</h3>
                      </div>
                      <p className="text-gray-600 text-sm mb-6">
                          {t('rep.deleteConfirm', { id: reportToDelete })}
                      </p>
                      <div className="flex justify-end space-x-3">
                          <button 
                              onClick={() => setReportToDelete(null)}
                              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                          >
                              {t('rep.cancel')}
                          </button>
                          <button 
                              onClick={handleDelete}
                              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors"
                          >
                              {t('rep.delete')}
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default ReportManagement;
