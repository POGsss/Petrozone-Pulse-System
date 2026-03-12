import { useState, useEffect, useMemo } from "react";
import {
  LuPencil,
  LuTrash2,
  LuUsers,
  LuUserCheck,
  LuUserX,
} from "react-icons/lu";
import { customersApi, branchesApi, vehiclesApi, jobOrdersApi } from "../../lib/api";
import { showToast } from "../../lib/toast";
import { useAuth } from "../../auth";
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
import type { Customer, Branch, Vehicle, JobOrder } from "../../types";

const ITEMS_PER_PAGE = 20;

// Format date helper
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function CustomerManagement() {
  const { user } = useAuth();
  const userRoles = user?.roles || [];
  const isHM = userRoles.includes("HM");

  // Permission checks
  const canCreate = userRoles.some((r) => ["HM", "POC", "JS", "R"].includes(r));
  const canUpdate = userRoles.some((r) => ["POC", "JS", "R", "T"].includes(r));
  const canDelete = userRoles.some((r) => ["POC", "JS", "R"].includes(r));

  // Data state
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search, filters and pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterBranch, setFilterBranch] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  // Add customer modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [addForm, setAddForm] = useState({
    full_name: "",
    contact_number: "",
    email: "",
    customer_type: "individual",
    branch_id: "",
    address: "",
    notes: "",
  });
  const [addError, setAddError] = useState<string | null>(null);

  // Edit customer modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [editForm, setEditForm] = useState({
    full_name: "",
    contact_number: "",
    email: "",
    customer_type: "individual",
    status: "active",
    address: "",
    notes: "",
  });
  const [editError, setEditError] = useState<string | null>(null);

  // View customer modal state
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewCustomer, setViewCustomer] = useState<Customer | null>(null);
  const [linkedVehicles, setLinkedVehicles] = useState<Vehicle[]>([]);
  const [linkedJobOrders, setLinkedJobOrders] = useState<JobOrder[]>([]);
  const [loadingLinked, setLoadingLinked] = useState(false);

  // Delete confirmation modal
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingCustomer, setDeletingCustomer] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [customerHasReferences, setCustomerHasReferences] = useState(false);
  const [checkingReferences, setCheckingReferences] = useState(false);

  // Computed stats
  const stats = useMemo(() => {
    const total = allCustomers.length;
    const active = allCustomers.filter((c) => c.status === "active").length;
    const inactive = total - active;
    return { total, active, inactive };
  }, [allCustomers]);

  // Filtered and paginated customers (client-side like PricingManagement)
  const { filteredCustomers, paginatedCustomers, totalPages } = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const filtered = allCustomers.filter((c) => {
      const matchSearch =
        !q ||
        c.full_name.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.contact_number?.toLowerCase().includes(q) ||
        c.address?.toLowerCase().includes(q);

      const matchStatus = filterStatus === "all" || c.status === filterStatus;
      const matchType = filterType === "all" || c.customer_type === filterType;
      const matchBranch = filterBranch === "all" || c.branch_id === filterBranch;

      return matchSearch && matchStatus && matchType && matchBranch;
    });
    const total = Math.ceil(filtered.length / ITEMS_PER_PAGE);
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginated = filtered.slice(start, start + ITEMS_PER_PAGE);
    return { filteredCustomers: filtered, paginatedCustomers: paginated, totalPages: total };
  }, [allCustomers, searchQuery, filterStatus, filterType, filterBranch, currentPage]);

  // Fetch data on mount
  useEffect(() => {
    fetchData();
  }, []);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterStatus, filterType, filterBranch]);

  function handleResetFilters() {
    setFilterStatus("all");
    setFilterType("all");
    setFilterBranch("all");
    setSearchQuery("");
    setCurrentPage(1);
  }

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);
      const [customersRes, branchesData] = await Promise.all([
        customersApi.getAll({ limit: 1000 }),
        branchesApi.getAll(),
      ]);
      setAllCustomers(customersRes.data);
      setBranches(branchesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }

  // Default branch for add form
  const defaultBranchId = useMemo(() => {
    if (!isHM && user?.branches?.length) {
      const primary = user.branches.find((b) => b.is_primary);
      return primary?.branch_id || user.branches[0]?.branch_id || "";
    }
    return "";
  }, [user, isHM]);

  // Branch options for select
  const branchOptions = useMemo(() => {
    if (!isHM && user?.branches) {
      return user.branches.map((ba) => ({
        value: ba.branch_id,
        label: ba.branches.name,
      }));
    }
    return branches.map((b) => ({ value: b.id, label: b.name }));
  }, [branches, user, isHM]);

  // Open add modal
  function openAddModal() {
    setAddForm({
      full_name: "",
      contact_number: "",
      email: "",
      customer_type: "individual",
      branch_id: defaultBranchId,
      address: "",
      notes: "",
    });
    setAddError(null);
    setShowAddModal(true);
  }

  // Add customer handler
  async function handleAddCustomer(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);

    if (!addForm.full_name.trim()) {
      setAddError("Full name is required");
      return;
    }
    if (!addForm.contact_number.trim() && !addForm.email.trim()) {
      setAddError("At least one contact method (phone or email) is required");
      return;
    }
    if (addForm.contact_number) {
      const phoneDigits = addForm.contact_number.replace(/[^0-9]/g, "");
      if (phoneDigits.length < 7 || phoneDigits.length > 20) {
        setAddError("Phone number must be between 7 and 20 digits");
        return;
      }
    }
    if (addForm.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(addForm.email)) {
        setAddError("Invalid email format");
        return;
      }
    }
    if (!addForm.branch_id) {
      setAddError("Branch is required");
      return;
    }

    try {
      setAddingCustomer(true);
      await customersApi.create({
        full_name: addForm.full_name.trim(),
        contact_number: addForm.contact_number.trim() || undefined,
        email: addForm.email.trim() || undefined,
        customer_type: addForm.customer_type,
        branch_id: addForm.branch_id,
        address: addForm.address.trim() || undefined,
        notes: addForm.notes.trim() || undefined,
      });
      setShowAddModal(false);
      showToast.success("Customer created successfully");
      fetchData();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to create customer");
      showToast.error(err instanceof Error ? err.message : "Failed to create customer");
    } finally {
      setAddingCustomer(false);
    }
  }

  // Open view modal — also load linked vehicles and JOs
  async function openViewModal(customer: Customer) {
    setViewCustomer(customer);
    setShowViewModal(true);
    setLinkedVehicles([]);
    setLinkedJobOrders([]);
    setLoadingLinked(true);
    try {
      const [vehRes, joRes] = await Promise.all([
        vehiclesApi.getAll({ customer_id: customer.id, limit: 100 }),
        jobOrdersApi.getAll({ customer_id: customer.id, limit: 100 }),
      ]);
      setLinkedVehicles(vehRes.data);
      setLinkedJobOrders(joRes.data);
    } catch {
      // Silently fail
    } finally {
      setLoadingLinked(false);
    }
  }

  // Open edit modal
  function openEditModal(customer: Customer) {
    setSelectedCustomer(customer);
    setEditForm({
      full_name: customer.full_name,
      contact_number: customer.contact_number || "",
      email: customer.email || "",
      customer_type: customer.customer_type,
      status: customer.status,
      address: customer.address || "",
      notes: customer.notes || "",
    });
    setEditError(null);
    setShowEditModal(true);
  }

  // Edit customer handler
  async function handleEditCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCustomer) return;
    setEditError(null);

    if (!editForm.full_name.trim()) {
      setEditError("Full name cannot be empty");
      return;
    }
    if (!editForm.contact_number.trim() && !editForm.email.trim()) {
      setEditError("At least one contact method (phone or email) is required");
      return;
    }
    if (editForm.contact_number) {
      const phoneDigits = editForm.contact_number.replace(/[^0-9]/g, "");
      if (phoneDigits.length < 7 || phoneDigits.length > 20) {
        setEditError("Phone number must be between 7 and 20 digits");
        return;
      }
    }
    if (editForm.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(editForm.email)) {
        setEditError("Invalid email format");
        return;
      }
    }

    try {
      setEditingCustomer(true);
      await customersApi.update(selectedCustomer.id, {
        full_name: editForm.full_name.trim(),
        contact_number: editForm.contact_number.trim() || null,
        email: editForm.email.trim() || null,
        customer_type: editForm.customer_type,
        status: editForm.status,
        address: editForm.address.trim() || null,
        notes: editForm.notes.trim() || null,
      });
      setShowEditModal(false);
      setSelectedCustomer(null);
      showToast.success("Customer updated successfully");
      fetchData();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update customer");
      showToast.error(err instanceof Error ? err.message : "Failed to update customer");
    } finally {
      setEditingCustomer(false);
    }
  }

  // Delete customer
  async function openDeleteConfirmModal(customer: Customer) {
    setCustomerToDelete(customer);
    setCustomerHasReferences(false);
    setCheckingReferences(true);
    setShowDeleteConfirm(true);
    try {
      const joRes = await jobOrdersApi.getAll({ customer_id: customer.id, limit: 1 });
      setCustomerHasReferences((joRes.data?.length ?? 0) > 0);
    } catch {
      // Default to soft-delete label if check fails
      setCustomerHasReferences(true);
    } finally {
      setCheckingReferences(false);
    }
  }

  async function handleDeleteCustomer() {
    if (!customerToDelete) return;
    try {
      setDeletingCustomer(true);
      const result = await customersApi.delete(customerToDelete.id);
      setShowDeleteConfirm(false);
      setCustomerToDelete(null);
      const isDeactivated = result.message?.toLowerCase().includes("deactivated");
      showToast.success(isDeactivated ? "Customer deactivated successfully" : "Customer deleted successfully");
      fetchData();
    } catch (err) {
      const failMsg = customerHasReferences ? "Failed to deactivate customer" : "Failed to delete customer";
      setError(err instanceof Error ? err.message : failMsg);
      showToast.error(err instanceof Error ? err.message : failMsg);
    } finally {
      setDeletingCustomer(false);
    }
  }

  if (loading) {
    return <SkeletonLoader showHeader showStats statsCount={3} rows={5} />;
  }

  if (error && allCustomers.length === 0) {
    return <ErrorAlert message={error} onRetry={fetchData} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Management"
        subtitle="Summary of customers"
        buttonLabel="Add New Customer"
        onAdd={openAddModal}
        showButton={canCreate}
      />

      <StatsCards
        cards={[
          { icon: LuUsers, iconBg: "bg-primary-100", iconColor: "text-primary", label: "All Customers", value: stats.total },
          { icon: LuUserCheck, iconBg: "bg-primary-100", iconColor: "text-positive", label: "Active", value: stats.active },
          { icon: LuUserX, iconBg: "bg-negative-100", iconColor: "text-negative", label: "Inactive", value: stats.inactive },
        ] as StatCard[]}
      />

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
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ],
            onChange: (v) => { setFilterStatus(v); setCurrentPage(1); },
          }}
          advancedFilters={[
            {
              key: "type",
              label: "Customer Type",
              value: filterType,
              options: [
                { value: "all", label: "All Types" },
                { value: "individual", label: "Individual" },
                { value: "company", label: "Company" },
              ],
              onChange: (v) => { setFilterType(v); setCurrentPage(1); },
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
          isEmpty={paginatedCustomers.length === 0}
          emptyMessage={
            searchQuery || filterStatus !== "all" || filterType !== "all" || filterBranch !== "all"
              ? "No customers match your filters."
              : 'No customers found. Click "Add a New Customer" to create one.'
          }
        >
          {paginatedCustomers.map((customer) => {
            const actions: MobileCardAction[] = [];
            if (canUpdate) actions.push({ label: "Edit", icon: <LuPencil className="w-4 h-4" />, onClick: () => openEditModal(customer) });
            if (canDelete) actions.push({ label: "Delete", icon: <LuTrash2 className="w-4 h-4" />, onClick: () => openDeleteConfirmModal(customer), className: "flex items-center gap-1 text-sm text-negative hover:text-negative-900" });
            return (
              <MobileCard
                key={customer.id}
                onClick={() => openViewModal(customer)}
                icon={<LuUsers className="w-5 h-5 text-primary" />}
                title={customer.full_name}
                subtitle={customer.branches?.code}
                statusBadge={{
                  label: customer.status === "active" ? "Active" : "Inactive",
                  className: customer.status === "active" ? "bg-positive-100 text-positive" : "bg-negative-100 text-negative",
                }}
                details={
                  <>
                    {customer.email && <p className="text-neutral-900">{customer.email}</p>}
                    {customer.contact_number && <p className="text-neutral-900">{customer.contact_number}</p>}
                    <p className="text-neutral-900">{customer.customer_type === "company" ? "Company" : "Individual"}</p>
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
            { label: "Name", width: "w-[22%]" },
            { label: "Contact", width: "w-[25%]" },
            { label: "Type", width: "w-[12%]" },
            { label: "Branch", width: "w-[15%]" },
            { label: "Status", width: "w-[12%]" },
            { label: "Actions", align: "center", width: "w-[14%]" },
          ] as DesktopTableColumn[]}
          tableClassName="table-fixed min-w-175"
          isEmpty={paginatedCustomers.length === 0}
          emptyMessage={
            searchQuery || filterStatus !== "all" || filterType !== "all" || filterBranch !== "all"
              ? "No customers match your filters."
              : 'No customers found. Click "Add a New Customer" to create one.'
          }
        >
              {paginatedCustomers.map((customer) => (
                <DesktopTableRow
                  key={customer.id}
                  onClick={() => openViewModal(customer)}
                >
                  <td className="py-3 px-4">
                    <span className="font-medium text-neutral-900 truncate block">{customer.full_name}</span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="space-y-0.5 min-w-0">
                      {customer.contact_number && (
                        <p className="text-sm text-neutral-900 flex items-center gap-1.5 truncate">
                          <span className="truncate">{customer.contact_number}</span>
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${customer.customer_type === "company"
                          ? "bg-primary-100 text-primary-950"
                          : "bg-neutral-100 text-neutral-950"
                        }`}
                    >
                      {customer.customer_type === "company" ? "Company" : "Individual"}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {customer.branches ? (
                      <span className="px-2 py-0.5 bg-neutral-100 text-neutral-900 rounded text-xs font-medium">
                        {customer.branches.code}
                      </span>
                    ) : (
                      <span className="text-sm text-neutral-400">-</span>
                    )}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${customer.status === "active"
                          ? "bg-primary-100 text-positive-950"
                          : "bg-neutral-100 text-neutral-950"
                        }`}
                    >
                      {customer.status === "active" ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <div className="flex items-center justify-center gap-2">
                      {canUpdate && (
                        <button
                          onClick={(e) => { e.stopPropagation(); openEditModal(customer); }}
                          className="p-2 text-primary-950 hover:text-primary-900 hover:bg-primary-50 rounded-lg transition-colors"
                          title="Edit customer"
                        >
                          <LuPencil className="w-4 h-4" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={(e) => { e.stopPropagation(); openDeleteConfirmModal(customer); }}
                          className="p-2 text-negative-950 hover:text-negative-900 hover:bg-negative-50 rounded-lg transition-colors"
                          title="Delete customer"
                        >
                          <LuTrash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </DesktopTableRow>
              ))}
        </DesktopTable>

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          variant="table"
          totalItems={filteredCustomers.length}
          itemsPerPage={ITEMS_PER_PAGE}
          entityName="customers"
        />
      </div>

      {/* Add Customer Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add New Customer"
        maxWidth="lg"
      >
        <form onSubmit={handleAddCustomer}>
          <ModalSection title="Customer Information">
            <ModalInput
              type="text"
              value={addForm.full_name}
              onChange={(v) => setAddForm((prev) => ({ ...prev, full_name: v }))}
              placeholder="Full Name *"
              required
            />
            <ModalSelect
              value={addForm.customer_type}
              onChange={(v) => setAddForm((prev) => ({ ...prev, customer_type: v }))}
              options={[
                { value: "individual", label: "Individual" },
                { value: "company", label: "Company" },
              ]}
            />
            <ModalSelect
              value={addForm.branch_id}
              onChange={(v) => setAddForm((prev) => ({ ...prev, branch_id: v }))}
              placeholder="Select Branch *"
              options={branchOptions}
            />
          </ModalSection>

          <ModalSection title="Contact Details">
            <ModalInput
              type="tel"
              value={addForm.contact_number}
              onChange={(v) => setAddForm((prev) => ({ ...prev, contact_number: v }))}
              placeholder="Contact Number"
              pattern="[0-9+\-()\s]{7,20}"
              title="Please enter a valid phone number (7-20 digits)"
            />
            <ModalInput
              type="email"
              value={addForm.email}
              onChange={(v) => setAddForm((prev) => ({ ...prev, email: v }))}
              placeholder="Email Address"
            />
            <ModalInput
              type="text"
              value={addForm.address}
              onChange={(v) => setAddForm((prev) => ({ ...prev, address: v }))}
              placeholder="Address"
            />
          </ModalSection>

          <ModalSection title="Additional Information">
            <textarea
              value={addForm.notes}
              onChange={(e) => setAddForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Notes (optional)"
              rows={3}
              className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
            />
          </ModalSection>

          <ModalError message={addError} />

          <ModalButtons
            onCancel={() => setShowAddModal(false)}
            submitText={addingCustomer ? "Creating..." : "Create Customer"}
            loading={addingCustomer}
          />
        </form>
      </Modal>

      {/* View Customer Modal */}
      <Modal
        isOpen={showViewModal && !!viewCustomer}
        onClose={() => setShowViewModal(false)}
        title="Customer Details"
        maxWidth="lg"
      >
        {viewCustomer && (
          <div>
            <ModalSection title="Customer Information">
              <ModalInput
                type="text"
                value={viewCustomer.full_name}
                onChange={() => { }}
                placeholder="Full Name"
                disabled
              />
              <ModalSelect
                value={viewCustomer.customer_type}
                onChange={() => { }}
                options={[
                  { value: "individual", label: "Individual" },
                  { value: "company", label: "Company" },
                ]}
                disabled
              />
              <ModalSelect
                value={viewCustomer.status}
                onChange={() => { }}
                options={[
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ]}
                disabled
              />
              <ModalInput
                type="text"
                value={
                  viewCustomer.branches
                    ? `${viewCustomer.branches.name} (${viewCustomer.branches.code})`
                    : "-"
                }
                onChange={() => { }}
                placeholder="Branch"
                disabled
              />
            </ModalSection>

            <ModalSection title="Contact Details">
              <ModalInput
                type="tel"
                value={viewCustomer.contact_number || "-"}
                onChange={() => { }}
                placeholder="Contact Number"
                disabled
              />
              <ModalInput
                type="email"
                value={viewCustomer.email || "-"}
                onChange={() => { }}
                placeholder="Email Address"
                disabled
              />
              <ModalInput
                type="text"
                value={viewCustomer.address || "-"}
                onChange={() => { }}
                placeholder="Address"
                disabled
              />
            </ModalSection>

            <ModalSection title="Additional Information">
              <textarea
                value={viewCustomer.notes || "-"}
                readOnly
                disabled
                rows={3}
                className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none transition-all resize-none cursor-readonly"
              />
            </ModalSection>

            <ModalSection title="Linked Vehicles">
              {loadingLinked ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[1, 2].map((i) => (
                    <div key={i} className="bg-neutral-100 rounded-xl px-4 py-3 animate-pulse">
                      <div className="h-4 bg-neutral-200 rounded w-3/4 mb-2" />
                      <div className="h-3 bg-neutral-200 rounded w-1/2" />
                    </div>
                  ))}
                </div>
              ) : linkedVehicles.length > 0 ? (
                <div className="max-h-40 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {linkedVehicles.map((v, idx) => (
                    <div
                      key={v.id}
                      className={`bg-neutral-100 rounded-xl px-4 py-3${
                        idx === linkedVehicles.length - 1 && linkedVehicles.length % 2 !== 0 ? " sm:col-span-2" : ""
                      }`}
                    >
                      <p className="font-medium text-neutral-950 text-sm">
                        {v.plate_number}
                      </p>
                      <p className="text-xs text-neutral-900">
                        {v.model} · {v.vehicle_type}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-neutral-900 text-center py-3">No vehicles linked.</p>
              )}
            </ModalSection>

            <ModalSection title="Linked Job Orders">
              {loadingLinked ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[1, 2].map((i) => (
                    <div key={i} className="bg-neutral-100 rounded-xl px-4 py-3 animate-pulse">
                      <div className="h-4 bg-neutral-200 rounded w-3/4 mb-2" />
                      <div className="h-3 bg-neutral-200 rounded w-1/2" />
                    </div>
                  ))}
                </div>
              ) : linkedJobOrders.length > 0 ? (
                <div className="max-h-40 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {linkedJobOrders.map((jo, idx) => (
                    <div
                      key={jo.id}
                      className={`bg-neutral-100 rounded-xl px-4 py-3${
                        idx === linkedJobOrders.length - 1 && linkedJobOrders.length % 2 !== 0 ? " sm:col-span-2" : ""
                      }`}
                    >
                      <p className="font-medium text-neutral-950 text-sm">
                        {jo.order_number}
                      </p>
                      <p className="text-xs text-neutral-900">
                        {jo.status} · {formatDate(jo.created_at)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-neutral-900 text-center py-3">No job orders linked.</p>
              )}
            </ModalSection>

            <ModalSection title="Timestamps">
              <div className="grid grid-cols-2 gap-4">
                <ModalInput
                  type="text"
                  value={formatDate(viewCustomer.created_at)}
                  onChange={() => { }}
                  placeholder="Created"
                  disabled
                />
                <ModalInput
                  type="text"
                  value={formatDate(viewCustomer.updated_at)}
                  onChange={() => { }}
                  placeholder="Updated"
                  disabled
                />
              </div>
            </ModalSection>
          </div>
        )}
      </Modal>

      {/* Edit Customer Modal */}
      <Modal
        isOpen={showEditModal && !!selectedCustomer}
        onClose={() => setShowEditModal(false)}
        title="Edit Customer"
        maxWidth="lg"
      >
        <form onSubmit={handleEditCustomer}>
          <ModalSection title="Customer Information">
            <ModalInput
              type="text"
              value={editForm.full_name}
              onChange={(v) => setEditForm((prev) => ({ ...prev, full_name: v }))}
              placeholder="Full Name *"
              required
            />
            <ModalSelect
              value={editForm.customer_type}
              onChange={(v) => setEditForm((prev) => ({ ...prev, customer_type: v }))}
              options={[
                { value: "individual", label: "Individual" },
                { value: "company", label: "Company" },
              ]}
            />
            <ModalSelect
              value={editForm.status}
              onChange={(v) => setEditForm((prev) => ({ ...prev, status: v }))}
              options={[
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
            />
          </ModalSection>

          <ModalSection title="Contact Details">
            <ModalInput
              type="tel"
              value={editForm.contact_number}
              onChange={(v) => setEditForm((prev) => ({ ...prev, contact_number: v }))}
              placeholder="Contact Number"
              pattern="[0-9+\-()\s]{7,20}"
              title="Please enter a valid phone number (7-20 digits)"
            />
            <ModalInput
              type="email"
              value={editForm.email}
              onChange={(v) => setEditForm((prev) => ({ ...prev, email: v }))}
              placeholder="Email Address"
            />
            <ModalInput
              type="text"
              value={editForm.address}
              onChange={(v) => setEditForm((prev) => ({ ...prev, address: v }))}
              placeholder="Address"
            />
          </ModalSection>

          <ModalSection title="Additional Information">
            <textarea
              value={editForm.notes}
              onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Notes (optional)"
              rows={3}
              className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
            />
          </ModalSection>

          <ModalError message={editError} />

          <ModalButtons
            onCancel={() => setShowEditModal(false)}
            submitText={editingCustomer ? "Saving..." : "Save Changes"}
            loading={editingCustomer}
          />
        </form>
      </Modal>

      {/* Delete / Deactivate Confirmation Modal */}
      <Modal
        isOpen={showDeleteConfirm && !!customerToDelete}
        onClose={() => setShowDeleteConfirm(false)}
        title={customerHasReferences ? "Deactivate Customer" : "Delete Customer"}
        maxWidth="sm"
      >
        {customerToDelete && (
          <div>
            <div className="bg-neutral-100 rounded-xl p-4 my-4">
              <p className="text-neutral-900">
                {customerHasReferences
                  ? <>Are you sure you want to deactivate <strong className="text-neutral-950">{customerToDelete.full_name}</strong>?</>
                  : <>Are you sure you want to delete <strong className="text-neutral-950">{customerToDelete.full_name}</strong>?</>
                }
              </p>
            </div>
            <p className="text-sm text-neutral-900 mb-2">
              {customerHasReferences
                ? "This customer has existing job orders and will be set to inactive instead of deleted."
                : "This action cannot be undone. All customer data will be permanently removed."
              }
            </p>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-3.5 border-2 border-negative text-negative rounded-xl font-semibold hover:bg-negative-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteCustomer}
                disabled={deletingCustomer || checkingReferences}
                className="flex-1 px-4 py-3.5 bg-negative text-white rounded-xl font-semibold hover:bg-negative-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {checkingReferences
                  ? "Checking..."
                  : deletingCustomer
                    ? (customerHasReferences ? "Deactivating..." : "Deleting...")
                    : (customerHasReferences ? "Deactivate" : "Delete")
                }
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
