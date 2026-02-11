
import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';

type Language = 'en' | 'zh';

interface I18nContextProps {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextProps | undefined>(undefined);

const translations: Record<Language, Record<string, string>> = {
  en: {
    // Menu
    'menu.dashboard': 'Home',
    'menu.wdrAnalyze': 'WDR Analysis',
    'menu.wdrComparison': 'WDR Comparison',
    'menu.reports': 'Reports',
    'menu.comparison': 'Comparison',
    'menu.visualizer': 'Plan Visualizer',
    'menu.plandiff': 'Plan Diff',
    'menu.thresholds': 'Thresholds',
    'menu.sqlaudit': 'SQL Audit',
    'menu.auditlog': 'Audit Log',
    'header.role': 'Administrator',

    // Dashboard - Intro
    'dash.welcome': 'Welcome to WDRProbe',
    'dash.tagline': 'Intelligent Analysis Expert for GaussDB WDR Reports',
    'dash.description': 'WDRProbe is a professional tool designed for DBA to diagnose performance bottlenecks in GaussDB. By parsing WDR reports, we provide health scoring, multi-dimensional comparison, and expert-level SQL plan optimization suggestions.',
    
    // Dashboard - Three Steps
    'dash.steps.title': 'Three Steps to Performance Diagnosis',
    'dash.step1.title': '1. Global Analysis',
    'dash.step1.desc': 'Upload WDR to identify core wait events and workload patterns.',
    'dash.step2.title': '2. Dimension Compare',
    'dash.step2.desc': 'Use Baseline to lock down root causes of performance regression.',
    'dash.step3.title': '3. Precise Optimize',
    'dash.step3.desc': 'Visualize plans and apply expert rules for SQL tuning.',
    'dash.action.start': 'Start Now',
    'dash.action.compare': 'Start Comparing',
    'dash.action.visualize': 'Open Visualizer',

    // Dashboard - Other
    'dash.recentAnalyses': 'Recent Analyses',
    'dash.instanceOverview': 'Instance Health',
    'dash.viewDetail': 'View Detail',
    'dash.lastReport': 'Last Report',
    'dash.healthy': 'Healthy',
    'dash.warning': 'Warning',
    'dash.critical': 'Critical',
    'dash.score': 'Score',
    
    // Original Keys for compatibility
    'rep.id': 'ID',
    'rep.instance': 'Instance',
    'rep.generated': 'Time',
    
    // (Other translations omitted for brevity but should be kept in real app)
  },
  zh: {
    // Menu
    'menu.dashboard': '首页',
    'menu.wdrAnalyze': 'WDR 分析',
    'menu.wdrComparison': 'WDR 对比',
    'menu.reports': '报告管理',
    'menu.comparison': '性能比对',
    'menu.visualizer': '计划可视化',
    'menu.plandiff': '计划比对',
    'menu.thresholds': '阈值配置',
    'menu.sqlaudit': 'SQL 审核',
    'menu.auditlog': '审计日志',
    'header.role': '管理员',

    // Dashboard - Intro
    'dash.welcome': '欢迎使用 WDRProbe',
    'dash.tagline': 'GaussDB WDR 报告智能分析专家',
    'dash.description': 'WDRProbe 是专为 DBA 打造的 GaussDB 性能诊断工具。通过深度解析 WDR 报告，提供健康评分、多维度性能比对以及专家级的 SQL 执行计划优化建议，加速瓶颈定位。',
    
    // Dashboard - Three Steps
    'dash.steps.title': '性能诊断“三板斧”',
    'dash.step1.title': '1. 全局视角诊断',
    'dash.step1.desc': '通过 WDR 报告概览，识别核心等待事件与负载模式。',
    'dash.step2.title': '2. 维度对比定位',
    'dash.step2.desc': '引入 Baseline 基准，通过差异比对锁定性能退化根源。',
    'dash.step3.title': '3. 精准调优闭环',
    'dash.step3.desc': '可视化 SQL 执行计划，基于专家规则库进行深度调优。',
    'dash.action.start': '开始分析',
    'dash.action.compare': '发起比对',
    'dash.action.visualize': '打开可视化',

    // Dashboard - Other
    'dash.recentAnalyses': '最近分析记录',
    'dash.instanceOverview': '实例健康度',
    'dash.viewDetail': '查看详情',
    'dash.lastReport': '最近报告',
    'dash.healthy': '健康',
    'dash.warning': '警告',
    'dash.critical': '严重',
    'dash.score': '健康分',
  }
};

export const I18nProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('zh');

  const t = useCallback((key: string, params?: Record<string, string | number>) => {
    let text = translations[language][key] || key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, String(v));
      });
    }
    return text;
  }, [language]);

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
};
