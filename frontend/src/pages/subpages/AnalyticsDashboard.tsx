import { useState, useEffect, useCallback, useMemo } from "react";
import { dashboardApi, branchesApi } from "../../lib/api";
import { useTheme } from "../../lib/ThemeContext";
import { showToast } from "../../lib/toast";
import { SkeletonLoader, ErrorAlert, PageHeader, KpiCard, ChartCard, DashboardCard, PeriodSelect } from "../../components";
import {
  LuDollarSign,
  LuClipboardList,
  LuUsers,
  LuTriangleAlert,
  LuRefreshCw,
  LuChevronDown,
  LuPackage,
  LuCircleAlert,
} from "react-icons/lu";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type {
  DashboardSummary,
  SalesOverTimePoint,
  TopService,
  JobStatusDistribution,
  BranchRevenue,
  RecentOrder,
  Branch,
} from "../../types";

// ─── Color palette ───
const PIE_COLORS = ["#5570F1", "#FFCC91", "#519C66", "#CC5F5F", "#8B5CF6", "#F59E0B", "#6366F1", "#EC4899"];
const STATUS_COLORS: Record<string, string> = {
  draft: "#8E8E91",
  pending_approval: "#FFCC91",
  approved: "#5570F1",
  in_progress: "#6366F1",
  ready_for_release: "#8B5CF6",
  completed: "#519C66",
  rejected: "#CC5F5F",
  cancelled: "#EF4444",
};
const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending Approval",
  approved: "Approved",
  in_progress: "In Progress",
  ready_for_release: "Ready for Release",
  completed: "Completed",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Date range helpers ───
function getDateRange(range: string): { date_from: string; date_to: string } {
  const now = new Date();
  const to = now.toISOString();
  let from: Date;
  switch (range) {
    case "today":
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "7d":
      from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
      from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case "90d":
      from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case "year":
      from = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  return { date_from: from.toISOString(), date_to: to };
}

const DATE_RANGES = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
  { value: "year", label: "This Year" },
];

// ─── Status badge component ───
function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: "bg-neutral-100 text-neutral-900",
    pending_approval: "bg-secondary-200 text-secondary-950",
    approved: "bg-primary-200 text-primary",
    in_progress: "bg-primary-100 text-primary",
    ready_for_release: "bg-primary-200 text-primary-950",
    completed: "bg-positive-100 text-positive",
    rejected: "bg-negative-100 text-negative",
    cancelled: "bg-negative-100 text-negative-950",
  };
  return (
    <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${colors[status] || "bg-neutral-100 text-neutral-900"}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

// ─── Custom tooltip for charts ───
function ChartTooltip({ active, payload, label, isCurrency = false, isDark = false }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg px-3 py-2 shadow-lg border"
      style={{
        backgroundColor: isDark ? "#1e1e24" : "#ffffff",
        borderColor: isDark ? "#2a2a30" : "#E6E6E7",
      }}
    >
      <p className="text-xs mb-1" style={{ color: isDark ? "#a7a7a9" : "#8E8E91" }}>{label}</p>
      {payload.map((item: any, i: number) => (
        <p key={i} className="text-sm font-semibold" style={{ color: item.color }}>
          {isCurrency ? formatCurrency(item.value) : item.value.toLocaleString()}
        </p>
      ))}
    </div>
  );
}

export function AnalyticsDashboard() {
  const { settings } = useTheme();
  const isDark = settings.darkMode;

  // Dark-mode-aware chart colors
  const chartGrid = isDark ? "#2a2a30" : "#E6E6E7";
  const chartTick = isDark ? "#a7a7a9" : "#8E8E91";
  const chartAxisLine = isDark ? "#2a2a30" : "#E6E6E7";
  const tooltipBg = isDark ? "#1e1e24" : "#ffffff";
  const tooltipBorder = isDark ? "#2a2a30" : "#E6E6E7";
  const tooltipTextPrimary = isDark ? "#f4f4f4" : "#1C1D22";
  const tooltipTextSecondary = isDark ? "#a7a7a9" : "#8E8E91";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [salesOverTime, setSalesOverTime] = useState<SalesOverTimePoint[]>([]);
  const [topServices, setTopServices] = useState<TopService[]>([]);
  const [jobDistribution, setJobDistribution] = useState<JobStatusDistribution[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [branchRevenue, setBranchRevenue] = useState<BranchRevenue[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  // Filter states
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("30d");
  const [salesPeriod, setSalesPeriod] = useState<string>("daily");
  const [topServicesPeriod, setTopServicesPeriod] = useState<string>("daily");
  const [revenuePeriod, setRevenuePeriod] = useState<string>("daily");

  // Determine branch filter param
  const branchParam = selectedBranch !== "all" ? selectedBranch : undefined;
  // Memoize date params so they only change when dateRange selection changes
  const dateParams = useMemo(() => getDateRange(dateRange), [dateRange]);

  // Load branches for filter
  useEffect(() => {
    const loadBranches = async () => {
      try {
        const res = await branchesApi.getAll();
        setBranches(res || []);
      } catch {
        // Non-critical
      }
    };
    loadBranches();
  }, []);

  // Load all dashboard data
  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filterParams = { branch_id: branchParam, ...dateParams };

      const [summaryData, salesData, servicesData, distributionData, ordersData, branchRevenueData] = await Promise.all([
        dashboardApi.getSummary(filterParams),
        dashboardApi.getSalesOverTime({ ...filterParams, period: salesPeriod }),
        dashboardApi.getTopServices({ ...filterParams, limit: 8 }),
        dashboardApi.getJobStatusDistribution(filterParams),
        dashboardApi.getRecentOrders({ branch_id: branchParam, limit: 8 }),
        dashboardApi.getRevenuePerBranch({ date_from: dateParams.date_from, date_to: dateParams.date_to }),
      ]);

      setSummary(summaryData);
      setSalesOverTime(salesData);
      setTopServices(servicesData);
      setJobDistribution(distributionData);
      setRecentOrders(ordersData);
      setBranchRevenue(branchRevenueData);
    } catch (err: any) {
      setError(err.message || "Failed to load dashboard data");
      showToast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, [branchParam, dateRange, salesPeriod]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  if (loading && !summary) {
    return <SkeletonLoader variant="dashboard" showHeader showStats={false} />;
  }

  if (error && !summary) {
    return <ErrorAlert message={error} onRetry={loadDashboard} />;
  }

  const selectedBranchName = selectedBranch === "all"
    ? "All Branches"
    : branches.find(b => b.id === selectedBranch)?.name || "Branch";

  const selectedDateLabel = DATE_RANGES.find(r => r.value === dateRange)?.label || "Last 30 Days";

  return (
    <div className="space-y-6">
      {/* ─── Filter Bar ─── */}
      <PageHeader
        title="Real-Time Dashboard"
        subtitle="View real-time analytics, sales, and job order metrics."
        showButton={false}
        actions={
          <>
            {/* Branch filter */}
            <div className="relative">
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="appearance-none pl-3 pr-8 py-2 text-sm border border-neutral-200 rounded-lg bg-white focus:outline-none focus:border-primary cursor-pointer"
              >
                <option value="all">All Branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <LuChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
            </div>

            {/* Date range filter */}
            <div className="relative">
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="appearance-none pl-3 pr-8 py-2 text-sm border border-neutral-200 rounded-lg bg-white focus:outline-none focus:border-primary cursor-pointer"
              >
                {DATE_RANGES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <LuChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
            </div>

            {/* Refresh button */}
            <button
              onClick={loadDashboard}
              disabled={loading}
              className="p-2 border border-neutral-200 rounded-lg text-neutral-950 hover:bg-neutral-100 disabled:opacity-100"
              title="Refresh"
            >
              <LuRefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </>
        }
      />

      {/* ─── Top Row: KPI Cards ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Sales Card */}
        <KpiCard
          label="Sales"
          value={formatCurrency(summary?.total_sales || 0)}
          subtitle={`${summary?.completed_job_orders || 0} completed orders`}
          icon={<LuDollarSign className="w-5 h-5 text-primary" />}
          iconBg="bg-primary-100"
          badge={selectedDateLabel}
        />

        {/* Customers Card */}
        <KpiCard
          label="Customers"
          value={(summary?.customers || 0).toLocaleString()}
          subtitle="Active customers"
          icon={<LuUsers className="w-5 h-5 text-secondary-950" />}
          iconBg="bg-secondary-200"
          badge={selectedBranchName}
        />

        {/* Orders Card */}
        <KpiCard
          label="All Orders"
          value={(summary?.total_job_orders || 0).toLocaleString()}
          icon={<LuClipboardList className="w-5 h-5 text-positive" />}
          iconBg="bg-positive-100"
          badge={selectedDateLabel}
        >
          <div className="flex items-end gap-6">
            <div>
              <p className="text-2xl font-bold text-neutral-950">{(summary?.total_job_orders || 0).toLocaleString()}</p>
              <p className="text-xs text-neutral-900 mt-1">Total</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-secondary-950">{(summary?.active_job_orders || 0).toLocaleString()}</p>
              <p className="text-xs text-neutral-900">Active</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-positive">{(summary?.completed_job_orders || 0).toLocaleString()}</p>
              <p className="text-xs text-neutral-900">Completed</p>
            </div>
          </div>
        </KpiCard>
      </div>

      {/* ─── Second Row: Pie + Inventory (left 2 cols) | Recent Orders (right, spans 2 rows) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column: Job Status Pie Chart */}
        <DashboardCard className="lg:col-span-1">
          <h4 className="text-sm font-semibold text-neutral-950 mb-4">Job Status Distribution</h4>
          {jobDistribution.length > 0 ? (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={jobDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    dataKey="count"
                    nameKey="status"
                    paddingAngle={2}
                  >
                    {jobDistribution.map((entry, index) => (
                      <Cell
                        key={entry.status}
                        fill={STATUS_COLORS[entry.status] || PIE_COLORS[index % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const item = payload[0].payload;
                      return (
                        <div className="rounded-lg px-3 py-2 shadow-lg border" style={{ backgroundColor: tooltipBg, borderColor: tooltipBorder }}>
                          <p className="text-xs" style={{ color: tooltipTextSecondary }}>{STATUS_LABELS[item.status] || item.status}</p>
                          <p className="text-sm font-semibold" style={{ color: tooltipTextPrimary }}>{item.count} orders</p>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 mt-2 justify-center">
                {jobDistribution.map((entry, index) => (
                  <div key={entry.status} className="flex items-center gap-1.5">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: STATUS_COLORS[entry.status] || PIE_COLORS[index % PIE_COLORS.length] }}
                    />
                    <span className="text-xs text-neutral-900">{STATUS_LABELS[entry.status] || entry.status}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-sm text-neutral-900">
              No job order data available
            </div>
          )}
        </DashboardCard>

        {/* Middle column: Inventory Status — 3 separate cards stacked */}
        <div className="flex flex-col gap-4 lg:col-span-1">
          {/* Card 1: All Products */}
          <DashboardCard className="p-4">
            <h4 className="text-sm font-semibold text-neutral-950 mb-3">All Products</h4>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-primary-100 rounded-lg">
                <LuPackage className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-2xl font-bold text-neutral-950">{summary?.total_inventory_items || 0}</p>
              </div>
              <span className="text-xs text-positive bg-positive-100 px-2 py-1 rounded-full font-medium">Active Items</span>
            </div>
          </DashboardCard>

          {/* Card 2: Low Stock */}
          <DashboardCard className="p-4">
            <h4 className="text-sm font-semibold text-neutral-950 mb-3">Low Stock</h4>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-secondary-200 rounded-lg">
                <LuTriangleAlert className="w-5 h-5 text-secondary-950" />
              </div>
              <div className="flex-1">
                <p className="text-2xl font-bold text-neutral-950">{summary?.low_stock_count || 0}</p>
              </div>
              <span className="text-xs text-secondary-950 bg-secondary-100 px-2 py-1 rounded-full font-medium">At/Below Threshold</span>
            </div>
          </DashboardCard>

          {/* Card 3: Out of Stock */}
          <DashboardCard className="p-4">
            <h4 className="text-sm font-semibold text-neutral-950 mb-3">Out of Stock</h4>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-negative-100 rounded-lg">
                <LuCircleAlert className="w-5 h-5 text-negative" />
              </div>
              <div className="flex-1">
                <p className="text-2xl font-bold text-neutral-950">{summary?.out_of_stock_count || 0}</p>
              </div>
              <span className="text-xs text-negative bg-negative-100 px-2 py-1 rounded-full font-medium">Needs Restock</span>
            </div>
          </DashboardCard>
        </div>

        {/* Right column: Recent Orders — spans 2 rows */}
        <DashboardCard className="lg:col-span-1 lg:row-span-2">
          <h4 className="text-sm font-semibold text-neutral-950 mb-4">Recent Orders</h4>
          <div className="max-h-[620px] overflow-y-auto">
            {recentOrders.length > 0 ? (
              recentOrders.map((order) => {
                const firstItem = order.job_order_items?.[0];
                return (
                  <div key={order.id} className="flex items-center justify-between gap-2 py-3 border-b border-neutral-100 first:border-t">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-950 truncate">
                        {order.customers?.full_name || order.order_number}
                      </p>
                      <p className="text-xs text-neutral-900 truncate">
                        {formatCurrency(order.total_amount)} &middot; {firstItem ? `${firstItem.catalog_item_name} x${firstItem.quantity}` : order.order_number}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-neutral-900">{formatDateTime(order.created_at)}</p>
                      <StatusBadge status={order.status} />
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-neutral-900 text-center py-8">No recent orders</p>
            )}
          </div>
        </DashboardCard>

        {/* Bottom-left spanning 2 cols under pie + inventory: Top Services */}
        <ChartCard
          className="lg:col-span-2"
          title="Top Services"
          actions={
            <>
              <PeriodSelect value={topServicesPeriod} onChange={setTopServicesPeriod} />
              <span className="text-xs text-neutral-900">{selectedDateLabel}</span>
            </>
          }
        >
          {topServices.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topServices} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(v) => formatCurrency(v)}
                  tick={{ fontSize: 12, fill: chartTick }}
                  axisLine={{ stroke: chartAxisLine }}
                  tickLine={false}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fontSize: 12, fill: chartTick }}
                  axisLine={false}
                  tickLine={false}
                  width={70}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const item = payload[0].payload;
                    return (
                      <div className="rounded-lg px-3 py-2 shadow-lg border" style={{ backgroundColor: tooltipBg, borderColor: tooltipBorder }}>
                        <p className="text-xs font-medium" style={{ color: tooltipTextSecondary }}>{item.name}</p>
                        <p className="text-sm font-semibold text-primary">{formatCurrency(item.revenue)}</p>
                        <p className="text-xs" style={{ color: tooltipTextSecondary }}>{item.count} orders</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="revenue" fill="#FFCC91" radius={[0, 4, 4, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-sm text-neutral-900">
              No service data available for this period
            </div>
          )}
        </ChartCard>
      </div>

      {/* ─── Third Row: Sales Summary + Revenue per Branch (side by side) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Sales Summary */}
        <ChartCard
          title="Sales Summary"
          actions={
            <>
              <PeriodSelect value={salesPeriod} onChange={setSalesPeriod} />
              <span className="text-xs text-neutral-900">{selectedDateLabel}</span>
            </>
          }
        >
          {salesOverTime.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={salesOverTime} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  tick={{ fontSize: 12, fill: chartTick }}
                  axisLine={{ stroke: chartAxisLine }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => formatCurrency(v)}
                  tick={{ fontSize: 12, fill: chartTick }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={(props) => <ChartTooltip {...props} isCurrency isDark={isDark} />} />
                <Bar dataKey="amount" fill="#5570F1" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-sm text-neutral-900">
              No sales data available for this period
            </div>
          )}
        </ChartCard>

        {/* Revenue per Branch */}
        <ChartCard
          title="Revenue per Branch"
          actions={
            <>
              <PeriodSelect value={revenuePeriod} onChange={setRevenuePeriod} />
              <span className="text-xs text-neutral-900">{selectedDateLabel}</span>
            </>
          }
        >
          {branchRevenue.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={branchRevenue} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                <defs>
                  <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#519C66" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#519C66" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12, fill: chartTick }}
                  axisLine={{ stroke: chartAxisLine }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => formatCurrency(v)}
                  tick={{ fontSize: 12, fill: chartTick }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const item = payload[0].payload;
                    return (
                      <div className="rounded-lg px-3 py-2 shadow-lg border" style={{ backgroundColor: tooltipBg, borderColor: tooltipBorder }}>
                        <p className="text-xs font-medium" style={{ color: tooltipTextSecondary }}>{item.name}</p>
                        <p className="text-sm font-semibold text-positive">{formatCurrency(item.revenue)}</p>
                      </div>
                    );
                  }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#519C66" strokeWidth={2} fill="url(#revenueGradient)" dot={{ fill: "#519C66", r: 4 }} activeDot={{ r: 6 }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-sm text-neutral-900">
              No branch revenue data available for this period
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
