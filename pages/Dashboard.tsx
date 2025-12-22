import React, { useEffect, useState } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend 
} from 'recharts';
import { Activity, Database, Server, AlertTriangle, ChevronDown, CheckCircle, AlertCircle } from 'lucide-react';
import { useI18n } from '../context/I18nContext';
import { ApiService } from '../services/apiService';
import { DashboardMetrics, InstanceSummary, WdrReport } from '../types';
import { Link } from 'react-router-dom';

const KPICard = ({ title, value, icon: Icon, color }: { title: string; value: string; icon: any; color: string }) => (
  <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex items-center space-x-4">
    <div className={`p-3 rounded-full bg-${color}-50 text-${color}-600`}>
      <Icon size={24} />
    </div>
    <div>
      <p className="text-sm text-gray-500">{title}</p>
      <p className="text-2xl font-bold text-gray-800">{value}</p>
    </div>
  </div>
);

const InstanceCard = ({ instance, onClick }: { instance: InstanceSummary, onClick: () => void }) => {
    const { t } = useI18n();
    const isHealthy = instance.status === 'Healthy';
    const isWarning = instance.status === 'Warning';
    const color = isHealthy ? 'green' : isWarning ? 'yellow' : 'red';
    const Icon = isHealthy ? CheckCircle : isWarning ? AlertTriangle : AlertCircle;

    return (
        <div 
            onClick={onClick}
            className="bg-white p-5 rounded-lg shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-pointer relative overflow-hidden group"
        >
            <div className={`absolute top-0 left-0 w-1 h-full bg-${color}-500`}></div>
            <div className="flex justify-between items-start mb-3">
                <div>
                    <h4 className="font-bold text-gray-800 text-lg group-hover:text-blue-600 transition-colors">{instance.instanceName}</h4>
                    <p className="text-xs text-gray-400">{t('dash.lastReport')}: {instance.lastReportTime}</p>
                </div>
                <div className={`flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium bg-${color}-50 text-${color}-700`}>
                    <Icon size={12} />
                    <span>{t(`dash.${instance.status.toLowerCase()}`)}</span>
                </div>
            </div>
            <div className="flex justify-between items-end">
                <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">{t('dash.score')}</p>
                    <p className="text-2xl font-bold text-gray-700">{instance.healthScore}</p>
                </div>
                <div className="text-right">
                     <p className="text-xs text-gray-500 uppercase tracking-wide">{t('dash.activeIssues')}</p>
                     <p className="text-xl font-bold text-gray-700">{instance.activeIssues}</p>
                </div>
            </div>
        </div>
    );
};

const PIE_COLORS = ['#10b981', '#f59e0b', '#ef4444'];

const Dashboard: React.FC = () => {
  const { t } = useI18n();
  const [instances, setInstances] = useState<InstanceSummary[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
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

  useEffect(() => {
    const loadMetrics = async () => {
        const data = await ApiService.getDashboardMetrics(selectedInstance || undefined);
        setMetrics(data);
    };
    loadMetrics();
  }, [selectedInstance]);

  const filteredReports = selectedInstance 
    ? recentReports.filter(r => r.instanceName === selectedInstance)
    : recentReports;

  // Localize pie data names
  const pieData = metrics?.healthDistribution.map(item => ({
      ...item,
      name: t(`dash.${item.name.toLowerCase()}`)
  }));

  return (
    <div className="space-y-6">
      {/* Header & Filter */}
      <div className="flex flex-col sm:flex-row justify-between items-center bg-white p-4 rounded-lg shadow-sm border border-gray-100">
         <h2 className="text-lg font-bold text-gray-800 mb-3 sm:mb-0">
             {selectedInstance ? selectedInstance : t('menu.dashboard')}
         </h2>
         <div className="relative">
             <select 
                value={selectedInstance || ''}
                onChange={(e) => setSelectedInstance(e.target.value || null)}
                className="appearance-none bg-gray-50 border border-gray-300 text-gray-700 py-2 px-4 pr-8 rounded leading-tight focus:outline-none focus:bg-white focus:border-blue-500 text-sm font-medium w-48"
             >
                 <option value="">{t('dash.allInstances')}</option>
                 {instances.map(inst => (
                     <option key={inst.instanceName} value={inst.instanceName}>{inst.instanceName}</option>
                 ))}
             </select>
             <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                <ChevronDown size={14} />
             </div>
         </div>
      </div>

      {/* Instance Overview Grid (Only shown when viewing All) */}
      {!selectedInstance && instances.length > 0 && (
          <div className="space-y-3">
              <h3 className="text-sm font-bold text-gray-600 uppercase tracking-wider">{t('dash.instanceOverview')}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {instances.map(inst => (
                      <InstanceCard 
                        key={inst.instanceName} 
                        instance={inst} 
                        onClick={() => setSelectedInstance(inst.instanceName)} 
                      />
                  ))}
              </div>
          </div>
      )}

      {/* KPIs */}
      {metrics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-in fade-in duration-500">
            <KPICard title={t('dash.cpu')} value={metrics.cpu} icon={Activity} color="blue" />
            <KPICard title={t('dash.mem')} value={metrics.mem} icon={Server} color="purple" />
            <KPICard title={t('dash.tps')} value={metrics.tps} icon={Database} color="green" />
            <KPICard title={t('dash.qps')} value={metrics.qps} icon={Database} color="indigo" />
          </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Health Chart */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 lg:col-span-1">
          <h3 className="font-semibold text-lg mb-4 text-gray-800">{t('dash.health')}</h3>
          <div className="h-64">
            {pieData && (
                <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    >
                    {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                    </Pie>
                    <Tooltip />
                    <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
                </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Trend Chart */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 lg:col-span-2">
          <h3 className="font-semibold text-lg mb-4 text-gray-800">{t('dash.trend')}</h3>
          <div className="h-64">
             {metrics?.trendData && (
                <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metrics.trendData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                    <XAxis dataKey="time" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 8 }} />
                </LineChart>
                </ResponsiveContainer>
             )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hot Issues */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h3 className="font-semibold text-lg mb-4 text-gray-800 flex items-center">
            <AlertTriangle size={20} className="text-orange-500 mr-2" /> {t('dash.hotIssues')}
          </h3>
          <ul className="space-y-4">
            {metrics?.hotIssues.map((issue, idx) => (
                <li key={idx} className="flex items-center justify-between pb-3 border-b border-gray-50 last:border-0">
                    <div>
                        <p className="text-sm font-medium text-gray-800">{issue.title}</p>
                        <p className="text-xs text-gray-400">{issue.desc}</p>
                    </div>
                    <button className="text-blue-600 text-sm hover:underline">{t('dash.details')}</button>
                </li>
            ))}
            {!metrics?.hotIssues.length && <li className="text-gray-400 text-sm italic">No hot issues detected.</li>}
          </ul>
        </div>

         {/* Recent Reports */}
         <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h3 className="font-semibold text-lg mb-4 text-gray-800">{t('dash.recentReports')}</h3>
          <div className="relative pl-6 border-l-2 border-gray-200 space-y-6">
            {filteredReports.slice(0, 3).map(report => (
                <div key={report.id} className="relative group">
                    <span className={`absolute -left-[31px] top-1 w-4 h-4 rounded-full border-2 border-white transition-colors ${report.status === 'Success' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                    <p className="text-xs text-gray-400">{report.generateTime}</p>
                    <div className="flex justify-between items-center mt-1">
                        <div>
                            <p className="text-sm font-medium text-gray-700 group-hover:text-blue-600 transition-colors">{report.instanceName}</p>
                            <p className="text-xs text-gray-500">{t('rep.id')}: #{report.id}</p>
                        </div>
                        <Link to="/reports" className="text-blue-600 text-xs px-2 py-1 bg-blue-50 rounded hover:bg-blue-100 transition-colors">{t('dash.view')}</Link>
                    </div>
                </div>
            ))}
            {filteredReports.length === 0 && <div className="text-gray-400 text-sm italic">No recent reports found.</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
