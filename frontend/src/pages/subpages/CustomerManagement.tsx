import { useState, useEffect, useMemo } from "react";
import {
  LuPlus,
  LuCircleAlert,
  LuRefreshCw,
  LuPencil,
  LuTrash2,
  LuSearch,
  LuChevronLeft,
  LuChevronRight,
  LuUsers,
  LuUserCheck,
  LuUserX,
} from "react-icons/lu";
import { customersApi, branchesApi } from "../../lib/api";
import { showToast } from "../../lib/toast";
import { useAuth } from "../../auth";
import {
  Modal,
  ModalSection,
  ModalInput,
  ModalSelect,
  ModalButtons,
  ModalError,
} from "../../components";
import type { Customer, Branch } from "../../types";

const ITEMS_PER_PAGE = 10;

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

  // Search and pagination
  const [searchQuery, setSearchQuery] = useState("");
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

  // Delete confirmation modal
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingCustomer, setDeletingCustomer] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);

  // Computed stats
  const stats = useMemo(() => {
    const total = allCustomers.length;
    const active = allCustomers.filter((c) => c.status === "active").length;
    const inactive = total - active;
    return { total, active, inactive };
  }, [allCustomers]);

  // Filtered and paginated customers (client-side like UserManagement)
  const { paginatedCustomers, totalPages } = useMemo(() => {
    const filtered = allCustomers.filter(
      (c) =>
        c.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.contact_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.address?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    const total = Math.ceil(filtered.length / ITEMS_PER_PAGE);
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginated = filtered.slice(start, start + ITEMS_PER_PAGE);
    return { paginatedCustomers: paginated, totalPages: total, filteredCount: filtered.length };
  }, [allCustomers, searchQuery, currentPage]);

  // Fetch data on mount
  useEffect(() => {
    fetchData();
  }, []);

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

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

  // Open view modal
  function openViewModal(customer: Customer) {
    setViewCustomer(customer);
    setShowViewModal(true);
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
  function openDeleteConfirmModal(customer: Customer) {
    setCustomerToDelete(customer);
    setShowDeleteConfirm(true);
  }

  async function handleDeleteCustomer() {
    if (!customerToDelete) return;
    try {
      setDeletingCustomer(true);
      await customersApi.delete(customerToDelete.id);
      setShowDeleteConfirm(false);
      setCustomerToDelete(null);
      showToast.success("Customer deleted successfully");
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete customer");
      showToast.error(err instanceof Error ? err.message : "Failed to delete customer");
    } finally {
      setDeletingCustomer(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LuRefreshCw className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error && allCustomers.length === 0) {
    return (
      <div className="bg-negative-200 border border-negative rounded-lg p-4 flex items-center gap-3">
        <LuCircleAlert className="w-5 h-5 text-negative-950 flex-shrink-0" />
        <div>
          <p className="text-sm text-negative-950">{error}</p>
          <button
            onClick={fetchData}
            className="text-sm text-negative-600 hover:underline mt-1"
          >
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
          <h3 className="text-lg font-semibold text-neutral-950">Customers</h3>
          <p className="text-sm text-neutral-900">Summary of customers</p>
        </div>
        {canCreate && (
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-950 transition-colors"
          >
            <LuPlus className="w-4 h-4" />
            Add a New Customer
          </button>
        )}
      </div>

      {/* Summary Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 rounded-lg">
              <LuUsers className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-neutral-900">All Customers</p>
              <p className="text-2xl font-bold text-neutral-950">{stats.total}</p>
            </div>
          </div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 rounded-lg">
              <LuUserCheck className="w-5 h-5 text-positive" />
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
              <LuUserX className="w-5 h-5 text-negative" />
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
        {/* Table Header with Search */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 border-b border-neutral-200">
          <div className="relative">
            <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:border-primary w-full sm:w-64"
            />
          </div>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedCustomers.map((customer) => (
              <div
                key={customer.id}
                onClick={() => openViewModal(customer)}
                className="bg-white rounded-xl border border-neutral-200 p-4 cursor-pointer hover:bg-neutral-50 transition-colors"
              >
                {/* Card header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary-100 rounded-lg">
                      <LuUsers className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-neutral-950">{customer.full_name}</h4>
                      {customer.branches && (
                        <span className="text-xs font-mono bg-neutral-100 text-primary px-2 py-0.5 rounded">
                          {customer.branches.code}
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      customer.status === "active"
                        ? "bg-positive-100 text-positive"
                        : "bg-negative-100 text-negative"
                    }`}
                  >
                    {customer.status === "active" ? "Active" : "Inactive"}
                  </span>
                </div>

                {/* Customer details */}
                <div className="space-y-1 text-sm text-neutral-900 mb-3">
                  {customer.email && <p className="text-neutral-900">{customer.email}</p>}
                  {customer.contact_number && <p className="text-neutral-900">{customer.contact_number}</p>}
                  <p className="text-neutral-900">{customer.customer_type === "company" ? "Company" : "Individual"}</p>
                </div>

                {/* Actions */}
                <div className={`flex items-center justify-end ${canUpdate || canDelete ? "gap-4 pt-3 border-t border-neutral-200" : ""}`}>
                  {canUpdate && (
                    <button
                      onClick={(e) => { e.stopPropagation(); openEditModal(customer); }}
                      className="flex items-center gap-1 text-sm text-primary hover:text-primary-900"
                    >
                      <LuPencil className="w-4 h-4" />
                      Edit
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={(e) => { e.stopPropagation(); openDeleteConfirmModal(customer); }}
                      className="flex items-center gap-1 text-sm text-negative hover:text-negative-900"
                    >
                      <LuTrash2 className="w-4 h-4" />
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}

            {paginatedCustomers.length === 0 && (
              <div className="col-span-full text-center py-12 text-neutral-900">
                {searchQuery
                  ? "No customers match your search."
                  : 'No customers found. Click "Add a New Customer" to create one.'}
              </div>
            )}
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full table-fixed min-w-[700px]">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-100">
                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950 whitespace-nowrap w-[22%]">Name</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950 whitespace-nowrap w-[25%]">Contact</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950 whitespace-nowrap w-[12%]">Type</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950 whitespace-nowrap w-[15%]">Branch</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950 whitespace-nowrap w-[12%]">Status</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950 whitespace-nowrap w-[14%]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedCustomers.map((customer) => (
                <tr
                  key={customer.id}
                  onClick={() => openViewModal(customer)}
                  className="border-b border-neutral-200 hover:bg-neutral-100 transition-colors cursor-pointer"
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
                </tr>
              ))}
            </tbody>
          </table>

          {paginatedCustomers.length === 0 && (
            <div className="text-center py-12 text-neutral-900">
              {searchQuery
                ? "No customers match your search."
                : 'No customers found. Click "Add a New Customer" to create one.'}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-neutral-200">
            <p className="text-sm text-neutral-900">
              Page {currentPage} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 border border-neutral-200 rounded-lg text-neutral-900 hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <LuChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-neutral-900 px-2">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 border border-neutral-200 rounded-lg text-neutral-900 hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <LuChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Customer Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add a New Customer"
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
                className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none transition-all resize-none opacity-70 cursor-not-allowed"
              />
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

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteConfirm && !!customerToDelete}
        onClose={() => setShowDeleteConfirm(false)}
        title="Delete Customer"
        maxWidth="sm"
      >
        {customerToDelete && (
          <div>
            <div className="bg-neutral-100 rounded-xl p-4 my-4">
              <p className="text-neutral-900">
                Are you sure you want to delete <strong className="text-neutral-950">{customerToDelete.full_name}</strong>?
              </p>
            </div>
            <p className="text-sm text-neutral-900 mb-2">
              This action cannot be undone. All customer data will be permanently removed.
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
                disabled={deletingCustomer}
                className="flex-1 px-4 py-3.5 bg-negative text-white rounded-xl font-semibold hover:bg-negative-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {deletingCustomer ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
