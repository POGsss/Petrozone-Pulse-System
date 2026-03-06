import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  LuPencil,
  LuTrash2,
  LuSend,
  LuClock,
  LuBan,
  LuEllipsisVertical,
} from "react-icons/lu";
import { showToast } from "../../lib/toast";
import { serviceRemindersApi, customersApi, vehiclesApi, branchesApi } from "../../lib/api";
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
import type { StatCard, DesktopTableColumn } from "../../components";
import { useAuth } from "../../auth";
import type { Branch, Customer, Vehicle, ServiceReminder } from "../../types";

const ITEMS_PER_PAGE = 10;

export function ServiceReminderManagement() {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<ServiceReminder[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [filteredVehicles, setFilteredVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  // Search, filters & pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterMethod, setFilterMethod] = useState<string>("all");
  const [filterBranch, setFilterBranch] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [selectedReminder, setSelectedReminder] = useState<ServiceReminder | null>(null);

  // Form state
  const [form, setForm] = useState({
    customer_id: "",
    vehicle_id: "",
    service_type: "", // Used as "Subject" in UI
    scheduled_at: "",
    delivery_method: "email" as string,
    message_template: "",
    status: "draft" as string,
  });

  const userRoles = user?.roles || [];
  const canCreate = userRoles.some((r) => ["POC", "JS", "R"].includes(r));
  const canEdit = canCreate;
  const canDelete = canCreate;
  const canSend = canCreate;
  const isHM = userRoles.includes("HM");

  // Batch process state
  const [processingScheduled, setProcessingScheduled] = useState(false);
  const [showProcessConfirm, setShowProcessConfirm] = useState(false);

  async function handleProcessScheduled() {
    try {
      setProcessingScheduled(true);
      setShowProcessConfirm(false);
      const result = await serviceRemindersApi.processScheduled();
      showToast.success(
        `Processed ${result.processed} reminder${result.processed !== 1 ? "s" : ""}: ${result.sent} sent, ${result.failed} failed`
      );
      fetchData();
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : "Failed to process scheduled reminders");
    } finally {
      setProcessingScheduled(false);
    }
  }

  // Actions overflow dropdown
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const closeDropdown = useCallback(() => setOpenDropdownId(null), []);
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

  // Stats
  const stats = useMemo(() => {
    return {
      total: totalCount,
      draft: reminders.filter((r) => r.status === "draft").length,
      scheduled: reminders.filter((r) => r.status === "scheduled").length,
      sent: reminders.filter((r) => r.status === "sent").length,
      failed: reminders.filter((r) => r.status === "failed").length,
    };
  }, [reminders, totalCount]);

  // Filtered
  const filteredReminders = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return reminders.filter((r) => {
      const matchSearch =
        !q ||
        r.service_type.toLowerCase().includes(q) ||
        r.message_template.toLowerCase().includes(q) ||
        r.customers?.full_name?.toLowerCase().includes(q) ||
        r.vehicles?.plate_number?.toLowerCase().includes(q);
      const matchStatus = filterStatus === "all" || r.status === filterStatus;
      const matchMethod = filterMethod === "all" || r.delivery_method === filterMethod;
      const matchBranch = filterBranch === "all" || r.branch_id === filterBranch;
      return matchSearch && matchStatus && matchMethod && matchBranch;
    });
  }, [reminders, searchQuery, filterStatus, filterMethod, filterBranch]);

  const totalPages = Math.ceil(filteredReminders.length / ITEMS_PER_PAGE);
  const paginatedReminders = filteredReminders.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterStatus, filterMethod, filterBranch]);

  // Filter vehicles when customer changes in form
  useEffect(() => {
    if (form.customer_id) {
      setFilteredVehicles(vehicles.filter((v) => v.customer_id === form.customer_id));
    } else {
      setFilteredVehicles([]);
    }
  }, [form.customer_id, vehicles]);

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);
      const [reminderData, branchData, customerData, vehicleData] = await Promise.all([
        serviceRemindersApi.getAll({ limit: 500 }),
        branchesApi.getAll(),
        customersApi.getAll({ limit: 500 }),
        vehiclesApi.getAll({ limit: 500 }),
      ]);
      setReminders(reminderData.data || []);
      setTotalCount(reminderData.pagination?.total || 0);
      setBranches(branchData);
      setCustomers(customerData.data || []);
      setVehicles(vehicleData.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setForm({
      customer_id: "",
      vehicle_id: "",
      service_type: "",
      scheduled_at: "",
      delivery_method: "email",
      message_template: "",
      status: "draft",
    });
    setFormError(null);
  }

  function openAddModal() {
    resetForm();
    setShowAddModal(true);
  }

  function openEditModal(r: ServiceReminder) {
    setSelectedReminder(r);
    setForm({
      customer_id: r.customer_id,
      vehicle_id: r.vehicle_id,
      service_type: r.service_type,
      scheduled_at: r.scheduled_at ? new Date(r.scheduled_at).toISOString().slice(0, 16) : "",
      delivery_method: r.delivery_method,
      message_template: r.message_template,
      status: r.status,
    });
    setFormError(null);
    setShowEditModal(true);
  }

  function openViewModal(r: ServiceReminder) {
    setSelectedReminder(r);
    setShowViewModal(true);
  }

  function openDeleteModal(r: ServiceReminder) {
    setSelectedReminder(r);
    setShowDeleteModal(true);
  }

  function openSendModal(r: ServiceReminder) {
    setSelectedReminder(r);
    setShowSendModal(true);
  }

  function openCancelModal(r: ServiceReminder) {
    setSelectedReminder(r);
    setShowCancelModal(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!form.customer_id) { setFormError("Customer is required"); return; }
    if (!form.vehicle_id) { setFormError("Vehicle is required"); return; }
    if (!form.service_type.trim()) { setFormError("Subject is required"); return; }
    if (!form.scheduled_at) { setFormError("Scheduled date is required"); return; }
    if (!form.message_template.trim()) { setFormError("Message is required"); return; }

    // Auto-derive branch from selected customer
    const selectedCustomer = customers.find((c) => c.id === form.customer_id);
    const branchId = selectedCustomer?.branch_id || user?.branches?.[0]?.branch_id || "";
    if (!branchId) { setFormError("Could not determine branch"); return; }

    try {
      setSaving(true);
      await serviceRemindersApi.create({
        customer_id: form.customer_id,
        vehicle_id: form.vehicle_id,
        service_type: form.service_type.trim(),
        scheduled_at: new Date(form.scheduled_at).toISOString(),
        delivery_method: form.delivery_method,
        message_template: form.message_template.trim(),
        branch_id: branchId,
        status: form.status,
      });
      showToast.success("Service reminder created");
      setShowAddModal(false);
      fetchData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create reminder");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedReminder) return;
    setFormError(null);

    try {
      setSaving(true);
      await serviceRemindersApi.update(selectedReminder.id, {
        customer_id: form.customer_id,
        vehicle_id: form.vehicle_id,
        service_type: form.service_type.trim(),
        scheduled_at: new Date(form.scheduled_at).toISOString(),
        delivery_method: form.delivery_method,
        message_template: form.message_template.trim(),
        status: form.status,
      });
      showToast.success("Service reminder updated");
      setShowEditModal(false);
      fetchData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to update reminder");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedReminder) return;
    try {
      setDeleting(true);
      await serviceRemindersApi.delete(selectedReminder.id);
      showToast.success("Service reminder deleted");
      setShowDeleteModal(false);
      fetchData();
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  async function handleSend() {
    if (!selectedReminder) return;
    try {
      setSending(true);
      await serviceRemindersApi.send(selectedReminder.id);
      showToast.success("Reminder sent successfully");
      setShowSendModal(false);
      fetchData();
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : "Failed to send reminder");
    } finally {
      setSending(false);
    }
  }

  async function handleCancel() {
    if (!selectedReminder) return;
    try {
      setSending(true);
      await serviceRemindersApi.cancel(selectedReminder.id);
      showToast.success("Reminder cancelled");
      setShowCancelModal(false);
      fetchData();
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : "Failed to cancel");
    } finally {
      setSending(false);
    }
  }

  function handleResetFilters() {
    setSearchQuery("");
    setFilterStatus("all");
    setFilterMethod("all");
    setFilterBranch("all");
  }

  const statusConfig: Record<string, { label: string; className: string }> = {
    draft: { label: "Draft", className: "bg-neutral-100 text-neutral-950" },
    scheduled: { label: "Scheduled", className: "bg-positive-100 text-blue-950" },
    sent: { label: "Sent", className: "bg-positive-50 text-positive-950" },
    failed: { label: "Failed", className: "bg-negative-50 text-negative-950" },
    cancelled: { label: "Cancelled", className: "bg-negative-100 text-negative-950" },
  };

  // Form fields JSX (reused for create & edit)
  const formFields = (
    <>
      <ModalSection title="Customer & Vehicle">
        <ModalSelect
          value={form.customer_id}
          onChange={(v) => setForm({ ...form, customer_id: v, vehicle_id: "" })}
          options={customers.map((c) => ({ value: c.id, label: `${c.full_name}${c.contact_number ? ` (${c.contact_number})` : ""}` }))}
          placeholder="Select Customer *"
        />
        <ModalSelect
          value={form.vehicle_id}
          onChange={(v) => setForm({ ...form, vehicle_id: v })}
          options={filteredVehicles.map((v) => ({ value: v.id, label: `${v.plate_number} – ${v.model}` }))}
          placeholder={form.customer_id ? "Select Vehicle *" : "Select a customer first"}
        />
      </ModalSection>

      <ModalSection title="Message Details">
        <ModalInput
          value={form.service_type}
          onChange={(v) => setForm({ ...form, service_type: v })}
          placeholder="Subject *"
          required
        />
        <textarea
          value={form.message_template}
          onChange={(e) => setForm({ ...form, message_template: e.target.value })}
          placeholder="Message *"
          rows={3}
          className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
        />
        <div className="grid grid-cols-2 gap-4">
          <ModalSelect
            value={form.delivery_method}
            onChange={(v) => setForm({ ...form, delivery_method: v })}
            options={[
              { value: "email", label: "Email" },
              { value: "sms", label: "SMS" },
            ]}
            placeholder="Reminder Type *"
          />
          <ModalInput
            type="date"
            value={form.scheduled_at}
            onChange={(v) => setForm({ ...form, scheduled_at: v })}
            placeholder="Scheduled Date *"
            required
          />
        </div>
        <ModalSelect
          value={form.status}
          onChange={(v) => setForm({ ...form, status: v })}
          options={[
            { value: "draft", label: "Draft" },
            { value: "scheduled", label: "Scheduled" },
          ]}
          placeholder="Status"
        />
      </ModalSection>
    </>
  );

  if (loading) {
    return <SkeletonLoader showHeader showStats statsCount={3} rows={5} />;
  }

  if (error) {
    return <ErrorAlert message={error} onRetry={fetchData} />;
  }

  return (
    <div className="space-y-6">
      {/* Header with title and add button */}
      <PageHeader
        title="Service Reminders"
        subtitle="Summary of service reminders"
        buttonLabel="Create Reminder"
        onAdd={openAddModal}
        showButton={canCreate}
      />

      {/* Summary Stats Cards */}
      <StatsCards
        cards={[
          { icon: LuClock, iconBg: "bg-primary-100", iconColor: "text-primary", label: "Total", value: stats.total },
          { icon: LuPencil, iconBg: "bg-positive-200", iconColor: "text-positive-950", label: "Draft", value: stats.draft },
          { icon: LuClock, iconBg: "bg-negative-100", iconColor: "text-negative-950", label: "Scheduled", value: stats.scheduled },
        ] satisfies StatCard[]}
      />

      {/* Table Section */}
      <div className="bg-white border border-neutral-200 rounded-xl">
        {/* Table Header with Search and Filters */}
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
              { value: "sent", label: "Sent" },
              { value: "failed", label: "Failed" },
              { value: "cancelled", label: "Cancelled" },
            ],
            onChange: (v) => { setFilterStatus(v); setCurrentPage(1); },
          }}
          advancedFilters={[
            {
              key: "method",
              label: "Delivery Method",
              value: filterMethod,
              options: [
                { value: "all", label: "All Methods" },
                { value: "email", label: "Email" },
                { value: "sms", label: "SMS" },
              ],
              onChange: (v) => { setFilterMethod(v); setCurrentPage(1); },
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
          extraButtons={
            isHM ? (
              <button
                onClick={() => setShowProcessConfirm(true)}
                disabled={processingScheduled}
                className="p-2 border border-neutral-200 rounded-lg text-neutral-950 hover:bg-neutral-100 disabled:opacity-50"
                title="Send all scheduled reminders that are due"
              >
                <LuSend className={`w-4 h-4 ${processingScheduled ? "animate-pulse" : ""}`} />
              </button>
            ) : undefined
          }
        />

        {/* Mobile Card View */}
        <MobileCardList
          isEmpty={paginatedReminders.length === 0}
          emptyMessage={
            searchQuery || filterStatus !== "all" || filterMethod !== "all" || filterBranch !== "all"
              ? "No reminders match your filters."
              : 'No reminders found. Click "Create Reminder" to create one.'
          }
        >
            {paginatedReminders.map((r) => {
              const sc = statusConfig[r.status] || statusConfig.draft;
              const canEditThis = canEdit && ["draft", "scheduled", "failed"].includes(r.status);
              const canDeleteThis = canDelete && ["draft", "scheduled", "failed"].includes(r.status);
              const canSendThis = canSend && ["draft", "scheduled", "failed"].includes(r.status);
              const canCancelThis = canEdit && ["draft", "scheduled"].includes(r.status);
              const showDots = canSendThis || canCancelThis;
              const hasActions = canEditThis || canDeleteThis || showDots;
              return (
                <MobileCard
                  key={r.id}
                  onClick={() => openViewModal(r)}
                  icon={<LuClock className="w-5 h-5 text-primary" />}
                  title={r.customers?.full_name || "—"}
                  subtitle={r.branches?.name || "—"}
                  statusBadge={{ label: sc.label, className: sc.className }}
                  details={
                    <>
                      <p>{r.service_type}</p>
                      <p className="text-neutral-900">{r.vehicles?.plate_number || "—"}</p>
                      <p className="text-neutral-900">{r.delivery_method === "email" ? "Email" : "SMS"}</p>
                      <p className="text-neutral-900">{new Date(r.scheduled_at).toLocaleString()}</p>
                    </>
                  }
                  extraActions={
                    hasActions ? (
                      <>
                        {canEditThis && (
                          <button
                            onClick={(e) => { e.stopPropagation(); openEditModal(r); }}
                            className="flex items-center gap-1 text-sm text-primary hover:text-primary-900"
                          >
                            <LuPencil className="w-4 h-4" /> Edit
                          </button>
                        )}
                        {canDeleteThis && (
                          <button
                            onClick={(e) => { e.stopPropagation(); openDeleteModal(r); }}
                            className="flex items-center gap-1 text-sm text-negative hover:text-negative-900"
                          >
                            <LuTrash2 className="w-4 h-4" /> Delete
                          </button>
                        )}
                        {showDots && (
                          <div className="relative" ref={openDropdownId === `card-${r.id}` ? dropdownRef : undefined}>
                            <button
                              onClick={(e) => { e.stopPropagation(); setOpenDropdownId(openDropdownId === `card-${r.id}` ? null : `card-${r.id}`); }}
                              className="flex items-center gap-1 text-sm text-neutral-950 hover:text-neutral-900"
                              title="More actions"
                            >
                              <LuEllipsisVertical className="w-4 h-4" /> More
                            </button>
                            {openDropdownId === `card-${r.id}` && (
                              <div className="absolute right-0 mt-2 w-52 bg-white rounded-lg border border-neutral-200 py-2 z-50">
                                {canSendThis && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); closeDropdown(); openSendModal(r); }}
                                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors"
                                  >
                                    <LuSend className="w-4 h-4" /> Send Reminder
                                  </button>
                                )}
                                {canCancelThis && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); closeDropdown(); openCancelModal(r); }}
                                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors"
                                  >
                                    <LuBan className="w-4 h-4" /> Cancel Reminder
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    ) : undefined
                  }
                />
              );
            })}
        </MobileCardList>

        {/* Desktop Table View */}
        <DesktopTable
          columns={[
            { label: "Customer" },
            { label: "Subject" },
            { label: "Scheduled" },
            { label: "Method" },
            { label: "Status" },
            { label: "Actions", align: "center" },
          ] as DesktopTableColumn[]}
          isEmpty={paginatedReminders.length === 0}
          emptyMessage={
            searchQuery || filterStatus !== "all" || filterMethod !== "all" || filterBranch !== "all"
              ? "No reminders match your filters."
              : "No reminders found. Click \"Create Reminder\" to create one."
          }
        >
              {paginatedReminders.map((r) => {
                const sc = statusConfig[r.status] || statusConfig.draft;
                const canEditThis = canEdit && ["draft", "scheduled", "failed"].includes(r.status);
                const canDeleteThis = canDelete && ["draft", "scheduled", "failed"].includes(r.status);
                const canSendThis = canSend && ["draft", "scheduled", "failed"].includes(r.status);
                const canCancelThis = canEdit && ["draft", "scheduled"].includes(r.status);
                const showDots = canSendThis || canCancelThis;
                return (
                  <DesktopTableRow key={r.id} onClick={() => openViewModal(r)}>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-medium text-neutral-900">{r.customers?.full_name || "—"}</span>
                    </td>
                    <td className="py-3 px-4 text-sm text-neutral-900 whitespace-nowrap">{r.service_type}</td>
                    <td className="py-3 px-4 text-sm text-neutral-900 whitespace-nowrap">
                      {new Date(r.scheduled_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium bg-primary-100 text-primary`}>
                        {r.delivery_method.toLocaleLowerCase() === "email" ? "Email" : "SMS"}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${sc.className}`}>
                        {sc.label}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center justify-center gap-2">
                        {canEditThis && (
                          <button
                            onClick={(e) => { e.stopPropagation(); openEditModal(r); }}
                            className="p-2 text-primary-950 hover:text-primary-900 hover:bg-primary-50 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <LuPencil className="w-4 h-4" />
                          </button>
                        )}
                        {canDeleteThis && (
                          <button
                            onClick={(e) => { e.stopPropagation(); openDeleteModal(r); }}
                            className="p-2 text-negative-950 hover:text-negative-900 hover:bg-negative-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <LuTrash2 className="w-4 h-4" />
                          </button>
                        )}
                        {/* More actions dropdown */}
                        {showDots && (
                          <div className="relative" ref={openDropdownId === `table-${r.id}` ? dropdownRef : undefined}>
                            <button
                              onClick={(e) => { e.stopPropagation(); setOpenDropdownId(openDropdownId === `table-${r.id}` ? null : `table-${r.id}`); }}
                              className="p-2 text-neutral-950 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
                              title="More actions"
                            >
                              <LuEllipsisVertical className="w-4 h-4" />
                            </button>
                            {openDropdownId === `table-${r.id}` && (
                              <div className="absolute right-0 mt-2 w-52 bg-white rounded-lg border border-neutral-200 py-2 z-50">
                                {canSendThis && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); closeDropdown(); openSendModal(r); }}
                                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors"
                                  >
                                    <LuSend className="w-4 h-4" /> Send Reminder
                                  </button>
                                )}
                                {canCancelThis && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); closeDropdown(); openCancelModal(r); }}
                                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors"
                                  >
                                    <LuBan className="w-4 h-4" /> Cancel Reminder
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </DesktopTableRow>
                );
              })}
        </DesktopTable>

        {/* Pagination */}
        <Pagination
          variant="table"
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredReminders.length}
          itemsPerPage={ITEMS_PER_PAGE}
          entityName="reminders"
          onPageChange={setCurrentPage}
        />
      </div>

      {/* Create Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Create Service Reminder" maxWidth="lg">
        <form onSubmit={handleCreate}>
          {formFields}
          <ModalError message={formError} />
          <ModalButtons
            onCancel={() => setShowAddModal(false)}
            submitText={saving ? "Creating..." : "Create Reminder"}
            loading={saving}
          />
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Service Reminder" maxWidth="lg">
        <form onSubmit={handleUpdate}>
          {formFields}
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
        isOpen={showViewModal && !!selectedReminder}
        onClose={() => setShowViewModal(false)}
        title="Service Reminder Details"
        maxWidth="lg"
      >
        {selectedReminder && (
          <div>
            <ModalSection title="Customer & Vehicle">
              <ModalInput
                type="text"
                value={selectedReminder.customers?.full_name || "—"}
                onChange={() => {}}
                placeholder="Customer"
                disabled
              />
              <ModalInput
                type="text"
                value={`${selectedReminder.vehicles?.plate_number || "—"} – ${selectedReminder.vehicles?.model || ""}`}
                onChange={() => {}}
                placeholder="Vehicle"
                disabled
              />
            </ModalSection>

            <ModalSection title="Message Details">
              <ModalInput
                type="text"
                value={selectedReminder.service_type}
                onChange={() => {}}
                placeholder="Subject"
                disabled
              />
              <textarea
                value={selectedReminder.message_template}
                readOnly
                disabled
                rows={3}
                placeholder="Message"
                className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none transition-all resize-none"
              />
              <div className="grid grid-cols-2 gap-4">
                <ModalInput
                  type="text"
                  value={selectedReminder.delivery_method.toUpperCase()}
                  onChange={() => {}}
                  placeholder="Reminder Type"
                  disabled
                />
                <ModalInput
                  type="text"
                  value={new Date(selectedReminder.scheduled_at).toLocaleString()}
                  onChange={() => {}}
                  placeholder="Scheduled At"
                  disabled
                />
              </div>
              <ModalSelect
                value={selectedReminder.status}
                onChange={() => {}}
                options={[
                  { value: "draft", label: "Draft" },
                  { value: "scheduled", label: "Scheduled" },
                  { value: "sent", label: "Sent" },
                  { value: "failed", label: "Failed" },
                  { value: "cancelled", label: "Cancelled" },
                ]}
                disabled
              />
            </ModalSection>

            <ModalSection title="Additional Details">
              <ModalInput
                type="text"
                value={selectedReminder.branches?.name || "—"}
                onChange={() => {}}
                placeholder="Branch"
                disabled
              />
              {selectedReminder.sent_at && (
                <ModalInput
                  type="text"
                  value={new Date(selectedReminder.sent_at).toLocaleString()}
                  onChange={() => {}}
                  placeholder="Sent At"
                  disabled
                />
              )}
              {selectedReminder.failure_reason && (
                <ModalInput
                  type="text"
                  value={selectedReminder.failure_reason}
                  onChange={() => {}}
                  placeholder="Failure Reason"
                  disabled
                />
              )}
              <ModalInput
                type="text"
                value={new Date(selectedReminder.created_at).toLocaleString()}
                onChange={() => {}}
                placeholder="Created At"
                disabled
              />
            </ModalSection>
          </div>
        )}
      </Modal>

      {/* Send Confirmation Modal */}
      <Modal
        isOpen={showSendModal && !!selectedReminder}
        onClose={() => setShowSendModal(false)}
        title="Send Reminder"
        maxWidth="sm"
      >
        {selectedReminder && (
          <div>
            <div className="bg-neutral-100 rounded-xl p-4 my-4">
              <p className="text-neutral-900">
                Send this reminder to <strong className="text-neutral-950">{selectedReminder.customers?.full_name}</strong> via{" "}
                <strong className="text-neutral-950">{selectedReminder.delivery_method?.toUpperCase()}</strong>?
              </p>
              {selectedReminder.delivery_method === "email" && selectedReminder.customers?.email && (
                <p className="text-xs text-neutral-500 mt-1">To: {selectedReminder.customers.email}</p>
              )}
              {selectedReminder.delivery_method === "sms" && selectedReminder.customers?.contact_number && (
                <p className="text-xs text-neutral-500 mt-1">To: {selectedReminder.customers.contact_number}</p>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowSendModal(false)}
                className="flex-1 px-4 py-3.5 border-2 border-primary text-primary rounded-xl font-semibold hover:bg-primary-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={sending}
                className="flex-1 px-4 py-3.5 bg-primary text-white rounded-xl font-semibold hover:bg-primary-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {sending ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Cancel Confirmation Modal */}
      <Modal
        isOpen={showCancelModal && !!selectedReminder}
        onClose={() => setShowCancelModal(false)}
        title="Cancel Reminder"
        maxWidth="sm"
      >
        {selectedReminder && (
          <div>
            <div className="bg-neutral-100 rounded-xl p-4 my-4">
              <p className="text-neutral-900">
                Are you sure you want to cancel this reminder for <strong className="text-neutral-950">{selectedReminder.customers?.full_name}</strong>?
              </p>
            </div>
            <p className="text-sm text-neutral-900 mb-2">
              The reminder will be marked as cancelled and will not be sent.
            </p>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="flex-1 px-4 py-3.5 border-2 border-negative text-negative rounded-xl font-semibold hover:bg-negative-200 transition-colors"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={sending}
                className="flex-1 px-4 py-3.5 bg-negative text-white rounded-xl font-semibold hover:bg-negative-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {sending ? "Cancelling..." : "Proceed"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal && !!selectedReminder}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Reminder"
        maxWidth="sm"
      >
        {selectedReminder && (
          <div>
            <div className="bg-neutral-100 rounded-xl p-4 my-4">
              <p className="text-neutral-900">
                Are you sure you want to permanently delete this reminder for <strong className="text-neutral-950">{selectedReminder.customers?.full_name}</strong>?
              </p>
            </div>
            <p className="text-sm text-neutral-900 mb-2">
              This action cannot be undone. The reminder data will be permanently removed.
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
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Process Scheduled Confirmation Modal */}
      <Modal
        isOpen={showProcessConfirm}
        onClose={() => setShowProcessConfirm(false)}
        title="Send Scheduled Reminders"
        maxWidth="sm"
      >
        <div>
          <div className="bg-neutral-100 rounded-xl p-4 my-4">
            <p className="text-neutral-900">
              Send all scheduled reminders that are past their due date?
            </p>
          </div>
          <p className="text-sm text-neutral-900 mb-2">
            This will process all reminders with status <strong className="text-neutral-950">Scheduled</strong> where the scheduled date has passed, and deliver them via their configured method (email or SMS).
          </p>
          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={() => setShowProcessConfirm(false)}
              className="flex-1 px-4 py-3.5 border-2 border-primary text-primary rounded-xl font-semibold hover:bg-primary-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleProcessScheduled}
              disabled={processingScheduled}
              className="flex-1 px-4 py-3.5 bg-primary text-white rounded-xl font-semibold hover:bg-primary-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {processingScheduled ? "Sending..." : "Send All"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
