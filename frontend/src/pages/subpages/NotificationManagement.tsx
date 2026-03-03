import { useState, useEffect, useMemo, useCallback } from "react";
import {
  LuPlus,
  LuCircleAlert,
  LuRefreshCw,
  LuSearch,
  LuPencil,
  LuTrash2,
  LuBell,
  LuBellOff,
  LuChevronLeft,
  LuChevronRight,
  LuFilter,
  LuEye,
} from "react-icons/lu";
import { showToast } from "../../lib/toast";
import { notificationsApi, branchesApi } from "../../lib/api";
import {
  Modal,
  ModalSection,
  ModalInput,
  ModalSelect,
  ModalButtons,
  ModalError,
} from "../../components";
import { useAuth } from "../../auth";
import type { Branch, Notification } from "../../types";

const ITEMS_PER_PAGE = 10;

export function NotificationManagement() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  // Search, filters & pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterTargetType, setFilterTargetType] = useState<string>("all");
  const [filterBranch, setFilterBranch] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);

  // Form state
  const [form, setForm] = useState({
    title: "",
    message: "",
    target_type: "branch" as string,
    target_value: "",
    branch_id: "",
  });

  const userRoles = user?.roles || [];
  const canCreate = userRoles.some((r) => ["HM", "POC", "JS"].includes(r));
  const canEdit = canCreate;
  const canDelete = canCreate;

  // Users in selected branch (for "Specific User" target type)
  const [branchUsers, setBranchUsers] = useState<Array<{ id: string; full_name: string; email: string }>>([]);
  const [loadingBranchUsers, setLoadingBranchUsers] = useState(false);

  const fetchBranchUsers = useCallback(async (branchId: string) => {
    if (!branchId) {
      setBranchUsers([]);
      return;
    }
    try {
      setLoadingBranchUsers(true);
      const users = await branchesApi.getUsers(branchId);
      setBranchUsers(users.map((u) => ({ id: u.id, full_name: u.full_name, email: u.email })));
    } catch {
      setBranchUsers([]);
    } finally {
      setLoadingBranchUsers(false);
    }
  }, []);

  // Fetch users when target_type is "user" and branch_id changes
  useEffect(() => {
    if (form.target_type === "user" && form.branch_id) {
      fetchBranchUsers(form.branch_id);
    } else if (form.target_type !== "user") {
      setBranchUsers([]);
    }
  }, [form.target_type, form.branch_id, fetchBranchUsers]);

  // Stats
  const stats = useMemo(() => {
    const total = notifications.length;
    const active = notifications.filter((n) => n.status === "active").length;
    const inactive = total - active;
    return { total: totalCount, active, inactive };
  }, [notifications, totalCount]);

  // Filtered
  const filteredNotifications = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return notifications.filter((n) => {
      const matchSearch =
        !q ||
        n.title.toLowerCase().includes(q) ||
        n.message.toLowerCase().includes(q);
      const matchStatus = filterStatus === "all" || n.status === filterStatus;
      const matchTarget = filterTargetType === "all" || n.target_type === filterTargetType;
      const matchBranch = filterBranch === "all" || n.branch_id === filterBranch;
      return matchSearch && matchStatus && matchTarget && matchBranch;
    });
  }, [notifications, searchQuery, filterStatus, filterTargetType, filterBranch]);

  const totalPages = Math.ceil(filteredNotifications.length / ITEMS_PER_PAGE);
  const paginatedNotifications = filteredNotifications.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterStatus, filterTargetType, filterBranch]);

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);
      const [notifData, branchData] = await Promise.all([
        notificationsApi.getAll({ limit: 500 }),
        branchesApi.getAll(),
      ]);
      setNotifications(notifData.data || []);
      setTotalCount(notifData.pagination?.total || 0);
      setBranches(branchData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setForm({
      title: "",
      message: "",
      target_type: "branch",
      target_value: "",
      branch_id: user?.branches?.[0]?.branch_id || "",
    });
    setFormError(null);
  }

  function openAddModal() {
    resetForm();
    setForm((prev) => ({
      ...prev,
      branch_id: user?.branches?.[0]?.branch_id || "",
    }));
    setShowAddModal(true);
  }

  function openEditModal(n: Notification) {
    setSelectedNotification(n);
    setForm({
      title: n.title,
      message: n.message,
      target_type: n.target_type,
      target_value: n.target_value,
      branch_id: n.branch_id,
    });
    setFormError(null);
    setShowEditModal(true);
  }

  function openViewModal(n: Notification) {
    setSelectedNotification(n);
    setShowViewModal(true);
  }

  function openDeleteModal(n: Notification) {
    setSelectedNotification(n);
    setShowDeleteModal(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!form.title.trim()) {
      setFormError("Title is required");
      return;
    }
    if (!form.message.trim()) {
      setFormError("Message is required");
      return;
    }

    // For "branch" target type, target_value and branch_id are the same
    const effectiveBranchId = form.target_type === "branch" ? form.target_value : form.branch_id;
    const effectiveTargetValue = form.target_type === "branch" ? form.target_value : form.target_value;

    if (!effectiveTargetValue.trim()) {
      setFormError("Target value is required");
      return;
    }
    if (form.target_type !== "branch" && !form.branch_id) {
      setFormError("Branch is required");
      return;
    }

    try {
      setSaving(true);
      await notificationsApi.create({
        title: form.title.trim(),
        message: form.message.trim(),
        target_type: form.target_type,
        target_value: effectiveTargetValue.trim(),
        branch_id: effectiveBranchId,
      });
      showToast.success("Notification created");
      setShowAddModal(false);
      fetchData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create notification");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedNotification) return;
    setFormError(null);

    try {
      setSaving(true);
      await notificationsApi.update(selectedNotification.id, {
        title: form.title.trim(),
        message: form.message.trim(),
        target_type: form.target_type,
        target_value: form.target_value.trim(),
      });
      showToast.success("Notification updated");
      setShowEditModal(false);
      fetchData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to update notification");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedNotification) return;

    try {
      setDeleting(true);
      await notificationsApi.delete(selectedNotification.id);
      showToast.success("Notification deactivated");
      setShowDeleteModal(false);
      fetchData();
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  function handleResetFilters() {
    setSearchQuery("");
    setFilterStatus("all");
    setFilterTargetType("all");
    setFilterBranch("all");
  }

  function getBranchName(branchId: string): string {
    return branches.find((b) => b.id === branchId)?.name || branchId;
  }

  const targetTypeLabel: Record<string, string> = {
    role: "Role",
    user: "User",
    branch: "Branch",
  };

  const targetTypeOptions =
    form.target_type === "role"
      ? [
          { value: "HM", label: "Higher Management" },
          { value: "POC", label: "POC Supervisor" },
          { value: "JS", label: "Junior Supervisor" },
          { value: "R", label: "Receptionist" },
          { value: "T", label: "Technician" },
        ]
      : [];

  // Shared target configuration JSX for Create/Edit modals
  const targetConfigSection = (
    <ModalSection title="Target Configuration">
      <ModalSelect
        value={form.target_type}
        onChange={(v) => setForm({ ...form, target_type: v, target_value: "", branch_id: form.branch_id })}
        placeholder="Select Target Type"
        options={[
          { value: "branch", label: "All Users in Branch" },
          { value: "role", label: "Specific Role" },
          { value: "user", label: "Specific User" },
        ]}
      />

      {/* Branch: just select a branch (target_value auto-set) */}
      {form.target_type === "branch" && (
        <ModalSelect
          value={form.target_value}
          onChange={(v) => setForm({ ...form, target_value: v })}
          options={branches.map((b) => ({ value: b.id, label: b.name }))}
          placeholder="Select Branch"
        />
      )}

      {/* Role: select role + select branch */}
      {form.target_type === "role" && (
        <>
          <ModalSelect
            value={form.target_value}
            onChange={(v) => setForm({ ...form, target_value: v })}
            options={targetTypeOptions.map((o) => ({ value: o.value, label: o.label }))}
            placeholder="Select Role"
          />
          <ModalSelect
            value={form.branch_id}
            onChange={(v) => setForm({ ...form, branch_id: v })}
            options={branches.map((b) => ({ value: b.id, label: b.name }))}
            placeholder="Select Branch"
          />
        </>
      )}

      {/* User: select branch first, then select user from that branch */}
      {form.target_type === "user" && (
        <>
          <ModalSelect
            value={form.branch_id}
            onChange={(v) => setForm({ ...form, branch_id: v, target_value: "" })}
            options={branches.map((b) => ({ value: b.id, label: b.name }))}
            placeholder="Select Branch"
          />
          <ModalSelect
            value={form.target_value}
            onChange={(v) => setForm({ ...form, target_value: v })}
            options={branchUsers.map((u) => ({ value: u.id, label: `${u.full_name} (${u.email})` }))}
            placeholder={loadingBranchUsers ? "Loading users..." : form.branch_id ? "Select User" : "Select a branch first"}
          />
        </>
      )}
    </ModalSection>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LuRefreshCw className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-negative-200 border border-negative rounded-lg p-4 flex items-center gap-3">
        <LuCircleAlert className="w-5 h-5 text-negative-950 shrink-0" />
        <div>
          <p className="text-sm text-negative-950">{error}</p>
          <button onClick={fetchData} className="text-sm text-negative-900 hover:underline mt-1">
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with title and add button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between bg-white rounded-xl p-4 border border-neutral-200">
        <div>
          <h3 className="text-lg font-semibold text-neutral-950">Notifications</h3>
          <p className="text-sm text-neutral-900">Summary of notifications</p>
        </div>
        {canCreate && (
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-950 transition-colors"
          >
            <LuPlus className="w-4 h-4" />
            Create Notification
          </button>
        )}
      </div>

      {/* Summary Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 rounded-lg">
              <LuBell className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-neutral-900">All Notifications</p>
              <p className="text-2xl font-bold text-neutral-950">{stats.total}</p>
            </div>
          </div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 rounded-lg">
              <LuBell className="w-5 h-5 text-positive" />
            </div>
            <div>
              <p className="text-sm text-neutral-900">Active</p>
              <p className="text-2xl font-bold text-neutral-950">{stats.active}</p>
            </div>
          </div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-negative-100 rounded-lg">
              <LuBellOff className="w-5 h-5 text-negative" />
            </div>
            <div>
              <p className="text-sm text-neutral-900">Inactive</p>
              <p className="text-2xl font-bold text-neutral-950">{stats.inactive}</p>
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
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:border-primary w-full sm:w-64"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={filterStatus}
                onChange={(e) => {
                  setFilterStatus(e.target.value);
                  setCurrentPage(1);
                }}
                className="appearance-none px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
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
                <label className="block text-xs text-neutral-900 mb-1">Target Type</label>
                <select
                  value={filterTargetType}
                  onChange={(e) => {
                    setFilterTargetType(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="all">All Target Types</option>
                  <option value="role">Role</option>
                  <option value="user">User</option>
                  <option value="branch">Branch</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs text-neutral-900 mb-1">Branch</label>
                <select
                  value={filterBranch}
                  onChange={(e) => {
                    setFilterBranch(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="all">All Branches</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end gap-2">
                <button
                  onClick={fetchData}
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
        <div className="md:hidden p-4">
          <div className="grid grid-cols-1 gap-4">
            {paginatedNotifications.map((n) => (
              <div
                key={n.id}
                onClick={() => openViewModal(n)}
                className="bg-white rounded-xl border border-neutral-200 p-4 cursor-pointer hover:bg-neutral-100 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary-100 rounded-lg">
                      <LuBell className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-neutral-950">{n.title}</h4>
                      <span className="text-xs font-mono bg-neutral-100 text-primary px-2 py-0.5 rounded">
                        {targetTypeLabel[n.target_type] || n.target_type}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      n.status === "active" ? "bg-positive-100 text-positive" : "bg-negative-100 text-negative"
                    }`}>
                      {n.status === "active" ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>
                <div className="space-y-1 text-sm text-neutral-900 mb-3">
                  <p className="text-neutral-900">{new Date(n.created_at).toLocaleDateString()}</p>
                  <p className="text-neutral-900 line-clamp-2">{n.message}</p>
                </div>
                {(() => {
                  const canEditThis = canEdit && n.notification_type === "manual";
                  const canDeleteThis = canDelete;
                  const hasActions = canEditThis || canDeleteThis;
                  return hasActions ? (
                    <div className="flex items-center justify-end gap-4 pt-3 border-t border-neutral-200">
                      {canEditThis && (
                        <button
                          onClick={(e) => { e.stopPropagation(); openEditModal(n); }}
                          className="flex items-center gap-1 text-sm text-primary hover:text-primary-900"
                        >
                          <LuPencil className="w-4 h-4" /> Edit
                        </button>
                      )}
                      {canDeleteThis && (
                        <button
                          onClick={(e) => { e.stopPropagation(); openDeleteModal(n); }}
                          className="flex items-center gap-1 text-sm text-negative hover:text-negative-900"
                        >
                          <LuTrash2 className="w-4 h-4" /> Delete
                        </button>
                      )}
                    </div>
                  ) : null;
                })()}
              </div>
            ))}
            {paginatedNotifications.length === 0 && (
              <div className="col-span-full text-center py-12 text-neutral-900">
                {searchQuery || filterStatus !== "all" || filterTargetType !== "all" || filterBranch !== "all"
                  ? "No notifications match your filters."
                  : "No notifications found. Click \"Create Notification\" to create one."}
              </div>
            )}
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-100">
                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950 whitespace-nowrap">Title</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950 whitespace-nowrap">Target</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950 whitespace-nowrap">Branch</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950 whitespace-nowrap">Type</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950 whitespace-nowrap">Status</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-neutral-950 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedNotifications.map((n) => (
                <tr key={n.id} onClick={() => openViewModal(n)} className="border-b border-neutral-200 hover:bg-neutral-100 transition-colors cursor-pointer last:border-b-0">
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className="font-medium text-neutral-900">{n.title}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-xs font-mono bg-positive-100 text-positive-950 px-2 py-0.5 rounded">
                      {targetTypeLabel[n.target_type] || n.target_type}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-neutral-900 whitespace-nowrap">
                    {n.branches?.name || getBranchName(n.branch_id)}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      n.notification_type === "system"
                        ? "bg-positive-100 text-positive-950"
                        : "bg-primary-100 text-primary"
                    }`}>
                      {n.notification_type === "system" ? "System" : "Manual"}
                    </span>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      n.status === "active" ? "bg-positive-100 text-positive-950" : "bg-negative-100 text-negative-950"
                    }`}>
                      {n.status === "active" ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    {(() => {
                      const canEditThis = canEdit && n.notification_type === "manual";
                      const canDeleteThis = canDelete;
                      return (
                        <div className="flex items-center justify-center gap-2">
                          {canEditThis && (
                            <button
                              onClick={(e) => { e.stopPropagation(); openEditModal(n); }}
                              className="p-2 text-primary-950 hover:text-primary-900 hover:bg-primary-50 rounded-lg transition-colors"
                              title="Edit notification"
                            >
                              <LuPencil className="w-4 h-4" />
                            </button>
                          )}
                          {canDeleteThis && (
                            <button
                              onClick={(e) => { e.stopPropagation(); openDeleteModal(n); }}
                              className="p-2 text-negative-950 hover:text-negative-900 hover:bg-negative-50 rounded-lg transition-colors"
                              title="Deactivate notification"
                            >
                              <LuTrash2 className="w-4 h-4" />
                            </button>
                          )}
                          {!canEditThis && !canDeleteThis && (
                            <button
                              onClick={(e) => { e.stopPropagation(); openViewModal(n); }}
                              className="p-2 text-positive-950 hover:text-positive-900 rounded-lg transition-colors"
                              title="View notification"
                            >
                              <LuEye className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {paginatedNotifications.length === 0 && (
            <div className="text-center py-12 text-neutral-900">
              {searchQuery || filterStatus !== "all" || filterTargetType !== "all" || filterBranch !== "all"
                ? "No notifications match your filters."
                : "No notifications found. Click \"Create Notification\" to create one."}
            </div>
          )}
        </div>

        {/* Pagination */}
        {filteredNotifications.length > ITEMS_PER_PAGE && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4">
            <p className="text-sm text-neutral-900">
              {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredNotifications.length)} of {filteredNotifications.length} notifications
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 border border-neutral-200 rounded-lg text-neutral-900 hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <LuChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-neutral-900 px-2">
                {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 border border-neutral-200 rounded-lg text-neutral-900 hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <LuChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Create Notification" maxWidth="lg">
        <form onSubmit={handleCreate}>
          <ModalSection title="Notification Information">
            <ModalInput
              type="text"
              required
              value={form.title}
              onChange={(v) => setForm({ ...form, title: v })}
              placeholder="Notification Title"
            />
            <textarea
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              placeholder="Notification Message *"
              rows={3}
              className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
            />
          </ModalSection>

          {targetConfigSection}

          <ModalError message={formError} />
          <ModalButtons
            onCancel={() => setShowAddModal(false)}
            submitText={saving ? "Creating..." : "Create Notification"}
            loading={saving}
          />
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Notification" maxWidth="lg">
        <form onSubmit={handleUpdate}>
          <ModalSection title="Notification Information">
            <ModalInput
              type="text"
              required
              value={form.title}
              onChange={(v) => setForm({ ...form, title: v })}
              placeholder="Notification Title"
            />
            <textarea
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              placeholder="Notification Message *"
              rows={3}
              className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
            />
          </ModalSection>

          {targetConfigSection}

          <ModalError message={formError} />
          <ModalButtons
            onCancel={() => setShowEditModal(false)}
            submitText={saving ? "Saving..." : "Save Changes"}
            loading={saving}
          />
        </form>
      </Modal>

      {/* View Modal */}
      <Modal
        isOpen={showViewModal && !!selectedNotification}
        onClose={() => setShowViewModal(false)}
        title="Notification Details"
        maxWidth="lg"
      >
        {selectedNotification && (
          <div>
            <ModalSection title="Notification Information">
              <ModalInput
                type="text"
                value={selectedNotification.title}
                onChange={() => {}}
                placeholder="Title"
                disabled
              />
              <textarea
                value={selectedNotification.message}
                readOnly
                disabled
                rows={3}
                placeholder="Message"
                className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none transition-all resize-none"
              />
              <div className="grid grid-cols-2 gap-4">
                <ModalSelect
                  value={selectedNotification.notification_type}
                  onChange={() => {}}
                  options={[
                    { value: "system", label: "System" },
                    { value: "manual", label: "Manual" },
                  ]}
                  disabled
                />
                <ModalSelect
                  value={selectedNotification.status}
                  onChange={() => {}}
                  options={[
                    { value: "active", label: "Active" },
                    { value: "inactive", label: "Inactive" },
                  ]}
                  disabled
                />
              </div>
            </ModalSection>

            <ModalSection title="Target Configuration">
              <ModalSelect
                value={selectedNotification.target_type}
                onChange={() => {}}
                options={[
                  { value: "branch", label: "All Users in Branch" },
                  { value: "role", label: "Specific Role" },
                  { value: "user", label: "Specific User" },
                ]}
                disabled
              />
              <ModalInput
                type="text"
                value={selectedNotification.target_type === "branch"
                  ? getBranchName(selectedNotification.target_value)
                  : selectedNotification.target_value}
                onChange={() => {}}
                placeholder="Target Value"
                disabled
              />
              <ModalInput
                type="text"
                value={selectedNotification.branches?.name || getBranchName(selectedNotification.branch_id)}
                onChange={() => {}}
                placeholder="Branch"
                disabled
              />
            </ModalSection>

            <ModalSection title="Additional Details">
              <ModalInput
                type="text"
                value={new Date(selectedNotification.created_at).toLocaleString()}
                onChange={() => {}}
                placeholder="Created At"
                disabled
              />
              {selectedNotification.reference_type && (
                <ModalInput
                  type="text"
                  value={`${selectedNotification.reference_type} – ${selectedNotification.reference_id}`}
                  onChange={() => {}}
                  placeholder="Reference"
                  disabled
                />
              )}
            </ModalSection>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal && !!selectedNotification}
        onClose={() => setShowDeleteModal(false)}
        title="Deactivate Notification"
        maxWidth="sm"
      >
        {selectedNotification && (
          <div>
            <div className="bg-neutral-100 rounded-xl p-4 my-4">
              <p className="text-neutral-900">
                Are you sure you want to deactivate <strong className="text-neutral-950">{selectedNotification.title}</strong>?
              </p>
            </div>
            <p className="text-sm text-neutral-900 mb-2">
              The notification will be set to inactive and will no longer be visible to users.
            </p>

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
                {deleting ? "Deactivating..." : "Deactivate"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
