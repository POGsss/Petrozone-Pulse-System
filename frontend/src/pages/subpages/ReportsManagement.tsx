import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  LuFileText,
  LuPencil,
  LuTrash2,
  LuDownload,
  LuEllipsisVertical,
} from "react-icons/lu";
import { reportsApi, branchesApi } from "../../lib/api";
import { showToast } from "../../lib/toast";
import { generateReportPDF } from "../../lib/pdfGenerator";
import { generateReportExcel } from "../../lib/excelGenerator";
import { useTheme } from "../../lib/ThemeContext";
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
  { value: "inventory", label: "Inventory" },
  { value: "job_order", label: "Job Order" },
  { value: "staff_performance", label: "Staff Report" },
];

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  sales: "Sales Report",
  inventory: "Inventory",
  job_order: "Job Order",
  staff_performance: "Staff Report",
};

export function ReportsManagement() {
  const { hasAnyRole } = useAuth();
  const { settings } = useTheme();
  const canCreate = hasAnyRole("HM", "POC", "JS", "R");
  const canEdit = hasAnyRole("HM", "POC", "JS", "R");
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
  });

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [editForm, setEditForm] = useState({
    report_name: "",
    report_type: "" as ReportType | "",
    branch_id: "",
    date_from: "",
    date_to: "",
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

  // Actions overflow dropdown
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const closeDropdown = useCallback(() => setOpenDropdownId(null), []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    }
    if (openDropdownId) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [openDropdownId, closeDropdown]);

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

      return matchSearch && matchType;
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

  // --- Edit ---
  function openEditModal(report: Report) {
    setSelectedReport(report);
    setEditForm({
      report_name: report.report_name,
      report_type: report.report_type,
      branch_id: report.branch_id || "",
      date_from: report.filters?.date_from || "",
      date_to: report.filters?.date_to || "",
    });
    setEditError(null);
    setShowEditModal(true);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedReport) return;
    if (!editForm.report_name || !editForm.report_type) return;

    try {
      setEditing(true);
      setEditError(null);

      const filters: Record<string, string> = {};
      if (editForm.date_from) filters.date_from = editForm.date_from;
      if (editForm.date_to) filters.date_to = editForm.date_to;

      await reportsApi.update(selectedReport.id, {
        report_name: editForm.report_name,
        report_type: editForm.report_type as ReportType,
        filters,
        branch_id: editForm.branch_id || undefined,
      });

      showToast.success("Report updated successfully");
      setShowEditModal(false);
      setSelectedReport(null);
      fetchData();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update report");
      showToast.error(err instanceof Error ? err.message : "Failed to update report");
    } finally {
      setEditing(false);
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
  async function handleExport(report: Report, format: "xlsx" | "pdf") {
    try {
      setExporting(report.id);
      closeDropdown();

      const res = await reportsApi.generate(report.id);

      if (format === "pdf") {
        generateReportPDF(report, res.data, settings.primaryColor);
      } else {
        await generateReportExcel(report, res.data, settings.primaryColor);
      }

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

  if (loading) return <SkeletonLoader showHeader rows={6} variant="grid" />;
  if (error) return <ErrorAlert message={error} onRetry={fetchData} />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Reports"
        subtitle={`${allReports.length} reports total`}
        buttonLabel="New Report"
        onAdd={openCreateModal}
        showButton={canCreate}
      />

      {/* Search & Filter bar */}
      {allReports.length > 0 && (
        <SearchFilter
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search"
          filters={filterGroups}
          activeFilters={activeFilters}
          onFilterChange={(key, value) =>
            setActiveFilters((prev) => ({ ...prev, [key]: value }))
          }
        />
      )}

      {/* Report Cards Grid */}
      <CardGrid
        isEmpty={paginatedItems.length === 0}
        emptyMessage={
          searchQuery || Object.values(activeFilters).some((v) => v && v !== "all")
            ? "No reports match your search or filters."
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
                <p className="text-neutral-900">Generated: {formatDate(report.generated_at)}</p>
                <p className="text-neutral-900">By: {report.user_profiles?.full_name || "Unknown"}</p>
              </>
            }
            actions={[
              ...(canEdit
                ? [
                    {
                      label: "Edit",
                      icon: <LuPencil className="w-4 h-4" />,
                      onClick: (e: React.MouseEvent) => {
                        e.stopPropagation();
                        openEditModal(report);
                      },
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
                      className: "flex items-center gap-1 text-sm text-negative hover:text-negative-900",
                    },
                  ]
                : []),
            ]}
            extraActions={
              canExport ? (
                <div className="relative" ref={openDropdownId === `card-${report.id}` ? dropdownRef : undefined}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenDropdownId(openDropdownId === `card-${report.id}` ? null : `card-${report.id}`);
                    }}
                    className="flex items-center gap-1 text-sm text-neutral-950 hover:text-neutral-900"
                    title="More actions"
                  >
                    <LuEllipsisVertical className="w-4 h-4" /> More
                  </button>
                  {openDropdownId === `card-${report.id}` && (
                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg border border-neutral-200 py-2 z-50">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleExport(report, "pdf");
                        }}
                        disabled={exporting === report.id}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors disabled:opacity-50"
                      >
                        <LuDownload className="w-4 h-4" /> Save as PDF
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleExport(report, "xlsx");
                        }}
                        disabled={exporting === report.id}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors disabled:opacity-50"
                      >
                        <LuDownload className="w-4 h-4" /> Save as Excel
                      </button>
                    </div>
                  )}
                </div>
              ) : undefined
            }
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
              placeholder="Report Name"
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
                { value: "", label: "Select Report Type" },
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

          {createError && <ModalError message={createError} />}

          <ModalButtons
            onCancel={() => setShowCreateModal(false)}
            submitText={creating ? "Creating..." : "Create Report"}
            loading={creating}
            disabled={!createForm.report_name || !createForm.report_type}
          />
        </form>
      </Modal>

      {/* Edit Report Modal */}
      <Modal
        isOpen={showEditModal && !!selectedReport}
        onClose={() => setShowEditModal(false)}
        title="Edit Report"
        maxWidth="lg"
      >
        {selectedReport && (
          <form onSubmit={handleEdit}>
            <ModalSection title="Report Configuration">
              <ModalInput
                type="text"
                value={editForm.report_name}
                onChange={(v) =>
                  setEditForm((prev) => ({ ...prev, report_name: v }))
                }
                placeholder="Report Name"
                required
              />
              <ModalSelect
                value={editForm.report_type}
                onChange={(v) =>
                  setEditForm((prev) => ({
                    ...prev,
                    report_type: v as ReportType | "",
                  }))
                }
                options={[
                  { value: "", label: "Select Report Type" },
                  ...REPORT_TYPE_OPTIONS,
                ]}
              />
              <ModalSelect
                value={editForm.branch_id}
                onChange={(v) =>
                  setEditForm((prev) => ({ ...prev, branch_id: v }))
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
                  value={editForm.date_from}
                  onChange={(v) =>
                    setEditForm((prev) => ({ ...prev, date_from: v }))
                  }
                  placeholder="From"
                />
                <ModalInput
                  type="date"
                  value={editForm.date_to}
                  onChange={(v) =>
                    setEditForm((prev) => ({ ...prev, date_to: v }))
                  }
                  placeholder="To"
                />
              </div>
            </ModalSection>

            <ModalError message={editError} />

            <ModalButtons
              onCancel={() => setShowEditModal(false)}
              submitText={editing ? "Saving..." : "Save Changes"}
              loading={editing}
              disabled={!editForm.report_name || !editForm.report_type}
            />
          </form>
        )}
      </Modal>

      {/* View Report Modal */}
      <Modal
        isOpen={showViewModal}
        onClose={() => setShowViewModal(false)}
        title={viewReport?.report_name || "Report"}
        maxWidth="lg"
      >
        {viewReport && (
          <div>
            <ModalSection title="Report Information">
              <div className="grid grid-cols-2 gap-4">
                <ModalInput type="text" value={REPORT_TYPE_LABELS[viewReport.report_type]} onChange={() => {}} placeholder="Type" disabled />
                <ModalInput type="text" value={viewReport.branches?.name || "All Branches"} onChange={() => {}} placeholder="Branch" disabled />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <ModalInput type="text" value={viewReport.filters?.date_from || "—"} onChange={() => {}} placeholder="Start Date" disabled />
                <ModalInput type="text" value={viewReport.filters?.date_to || "—"} onChange={() => {}} placeholder="End Date" disabled />
              </div>
              <ModalInput type="text" value={viewReport.user_profiles?.full_name || "Unknown"} onChange={() => {}} placeholder="Generated By" disabled />
            </ModalSection>

            <ModalSection title="Report Preview">
              {viewLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : viewData ? (
                <>
                  {/* Summary cards */}
                  {viewData.summary && Object.keys(viewData.summary).length > 0 && (
                    <div className="grid grid-cols-3 gap-4">
                      {Object.entries(viewData.summary).map(([key, value]) => (
                        <div key={key} className="bg-neutral-100 rounded-xl px-4 py-3.5 text-center">
                          <p className="text-xs text-neutral-900">
                            {key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                          </p>
                          <p className="text-lg font-bold text-neutral-950">
                            {typeof value === "object"
                              ? Object.entries(value as Record<string, unknown>).map(([k, v]) => `${k}: ${v}`).join(", ")
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
                    <div className="overflow-hidden rounded-xl border border-neutral-200">
                      <div className="overflow-x-auto max-h-80">
                        <table className="w-full text-sm">
                          <thead className="bg-neutral-100 sticky top-0">
                            <tr>
                              {Object.keys(flattenObj(viewData.rows[0])).slice(0, 6).map((key) => (
                                <th key={key} className="px-3 py-2.5 text-left text-xs font-medium text-neutral-900">
                                  {key.replace(/_/g, " ")}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-100 bg-white">
                            {viewData.rows.slice(0, 50).map((row, i) => {
                              const flat = flattenObj(row);
                              const keys = Object.keys(flat).slice(0, 6);
                              return (
                                <tr key={i} className="hover:bg-neutral-100">
                                  {keys.map((key) => (
                                    <td key={key} className="px-3 py-2.5 text-neutral-950 truncate max-w-50">
                                      {flat[key] !== null && flat[key] !== undefined ? String(flat[key]) : "—"}
                                    </td>
                                  ))}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {viewData.rows.length > 50 && (
                        <p className="text-xs text-neutral-900 text-center py-2 bg-neutral-50 border-t border-neutral-100">
                          Showing 50 of {viewData.rows.length} records. Export for full data.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-center text-neutral-900 py-8">No data found for this report configuration.</p>
                  )}
                </>
              ) : (
                <p className="text-center text-neutral-900 py-8">Failed to load report data.</p>
              )}
            </ModalSection>

            {canExport && viewData && viewData.rows.length > 0 && (
              <ModalSection title="Actions">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleExport(viewReport, "xlsx")}
                    disabled={exporting === viewReport.id}
                    className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      exporting === viewReport.id
                        ? "bg-neutral-100 text-neutral opacity-50 cursor-not-allowed"
                        : "bg-neutral-100 text-neutral hover:bg-neutral-200"
                    }`}
                  >
                    Export Excel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      generateReportPDF(viewReport, viewData, settings.primaryColor);
                      showToast.success("Report exported as PDF");
                    }}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all bg-primary text-white"
                  >
                    Export PDF
                  </button>
                </div>
              </ModalSection>
            )}
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal && !!reportToDelete}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Report"
        maxWidth="sm"
      >
        {reportToDelete && (
          <div>
            <div className="bg-neutral-100 rounded-xl p-4 my-4">
              <p className="text-neutral-900">
                Are you sure you want to delete{" "}
                <strong className="text-neutral-950">
                  {reportToDelete.report_name}
                </strong>
                ? This action cannot be undone.
              </p>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-4 py-3.5 border-2 border-negative text-negative rounded-xl font-semibold hover:bg-negative-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-3.5 bg-negative text-white rounded-xl font-semibold hover:bg-negative-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        )}
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
