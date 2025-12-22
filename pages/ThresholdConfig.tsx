import React, { useEffect, useState } from 'react';
import { ApiService } from '../services/apiService';
import { ThresholdConfig } from '../types';
import { Save, RotateCcw, FileText, ChevronRight, Edit2 } from 'lucide-react';
import { useI18n } from '../context/I18nContext';

const ThresholdPage: React.FC = () => {
  const { t } = useI18n();
  const [configs, setConfigs] = useState<ThresholdConfig[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('SQL');
  const [isTemplateOpen, setIsTemplateOpen] = useState(false);

  useEffect(() => {
    ApiService.getThresholdConfigs().then(setConfigs);
  }, []);

  const categories = ['SQL', 'WAIT', 'SYSTEM', 'AI'];
  const filteredConfigs = configs.filter(c => c.category === selectedCategory);

  const handleUpdate = async (key: string, newVal: number) => {
    await ApiService.updateThresholdConfig(key, { value: newVal });
    setConfigs(prev => prev.map(c => c.configKey === key ? { ...c, value: newVal } : c));
  };

  return (
    <div className="flex h-[calc(100vh-140px)] bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
      {/* Left Tree/Sidebar */}
      <div className="w-64 border-r border-gray-200 bg-gray-50 flex flex-col">
        <div className="p-4 font-semibold text-gray-700 border-b border-gray-200">{t('thr.categories')}</div>
        <div className="flex-1 overflow-y-auto p-2">
            {categories.map(cat => (
                <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm mb-1 ${
                        selectedCategory === cat ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-200'
                    }`}
                >
                    <span>{cat} {t('menu.thresholds')}</span>
                    <ChevronRight size={16} className="text-gray-400" />
                </button>
            ))}
        </div>
      </div>

      {/* Right Content */}
      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-white">
            <h2 className="text-lg font-medium text-gray-800">{selectedCategory} {t('thr.config')}</h2>
            <div className="space-x-2">
                 <button className="px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50 flex items-center inline-flex">
                    <Save size={16} className="mr-2"/> {t('thr.batchSave')}
                 </button>
                 <div className="relative inline-block">
                    <button 
                        onClick={() => setIsTemplateOpen(!isTemplateOpen)}
                        className="px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50 flex items-center inline-flex"
                    >
                        <FileText size={16} className="mr-2"/> {t('thr.templates')}
                    </button>
                    {isTemplateOpen && (
                        <div className="absolute right-0 mt-2 w-64 bg-white rounded-md shadow-lg border border-gray-200 z-50">
                            <div className="p-2 border-b border-gray-100 text-xs font-bold text-gray-500">{t('thr.sysTemplates')}</div>
                            <div className="p-2 hover:bg-blue-50 cursor-pointer text-sm">Default Optimization</div>
                            <div className="p-2 hover:bg-blue-50 cursor-pointer text-sm">High Throughput</div>
                            <div className="p-2 border-b border-gray-100 text-xs font-bold text-gray-500 mt-2">{t('thr.customTemplates')}</div>
                            <div className="p-2 hover:bg-blue-50 cursor-pointer text-sm">My Custom Config (2025-11)</div>
                        </div>
                    )}
                 </div>
            </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto p-6">
            <table className="w-full text-left text-sm">
                <thead>
                    <tr className="border-b-2 border-gray-100 text-gray-500">
                        <th className="pb-3 w-1/4">{t('thr.key')}</th>
                        <th className="pb-3 w-1/6">{t('thr.value')}</th>
                        <th className="pb-3 w-1/12">{t('thr.unit')}</th>
                        <th className="pb-3 w-1/4">{t('thr.range')}</th>
                        <th className="pb-3 text-right">{t('thr.action')}</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {filteredConfigs.map(conf => (
                        <tr key={conf.configKey} className="group hover:bg-gray-50">
                            <td className="py-4 pr-4">
                                <div className="font-medium text-gray-900">{conf.configName}</div>
                                <div className="text-xs text-gray-400 font-mono">{conf.configKey}</div>
                            </td>
                            <td className="py-4">
                                <input 
                                    type="number" 
                                    defaultValue={conf.value}
                                    onBlur={(e) => handleUpdate(conf.configKey, Number(e.target.value))}
                                    className="w-24 border border-gray-300 rounded px-2 py-1 text-right focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                />
                            </td>
                            <td className="py-4 text-gray-500">{conf.unit}</td>
                            <td className="py-4 text-gray-500">{conf.recommendRange}</td>
                            <td className="py-4 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                                <button className="text-blue-600 hover:bg-blue-50 p-1.5 rounded mr-1" title="History">
                                    <RotateCcw size={16} />
                                </button>
                                <button className="text-blue-600 hover:bg-blue-50 p-1.5 rounded" title="Details">
                                    <Edit2 size={16} />
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  );
};

export default ThresholdPage;
