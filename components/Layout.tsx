
import React, { ReactNode, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  FileText, 
  GitCompare, 
  Settings, 
  ShieldAlert, 
  History, 
  Bell, 
  User, 
  Menu,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  Languages,
  SplitSquareHorizontal,
  FileSearch
} from 'lucide-react';
import { useI18n } from '../context/I18nContext';

interface LayoutProps {
  children: ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();
  const { t, language, setLanguage } = useI18n();

  const MENU_ITEMS = [
    { path: '/', labelKey: 'menu.dashboard', icon: LayoutDashboard },
    { path: '/wdr-analysis', labelKey: 'menu.wdrAnalyze', icon: FileSearch },
    { path: '/reports', labelKey: 'menu.reports', icon: FileText },
    { path: '/comparison', labelKey: 'menu.comparison', icon: GitCompare },
    { path: '/visualizer', labelKey: 'menu.visualizer', icon: GitBranch },
    { path: '/plandiff', labelKey: 'menu.plandiff', icon: SplitSquareHorizontal },
    { path: '/thresholds', labelKey: 'menu.thresholds', icon: Settings },
    { path: '/sqlaudit', labelKey: 'menu.sqlaudit', icon: ShieldAlert },
    { path: '/auditlog', labelKey: 'menu.auditlog', icon: History },
  ];

  const currentLabel = MENU_ITEMS.find(m => m.path === location.pathname)?.labelKey;

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* Sidebar */}
      <aside 
        className={`${
          sidebarOpen ? 'w-64' : 'w-20'
        } bg-[#0f2c4b] text-white transition-all duration-300 ease-in-out flex flex-col shadow-xl z-20`}
      >
        {/* Logo Area */}
        <div className="h-16 flex items-center justify-center border-b border-gray-700">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center font-bold text-lg">W</div>
            {sidebarOpen && <span className="font-bold text-lg tracking-wide truncate">WDRProbe</span>}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-2">
            {MENU_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={`flex items-center px-4 py-3 rounded-md transition-colors ${
                      isActive 
                        ? 'bg-blue-600 text-white shadow-md' 
                        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    }`}
                  >
                    <Icon size={20} className="min-w-[20px]" />
                    {sidebarOpen && <span className="ml-3 truncate">{t(item.labelKey)}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Toggle Button */}
        <div className="p-4 border-t border-gray-700">
            <button 
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="w-full flex items-center justify-center p-2 rounded-md hover:bg-gray-800 transition-colors"
            >
                {sidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
            </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 bg-white shadow-sm flex items-center justify-between px-6 z-10">
          <div className="text-gray-500 text-sm">
             <span className="font-semibold text-gray-700">WDRProbe</span> / {currentLabel ? t(currentLabel) : 'Page'}
          </div>
          
          <div className="flex items-center space-x-6">
            {/* Language Switcher */}
            <button 
                onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
                className="text-gray-500 hover:text-blue-600 flex items-center space-x-1 px-2 py-1 rounded hover:bg-gray-50 transition-colors"
                title="Switch Language"
            >
                <Languages size={20} />
                <span className="text-sm font-medium">{language === 'zh' ? 'EN' : '中文'}</span>
            </button>

            <div className="relative cursor-pointer text-gray-500 hover:text-blue-600">
                <Bell size={20} />
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">3</span>
            </div>
            <div className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded-md">
                <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                    <User size={16} />
                </div>
                <div className="text-sm">
                    <p className="font-medium text-gray-700">Zhang San</p>
                    <p className="text-xs text-gray-400">{t('header.role')}</p>
                </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-6 bg-gray-50">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
