import { useState, useEffect, useMemo } from "react";
import {
  LuPlus,
  LuCircleAlert,
  LuRefreshCw,
  LuPencil,
  LuTrash2,
  LuDollarSign,
  LuChevronLeft,
  LuChevronRight,
  LuSearch,
  LuCheck,
  LuX,
  LuFilter,
} from "react-icons/lu";
import { pricingApi, catalogApi, branchesApi } from "../../lib/api";
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
import type { PricingMatrix, CatalogItem, Branch } from "../../types";

const ITEMS_PER_PAGE = 5;

const PRICING_TYPE_OPTIONS = [
  { value: "labor", label: "Labor" },
  { value: "packaging", label: "Packaging" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(amount);
}

function pricingTypeLabel(type: string): string {
  return PRICING_TYPE_OPTIONS.find((o) => o.value === type)?.label || type;
}

export function PricingManagement() {
  const { user } = useAuth();
  const userRoles = user?.roles || [];

  // Permission checks
  const canCreate = userRoles.some((r) => ["HM", "POC", "JS", "R"].includes(r));
  const canUpdate = canCreate;
  const canDelete = canCreate;

  // Data state
  const [allPricingMatrices, setAllPricingMatrices] = useState<PricingMatrix[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterBranch, setFilterBranch] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // View detail modal
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewItem, setViewItem] = useState<PricingMatrix | null>(null);

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [addForm, setAddForm] = useState({
    catalog_item_id: "",
    pricing_type: "labor",
    price: "",
    status: "active",
    branch_id: "",
    description: "",
  });
  const [addError, setAddError] = useState<string | null>(null);

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PricingMatrix | null>(null);
  const [editForm, setEditForm] = useState({
    catalog_item_id: "",
    pricing_type: "labor",
    price: "",
    status: "active",
    branch_id: "",
    description: "",
  });
  const [editError, setEditError] = useState<string | null>(null);

  // Delete modal
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingItem, setDeletingItem] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<PricingMatrix | null>(null);

  // Computed stats
  const stats = useMemo(() => {
    const total = allPricingMatrices.length;
    const active = allPricingMatrices.filter((p) => p.status === "active").length;
    const inactive = total - active;
    return { total, active, inactive };
  }, [allPricingMatrices]);

  // Filtered + paginated
  const { filteredItems, paginatedItems, totalPages } = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const filtered = allPricingMatrices.filter((p) => {
      const matchSearch =
        !q ||
        p.catalog_items?.name?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.pricing_type.toLowerCase().includes(q) ||
        p.branches?.name?.toLowerCase().includes(q);

      const matchStatus = filterStatus === "all" || p.status === filterStatus;
      const matchType = filterType === "all" || p.pricing_type === filterType;
      const matchBranch = filterBranch === "all" || p.branch_id === filterBranch;

      return matchSearch && matchStatus && matchType && matchBranch;
    });
    const pages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return {
      filteredItems: filtered,
      paginatedItems: filtered.slice(start, start + ITEMS_PER_PAGE),
      totalPages: pages,
    };
  }, [allPricingMatrices, searchQuery, filterStatus, filterType, filterBranch, currentPage]);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterStatus, filterType, filterBranch]);

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);

      // Only fetch catalog items if user can create/edit (T role can only view pricing)
      const fetches: [Promise<any>, Promise<any> | null, Promise<any>] = [
        pricingApi.getAll({ limit: 1000 }),
        canCreate ? catalogApi.getAll({ limit: 1000 }) : Promise.resolve(null),
        branchesApi.getAll(),
      ];

      const [pricingRes, catalogRes, branchesData] = await Promise.all(fetches);
      setAllPricingMatrices(pricingRes.data);
      if (catalogRes?.data) setCatalogItems(catalogRes.data);
      setBranches(branchesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }

  // View detail
  function openViewModal(item: PricingMatrix) {
    setViewItem(item);
    setShowViewModal(true);
  }

  // Open add modal
  function openAddModal() {
    const defaultBranch =
      user?.branches?.find((b) => b.is_primary)?.branch_id ||
      user?.branches?.[0]?.branch_id ||
      "";
    setAddForm({
      catalog_item_id: "",
      pricing_type: "labor",
      price: "",
      status: "active",
      branch_id: defaultBranch,
      description: "",
    });
    setAddError(null);
    setShowAddModal(true);
  }

  // Create handler
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);

    if (!addForm.catalog_item_id) {
      setAddError("Please select a catalog item");
      return;
    }
    if (!addForm.pricing_type) {
      setAddError("Please select a pricing type");
      return;
    }
    if (!addForm.price || parseFloat(addForm.price) < 0 || isNaN(parseFloat(addForm.price))) {
      setAddError("Please enter a valid price (non-negative number)");
      return;
    }
    if (!addForm.branch_id) {
      setAddError("Please select a branch");
      return;
    }

    try {
      setAddingItem(true);
      await pricingApi.create({
        catalog_item_id: addForm.catalog_item_id,
        pricing_type: addForm.pricing_type,
        price: parseFloat(addForm.price),
        status: addForm.status,
        branch_id: addForm.branch_id,
        description: addForm.description || undefined,
      });
      setShowAddModal(false);
      showToast.success("Pricing rule created successfully");
      fetchData();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to create pricing matrix");
      showToast.error(err instanceof Error ? err.message : "Failed to create pricing matrix");
    } finally {
      setAddingItem(false);
    }
  }

  // Open edit modal
  function openEditModal(item: PricingMatrix) {
    setSelectedItem(item);
    setEditForm({
      catalog_item_id: item.catalog_item_id,
      pricing_type: item.pricing_type,
      price: String(item.price),
      status: item.status,
      branch_id: item.branch_id,
      description: item.description || "",
    });
    setEditError(null);
    setShowEditModal(true);
  }

  // Update handler
  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedItem) return;
    setEditError(null);

    if (!editForm.catalog_item_id) {
      setEditError("Please select a catalog item");
      return;
    }
    if (!editForm.pricing_type) {
      setEditError("Please select a pricing type");
      return;
    }
    if (!editForm.price || parseFloat(editForm.price) < 0 || isNaN(parseFloat(editForm.price))) {
      setEditError("Please enter a valid price (non-negative number)");
      return;
    }
    if (!editForm.branch_id) {
      setEditError("Please select a branch");
      return;
    }

    try {
      setEditingItem(true);
      await pricingApi.update(selectedItem.id, {
        catalog_item_id: editForm.catalog_item_id,
        pricing_type: editForm.pricing_type,
        price: parseFloat(editForm.price),
        status: editForm.status,
        branch_id: editForm.branch_id,
        description: editForm.description || null,
      });
      setShowEditModal(false);
      showToast.success("Pricing rule updated successfully");
      fetchData();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update pricing matrix");
      showToast.error(err instanceof Error ? err.message : "Failed to update pricing matrix");
    } finally {
      setEditingItem(false);
    }
  }

  // Delete handlers
  function openDeleteModal(item: PricingMatrix) {
    setItemToDelete(item);
    setShowDeleteConfirm(true);
  }

  async function handleDelete() {
    if (!itemToDelete) return;
    try {
      setDeletingItem(true);
      await pricingApi.delete(itemToDelete.id);
      setShowDeleteConfirm(false);
      setItemToDelete(null);
      showToast.success("Pricing rule deleted successfully");
      fetchData();
    } catch (err) {
      console.error("Failed to delete pricing matrix:", err);
      showToast.error(err instanceof Error ? err.message : "Failed to delete pricing rule");
    } finally {
      setDeletingItem(false);
    }
  }

  // Reset filters
  function handleResetFilters() {
    setFilterStatus("all");
    setFilterType("all");
    setFilterBranch("all");
    setSearchQuery("");
    setCurrentPage(1);
  }

  // Get active catalog items for the selected branch in forms
  function getCatalogItemsForBranch(branchId: string) {
    return catalogItems.filter(
      (c) =>
        c.status === "active" &&
        (c.is_global || c.branch_id === branchId)
    );
  }

  if (loading && allPricingMatrices.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <LuRefreshCw className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error && allPricingMatrices.length === 0) {
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
      {/* Header with title and add button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between bg-white rounded-xl p-4 border border-neutral-200">
        <div>
          <h3 className="text-lg font-semibold text-neutral-950">Pricing Matrices</h3>
          <p className="text-sm text-neutral-900">Summary of pricing rules</p>
        </div>
        {canCreate && (
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-950 transition-colors"
          >
            <LuPlus className="w-4 h-4" />
            Add Pricing Rule
          </button>
        )}
      </div>

      {/* Summary Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 rounded-lg">
              <LuDollarSign className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-neutral-900">All Rules</p>
              <p className="text-2xl font-bold text-neutral-950">{stats.total}</p>
            </div>
          </div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-positive-100 rounded-lg">
              <LuCheck className="w-5 h-5 text-positive" />
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
              <LuX className="w-5 h-5 text-negative" />
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
        {/* Table Header with Search and Filters — AuditLog style */}
        <div className="p-4 border-b border-neutral-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-900" />
              <input
                type="text"
                placeholder="Search pricing rules..."
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
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${showFilters ? "border-primary bg-primary-100 text-primary" : "border-neutral-200 text-neutral-950 hover:bg-neutral-100"
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
                <label className="block text-xs text-neutral-900 mb-1">Pricing Type</label>
                <select
                  value={filterType}
                  onChange={(e) => {
                    setFilterType(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="all">All Types</option>
                  {PRICING_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedItems.map((item) => (
              <div
                key={item.id}
                onClick={() => openViewModal(item)}
                className="bg-white rounded-xl border border-neutral-200 p-4 cursor-pointer hover:bg-neutral-50 transition-colors"
              >
                {/* Card header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary-100 rounded-lg">
                      <LuDollarSign className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-neutral-950">
                        {item.catalog_items?.name || "Unknown Item"}
                      </h4>
                      {item.branches && (
                        <span className="text-xs font-mono bg-neutral-100 text-primary px-2 py-0.5 rounded">
                          {item.branches.code}
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      item.status === "active"
                        ? "bg-positive-100 text-positive"
                        : "bg-negative-100 text-negative"
                    }`}
                  >
                    {item.status === "active" ? "Active" : "Inactive"}
                  </span>
                </div>

                {/* Pricing details */}
                <div className="space-y-1 text-sm text-neutral-900 mb-3">
                  <p className="text-neutral-900">{pricingTypeLabel(item.pricing_type)}</p>
                  <p className="text-neutral-900 font-medium">{formatCurrency(item.price)}</p>
                  {item.description && <p className="text-neutral-900">{item.description}</p>}
                </div>

                {/* Actions */}
                <div className={`flex items-center justify-end ${canUpdate || canDelete ? "gap-4 pt-3 border-t border-neutral-200" : ""}`}>
                  {canUpdate && (
                    <button
                      onClick={(e) => { e.stopPropagation(); openEditModal(item); }}
                      className="flex items-center gap-1 text-sm text-primary hover:text-primary-900"
                    >
                      <LuPencil className="w-4 h-4" />
                      Edit
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={(e) => { e.stopPropagation(); openDeleteModal(item); }}
                      className="flex items-center gap-1 text-sm text-negative hover:text-negative-900"
                    >
                      <LuTrash2 className="w-4 h-4" />
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}

            {paginatedItems.length === 0 && (
              <div className="col-span-full text-center py-12 text-neutral-900">
                No pricing rules found.
              </div>
            )}
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-100">
                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950">Catalog Item</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950">Price</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950">Type</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950">Branch</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950">Status</th>
                {(canUpdate || canDelete) && (
                  <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => openViewModal(item)}
                  className="border-b border-neutral-100 hover:bg-neutral-100 transition-colors cursor-pointer"
                >
                  <td className="py-3 px-4 text-sm text-neutral-900">
                    <span className="font-medium">{item.catalog_items?.name || "Unknown"}</span>
                  </td>
                  <td className="py-3 px-4 text-sm text-neutral-900 whitespace-nowrap font-medium">
                    {formatCurrency(item.price)}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${item.pricing_type === "labor"
                        ? "bg-primary-100 text-primary-950"
                        : "bg-positive-100 text-positive-950"
                      }`}>
                      {pricingTypeLabel(item.pricing_type)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-neutral-900">
                    {item.branches ? (
                      <span className="px-2 py-0.5 bg-neutral-100 text-neutral-900 rounded text-xs font-medium">
                        {item.branches.name}
                      </span>
                    ) : (
                      <span className="text-sm text-neutral-400">-</span>
                    )}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        item.status === "active"
                          ? "bg-primary-100 text-positive-950"
                          : "bg-neutral-100 text-neutral-950"
                      }`}
                    >
                      {item.status === "active" ? "Active" : "Inactive"}
                    </span>
                  </td>
                  {(canUpdate || canDelete) && (
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center justify-center gap-2">
                        {canUpdate && (
                          <button
                            onClick={(e) => { e.stopPropagation(); openEditModal(item); }}
                            className="p-2 text-primary-950 hover:text-primary-900 hover:bg-primary-50 rounded-lg transition-colors"
                            title="Edit pricing rule"
                          >
                            <LuPencil className="w-4 h-4" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={(e) => { e.stopPropagation(); openDeleteModal(item); }}
                            className="p-2 text-negative-950 hover:text-negative-900 hover:bg-negative-50 rounded-lg transition-colors"
                            title="Delete pricing rule"
                          >
                            <LuTrash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {paginatedItems.length === 0 && (
            <div className="text-center py-12 text-neutral-900">
              No pricing rules found.
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4">
            <p className="text-sm text-neutral-900">
              {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredItems.length)} of {filteredItems.length} pricing rules
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

      {/* View Detail Modal */}
      <Modal
        isOpen={showViewModal && !!viewItem}
        onClose={() => setShowViewModal(false)}
        title="Pricing Rule Details"
        maxWidth="lg"
      >
        {viewItem && (
          <div>
            <ModalSection title="Pricing Information">
              <ModalInput
                type="text"
                value={viewItem.catalog_items?.name || "Unknown Item"}
                onChange={() => { }}
                placeholder="Catalog Item"
                disabled
              />
              <ModalInput
                type="text"
                value={viewItem.catalog_items?.type ? viewItem.catalog_items.type.charAt(0).toUpperCase() + viewItem.catalog_items.type.slice(1) : "-"}
                onChange={() => { }}
                placeholder="Item Type"
                disabled
              />
              <ModalInput
                type="text"
                value={pricingTypeLabel(viewItem.pricing_type)}
                onChange={() => { }}
                placeholder="Pricing Type"
                disabled
              />
              <ModalInput
                type="text"
                value={formatCurrency(viewItem.price)}
                onChange={() => { }}
                placeholder="Price"
                disabled
              />
            </ModalSection>

            <ModalSection title="Assignment">
              <ModalSelect
                value={viewItem.status}
                onChange={() => { }}
                options={STATUS_OPTIONS}
                disabled
              />
              <ModalInput
                type="text"
                value={
                  viewItem.branches
                    ? `${viewItem.branches.name} (${viewItem.branches.code})`
                    : "-"
                }
                onChange={() => { }}
                placeholder="Branch"
                disabled
              />
            </ModalSection>

            <ModalSection title="Additional Information">
              <ModalInput
                type="text"
                value={viewItem.description || "-"}
                onChange={() => { }}
                placeholder="Description"
                disabled
              />
            </ModalSection>

            <ModalSection title="Timestamps">
              <div className="grid grid-cols-2 gap-4">
                <ModalInput
                  type="text"
                  value={formatDate(viewItem.created_at)}
                  onChange={() => { }}
                  placeholder="Created"
                  disabled
                />
                <ModalInput
                  type="text"
                  value={formatDate(viewItem.updated_at)}
                  onChange={() => { }}
                  placeholder="Updated"
                  disabled
                />
              </div>
            </ModalSection>
          </div>
        )}
      </Modal>

      {/* Add Pricing Rule Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Pricing Rule"
        maxWidth="lg"
      >
        <form onSubmit={handleAdd}>
          <ModalSection title="Pricing Information">
            <ModalSelect
              value={addForm.branch_id}
              onChange={(v) => {
                setAddForm((prev) => ({ ...prev, branch_id: v, catalog_item_id: "" }));
              }}
              options={[
                { value: "", label: "Select Branch" },
                ...branches.filter((b) => b.is_active).map((b) => ({
                  value: b.id,
                  label: `${b.name} (${b.code})`,
                })),
              ]}
            />

            <ModalSelect
              value={addForm.catalog_item_id}
              onChange={(v) => setAddForm((prev) => ({ ...prev, catalog_item_id: v }))}
              options={[
                { value: "", label: "Select Catalog Item" },
                ...getCatalogItemsForBranch(addForm.branch_id).map((c) => ({
                  value: c.id,
                  label: `${c.name} (${c.type}) — Base: ${formatCurrency(c.base_price)}`,
                })),
              ]}
              disabled={!addForm.branch_id}
            />

            <ModalSelect
              value={addForm.pricing_type}
              onChange={(v) => setAddForm((prev) => ({ ...prev, pricing_type: v }))}
              options={PRICING_TYPE_OPTIONS}
            />

            <ModalInput
              type="number"
              value={addForm.price}
              onChange={(v) => setAddForm((prev) => ({ ...prev, price: v }))}
              placeholder="Price"
              required
            />

            <ModalSelect
              value={addForm.status}
              onChange={(v) => setAddForm((prev) => ({ ...prev, status: v }))}
              options={STATUS_OPTIONS}
            />

            <ModalInput
              type="text"
              value={addForm.description}
              onChange={(v) => setAddForm((prev) => ({ ...prev, description: v }))}
              placeholder="Description (optional)"
            />
          </ModalSection>

          <ModalError message={addError} />

          <ModalButtons
            onCancel={() => setShowAddModal(false)}
            submitText={addingItem ? "Creating..." : "Create Pricing Rule"}
            loading={addingItem}
          />
        </form>
      </Modal>

      {/* Edit Pricing Rule Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Pricing Rule"
        maxWidth="lg"
      >
        <form onSubmit={handleEdit}>
          <ModalSection title="Pricing Information">
            <ModalSelect
              value={editForm.branch_id}
              onChange={(v) =>
                setEditForm((prev) => ({ ...prev, branch_id: v, catalog_item_id: "" }))
              }
              options={[
                { value: "", label: "Select Branch" },
                ...branches.filter((b) => b.is_active).map((b) => ({
                  value: b.id,
                  label: `${b.name} (${b.code})`,
                })),
              ]}
            />

            <ModalSelect
              value={editForm.catalog_item_id}
              onChange={(v) => setEditForm((prev) => ({ ...prev, catalog_item_id: v }))}
              options={[
                { value: "", label: "Select Catalog Item" },
                ...getCatalogItemsForBranch(editForm.branch_id).map((c) => ({
                  value: c.id,
                  label: `${c.name} (${c.type}) — Base: ${formatCurrency(c.base_price)}`,
                })),
              ]}
              disabled={!editForm.branch_id}
            />

            <ModalSelect
              value={editForm.pricing_type}
              onChange={(v) => setEditForm((prev) => ({ ...prev, pricing_type: v }))}
              options={PRICING_TYPE_OPTIONS}
            />

            <ModalInput
              type="number"
              value={editForm.price}
              onChange={(v) => setEditForm((prev) => ({ ...prev, price: v }))}
              placeholder="Price"
              required
            />

            <ModalSelect
              value={editForm.status}
              onChange={(v) => setEditForm((prev) => ({ ...prev, status: v }))}
              options={STATUS_OPTIONS}
            />

            <ModalInput
              type="text"
              value={editForm.description}
              onChange={(v) => setEditForm((prev) => ({ ...prev, description: v }))}
              placeholder="Description (optional)"
            />
          </ModalSection>

          <ModalError message={editError} />

          <ModalButtons
            onCancel={() => setShowEditModal(false)}
            submitText={editingItem ? "Saving..." : "Save Changes"}
            loading={editingItem}
          />
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteConfirm && !!itemToDelete}
        onClose={() => setShowDeleteConfirm(false)}
        title="Delete Pricing Rule"
        maxWidth="sm"
      >
        {itemToDelete && (
          <div>
            <div className="bg-neutral-100 rounded-xl p-4 my-4">
              <p className="text-neutral-900">
                Are you sure you want to delete the{" "}
                <strong className="text-neutral-950">
                  {pricingTypeLabel(itemToDelete.pricing_type)}
                </strong>{" "}
                pricing rule for{" "}
                <strong className="text-neutral-950">
                  {itemToDelete.catalog_items?.name || "Unknown Item"}
                </strong>
                ?
              </p>
            </div>
            <p className="text-sm text-neutral-900 mb-2">
              This action cannot be undone. The pricing rule will be permanently removed.
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
                onClick={handleDelete}
                disabled={deletingItem}
                className="flex-1 px-4 py-3.5 bg-negative text-white rounded-xl font-semibold hover:bg-negative-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {deletingItem ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
