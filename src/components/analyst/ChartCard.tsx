import React, { useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  BarChart3,
  LineChart as LineIcon,
  PieChart as PieIcon,
  Maximize2,
  Minimize2,
  HelpCircle,
  Hash,
} from 'lucide-react';
import { GroundedInsight } from '../../types/index.ts';

interface ChartCardProps {
  columns: { name: string; type?: string }[];
  rows: Record<string, any>[];
  insight?: GroundedInsight;
}

const COLORS = ['#4F46E5', '#06B6D4', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#64748B'];

export function ChartCard({ columns, rows, insight }: ChartCardProps) {
  const initialType = insight?.chartRecommendation?.type || 'bar';
  const [chartType, setChartType] = useState<string>(initialType);
  const [isExpanded, setIsExpanded] = useState(false);

  if (rows.length === 0 || columns.length === 0) {
    return null;
  }

  // Detect candidate numeric and categorical keys
  let categoryKey = insight?.chartRecommendation?.xAxisKey;
  let numericKey = insight?.chartRecommendation?.yAxisKey;

  const firstRow = rows[0];
  if (!categoryKey) {
    categoryKey = columns.find(c => typeof firstRow[c.name] === 'string')?.name || columns[0]?.name;
  }
  if (!numericKey) {
    numericKey = columns.find(c => typeof firstRow[c.name] === 'number')?.name || columns[1]?.name;
  }

  // Value Card representation for single cell / scalar
  if (chartType === 'value_card' || (rows.length === 1 && columns.length <= 2)) {
    const val = numericKey ? rows[0][numericKey] : Object.values(rows[0])[0];
    const label = numericKey || Object.keys(rows[0])[0];

    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Hash className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Scalar Metric Result
            </h3>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <span className="text-4xl sm:text-5xl font-extrabold text-indigo-600 dark:text-indigo-400 tracking-tight font-mono">
            {val !== null && val !== undefined ? String(val) : 'NULL'}
          </span>
          <span className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {label}
          </span>
        </div>
      </div>
    );
  }

  const renderChart = (height: number) => {
    switch (chartType) {
      case 'line':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <LineChart data={rows} margin={{ top: 10, right: 20, left: 0, bottom: 25 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.6} />
              <XAxis dataKey={categoryKey} tick={{ fontSize: 11 }} angle={-15} textAnchor="end" />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
              />
              <Line
                type="monotone"
                dataKey={numericKey}
                stroke="#4F46E5"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#4F46E5' }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        );

      case 'donut':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <PieChart>
              <Pie
                data={rows}
                dataKey={numericKey}
                nameKey={categoryKey}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={95}
                paddingAngle={3}
              >
                {rows.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        );

      case 'scatter':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.6} />
              <XAxis dataKey={categoryKey} tick={{ fontSize: 11 }} />
              <YAxis dataKey={numericKey} tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
              />
              <Scatter data={rows} fill="#4F46E5" />
            </ScatterChart>
          </ResponsiveContainer>
        );

      case 'bar':
      default:
        return (
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={rows} margin={{ top: 10, right: 20, left: 0, bottom: 25 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.6} />
              <XAxis dataKey={categoryKey} tick={{ fontSize: 11 }} angle={-15} textAnchor="end" />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
              />
              <Bar dataKey={numericKey} fill="#4F46E5" radius={[4, 4, 0, 0]}>
                {rows.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );
    }
  };

  return (
    <>
      <div
        id="chart-card-container"
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm"
      >
        {/* Chart Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 gap-3">
          <div>
            <h3 className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <span>{insight?.chartRecommendation?.title || `${numericKey} by ${categoryKey}`}</span>
            </h3>
            {insight?.chartRecommendation?.reasoning && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {insight.chartRecommendation.reasoning}
              </p>
            )}
          </div>

          {/* Chart Controls */}
          <div className="flex items-center gap-1.5 self-end sm:self-auto">
            {/* Chart type buttons */}
            <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-800/60">
              <button
                id="chart-type-bar-btn"
                onClick={() => setChartType('bar')}
                className={`p-1.5 rounded-md transition-colors ${
                  chartType === 'bar' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-xs' : 'text-slate-500'
                }`}
                title="Bar Chart"
              >
                <BarChart3 className="w-3.5 h-3.5" />
              </button>
              <button
                id="chart-type-line-btn"
                onClick={() => setChartType('line')}
                className={`p-1.5 rounded-md transition-colors ${
                  chartType === 'line' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-xs' : 'text-slate-500'
                }`}
                title="Line Chart"
              >
                <LineIcon className="w-3.5 h-3.5" />
              </button>
              <button
                id="chart-type-donut-btn"
                onClick={() => setChartType('donut')}
                className={`p-1.5 rounded-md transition-colors ${
                  chartType === 'donut' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-xs' : 'text-slate-500'
                }`}
                title="Donut Chart"
              >
                <PieIcon className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Expand chart button */}
            <button
              id="expand-chart-modal-btn"
              onClick={() => setIsExpanded(true)}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
              title="Expand Chart"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Chart Viewport */}
        <div className="pt-6">{renderChart(280)}</div>
      </div>

      {/* Expanded Chart Modal */}
      {isExpanded && (
        <div
          id="chart-expanded-modal"
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-8 z-50 animate-in fade-in"
        >
          <div className="bg-white dark:bg-slate-900 w-full max-w-4xl h-[80vh] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-semibold text-base text-slate-900 dark:text-white">
                {insight?.chartRecommendation?.title || `${numericKey} by ${categoryKey}`}
              </h3>
              <button
                onClick={() => setIsExpanded(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 pt-6">{renderChart(450)}</div>
          </div>
        </div>
      )}
    </>
  );
}
