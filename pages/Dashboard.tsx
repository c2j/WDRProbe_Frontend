
import React, { useEffect, useState } from 'react';
import { 
  FileSearch, Scale, GitBranch, ArrowRight, CheckCircle, 
  AlertTriangle, AlertCircle, PlayCircle, History, Database, Zap
} from 'lucide-react';
import { useI18n } from '../context/I18nContext';
import { ApiService } from '../services/apiService';
import { InstanceSummary, WdrReport } from '../types';
import { Link, useNavigate } from 'react-router-dom';

const StepCard = ({ title, desc, icon: Icon, action, actionLabel, link }: any) => {
    const navigate = useNavigate();
    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all flex flex-col h-full group">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center mb-4 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <Icon size={24} />
            </div>
            <h4 className="font-bold text-gray-800 text-lg mb-2">{title}</h4>
            <p className="text-sm text-gray-500 mb-6 flex-1 leading-relaxed">{desc}</p>
            <button 
                onClick={() => navigate(link)}
                className="flex items-center text-blue-600 font-medium text-sm hover:text-blue-700 group/btn"
            >
                {actionLabel} <ArrowRight size={16} className="ml-1 group-hover/btn:translate-x-1 transition-transform" />
            </button>
        </div>
    );
};

const InstanceStatusItem = ({ instance }: { instance: InstanceSummary }) => {
    const { t } = useI18n();
    const isHealthy = instance.status === 'Healthy';
    const isWarning = instance.status === 'Warning';
    const color = isHealthy ? 'green' : isWarning ? 'orange' : 'red';
    const Icon = isHealthy ? CheckCircle : isWarning ? AlertTriangle : AlertCircle;

    return (
        <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-100 hover:border-blue-200 transition-colors">
            <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-full bg-${color}-50 text-${color}-500`}>
                    <Icon size={18} />
                </div>
                <div>
                    <p className="font-bold text-gray-700">{instance.instanceName}</p>
                    <p className="text-xs text-gray-400">{t('dash.lastReport')}: {instance.lastReportTime}</p>
                </div>
            </div>
            <div className="text-right">
                <p className="text-[10px] text-gray-400 uppercase font-bold">{t('dash.score')}</p>
                <p className={`text-xl font-black text-${color}-600`}>{instance.healthScore}</p>
            </div>
        </div>
    );
};

const Dashboard: React.FC = () => {
  const { t } = useI18n();
  const [instances, setInstances] = useState<InstanceSummary[]>([]);
  const [recentReports, setRecentReports] = useState<WdrReport[]>([]);

  useEffect(() => {
    const loadInitData = async () => {
        const insts = await ApiService.getInstanceSummaries();
        setInstances(insts);
        const reps = await ApiService.getWdrReports();
        setRecentReports(reps);
    };
    loadInitData();
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      {/* Hero Section */}
      <div className="relative rounded-2xl overflow-hidden bg-[#0f2c4b] text-white p-8 lg:p-12 shadow-xl">
          <div className="absolute top-0 right-0 w-1/3 h-full bg-gradient-to-l from-blue-500/20 to-transparent pointer-events-none"></div>
          <div className="relative z-10 max-w-3xl">
              <div className="inline-flex items-center space-x-2 px-3 py-1 bg-blue-500/20 rounded-full text-blue-300 text-xs font-bold mb-6 border border-blue-400/20">
                  <Zap size={12} className="fill-current" />
                  <span>GaussDB Toolchain</span>
              </div>
              <h1 className="text-3xl lg:text-4xl font-black mb-4 tracking-tight">
                  {t('dash.welcome')}
              </h1>
              <p className="text-xl text-blue-100 font-medium mb-4">
                  {t('dash.tagline')}
              </p>
              <p className="text-blue-200/80 leading-relaxed text-sm lg:text-base">
                  {t('dash.description')}
              </p>
          </div>
      </div>

      {/* Three Steps Guide */}
      <section className="space-y-4">
          <h3 className="text-xl font-bold text-gray-800 flex items-center">
              <PlayCircle size={24} className="mr-2 text-blue-600" />
              {t('dash.steps.title')}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <StepCard 
                  title={t('dash.step1.title')}
                  desc={t('dash.step1.desc')}
                  icon={FileSearch}
                  actionLabel={t('dash.action.start')}
                  link="/wdr-analysis"
              />
              <StepCard 
                  title={t('dash.step2.title')}
                  desc={t('dash.step2.desc')}
                  icon={Scale}
                  actionLabel={t('dash.action.compare')}
                  link="/wdr-comparison"
              />
              <StepCard 
                  title={t('dash.step3.title')}
                  desc={t('dash.step3.desc')}
                  icon={GitBranch}
                  actionLabel={t('dash.action.visualize')}
                  link="/visualizer"
              />
          </div>
      </section>

      {/* Instance Summary & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Health Overview */}
          <div className="lg:col-span-1 space-y-4">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest flex items-center">
                  <Database size={16} className="mr-2" />
                  {t('dash.instanceOverview')}
              </h3>
              <div className="space-y-3">
                  {instances.map(inst => (
                      <InstanceStatusItem key={inst.instanceName} instance={inst} />
                  ))}
                  {instances.length === 0 && (
                      <div className="p-8 text-center text-gray-400 bg-white rounded-xl border border-dashed border-gray-200 text-sm">
                          No instances tracked.
                      </div>
                  )}
              </div>
          </div>

          {/* Recent Reports */}
          <div className="lg:col-span-2 space-y-4">
              <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest flex items-center">
                      <History size={16} className="mr-2" />
                      {t('dash.recentAnalyses')}
                  </h3>
                  <Link to="/reports" className="text-blue-600 text-xs font-bold hover:underline">{t('dash.view')}</Link>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <table className="w-full text-left text-sm">
                      <thead className="bg-gray-50/50 border-b border-gray-100 text-gray-400 font-bold">
                          <tr>
                              <th className="px-6 py-4">{t('rep.instance')}</th>
                              <th className="px-6 py-4">{t('rep.generated')}</th>
                              <th className="px-6 py-4 text-right">{t('dash.viewDetail')}</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                          {recentReports.slice(0, 5).map(report => (
                              <tr key={report.id} className="hover:bg-gray-50 transition-colors">
                                  <td className="px-6 py-4 font-bold text-gray-700">{report.instanceName}</td>
                                  <td className="px-6 py-4 text-gray-500">{report.generateTime}</td>
                                  <td className="px-6 py-4 text-right">
                                      <Link to={`/reports/${report.id}`} className="text-blue-600 hover:text-blue-800">
                                          <ArrowRight size={18} className="inline" />
                                      </Link>
                                  </td>
                              </tr>
                          ))}
                          {recentReports.length === 0 && (
                              <tr>
                                  <td colSpan={3} className="px-6 py-12 text-center text-gray-400 italic">
                                      No analysis history found. Start by uploading a report!
                                  </td>
                              </tr>
                          )}
                      </tbody>
                  </table>
              </div>
          </div>
      </div>
    </div>
  );
};

export default Dashboard;
