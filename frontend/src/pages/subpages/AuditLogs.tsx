import { useState, useEffect, useMemo } from "react";
import { LuFileText, LuRefreshCw, LuCircleAlert, LuSearch, LuFilter, LuChevronLeft, LuChevronRight, LuCheck, LuX, LuClock } from "react-icons/lu";
import { auditApi } from "../../lib/api";
import {
  Modal,
  ModalSection,
  ModalInput,
} from "../../components";
import type { AuditLog, PaginatedResponse } from "../../types";

const ITEMS_PER_PAGE = 20;

// Action types for filtering
const ACTION_TYPES = [
  { value: "", label: "All Actions" },
  { value: "LOGIN", label: "Login" },
  { value: "LOGOUT", label: "Logout" },
  { value: "CREATE", label: "Create" },
  { value: "UPDATE", label: "Update" },
  { value: "DELETE", label: "Delete" },
];

// Format date helper
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Get action badge color
function getActionColor(action: string): string {
  switch (action) {
    case "LOGIN":
    case "LOGOUT":
      return "bg-primary-100 text-primary-950";
    case "CREATE":
      return "bg-positive-100 text-positive-950";
    case "UPDATE":
      return "bg-negative-100 text-negative-950";
    case "DELETE":
      return "bg-negative-100 text-negative-950";
    default:
      return "bg-neutral-100 text-neutral-950";
  }
}

export function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    total_events: number;
    logins: number;
    successful: number;
    failed: number;
    actions: Record<string, number>;
  } | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  // Filters
  const [filters, setFilters] = useState({
    action: "",
    search: "",
    startDate: "",
    endDate: "",
  });
  const [showFilters, setShowFilters] = useState(false);

  // View detail modal
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewLog, setViewLog] = useState<AuditLog | null>(null);

  function openViewModal(log: AuditLog) {
    setViewLog(log);
    setShowViewModal(true);
  }

  // Stats summary
  const summaryStats = useMemo(() => {
    if (!stats) return { total: 0, successful: 0, failed: 0 };
    return {
      total: stats.total_events,
      successful: stats.successful || 0,
      failed: stats.failed || 0,
    };
  }, [stats]);

  // Fetch data on mount and when filters change
  useEffect(() => {
    fetchData();
    fetchStats();
  }, []);

  // Track applied date filters separately so they only take effect on "Apply"
  const [appliedStartDate, setAppliedStartDate] = useState("");
  const [appliedEndDate, setAppliedEndDate] = useState("");

  // Refetch when page, action, or applied dates change
  useEffect(() => {
    fetchData();
  }, [currentPage, filters.action, appliedStartDate, appliedEndDate]);

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);

      const params: Parameters<typeof auditApi.getLogs>[0] = {
        limit: ITEMS_PER_PAGE,
        offset: (currentPage - 1) * ITEMS_PER_PAGE,
      };

      if (filters.action) params.action = filters.action;
      if (appliedStartDate) params.start_date = appliedStartDate + "T00:00:00";
      if (appliedEndDate) params.end_date = appliedEndDate + "T23:59:59";

      const response: PaginatedResponse<AuditLog> = await auditApi.getLogs(params);
      setLogs(response.data);
      setTotalItems(response.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch audit logs");
    } finally {
      setLoading(false);
    }
  }

  async function fetchStats() {
    try {
      const statsData = await auditApi.getStats(30);
      setStats(statsData);
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
  }

  // Filter logs by search term (client-side for quick filtering)
  const filteredLogs = useMemo(() => {
    if (!filters.search) return logs;
    const searchLower = filters.search.toLowerCase();
    return logs.filter(log =>
      log.action.toLowerCase().includes(searchLower) ||
      log.entity_type.toLowerCase().includes(searchLower) ||
      log.user_profiles?.full_name?.toLowerCase().includes(searchLower) ||
      log.user_profiles?.email?.toLowerCase().includes(searchLower)
    );
  }, [logs, filters.search]);

  // Apply date filter
  function handleApplyFilters() {
    setCurrentPage(1);
    setAppliedStartDate(filters.startDate);
    setAppliedEndDate(filters.endDate);
  }

  // Reset filters
  function handleResetFilters() {
    setFilters({ action: "", search: "", startDate: "", endDate: "" });
    setAppliedStartDate("");
    setAppliedEndDate("");
    setCurrentPage(1);
  }

  if (loading && logs.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <LuRefreshCw className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error && logs.length === 0) {
    return (
      <div className="bg-negative-200 border border-negative rounded-lg p-4 flex items-center gap-3">
        <LuCircleAlert className="w-5 h-5 text-negative-950 flex-shrink-0" />
        <div>
          <p className="text-sm text-negative-950">{error}</p>
          <button
            onClick={fetchData}
            className="text-sm text-negative-900 hover:underline mt-1"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 rounded-lg">
              <LuFileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-neutral-900">Total Events</p>
              <p className="text-2xl font-bold text-neutral-950">{summaryStats.total}</p>
            </div>
          </div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-positive-100 rounded-lg">
              <LuCheck className="w-5 h-5 text-positive" />
            </div>
            <div>
              <p className="text-sm text-neutral-900">Successful</p>
              <p className="text-2xl font-bold text-neutral-950">{summaryStats.successful}</p>
            </div>
          </div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-negative-100 rounded-lg">
              <LuX className="w-5 h-5 text-negative" />
            </div>
            <div>
              <p className="text-sm text-neutral-900">Failed</p>
              <p className="text-2xl font-bold text-neutral-950">{summaryStats.failed}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white border border-neutral-200 rounded-xl">
        {/* Table Header with Search and Filters */}
        <div className="p-4 border-b border-neutral-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-900" />
              <input
                type="text"
                placeholder="Search logs..."
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                className="pl-9 pr-4 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:border-primary w-full sm:w-64"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={filters.action}
                onChange={(e) => {
                  setFilters(prev => ({ ...prev, action: e.target.value }));
                  setCurrentPage(1);
                }}
                className="appearance-none px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              >
                {ACTION_TYPES.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${
                  showFilters ? "border-primary bg-primary-100 text-primary" : "border-neutral-200 text-neutral-950 hover:bg-neutral-100"
                }`}
              >
                <LuFilter className="w-4 h-4" />
                <span className="hidden sm:inline">Filters</span>
              </button>
              <button
                onClick={fetchData}
                disabled={loading}
                className="p-2 border border-neutral-200 rounded-lg text-neutral-950 hover:bg-neutral-100 disabled:opacity-100"
                title="Refresh"
              >
                <LuRefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {/* Advanced Filters */}
          {showFilters && (
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label className="block text-xs text-neutral-900 mb-1">Start Date</label>
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-neutral-900 mb-1">End Date</label>
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>
              <div className="flex items-end gap-2">
                <button
                  onClick={handleApplyFilters}
                  className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-950 transition-colors"
                >
                  Apply
                </button>
                <button
                  onClick={handleResetFilters}
                  className="px-4 py-2 border border-neutral-200 rounded-lg text-sm font-medium text-neutral-950 hover:bg-neutral-100 transition-colors"
                >
                  Reset
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden p-4 space-y-4">
          {filteredLogs.map((log) => (
            <div
              key={log.id}
              onClick={() => openViewModal(log)}
              className="border border-neutral-200 rounded-xl p-4 space-y-3 cursor-pointer hover:bg-neutral-50 transition-colors"
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getActionColor(log.action)}`}>
                    {log.action}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${log.status === 'FAILED' ? 'bg-negative-100 text-negative-950' : 'bg-positive-100 text-positive-950'}`}>
                    {log.status || 'SUCCESS'}
                  </span>
                </div>
                <span className="text-xs text-neutral-900 flex items-center gap-1">
                  <LuClock className="w-3 h-3" />
                  {formatDate(log.created_at)}
                </span>
              </div>

              {/* Details */}
              <div className="space-y-1">
                <p className="text-sm text-neutral-900">
                  <span className="text-neutral-900">Entity:</span>{" "}
                  <span className="font-medium">{log.entity_type || "-"}</span>
                </p>
                {log.user_profiles && (
                  <p className="text-sm text-neutral-900">
                    <span className="text-neutral-900">User:</span>{" "}
                    {log.user_profiles.full_name || log.user_profiles.email}
                  </p>
                )}
              </div>
            </div>
          ))}

          {filteredLogs.length === 0 && (
            <div className="text-center py-8 text-neutral-900">
              No audit logs found.
            </div>
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-100">
                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950">Date & Time</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950">Action</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950">Status</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950">Entity</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950">User</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => (
                <tr key={log.id} onClick={() => openViewModal(log)} className="border-b border-neutral-100 hover:bg-neutral-100 transition-colors cursor-pointer">
                  <td className="py-3 px-4 text-sm text-neutral-900 whitespace-nowrap">
                    {formatDate(log.created_at)}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getActionColor(log.action)}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${log.status === 'FAILED' ? 'bg-negative-100 text-negative-950' : 'bg-positive-100 text-positive-950'}`}>
                      {log.status || 'SUCCESS'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-neutral-900">
                    {log.entity_type || "-"}
                  </td>
                  <td className="py-3 px-4 text-sm text-neutral-900">
                    {log.user_profiles?.full_name || log.user_profiles?.email || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredLogs.length === 0 && (
            <div className="text-center py-12 text-neutral-900">
              No audit logs found.
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4">
            <p className="text-sm text-neutral-900">
              {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, totalItems)} of {totalItems} logs
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 border border-neutral-200 rounded-lg text-neutral-900 hover:bg-neutral-100 disabled:opacity-100 disabled:cursor-not-allowed"
              >
                <LuChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-neutral-900 px-2">
                {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 border border-neutral-200 rounded-lg text-neutral-900 hover:bg-neutral-100 disabled:opacity-100 disabled:cursor-not-allowed"
              >
                <LuChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
      {/* View Detail Modal */}
      <Modal
        isOpen={showViewModal && !!viewLog}
        onClose={() => setShowViewModal(false)}
        title="Audit Log Details"
        maxWidth="lg"
      >
        {viewLog && (
          <div>
            <ModalSection title="Event Information">
              <ModalInput
                type="text"
                value={viewLog.action}
                onChange={() => {}}
                placeholder="Action"
                disabled
              />
              <ModalInput
                type="text"
                value={viewLog.entity_type || "-"}
                onChange={() => {}}
                placeholder="Entity Type"
                disabled
              />
              <ModalInput
                type="text"
                value={viewLog.entity_id || "-"}
                onChange={() => {}}
                placeholder="Entity ID"
                disabled
              />
            </ModalSection>

            <ModalSection title="User & Branch">
              <ModalInput
                type="text"
                value={viewLog.user_profiles?.full_name || viewLog.user_profiles?.email || "-"}
                onChange={() => {}}
                placeholder="User"
                disabled
              />
              <ModalInput
                type="text"
                value={
                  viewLog.branches
                    ? `${viewLog.branches.name} (${viewLog.branches.code})`
                    : "-"
                }
                onChange={() => {}}
                placeholder="Branch"
                disabled
              />
            </ModalSection>

            {(viewLog.old_values || viewLog.new_values) && (
              <ModalSection title="Changes">
                {viewLog.old_values && (
                  <div>
                    <label className="block text-xs text-neutral-900 mb-1">Old Values</label>
                    <pre className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 text-sm overflow-auto max-h-40">
                      {JSON.stringify(viewLog.old_values, null, 2)}
                    </pre>
                  </div>
                )}
                {viewLog.new_values && (
                  <div className="mt-3">
                    <label className="block text-xs text-neutral-900 mb-1">New Values</label>
                    <pre className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 text-sm overflow-auto max-h-40">
                      {JSON.stringify(viewLog.new_values, null, 2)}
                    </pre>
                  </div>
                )}
              </ModalSection>
            )}

            <ModalSection title="Additional Information">
              <ModalInput
                type="text"
                value={viewLog.status || "SUCCESS"}
                onChange={() => {}}
                placeholder="Status"
                disabled
              />
              <ModalInput
                type="text"
                value={formatDate(viewLog.created_at)}
                onChange={() => {}}
                placeholder="Timestamp"
                disabled
              />
            </ModalSection>
          </div>
        )}
      </Modal>
    </div>
  );
}
