import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  LuPencil,
  LuTrash2,
  LuBell,
  LuBellOff,
  LuEye,
  LuSend,
  LuClock,
  LuEllipsisVertical,
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
  PageHeader,
  StatsCards,
  TableSearchFilter,
  Pagination,
  ErrorAlert,
  SkeletonLoader,
  MobileCardList,
  MobileCard,
  DesktopTable,
  DesktopTableRow,
} from "../../components";
import type { StatCard, MobileCardAction, DesktopTableColumn } from "../../components";
import { useAuth } from "../../auth";
import type { Branch, Notification } from "../../types";

const ITEMS_PER_PAGE = 20;

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
  const [currentPage, setCurrentPage] = useState(1);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notificationHasReferences, setNotificationHasReferences] = useState(false);
  const [checkingReferences] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);

  // Form state
  const [form, setForm] = useState({
    title: "",
    message: "",
    target_type: "branch" as string,
    target_value: "",
    branch_id: "",
    status: "" as string,
    scheduleDelay: "",
    scheduleUnit: "minutes" as "seconds" | "minutes" | "hours",
  });

  // Actions dropdown
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // Schedule edit modal
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({ scheduleDelay: "", scheduleUnit: "minutes" as "seconds" | "minutes" | "hours" });

  // Close dropdown on outside click
  const dropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!openDropdownId) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdownId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openDropdownId]);

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
    const draft = notifications.filter((n) => n.status === "draft").length;
    const scheduled = notifications.filter((n) => n.status === "scheduled").length;
    const active = notifications.filter((n) => n.status === "active").length;
    const inactive = notifications.filter((n) => n.status === "inactive").length;
    return { total: totalCount, draft, scheduled, active, inactive };
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

  // Auto-refresh when scheduled notifications are due
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const scheduledItems = notifications.filter(
      (n) => n.status === "scheduled" && n.scheduled_at
    );
    for (const n of scheduledItems) {
      const delayMs = new Date(n.scheduled_at!).getTime() - Date.now();
      if (delayMs > 0) {
        timers.push(setTimeout(() => {
          fetchData();
          window.dispatchEvent(new Event("notification-schedule-complete"));
        }, delayMs + 1000)); // +1s buffer for backend to process
      } else {
        // Already past due, refetch soon in case backend hasn't processed yet
        timers.push(setTimeout(() => {
          fetchData();
          window.dispatchEvent(new Event("notification-schedule-complete"));
        }, 2000));
      }
    }
    return () => timers.forEach((t) => clearTimeout(t));
  }, [notifications]);

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
      status: "",
      scheduleDelay: "",
      scheduleUnit: "minutes",
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
    // Compute remaining schedule delay from now
    let scheduleDelay = "";
    let scheduleUnit: "seconds" | "minutes" | "hours" = "minutes";
    if (n.scheduled_at) {
      const diffMs = new Date(n.scheduled_at).getTime() - Date.now();
      if (diffMs > 0) {
        const diffSecs = Math.round(diffMs / 1000);
        if (diffSecs >= 3600 && diffSecs % 3600 === 0) {
          scheduleDelay = String(diffSecs / 3600);
          scheduleUnit = "hours";
        } else if (diffSecs >= 60 && diffSecs % 60 === 0) {
          scheduleDelay = String(diffSecs / 60);
          scheduleUnit = "minutes";
        } else {
          scheduleDelay = String(diffSecs);
          scheduleUnit = "seconds";
        }
      }
    }
    setForm({
      title: n.title,
      message: n.message,
      target_type: n.target_type,
      target_value: n.target_value,
      branch_id: n.branch_id,
      status: n.status,
      scheduleDelay,
      scheduleUnit,
    });
    setFormError(null);
    setShowEditModal(true);
  }

  function openViewModal(n: Notification) {
    setSelectedNotification(n);
    setShowViewModal(true);
  }

  async function openDeleteModal(n: Notification) {
    setSelectedNotification(n);
    // draft/scheduled → no references (hard delete), active/inactive → has references (deactivate)
    setNotificationHasReferences(["active", "inactive"].includes(n.status));
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

      // Compute scheduled_at from delay + unit
      let scheduledAt: string | null = null;
      if (form.scheduleDelay && Number(form.scheduleDelay) > 0) {
        const delay = Number(form.scheduleDelay);
        const multiplier = form.scheduleUnit === "seconds" ? 1000 : form.scheduleUnit === "minutes" ? 60000 : 3600000;
        scheduledAt = new Date(Date.now() + delay * multiplier).toISOString();
      }

      await notificationsApi.create({
        title: form.title.trim(),
        message: form.message.trim(),
        target_type: form.target_type,
        target_value: effectiveTargetValue.trim(),
        branch_id: effectiveBranchId,
        scheduled_at: scheduledAt,
      });
      showToast.success(scheduledAt ? "Notification scheduled" : "Notification created as draft");
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

      // Compute scheduled_at from delay + unit (only for draft/scheduled)
      const updatePayload: Record<string, unknown> = {
        title: form.title.trim(),
        message: form.message.trim(),
        target_type: form.target_type,
        target_value: form.target_value.trim(),
      };

      // Send status if it was changed
      if (form.status && form.status !== selectedNotification.status) {
        updatePayload.status = form.status;
      }

      if (selectedNotification && ["draft", "scheduled"].includes(selectedNotification.status)) {
        let scheduledAt: string | null = null;
        if (form.scheduleDelay && Number(form.scheduleDelay) > 0) {
          const delay = Number(form.scheduleDelay);
          const multiplier = form.scheduleUnit === "seconds" ? 1000 : form.scheduleUnit === "minutes" ? 60000 : 3600000;
          scheduledAt = new Date(Date.now() + delay * multiplier).toISOString();
        }
        updatePayload.scheduled_at = scheduledAt;
      }

      await notificationsApi.update(selectedNotification.id, updatePayload as Parameters<typeof notificationsApi.update>[1]);
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
      const result = await notificationsApi.delete(selectedNotification.id);
      setShowDeleteModal(false);
      const isDeactivated = result.message?.toLowerCase().includes("deactivated");
      showToast.success(isDeactivated ? "Notification deactivated successfully" : "Notification deleted successfully");
      fetchData();
    } catch (err) {
      const failMsg = notificationHasReferences ? "Failed to deactivate notification" : "Failed to delete notification";
      showToast.error(err instanceof Error ? err.message : failMsg);
    } finally {
      setDeleting(false);
    }
  }

  async function handleSend(n: Notification) {
    try {
      setSending(true);
      await notificationsApi.send(n.id);
      showToast.success("Notification sent successfully");
      setOpenDropdownId(null);
      fetchData();
      window.dispatchEvent(new Event("notification-schedule-complete"));
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : "Failed to send notification");
    } finally {
      setSending(false);
    }
  }

  function openScheduleModal(n: Notification) {
    setSelectedNotification(n);
    // Pre-populate remaining delay from now
    let scheduleDelay = "";
    let scheduleUnit: "seconds" | "minutes" | "hours" = "minutes";
    if (n.scheduled_at) {
      const diffMs = new Date(n.scheduled_at).getTime() - Date.now();
      if (diffMs > 0) {
        const diffSecs = Math.round(diffMs / 1000);
        if (diffSecs >= 3600 && diffSecs % 3600 === 0) {
          scheduleDelay = String(diffSecs / 3600);
          scheduleUnit = "hours";
        } else if (diffSecs >= 60 && diffSecs % 60 === 0) {
          scheduleDelay = String(diffSecs / 60);
          scheduleUnit = "minutes";
        } else {
          scheduleDelay = String(diffSecs);
          scheduleUnit = "seconds";
        }
      }
    }
    setScheduleForm({ scheduleDelay, scheduleUnit });
    setOpenDropdownId(null);
    setShowScheduleModal(true);
  }

  async function handleScheduleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedNotification) return;
    setFormError(null);

    let scheduledAt: string | null = null;
    if (scheduleForm.scheduleDelay && Number(scheduleForm.scheduleDelay) > 0) {
      const delay = Number(scheduleForm.scheduleDelay);
      const multiplier = scheduleForm.scheduleUnit === "seconds" ? 1000 : scheduleForm.scheduleUnit === "minutes" ? 60000 : 3600000;
      scheduledAt = new Date(Date.now() + delay * multiplier).toISOString();
    }

    try {
      setSaving(true);
      await notificationsApi.update(selectedNotification.id, { scheduled_at: scheduledAt });
      showToast.success(scheduledAt ? "Schedule updated" : "Schedule removed (now draft)");
      setShowScheduleModal(false);
      fetchData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to update schedule");
    } finally {
      setSaving(false);
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

  const statusConfig: Record<string, { label: string; className: string }> = {
    draft: { label: "Draft", className: "bg-neutral-100 text-neutral-900" },
    scheduled: { label: "Scheduled", className: "bg-primary-100 text-primary" },
    active: { label: "Active", className: "bg-positive-100 text-positive-950" },
    inactive: { label: "Inactive", className: "bg-negative-100 text-negative-950" },
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

  // Shared schedule configuration JSX for Create/Edit modals
  const scheduleSection = (
    <ModalSection title="Schedule">
      <div className="flex gap-3">
        <div className="flex-1">
          <input
            type="number"
            min="0"
            value={form.scheduleDelay}
            onChange={(e) => setForm({ ...form, scheduleDelay: e.target.value })}
            placeholder="Send delay (e.g. 1)"
            className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all"
          />
        </div>
        <div className="w-36">
          <ModalSelect
            value={form.scheduleUnit}
            onChange={(v) => setForm({ ...form, scheduleUnit: v as "seconds" | "minutes" | "hours" })}
            options={[
              { value: "seconds", label: "Seconds" },
              { value: "minutes", label: "Minutes" },
              { value: "hours", label: "Hours" },
            ]}
          />
        </div>
      </div>
    </ModalSection>
  );

  if (loading) {
    return <SkeletonLoader showHeader showStats statsCount={3} rows={6} />;
  }

  if (error) {
    return <ErrorAlert message={error} onRetry={fetchData} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        subtitle="Summary of notifications"
        buttonLabel="Create Notification"
        onAdd={openAddModal}
        showButton={canCreate}
      />

      <StatsCards cards={[
        { icon: LuBell, iconBg: "bg-primary-100", iconColor: "text-primary", label: "All Notifications", value: stats.total },
        { icon: LuBell, iconBg: "bg-primary-100", iconColor: "text-positive", label: "Active", value: stats.active },
        { icon: LuBellOff, iconBg: "bg-negative-100", iconColor: "text-negative", label: "Inactive", value: stats.inactive },
      ] as StatCard[]} />

      {/* Table Section */}
      <div className="bg-white border border-neutral-200 rounded-xl">
        <TableSearchFilter
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search"
          primaryFilter={{
            key: "status",
            label: "Status",
            value: filterStatus,
            options: [
              { value: "all", label: "All Status" },
              { value: "draft", label: "Draft" },
              { value: "scheduled", label: "Scheduled" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ],
            onChange: (v) => { setFilterStatus(v); setCurrentPage(1); },
          }}
          advancedFilters={[
            {
              key: "targetType",
              label: "Target Type",
              value: filterTargetType,
              options: [
                { value: "all", label: "All Target Types" },
                { value: "role", label: "Role" },
                { value: "user", label: "User" },
                { value: "branch", label: "Branch" },
              ],
              onChange: (v) => { setFilterTargetType(v); setCurrentPage(1); },
            },
            {
              key: "branch",
              label: "Branch",
              value: filterBranch,
              options: [
                { value: "all", label: "All Branches" },
                ...branches.map((b) => ({ value: b.id, label: b.name })),
              ],
              onChange: (v) => { setFilterBranch(v); setCurrentPage(1); },
            },
          ]}
          onApply={fetchData}
          onReset={handleResetFilters}
          onRefresh={fetchData}
          loading={loading}
        />

        {/* Mobile Card View */}
        <MobileCardList
          isEmpty={paginatedNotifications.length === 0}
          emptyMessage={
            searchQuery || filterStatus !== "all" || filterTargetType !== "all" || filterBranch !== "all"
              ? "No notifications match your filters."
              : "No notifications found. Click \"Create Notification\" to create one."
          }
        >
          {paginatedNotifications.map((n) => {
            const canEditThis = canEdit && n.notification_type === "manual";
            const canDeleteThis = canDelete;
            const canSend = canEdit && ["draft", "scheduled"].includes(n.status);
            const canSchedule = canEdit && ["draft", "scheduled"].includes(n.status);
            const actions: MobileCardAction[] = [];
            if (canSend) actions.push({ label: "Send Now", icon: <LuSend className="w-4 h-4" />, onClick: () => handleSend(n) });
            if (canSchedule) actions.push({ label: "Schedule", icon: <LuClock className="w-4 h-4" />, onClick: () => openScheduleModal(n) });
            if (canEditThis) actions.push({ label: "Edit", icon: <LuPencil className="w-4 h-4" />, onClick: () => openEditModal(n) });
            if (canDeleteThis) actions.push({ label: "Delete", icon: <LuTrash2 className="w-4 h-4" />, onClick: () => openDeleteModal(n), className: "flex items-center gap-1 text-sm text-negative hover:text-negative-900" });
            const badge = statusConfig[n.status] || statusConfig.draft;
            return (
              <MobileCard
                key={n.id}
                onClick={() => openViewModal(n)}
                icon={<LuBell className="w-5 h-5 text-primary" />}
                title={n.title}
                subtitle={targetTypeLabel[n.target_type] || n.target_type}
                statusBadge={{
                  label: badge.label,
                  className: badge.className,
                }}
                details={
                  <>
                    <p className="text-neutral-900">{new Date(n.created_at).toLocaleDateString()}</p>
                    <p className="text-neutral-900 line-clamp-2">{n.message}</p>
                  </>
                }
                actions={actions}
              />
            );
          })}
        </MobileCardList>

        {/* Desktop Table View */}
        <DesktopTable
          columns={[
            { label: "Title" },
            { label: "Target" },
            { label: "Branch" },
            { label: "Type" },
            { label: "Status" },
            { label: "Actions", align: "center" },
          ] as DesktopTableColumn[]}
          isEmpty={paginatedNotifications.length === 0}
          emptyMessage={
            searchQuery || filterStatus !== "all" || filterTargetType !== "all" || filterBranch !== "all"
              ? "No notifications match your filters."
              : "No notifications found. Click \"Create Notification\" to create one."
          }
        >
          {paginatedNotifications.map((n) => {
            const badge = statusConfig[n.status] || statusConfig.draft;
            const canEditThis = canEdit && n.notification_type === "manual";
            const canDeleteThis = canDelete;
            const canSend = canEdit && ["draft", "scheduled"].includes(n.status);
            const canSchedule = canEdit && ["draft", "scheduled"].includes(n.status);
            const hasActions = canEditThis || canDeleteThis || canSend || canSchedule;

            return (
            <DesktopTableRow key={n.id} onClick={() => openViewModal(n)}>
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
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${n.notification_type === "system"
                    ? "bg-positive-100 text-positive-950"
                    : "bg-primary-100 text-primary"
                  }`}>
                  {n.notification_type === "system" ? "System" : "Manual"}
                </span>
              </td>
              <td className="py-3 px-4 whitespace-nowrap">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${badge.className}`}>
                  {badge.label}
                </span>
              </td>
              <td className="py-3 px-4 whitespace-nowrap">
                <div className="flex items-center justify-center gap-1">
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
                      title={["draft", "scheduled"].includes(n.status) ? "Delete notification" : "Deactivate notification"}
                    >
                      <LuTrash2 className="w-4 h-4" />
                    </button>
                  )}
                  {hasActions && (canSend || canSchedule) && (
                    <div className="relative" ref={openDropdownId === n.id ? dropdownRef : undefined}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenDropdownId(openDropdownId === n.id ? null : n.id);
                        }}
                        className="p-2 text-neutral-900 hover:text-neutral-950 hover:bg-neutral-100 rounded-lg transition-colors"
                        title="More actions"
                      >
                        <LuEllipsisVertical className="w-4 h-4" />
                      </button>
                      {openDropdownId === n.id && (
                        <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-neutral-200 rounded-xl shadow-lg z-50 py-1">
                          {canSend && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleSend(n); }}
                              disabled={sending}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors"
                            >
                              <LuSend className="w-4 h-4" />
                              {sending ? "Sending..." : "Send Now"}
                            </button>
                          )}
                          {canSchedule && (
                            <button
                              onClick={(e) => { e.stopPropagation(); openScheduleModal(n); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors"
                            >
                              <LuClock className="w-4 h-4" />
                              Edit Schedule
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {!hasActions && (
                    <button
                      onClick={(e) => { e.stopPropagation(); openViewModal(n); }}
                      className="p-2 text-positive-950 hover:text-positive-900 rounded-lg transition-colors"
                      title="View notification"
                    >
                      <LuEye className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </td>
            </DesktopTableRow>
            );
          })}
        </DesktopTable>

        <Pagination
          variant="table"
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={filteredNotifications.length}
          itemsPerPage={ITEMS_PER_PAGE}
          entityName="notifications"
        />
      </div>

      {/* Create Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Create Notification" maxWidth="xl">
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

          {scheduleSection}

          <ModalError message={formError} />
          <ModalButtons
            onCancel={() => setShowAddModal(false)}
            submitText={saving ? "Creating..." : "Create Notification"}
            loading={saving}
          />
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Notification" maxWidth="xl">
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

          {selectedNotification && ["draft", "scheduled"].includes(selectedNotification.status) && scheduleSection}

          {selectedNotification && ["active", "inactive"].includes(selectedNotification.status) && (
            <ModalSection title="Status">
              <ModalSelect
                value={form.status}
                onChange={(v) => setForm({ ...form, status: v })}
                options={[
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ]}
              />
            </ModalSection>
          )}

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
        maxWidth="xl"
      >
        {selectedNotification && (
          <div>
            <ModalSection title="Notification Information">
              <ModalInput
                type="text"
                value={selectedNotification.title}
                onChange={() => { }}
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
                  onChange={() => { }}
                  options={[
                    { value: "system", label: "System" },
                    { value: "manual", label: "Manual" },
                  ]}
                  disabled
                />
                <ModalSelect
                  value={selectedNotification.status}
                  onChange={() => { }}
                  options={[
                    { value: "draft", label: "Draft" },
                    { value: "scheduled", label: "Scheduled" },
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
                onChange={() => { }}
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
                onChange={() => { }}
                placeholder="Target Value"
                disabled
              />
              <ModalInput
                type="text"
                value={selectedNotification.branches?.name || getBranchName(selectedNotification.branch_id)}
                onChange={() => { }}
                placeholder="Branch"
                disabled
              />
            </ModalSection>

            <ModalSection title="Additional Details">
              <ModalInput
                type="text"
                value={new Date(selectedNotification.created_at).toLocaleString()}
                onChange={() => { }}
                placeholder="Created At"
                disabled
              />
              {selectedNotification.scheduled_at && (
                <ModalInput
                  type="text"
                  value={new Date(selectedNotification.scheduled_at).toLocaleString()}
                  onChange={() => { }}
                  placeholder="Scheduled At"
                  disabled
                />
              )}
              {selectedNotification.reference_type && (
                <ModalInput
                  type="text"
                  value={`${selectedNotification.reference_type} – ${selectedNotification.reference_id}`}
                  onChange={() => { }}
                  placeholder="Reference"
                  disabled
                />
              )}
            </ModalSection>
          </div>
        )}
      </Modal>

      {/* Delete / Deactivate Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal && !!selectedNotification}
        onClose={() => setShowDeleteModal(false)}
        title={notificationHasReferences ? "Deactivate Notification" : "Delete Notification"}
        maxWidth="sm"
      >
        {selectedNotification && (
          <div>
            <div className="bg-neutral-100 rounded-xl p-4 my-4">
              <p className="text-neutral-900">
                {notificationHasReferences
                  ? <>Are you sure you want to deactivate <strong className="text-neutral-950">{selectedNotification.title}</strong>?</>
                  : <>Are you sure you want to delete <strong className="text-neutral-950">{selectedNotification.title}</strong>?</>
                }
              </p>
            </div>
            <p className="text-sm text-neutral-900 mb-2">
              {notificationHasReferences
                ? "This notification has been sent to users and will be set to inactive instead of deleted."
                : "This action cannot be undone. The notification will be permanently removed."
              }
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
                disabled={deleting || checkingReferences}
                className="flex-1 px-4 py-3.5 bg-negative text-white rounded-xl font-semibold hover:bg-negative-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {checkingReferences
                  ? "Checking..."
                  : deleting
                    ? (notificationHasReferences ? "Deactivating..." : "Deleting...")
                    : (notificationHasReferences ? "Deactivate" : "Delete")
                }
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Schedule Edit Modal */}
      <Modal
        isOpen={showScheduleModal && !!selectedNotification}
        onClose={() => setShowScheduleModal(false)}
        title="Edit Schedule"
        maxWidth="xl"
      >
        {selectedNotification && (
          <form onSubmit={handleScheduleUpdate}>
            <ModalSection title="Schedule">
              <div className="flex gap-3">
                <div className="flex-1">
                  <input
                    type="number"
                    min="0"
                    value={scheduleForm.scheduleDelay}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, scheduleDelay: e.target.value })}
                    placeholder="Send delay (e.g. 1)"
                    className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                  />
                </div>
                <div className="w-36">
                  <ModalSelect
                    value={scheduleForm.scheduleUnit}
                    onChange={(v) => setScheduleForm({ ...scheduleForm, scheduleUnit: v as "seconds" | "minutes" | "hours" })}
                    options={[
                      { value: "seconds", label: "Seconds" },
                      { value: "minutes", label: "Minutes" },
                      { value: "hours", label: "Hours" },
                    ]}
                  />
                </div>
              </div>
            </ModalSection>
            <ModalError message={formError} />
            <ModalButtons
              onCancel={() => setShowScheduleModal(false)}
              submitText={saving ? "Saving..." : "Update Schedule"}
              loading={saving}
            />
          </form>
        )}
      </Modal>
    </div>
  );
}
