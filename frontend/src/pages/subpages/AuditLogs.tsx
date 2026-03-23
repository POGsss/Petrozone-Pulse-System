import { useState, useEffect, useMemo } from "react";
import { LuFileText, LuCheck, LuX, LuClock } from "react-icons/lu";
import { auditApi } from "../../lib/api";
import {
  Modal,
  ModalSection,
  ModalInput,
  PageHeader,
  StatsCards,
  TableSearchFilter,
  Pagination,
  ErrorAlert,
  SkeletonLoader,
  MobileCardList,
  DesktopTable,
  DesktopTableRow,
} from "../../components";
import type { StatCard, DesktopTableColumn } from "../../components";
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
      setStats({
        total_events: statsData.total_events,
        logins: statsData.logins,
        successful: statsData.successful || 0,
        failed: statsData.failed || 0,
        actions: statsData.actions,
      });
    } catch (err) {
      // Stats fetch failed silently — non-critical
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
    return <SkeletonLoader showHeader showStats statsCount={3} rows={6} />;
  }

  if (error && logs.length === 0) {
    return <ErrorAlert message={error} onRetry={fetchData} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Audit Logs"
        subtitle="Summary of system activity and events"
      />

      {/* Summary Stats Cards */}
      <StatsCards
        cards={[
          { icon: LuFileText, iconBg: "bg-primary-100", iconColor: "text-primary", label: "Total Events", value: summaryStats.total },
          { icon: LuCheck, iconBg: "bg-positive-100", iconColor: "text-positive", label: "Successful", value: summaryStats.successful },
          { icon: LuX, iconBg: "bg-negative-100", iconColor: "text-negative", label: "Failed", value: summaryStats.failed },
        ] as StatCard[]}
      />

      {/* Table Section */}
      <div className="bg-white border border-neutral-200 rounded-xl">
        {/* Table Header with Search and Filters */}
        <TableSearchFilter
          searchQuery={filters.search}
          onSearchChange={(v) => setFilters(prev => ({ ...prev, search: v }))}
          searchPlaceholder="Search logs..."
          primaryFilter={{
            key: "action",
            label: "Action",
            value: filters.action,
            options: ACTION_TYPES.map((t) => ({ value: t.value, label: t.label })),
            onChange: (v) => {
              setFilters(prev => ({ ...prev, action: v }));
              setCurrentPage(1);
            },
          }}
          advancedFilters={[
            {
              key: "startDate",
              label: "Start Date",
              type: "date",
              value: filters.startDate,
              onChange: (v) => setFilters(prev => ({ ...prev, startDate: v })),
            },
            {
              key: "endDate",
              label: "End Date",
              type: "date",
              value: filters.endDate,
              onChange: (v) => setFilters(prev => ({ ...prev, endDate: v })),
            },
          ]}
          onApply={handleApplyFilters}
          onReset={handleResetFilters}
          onRefresh={fetchData}
          loading={loading}
        />

        {/* Mobile Card View */}
        <MobileCardList grid={false} isEmpty={filteredLogs.length === 0} emptyMessage="No audit logs found.">
          {filteredLogs.map((log) => (
            <div
              key={log.id}
              onClick={() => openViewModal(log)}
              className="border border-neutral-200 rounded-xl p-4 space-y-3 cursor-pointer hover:bg-neutral-100 transition-colors"
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
        </MobileCardList>

        {/* Desktop Table View */}
        <DesktopTable
          columns={[
            { label: "Date & Time" },
            { label: "Action" },
            { label: "Status" },
            { label: "Entity" },
            { label: "User" },
          ] as DesktopTableColumn[]}
          isEmpty={filteredLogs.length === 0}
          emptyMessage="No audit logs found."
        >
              {filteredLogs.map((log) => (
                <DesktopTableRow key={log.id} onClick={() => openViewModal(log)}>
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
                </DesktopTableRow>
              ))}
        </DesktopTable>

        {/* Pagination */}
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          variant="table"
          totalItems={totalItems}
          itemsPerPage={ITEMS_PER_PAGE}
          entityName="logs"
        />
      </div>
      {/* View Detail Modal */}
      <Modal
        isOpen={showViewModal && !!viewLog}
        onClose={() => setShowViewModal(false)}
        title="Audit Log Details"
        maxWidth="xl"
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
