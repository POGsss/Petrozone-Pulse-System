import { useState, useEffect, useMemo } from "react";
import {
  LuPlus,
  LuCircleAlert,
  LuRefreshCw,
  LuPencil,
  LuTrash2,
  LuSearch,
  LuFilter,
  LuChevronLeft,
  LuChevronRight,
  LuUsers,
  LuBuilding,
  LuPhone,
  LuMail,
} from "react-icons/lu";
import { customersApi, branchesApi } from "../../lib/api";
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

// Get status badge styling
function getStatusColor(status: string): string {
  return status === "active"
    ? "bg-positive-100 text-positive"
    : "bg-negative-100 text-negative";
}

// Get customer type badge styling
function getTypeColor(type: string): string {
  return type === "company"
    ? "bg-primary-100 text-primary"
    : "bg-neutral-100 text-neutral-950";
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
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  // Filters
  const [filters, setFilters] = useState({
    search: "",
    status: "",
    customer_type: "",
    branch_id: "",
  });
  const [showFilters, setShowFilters] = useState(false);

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

  // Delete confirmation modal
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingCustomer, setDeletingCustomer] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);

  // Fetch data on mount
  useEffect(() => {
    fetchBranches();
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [currentPage, filters.status, filters.customer_type, filters.branch_id]);

  async function fetchBranches() {
    try {
      const data = await branchesApi.getAll();
      setBranches(data);
    } catch (err) {
      console.error("Failed to fetch branches:", err);
    }
  }

  async function fetchCustomers() {
    try {
      setLoading(true);
      setError(null);

      const params: Parameters<typeof customersApi.getAll>[0] = {
        limit: ITEMS_PER_PAGE,
        offset: (currentPage - 1) * ITEMS_PER_PAGE,
      };

      if (filters.status) params.status = filters.status;
      if (filters.customer_type) params.customer_type = filters.customer_type;
      if (filters.branch_id) params.branch_id = filters.branch_id;
      if (filters.search) params.search = filters.search;

      const response = await customersApi.getAll(params);
      setCustomers(response.data);
      setTotalItems(response.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch customers");
    } finally {
      setLoading(false);
    }
  }

  // Search handler with debounce-like behavior (search on Enter or button click)
  function handleSearch() {
    setCurrentPage(1);
    fetchCustomers();
  }

  function handleResetFilters() {
    setFilters({ search: "", status: "", customer_type: "", branch_id: "" });
    setCurrentPage(1);
  }

  // Default branch for add form
  const defaultBranchId = useMemo(() => {
    if (!isHM && user?.branches?.length) {
      const primary = user.branches.find((b) => b.is_primary);
      return primary?.branch_id || user.branches[0]?.branch_id || "";
    }
    return "";
  }, [user, isHM]);

  // Add customer
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
      fetchCustomers();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to create customer");
    } finally {
      setAddingCustomer(false);
    }
  }

  // Edit customer
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
      fetchCustomers();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update customer");
    } finally {
      setEditingCustomer(false);
    }
  }

  // Delete customer
  function openDeleteConfirm(customer: Customer) {
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
      fetchCustomers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete customer");
    } finally {
      setDeletingCustomer(false);
    }
  }

  // Branch options for select
  const branchOptions = useMemo(() => {
    // For non-HM, only show their assigned branches
    if (!isHM && user?.branches) {
      return user.branches.map((ba) => ({
        value: ba.branch_id,
        label: ba.branches.name,
      }));
    }
    return branches.map((b) => ({ value: b.id, label: b.name }));
  }, [branches, user, isHM]);

  if (loading && customers.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <LuRefreshCw className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error && customers.length === 0) {
    return (
      <div className="bg-negative-200 border border-negative rounded-lg p-4 flex items-center gap-3">
        <LuCircleAlert className="w-5 h-5 text-negative-950 flex-shrink-0" />
        <div>
          <p className="text-sm text-negative-950">{error}</p>
          <button
            onClick={fetchCustomers}
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
      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 rounded-lg">
              <LuUsers className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-neutral-900">Total Customers</p>
              <p className="text-2xl font-bold text-neutral-950">{totalItems}</p>
            </div>
          </div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-positive-100 rounded-lg">
              <LuUsers className="w-5 h-5 text-positive" />
            </div>
            <div>
              <p className="text-sm text-neutral-900">Active</p>
              <p className="text-2xl font-bold text-neutral-950">
                {customers.filter((c) => c.status === "active").length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-negative-100 rounded-lg">
              <LuUsers className="w-5 h-5 text-negative" />
            </div>
            <div>
              <p className="text-sm text-neutral-900">Inactive</p>
              <p className="text-2xl font-bold text-neutral-950">
                {customers.filter((c) => c.status === "inactive").length}
              </p>
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
                placeholder="Search customers..."
                value={filters.search}
                onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-9 pr-4 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:border-primary w-full sm:w-64"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={filters.status}
                onChange={(e) => {
                  setFilters((prev) => ({ ...prev, status: e.target.value }));
                  setCurrentPage(1);
                }}
                className="appearance-none px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${
                  showFilters
                    ? "border-primary bg-primary-100 text-primary"
                    : "border-neutral-200 text-neutral-950 hover:bg-neutral-100"
                }`}
              >
                <LuFilter className="w-4 h-4" />
                <span className="hidden sm:inline">Filters</span>
              </button>
              {canCreate && (
                <button
                  onClick={openAddModal}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-950 transition-colors text-sm font-medium"
                >
                  <LuPlus className="w-4 h-4" />
                  <span className="hidden sm:inline">Add Customer</span>
                </button>
              )}
              <button
                onClick={fetchCustomers}
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
                <label className="block text-xs text-neutral-900 mb-1">Customer Type</label>
                <select
                  value={filters.customer_type}
                  onChange={(e) => {
                    setFilters((prev) => ({ ...prev, customer_type: e.target.value }));
                    setCurrentPage(1);
                  }}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  <option value="">All Types</option>
                  <option value="individual">Individual</option>
                  <option value="company">Company</option>
                </select>
              </div>
              {(isHM || branchOptions.length > 1) && (
                <div className="flex-1">
                  <label className="block text-xs text-neutral-900 mb-1">Branch</label>
                  <select
                    value={filters.branch_id}
                    onChange={(e) => {
                      setFilters((prev) => ({ ...prev, branch_id: e.target.value }));
                      setCurrentPage(1);
                    }}
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="">All Branches</option>
                    {branchOptions.map((b) => (
                      <option key={b.value} value={b.value}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex items-end gap-2">
                <button
                  onClick={handleSearch}
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
          {customers.map((customer) => (
            <div
              key={customer.id}
              className="border border-neutral-200 rounded-xl p-4 space-y-3"
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-semibold text-neutral-950">{customer.full_name}</h4>
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${getTypeColor(
                      customer.customer_type
                    )}`}
                  >
                    {customer.customer_type === "company" ? "Company" : "Individual"}
                  </span>
                </div>
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(
                    customer.status
                  )}`}
                >
                  {customer.status === "active" ? "Active" : "Inactive"}
                </span>
              </div>

              {/* Contact Info */}
              <div className="space-y-1 text-sm text-neutral-900">
                {customer.contact_number && (
                  <p className="flex items-center gap-2">
                    <LuPhone className="w-3.5 h-3.5" />
                    {customer.contact_number}
                  </p>
                )}
                {customer.email && (
                  <p className="flex items-center gap-2">
                    <LuMail className="w-3.5 h-3.5" />
                    {customer.email}
                  </p>
                )}
                {customer.branches && (
                  <p className="flex items-center gap-2">
                    <LuBuilding className="w-3.5 h-3.5" />
                    {customer.branches.name} ({customer.branches.code})
                  </p>
                )}
              </div>

              {/* Actions */}
              {(canUpdate || canDelete) && (
                <div className="flex items-center justify-end gap-4 pt-3 border-t border-neutral-200">
                  {canUpdate && (
                    <button
                      onClick={() => openEditModal(customer)}
                      className="flex items-center gap-1 text-sm text-primary hover:text-primary-900"
                    >
                      <LuPencil className="w-4 h-4" />
                      Edit
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => openDeleteConfirm(customer)}
                      className="flex items-center gap-1 text-sm text-negative hover:text-negative-900"
                    >
                      <LuTrash2 className="w-4 h-4" />
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          {customers.length === 0 && (
            <div className="text-center py-8 text-neutral-900">
              No customers found.
            </div>
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-100">
                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950">
                  Name
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950">
                  Type
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950">
                  Contact
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950">
                  Branch
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950">
                  Status
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950">
                  Created
                </th>
                {(canUpdate || canDelete) && (
                  <th className="text-right py-3 px-4 text-sm font-medium text-neutral-950">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr
                  key={customer.id}
                  className="border-b border-neutral-100 hover:bg-neutral-100 transition-colors"
                >
                  <td className="py-3 px-4">
                    <p className="text-sm font-medium text-neutral-950">
                      {customer.full_name}
                    </p>
                    {customer.address && (
                      <p className="text-xs text-neutral-900 truncate max-w-[200px]">
                        {customer.address}
                      </p>
                    )}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-medium ${getTypeColor(
                        customer.customer_type
                      )}`}
                    >
                      {customer.customer_type === "company" ? "Company" : "Individual"}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="space-y-0.5">
                      {customer.contact_number && (
                        <p className="text-sm text-neutral-900 flex items-center gap-1.5">
                          <LuPhone className="w-3.5 h-3.5 flex-shrink-0" />
                          {customer.contact_number}
                        </p>
                      )}
                      {customer.email && (
                        <p className="text-sm text-neutral-900 flex items-center gap-1.5">
                          <LuMail className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate max-w-[180px]">{customer.email}</span>
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-sm text-neutral-900 whitespace-nowrap">
                    {customer.branches
                      ? `${customer.branches.name} (${customer.branches.code})`
                      : "-"}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(
                        customer.status
                      )}`}
                    >
                      {customer.status === "active" ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-neutral-900 whitespace-nowrap">
                    {formatDate(customer.created_at)}
                  </td>
                  {(canUpdate || canDelete) && (
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center justify-end gap-3">
                        {canUpdate && (
                          <button
                            onClick={() => openEditModal(customer)}
                            className="flex items-center gap-1 text-sm text-primary hover:text-primary-900"
                          >
                            <LuPencil className="w-4 h-4" />
                            Edit
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => openDeleteConfirm(customer)}
                            className="flex items-center gap-1 text-sm text-negative hover:text-negative-900"
                          >
                            <LuTrash2 className="w-4 h-4" />
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {customers.length === 0 && (
            <div className="text-center py-12 text-neutral-900">
              No customers found.
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4">
            <p className="text-sm text-neutral-900">
              {(currentPage - 1) * ITEMS_PER_PAGE + 1}-
              {Math.min(currentPage * ITEMS_PER_PAGE, totalItems)} of {totalItems} customers
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 border border-neutral-200 rounded-lg text-neutral-900 hover:bg-neutral-100 disabled:opacity-100 disabled:cursor-not-allowed"
              >
                <LuChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-neutral-900 px-2">
                {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 border border-neutral-200 rounded-lg text-neutral-900 hover:bg-neutral-100 disabled:opacity-100 disabled:cursor-not-allowed"
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
        <div className="py-2">
          <p className="text-neutral-900">
            Are you sure you want to delete{" "}
            <span className="font-semibold text-neutral-950">
              {customerToDelete?.full_name}
            </span>
            ? This action cannot be undone.
          </p>
        </div>

        <ModalButtons
          onCancel={() => setShowDeleteConfirm(false)}
          submitText={deletingCustomer ? "Deleting..." : "Delete Customer"}
          loading={deletingCustomer}
          type="button"
          onSubmit={handleDeleteCustomer}
        />
      </Modal>
    </div>
  );
}
