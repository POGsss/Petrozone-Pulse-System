import { useState, useEffect, useMemo } from "react";
import {
  LuFileText,
  LuPlus,
  LuTrash2,
  LuDownload,
  LuRefreshCw,
} from "react-icons/lu";
import { reportsApi, branchesApi } from "../../lib/api";
import { showToast } from "../../lib/toast";
import { useAuth } from "../../auth";
import type { Report, ReportType, ReportData, Branch } from "../../types";
import {
  PageHeader,
  SearchFilter,
  CardGrid,
  GridCard,
  Pagination,
  Modal,
  ModalSection,
  ModalInput,
  ModalSelect,
  ModalButtons,
  ModalError,
  ErrorAlert,
  SkeletonLoader,
} from "../../components";
import type { FilterGroup } from "../../components";

const ITEMS_PER_PAGE = 12;

const REPORT_TYPE_OPTIONS: { value: ReportType; label: string }[] = [
  { value: "sales", label: "Sales Report" },
  { value: "inventory", label: "Inventory Report" },
  { value: "job_order", label: "Job Order Report" },
  { value: "staff_performance", label: "Staff Performance Report" },
];

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  sales: "Sales",
  inventory: "Inventory",
  job_order: "Job Order",
  staff_performance: "Staff Performance",
};

export function ReportsManagement() {
  const { hasAnyRole } = useAuth();
  const canCreate = hasAnyRole("HM", "POC", "JS", "R");
  const canDelete = hasAnyRole("HM", "POC", "JS", "R");
  const canExport = hasAnyRole("HM", "POC", "JS", "R");

  // Data
  const [allReports, setAllReports] = useState<Report[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search and filters
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = useState(1);

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    report_name: "",
    report_type: "" as ReportType | "",
    branch_id: "",
    date_from: "",
    date_to: "",
    is_template: false,
  });

  // View modal
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewReport, setViewReport] = useState<Report | null>(null);
  const [viewData, setViewData] = useState<ReportData | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  // Delete modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<Report | null>(null);

  // Export loading
  const [exporting, setExporting] = useState<string | null>(null);

  // Filter groups
  const filterGroups: FilterGroup[] = useMemo(() => {
    return [
      {
        key: "report_type",
        label: "Type",
        options: [
          { value: "all", label: "All Types" },
          ...REPORT_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
        ],
      },
      {
        key: "is_template",
        label: "Template",
        options: [
          { value: "all", label: "All" },
          { value: "true", label: "Templates Only" },
          { value: "false", label: "Reports Only" },
        ],
      },
    ];
  }, []);

  // Filtered + paginated
  const { paginatedItems, totalPages } = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const filtered = allReports.filter((report) => {
      const matchSearch =
        !q ||
        report.report_name.toLowerCase().includes(q) ||
        REPORT_TYPE_LABELS[report.report_type].toLowerCase().includes(q);

      const typeFilter = activeFilters.report_type;
      const matchType =
        !typeFilter || typeFilter === "all" || report.report_type === typeFilter;

      const templateFilter = activeFilters.is_template;
      const matchTemplate =
        !templateFilter ||
        templateFilter === "all" ||
        String(report.is_template) === templateFilter;

      return matchSearch && matchType && matchTemplate;
    });

    const pages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return {
      paginatedItems: filtered.slice(start, start + ITEMS_PER_PAGE),
      totalPages: pages,
    };
  }, [allReports, searchQuery, activeFilters, currentPage]);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeFilters]);

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);
      const [reportsRes, branchesRes] = await Promise.all([
        reportsApi.getAll({ limit: 1000 }),
        branchesApi.getAll(),
      ]);
      setAllReports(reportsRes.data);
      setBranches(branchesRes.filter((b) => b.is_active));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }

  // --- Create ---
  function openCreateModal() {
    setCreateForm({
      report_name: "",
      report_type: "",
      branch_id: "",
      date_from: "",
      date_to: "",
      is_template: false,
    });
    setCreateError(null);
    setShowCreateModal(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.report_name || !createForm.report_type) return;

    try {
      setCreating(true);
      setCreateError(null);

      const filters: Record<string, string> = {};
      if (createForm.date_from) filters.date_from = createForm.date_from;
      if (createForm.date_to) filters.date_to = createForm.date_to;

      await reportsApi.create({
        report_name: createForm.report_name,
        report_type: createForm.report_type as ReportType,
        filters,
        branch_id: createForm.branch_id || undefined,
        is_template: createForm.is_template,
      });

      showToast.success("Report created successfully");
      setShowCreateModal(false);
      fetchData();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create report");
    } finally {
      setCreating(false);
    }
  }

  // --- View ---
  async function openViewModal(report: Report) {
    setViewReport(report);
    setViewData(null);
    setViewLoading(true);
    setShowViewModal(true);

    try {
      const res = await reportsApi.generate(report.id);
      setViewData(res.data);
    } catch {
      showToast.error("Failed to generate report data");
    } finally {
      setViewLoading(false);
    }
  }

  // --- Delete ---
  function openDeleteModal(report: Report) {
    setReportToDelete(report);
    setShowDeleteModal(true);
  }

  async function handleDelete() {
    if (!reportToDelete) return;

    try {
      setDeleting(true);
      await reportsApi.delete(reportToDelete.id);
      showToast.success("Report deleted successfully");
      setShowDeleteModal(false);
      setReportToDelete(null);
      fetchData();
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : "Failed to delete report");
    } finally {
      setDeleting(false);
    }
  }

  // --- Export ---
  async function handleExport(report: Report, format: "csv" | "pdf") {
    try {
      setExporting(report.id);
      await reportsApi.exportReport(report.id, format);
      showToast.success(`Report exported as ${format.toUpperCase()}`);
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(null);
    }
  }

  // --- Render helpers ---
  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getTypeBadgeClass(type: ReportType) {
    switch (type) {
      case "sales":
        return "bg-positive-100 text-positive";
      case "inventory":
        return "bg-info-100 text-info";
      case "job_order":
        return "bg-warning-100 text-warning";
      case "staff_performance":
        return "bg-primary-100 text-primary";
    }
  }

  if (loading) return <SkeletonLoader variant="grid" showHeader />;
  if (error) return <ErrorAlert message={error} onRetry={fetchData} />;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Reports"
        subtitle="Generate, view, and export customizable reports"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={fetchData}
              className="p-2.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-950 transition-colors"
              title="Refresh"
            >
              <LuRefreshCw className="w-4 h-4" />
            </button>
            {canCreate && (
              <button
                onClick={openCreateModal}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white hover:bg-primary-600 transition-colors text-sm font-medium"
              >
                <LuPlus className="w-4 h-4" />
                New Report
              </button>
            )}
          </div>
        }
      />

      <SearchFilter
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search reports..."
        filters={filterGroups}
        activeFilters={activeFilters}
        onFilterChange={(key, value) =>
          setActiveFilters((prev) => ({ ...prev, [key]: value }))
        }
      />

      {/* Report Cards Grid */}
      <CardGrid
        isEmpty={paginatedItems.length === 0}
        emptyMessage={
          searchQuery
            ? "No reports match your search."
            : 'No reports found. Click "New Report" to create one.'
        }
      >
        {paginatedItems.map((report) => (
          <GridCard
            key={report.id}
            onClick={() => openViewModal(report)}
            icon={<LuFileText className="w-5 h-5 text-primary" />}
            title={report.report_name}
            subtitle={report.branches?.name || "All Branches"}
            statusBadge={{
              label: REPORT_TYPE_LABELS[report.report_type],
              className: getTypeBadgeClass(report.report_type),
            }}
            details={
              <>
                <p className="text-xs text-neutral-900">
                  Generated: {formatDate(report.generated_at)}
                </p>
                <p className="text-xs text-neutral-900">
                  By: {report.user_profiles?.full_name || "Unknown"}
                </p>
                {report.is_template && (
                  <span className="inline-block mt-1 px-2 py-0.5 text-xs rounded-full bg-primary-100 text-primary font-medium">
                    Template
                  </span>
                )}
              </>
            }
            actions={[
              ...(canExport
                ? [
                    {
                      label: "CSV",
                      icon: <LuDownload className="w-4 h-4" />,
                      onClick: (e: React.MouseEvent) => {
                        e.stopPropagation();
                        handleExport(report, "csv");
                      },
                      className:
                        exporting === report.id
                          ? "flex items-center gap-1 text-sm text-neutral-900 opacity-50 pointer-events-none"
                          : "flex items-center gap-1 text-sm text-neutral-950 hover:text-primary",
                    },
                    {
                      label: "PDF",
                      icon: <LuDownload className="w-4 h-4" />,
                      onClick: (e: React.MouseEvent) => {
                        e.stopPropagation();
                        handleExport(report, "pdf");
                      },
                      className:
                        exporting === report.id
                          ? "flex items-center gap-1 text-sm text-neutral-900 opacity-50 pointer-events-none"
                          : "flex items-center gap-1 text-sm text-neutral-950 hover:text-primary",
                    },
                  ]
                : []),
              ...(canDelete
                ? [
                    {
                      label: "Delete",
                      icon: <LuTrash2 className="w-4 h-4" />,
                      onClick: (e: React.MouseEvent) => {
                        e.stopPropagation();
                        openDeleteModal(report);
                      },
                      className:
                        "flex items-center gap-1 text-sm text-negative hover:text-negative-900",
                    },
                  ]
                : []),
            ]}
          />
        ))}
      </CardGrid>

      {/* Pagination */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        variant="card"
      />

      {/* Create Report Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New Report"
        maxWidth="lg"
      >
        <form onSubmit={handleCreate}>
          <ModalSection title="Report Configuration">
            <ModalInput
              type="text"
              value={createForm.report_name}
              onChange={(v) =>
                setCreateForm((prev) => ({ ...prev, report_name: v }))
              }
              placeholder="Report Name *"
              required
            />
            <ModalSelect
              value={createForm.report_type}
              onChange={(v) =>
                setCreateForm((prev) => ({
                  ...prev,
                  report_type: v as ReportType | "",
                }))
              }
              options={[
                { value: "", label: "Select Report Type *" },
                ...REPORT_TYPE_OPTIONS,
              ]}
            />
            <ModalSelect
              value={createForm.branch_id}
              onChange={(v) =>
                setCreateForm((prev) => ({ ...prev, branch_id: v }))
              }
              options={[
                { value: "", label: "All Branches" },
                ...branches.map((b) => ({ value: b.id, label: b.name })),
              ]}
            />
          </ModalSection>

          <ModalSection title="Date Range Filter">
            <div className="grid grid-cols-2 gap-3">
              <ModalInput
                type="date"
                value={createForm.date_from}
                onChange={(v) =>
                  setCreateForm((prev) => ({ ...prev, date_from: v }))
                }
                placeholder="From"
              />
              <ModalInput
                type="date"
                value={createForm.date_to}
                onChange={(v) =>
                  setCreateForm((prev) => ({ ...prev, date_to: v }))
                }
                placeholder="To"
              />
            </div>
          </ModalSection>

          <ModalSection title="Options">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={createForm.is_template}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    is_template: e.target.checked,
                  }))
                }
                className="w-4 h-4 rounded border-neutral-300 text-primary focus:ring-primary"
              />
              <span className="text-sm text-neutral-950">
                Save as reusable template
              </span>
            </label>
          </ModalSection>

          {createError && <ModalError message={createError} />}

          <ModalButtons
            onCancel={() => setShowCreateModal(false)}
            submitText="Create Report"
            loading={creating}
            loadingText="Creating..."
            disabled={!createForm.report_name || !createForm.report_type}
          />
        </form>
      </Modal>

      {/* View Report Modal */}
      <Modal
        isOpen={showViewModal}
        onClose={() => setShowViewModal(false)}
        title={viewReport?.report_name || "Report"}
        maxWidth="2xl"
      >
        {viewReport && (
          <div className="space-y-4">
            {/* Report Info */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-neutral-900">Type:</span>{" "}
                <span className="font-medium text-neutral-950">
                  {REPORT_TYPE_LABELS[viewReport.report_type]}
                </span>
              </div>
              <div>
                <span className="text-neutral-900">Branch:</span>{" "}
                <span className="font-medium text-neutral-950">
                  {viewReport.branches?.name || "All Branches"}
                </span>
              </div>
              <div>
                <span className="text-neutral-900">Generated:</span>{" "}
                <span className="font-medium text-neutral-950">
                  {formatDate(viewReport.generated_at)}
                </span>
              </div>
              <div>
                <span className="text-neutral-900">By:</span>{" "}
                <span className="font-medium text-neutral-950">
                  {viewReport.user_profiles?.full_name || "Unknown"}
                </span>
              </div>
            </div>

            {/* Filters Applied */}
            {viewReport.filters &&
              Object.keys(viewReport.filters).length > 0 && (
                <div className="p-3 bg-neutral-100 rounded-xl text-sm">
                  <p className="font-medium text-neutral-950 mb-1">
                    Filters Applied:
                  </p>
                  {Object.entries(viewReport.filters).map(([key, value]) => (
                    <p key={key} className="text-neutral-900">
                      {key.replace(/_/g, " ")}: {value}
                    </p>
                  ))}
                </div>
              )}

            {/* Report Data */}
            {viewLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : viewData ? (
              <div className="space-y-4">
                {/* Summary */}
                {viewData.summary &&
                  Object.keys(viewData.summary).length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {Object.entries(viewData.summary).map(([key, value]) => (
                        <div
                          key={key}
                          className="p-3 bg-neutral-100 rounded-xl text-center"
                        >
                          <p className="text-xs text-neutral-900 mb-1">
                            {key
                              .replace(/_/g, " ")
                              .replace(/\b\w/g, (c) => c.toUpperCase())}
                          </p>
                          <p className="text-lg font-semibold text-neutral-950">
                            {typeof value === "object"
                              ? Object.entries(
                                  value as Record<string, unknown>
                                )
                                  .map(([k, v]) => `${k}: ${v}`)
                                  .join(", ")
                              : typeof value === "number"
                              ? value.toLocaleString()
                              : String(value)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                {/* Data table */}
                {viewData.rows.length > 0 ? (
                  <div className="overflow-x-auto max-h-80">
                    <table className="w-full text-sm">
                      <thead className="bg-neutral-100 sticky top-0">
                        <tr>
                          {Object.keys(flattenObj(viewData.rows[0]))
                            .slice(0, 6)
                            .map((key) => (
                              <th
                                key={key}
                                className="px-3 py-2 text-left text-xs font-medium text-neutral-900"
                              >
                                {key.replace(/_/g, " ")}
                              </th>
                            ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {viewData.rows.slice(0, 50).map((row, i) => {
                          const flat = flattenObj(row);
                          const keys = Object.keys(flat).slice(0, 6);
                          return (
                            <tr key={i} className="hover:bg-neutral-50">
                              {keys.map((key) => (
                                <td
                                  key={key}
                                  className="px-3 py-2 text-neutral-950 truncate max-w-[200px]"
                                >
                                  {flat[key] !== null && flat[key] !== undefined
                                    ? String(flat[key])
                                    : "-"}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {viewData.rows.length > 50 && (
                      <p className="text-xs text-neutral-900 text-center py-2">
                        Showing 50 of {viewData.rows.length} records. Export for
                        full data.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-center text-neutral-900 py-8">
                    No data found for this report configuration.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-center text-neutral-900 py-8">
                Failed to load report data.
              </p>
            )}

            {/* Export buttons */}
            {canExport && viewData && viewData.rows.length > 0 && (
              <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
                <button
                  onClick={() => handleExport(viewReport, "csv")}
                  disabled={exporting === viewReport.id}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-950 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  <LuDownload className="w-4 h-4" />
                  Export CSV
                </button>
                <button
                  onClick={() => handleExport(viewReport, "pdf")}
                  disabled={exporting === viewReport.id}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary-600 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  <LuDownload className="w-4 h-4" />
                  Export PDF
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Report"
        maxWidth="sm"
      >
        <p className="text-neutral-900 text-sm mb-4">
          Are you sure you want to delete{" "}
          <span className="font-semibold text-neutral-950">
            {reportToDelete?.report_name}
          </span>
          ? This action cannot be undone.
        </p>
        <ModalButtons
          onCancel={() => setShowDeleteModal(false)}
          onSubmit={handleDelete}
          submitText="Delete"
          loading={deleting}
          loadingText="Deleting..."
          type="button"
        />
      </Modal>
    </div>
  );
}

// Flatten nested object for table display
function flattenObj(
  obj: Record<string, unknown>,
  prefix = ""
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}_${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(
        result,
        flattenObj(value as Record<string, unknown>, newKey)
      );
    } else {
      result[newKey] = value;
    }
  }
  return result;
}
