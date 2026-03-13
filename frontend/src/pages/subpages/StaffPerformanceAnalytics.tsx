import { useState, useEffect, useCallback, useMemo } from "react";
import {
  LuActivity,
  LuClipboardCheck,
  LuClock,
  LuDollarSign,
  LuMedal,
  LuChevronDown,
  LuRefreshCw,
} from "react-icons/lu";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { staffPerformanceApi, branchesApi } from "../../lib/api";
import {
  PageHeader,
  ErrorAlert,
  SkeletonLoader,
  KpiCard,
  DashboardCard,
} from "../../components";
import type {
  StaffPerformance,
  StaffMetricType,
  Branch,
} from "../../types";

const METRIC_LABELS: Record<StaffMetricType, string> = {
  jobs_completed: "Jobs Completed",
  avg_completion_time: "Avg Completion Time",
  revenue_generated: "Revenue Generated",
  on_time_completion_rate: "On-Time Rate",
};

const METRIC_OPTIONS = [
  { value: "jobs_completed", label: "Jobs Completed" },
  { value: "avg_completion_time", label: "Avg Completion Time" },
  { value: "revenue_generated", label: "Revenue Generated" },
  { value: "on_time_completion_rate", label: "On-Time Rate" },
];

const RANK_COLORS = ["#F59E0B", "#94A3B8", "#D97706"];
const PIE_COLORS = ["#5570F1", "#FFCC91", "#519C66", "#CC5F5F", "#8B5CF6", "#F59E0B", "#6366F1", "#EC4899", "#14B8A6", "#F97316"];

function formatMetricValue(type: StaffMetricType, value: number): string {
  switch (type) {
    case "jobs_completed":
      return `${value}`;
    case "avg_completion_time":
      return `${value.toFixed(1)} hrs`;
    case "revenue_generated":
      return formatCurrency(value);
    case "on_time_completion_rate":
      return `${value.toFixed(1)}%`;
    default:
      return `${value}`;
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

export function StaffPerformanceAnalytics() {
  // Data state
  const [records, setRecords] = useState<StaffPerformance[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters (dashboard-style inline)
  const [selectedBranch, setSelectedBranch] = useState("all");

  // Leaderboard metric selector
  const [leaderMetric, setLeaderMetric] = useState<StaffMetricType>("jobs_completed");

  // Load branches
  useEffect(() => {
    branchesApi
      .getAll()
      .then((data) => setBranches(data.filter((b: Branch) => b.is_active)))
      .catch(() => {});
  }, []);

  // Fetch all records
  const fetchRecords = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const params: Record<string, string | number> = { limit: 500, offset: 0 };
      if (selectedBranch !== "all") params.branch_id = selectedBranch;

      let res = await staffPerformanceApi.getAll(params as Parameters<typeof staffPerformanceApi.getAll>[0]);

      // Self-heal empty dataset by generating snapshots from completed job orders.
      if (!res.data || res.data.length === 0) {
        await staffPerformanceApi.recompute(
          selectedBranch !== "all" ? { branch_id: selectedBranch } : {}
        );
        res = await staffPerformanceApi.getAll(params as Parameters<typeof staffPerformanceApi.getAll>[0]);
      }

      setRecords(res.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load records");
    } finally {
      setLoading(false);
    }
  }, [selectedBranch]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // Group records by staff
  const staffGroups = useMemo(() => {
    return records.reduce<
      Record<string, { name: string; email: string; branch: string; metrics: StaffPerformance[] }>
    >((acc, r) => {
      const key = r.staff_id;
      if (!acc[key]) {
        acc[key] = {
          name: r.user_profiles?.full_name || "Unknown",
          email: r.user_profiles?.email || "",
          branch: r.branches?.name || "—",
          metrics: [],
        };
      }
      acc[key].metrics.push(r);
      return acc;
    }, {});
  }, [records]);

  const groupEntries = Object.entries(staffGroups);

  // ─── Computed aggregates for KPI cards ───
  const aggregates = useMemo(() => {
    let totalJobs = 0;
    let totalRevenue = 0;
    let completionTimes: number[] = [];
    let onTimeRates: number[] = [];

    records.forEach((r) => {
      switch (r.metric_type) {
        case "jobs_completed":
          totalJobs += r.metric_value;
          break;
        case "revenue_generated":
          totalRevenue += r.metric_value;
          break;
        case "avg_completion_time":
          completionTimes.push(r.metric_value);
          break;
        case "on_time_completion_rate":
          onTimeRates.push(r.metric_value);
          break;
      }
    });

    const avgCompletionTime = completionTimes.length > 0
      ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length
      : 0;
    const avgOnTime = onTimeRates.length > 0
      ? onTimeRates.reduce((a, b) => a + b, 0) / onTimeRates.length
      : 0;

    return { totalJobs, totalRevenue, avgCompletionTime, avgOnTime, staffCount: groupEntries.length };
  }, [records, groupEntries.length]);

  // ─── Leaderboard data (top 5) ───
  const leaderboard = useMemo(() => {
    return groupEntries
      .map(([staffId, group]) => {
        const metric = group.metrics.find((m) => m.metric_type === leaderMetric);
        return { staffId, name: group.name, branch: group.branch, value: metric?.metric_value || 0 };
      })
      .filter((s) => s.value > 0)
      .sort((a, b) => leaderMetric === "avg_completion_time" ? a.value - b.value : b.value - a.value)
      .slice(0, 5);
  }, [groupEntries, leaderMetric]);

  // ─── Bar chart data (top 10) ───
  const chartData = useMemo(() => {
    return groupEntries
      .map(([, group]) => {
        const metric = group.metrics.find((m) => m.metric_type === leaderMetric);
        return {
          name: group.name.length > 12 ? group.name.slice(0, 12) + "…" : group.name,
          value: metric?.metric_value || 0,
        };
      })
      .filter((d) => d.value > 0)
      .sort((a, b) => leaderMetric === "avg_completion_time" ? a.value - b.value : b.value - a.value)
      .slice(0, 10);
  }, [groupEntries, leaderMetric]);

  const selectedBranchName = selectedBranch === "all"
    ? "All Branches"
    : branches.find((b) => b.id === selectedBranch)?.name || "Branch";

  const hasData = groupEntries.length > 0;

  if (loading && records.length === 0) {
    return <SkeletonLoader variant="staff-performance" showHeader />;
  }

  if (error && records.length === 0) {
    return <ErrorAlert message={error} onRetry={fetchRecords} />;
  }

  return (
    <div className="space-y-6">
      {/* ─── Page Header with Dashboard-style Filters ─── */}
      <PageHeader
        title="Staff Performance"
        subtitle="Analyze staff productivity, revenue, and on-time metrics."
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

            {/* Refresh */}
            <button
              onClick={fetchRecords}
              disabled={loading}
              className="p-2 border border-neutral-200 rounded-lg text-neutral-950 hover:bg-neutral-100 disabled:opacity-100"
              title="Refresh"
            >
              <LuRefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </>
        }
      />

      {/* ─── KPI Cards — 3 column brick layout ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Row 1: 1 + 2-span */}
        <KpiCard
          label="Total Jobs"
          value={aggregates.totalJobs.toLocaleString()}
          subtitle={`${aggregates.staffCount} staff members`}
          icon={<LuClipboardCheck className="w-5 h-5 text-primary" />}
          iconBg="bg-primary-100"
        />
        <KpiCard
          label="Total Revenue"
          value={formatCurrency(aggregates.totalRevenue)}
          subtitle="From completed jobs"
          icon={<LuDollarSign className="w-5 h-5 text-positive" />}
          iconBg="bg-positive-100"
          className="lg:col-span-2"
          badge={selectedBranchName}
        />

        {/* Row 2: 2-span + 1 */}
        <KpiCard
          label="Avg Completion Time"
          value={`${aggregates.avgCompletionTime.toFixed(1)} hrs`}
          subtitle="Average job turnaround"
          icon={<LuClock className="w-5 h-5 text-secondary-950" />}
          iconBg="bg-secondary-200"
          className="lg:col-span-2"
          badge={selectedBranchName}
        />
        <KpiCard
          label="Avg On-Time Rate"
          value={`${aggregates.avgOnTime.toFixed(1)}%`}
          subtitle="Average on-time delivery"
          icon={<LuActivity className="w-5 h-5 text-primary" />}
          iconBg="bg-primary-100"
        />
      </div>

      {/* ─── Leaderboard + Chart Row ─── */}
      {hasData && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Leaderboard — 2 col span */}
          <DashboardCard className="lg:col-span-2">
            <div className="flex items-start justify-between mb-4">
            <h4 className="text-sm font-semibold text-neutral-950">Top Performers</h4>
              <div className="relative">
                <select
                  value={leaderMetric}
                  onChange={(e) => setLeaderMetric(e.target.value as StaffMetricType)}
                  className="appearance-none pl-3 pr-7 py-1.5 text-xs border border-neutral-200 rounded-lg bg-white focus:outline-none focus:border-primary cursor-pointer"
                >
                  {METRIC_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <LuChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-400 pointer-events-none" />
              </div>
            </div>

            {leaderboard.length > 0 ? (
              <div className="space-y-3">
                {leaderboard.map((staff, idx) => (
                  <div
                    key={staff.staffId}
                    className="flex items-center gap-3 p-3 rounded-lg bg-neutral-100 hover:bg-neutral-200 transition-colors"
                  >
                    <div
                      className="flex items-center justify-center w-8 h-8 rounded-full text-white text-xs font-bold shrink-0"
                      style={{ backgroundColor: RANK_COLORS[idx] || "#8E8E91" }}
                    >
                      {idx < 3 ? <LuMedal className="w-4 h-4" /> : idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-950 truncate">{staff.name}</p>
                      <p className="text-xs text-neutral-500 truncate">{staff.branch}</p>
                    </div>
                    <span className="text-sm font-semibold text-neutral-950 shrink-0">
                      {formatMetricValue(leaderMetric, staff.value)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-50 flex items-center justify-center text-sm text-neutral-500">
                No data available for this metric
              </div>
            )}
          </DashboardCard>

          {/* Pie Chart — 1 col span */}
          <DashboardCard className="lg:col-span-1">
            <h4 className="text-sm font-semibold text-neutral-950 mb-4">
              {METRIC_LABELS[leaderMetric]} Breakdown
            </h4>
            {chartData.length > 0 ? (
              <div className="flex flex-col items-center">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      dataKey="value"
                      nameKey="name"
                      paddingAngle={2}
                    >
                      {chartData.map((_, index) => (
                        <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const item = payload[0].payload;
                        return (
                          <div className="rounded-lg px-3 py-2 shadow-lg border bg-white border-neutral-200">
                            <p className="text-xs text-neutral-500">{item.name}</p>
                            <p className="text-sm font-semibold text-neutral-950">
                              {formatMetricValue(leaderMetric, item.value)}
                            </p>
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-2 mt-2 justify-center">
                  {chartData.map((entry, index) => (
                    <div key={entry.name} className="flex items-center gap-1.5">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                      />
                      <span className="text-xs text-neutral-900">{entry.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-50 flex items-center justify-center text-sm text-neutral-500">
                No data available for this metric
              </div>
            )}
          </DashboardCard>
        </div>
      )}

    </div>
  );
}
