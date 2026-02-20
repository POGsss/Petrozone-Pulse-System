import { useState, useEffect, useMemo } from "react";
import {
  LuPlus,
  LuCircleAlert,
  LuRefreshCw,
  LuPencil,
  LuTrash2,
  LuPackage,
  LuChevronLeft,
  LuChevronRight,
} from "react-icons/lu";
import { catalogApi, branchesApi } from "../../lib/api";
import { showToast } from "../../lib/toast";
import { useAuth } from "../../auth";
import {
  Modal,
  ModalSection,
  ModalInput,
  ModalSelect,
  ModalToggle,
  ModalButtons,
  ModalError,
  SearchFilter,
} from "../../components";
import type { FilterGroup } from "../../components";
import type { CatalogItem, Branch } from "../../types";

const ITEMS_PER_PAGE = 12;

const TYPE_OPTIONS = [
  { value: "service", label: "Service" },
  { value: "product", label: "Product" },
  { value: "package", label: "Package" },
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

function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(price);
}

function typeLabel(type: string): string {
  return TYPE_OPTIONS.find((o) => o.value === type)?.label || type;
}


export function CatalogManagement() {
  const { user } = useAuth();
  const userRoles = user?.roles || [];
  const isHM = userRoles.includes("HM");

  // Permission checks - HM, POC, JS can manage; R and T can only view
  const canCreate = userRoles.some((r) => ["HM", "POC", "JS"].includes(r));
  const canUpdate = canCreate;
  const canDelete = canCreate;

  // Data state
  const [allItems, setAllItems] = useState<CatalogItem[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search, filters & pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = useState(1);

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    type: "service",
    description: "",
    base_price: "",
    branch_id: "",
    is_global: false,
  });
  const [addError, setAddError] = useState<string | null>(null);

  // View modal
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewItem, setViewItem] = useState<CatalogItem | null>(null);

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    type: "service",
    description: "",
    base_price: "",
    status: "active",
    branch_id: "",
    is_global: false,
  });
  const [editError, setEditError] = useState<string | null>(null);

  // Delete modal
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingItem, setDeletingItem] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<CatalogItem | null>(null);

  // Filter groups for SearchFilter
  const filterGroups: FilterGroup[] = useMemo(() => {
    const branchFilterOptions = branches.map((b) => ({
      value: b.id,
      label: b.name,
    }));
    return [
      {
        key: "status",
        label: "Status",
        options: STATUS_OPTIONS,
      },
      {
        key: "type",
        label: "Type",
        options: TYPE_OPTIONS,
      },
      {
        key: "branch",
        label: "Branch",
        options: [{ value: "global", label: "Global" }, ...branchFilterOptions],
      },
    ];
  }, [branches]);

  // Filtered + paginated
  const { paginatedItems, totalPages } = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const filtered = allItems.filter((item) => {
      // Search
      const matchSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q) ||
        item.type.toLowerCase().includes(q);

      // Filters
      const statusFilter = activeFilters.status;
      const matchStatus = !statusFilter || statusFilter === "all" || item.status === statusFilter;

      const typeFilter = activeFilters.type;
      const matchType = !typeFilter || typeFilter === "all" || item.type === typeFilter;

      const branchFilter = activeFilters.branch;
      const matchBranch =
        !branchFilter ||
        branchFilter === "all" ||
        (branchFilter === "global" ? item.is_global : item.branch_id === branchFilter);

      return matchSearch && matchStatus && matchType && matchBranch;
    });
    const pages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return {
      paginatedItems: filtered.slice(start, start + ITEMS_PER_PAGE),
      totalPages: pages,
    };
  }, [allItems, searchQuery, activeFilters, currentPage]);

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
      const [catalogRes, branchesData] = await Promise.all([
        catalogApi.getAll({ limit: 1000 }),
        branchesApi.getAll(),
      ]);
      setAllItems(catalogRes.data);
      setBranches(branchesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }

  // Default branch
  const defaultBranchId = useMemo(() => {
    if (!isHM && user?.branches?.length) {
      const primary = user.branches.find((b) => b.is_primary);
      return primary?.branch_id || user.branches[0]?.branch_id || "";
    }
    return "";
  }, [user, isHM]);

  // Branch options
  const branchOptions = useMemo(() => {
    if (!isHM && user?.branches) {
      return user.branches.map((ba) => ({
        value: ba.branch_id,
        label: ba.branches.name,
      }));
    }
    return branches.map((b) => ({ value: b.id, label: b.name }));
  }, [branches, user, isHM]);

  // --- Add ---
  function openAddModal() {
    setAddForm({
      name: "",
      type: "service",
      description: "",
      base_price: "",
      branch_id: defaultBranchId,
      is_global: false,
    });
    setAddError(null);
    setShowAddModal(true);
  }

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);

    if (!addForm.name.trim()) {
      setAddError("Name is required");
      return;
    }
    if (!addForm.base_price || isNaN(parseFloat(addForm.base_price)) || parseFloat(addForm.base_price) < 0) {
      setAddError("Base price must be a valid non-negative number");
      return;
    }
    if (!addForm.is_global && !addForm.branch_id) {
      setAddError("Select a branch or mark as global");
      return;
    }

    try {
      setAddingItem(true);
      await catalogApi.create({
        name: addForm.name.trim(),
        type: addForm.type,
        description: addForm.description.trim() || undefined,
        base_price: parseFloat(addForm.base_price),
        branch_id: addForm.is_global ? undefined : addForm.branch_id,
        is_global: addForm.is_global,
      });
      setShowAddModal(false);
      showToast.success("Catalog item created successfully");
      fetchData();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to create catalog item");
      showToast.error(err instanceof Error ? err.message : "Failed to create catalog item");
    } finally {
      setAddingItem(false);
    }
  }

  // --- View ---
  function openViewModal(item: CatalogItem) {
    setViewItem(item);
    setShowViewModal(true);
  }

  // --- Edit ---
  function openEditModal(item: CatalogItem) {
    setSelectedItem(item);
    setEditForm({
      name: item.name,
      type: item.type,
      description: item.description || "",
      base_price: item.base_price.toString(),
      status: item.status,
      branch_id: item.branch_id || "",
      is_global: item.is_global,
    });
    setEditError(null);
    setShowEditModal(true);
  }

  async function handleEditItem(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedItem) return;
    setEditError(null);

    if (!editForm.name.trim()) {
      setEditError("Name cannot be empty");
      return;
    }
    if (!editForm.base_price || isNaN(parseFloat(editForm.base_price)) || parseFloat(editForm.base_price) < 0) {
      setEditError("Base price must be a valid non-negative number");
      return;
    }
    if (!editForm.is_global && !editForm.branch_id) {
      setEditError("Select a branch or mark as global");
      return;
    }

    try {
      setEditingItem(true);
      await catalogApi.update(selectedItem.id, {
        name: editForm.name.trim(),
        type: editForm.type,
        description: editForm.description.trim() || null,
        base_price: parseFloat(editForm.base_price),
        status: editForm.status,
        branch_id: editForm.is_global ? null : editForm.branch_id,
        is_global: editForm.is_global,
      });
      setShowEditModal(false);
      setSelectedItem(null);
      showToast.success("Catalog item updated successfully");
      fetchData();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update catalog item");
      showToast.error(err instanceof Error ? err.message : "Failed to update catalog item");
    } finally {
      setEditingItem(false);
    }
  }

  // --- Delete ---
  function openDeleteConfirmModal(item: CatalogItem) {
    setItemToDelete(item);
    setShowDeleteConfirm(true);
  }

  async function handleDeleteItem() {
    if (!itemToDelete) return;
    try {
      setDeletingItem(true);
      const result = await catalogApi.delete(itemToDelete.id);
      setShowDeleteConfirm(false);
      setItemToDelete(null);
      if (result.deactivated) {
        showToast.info("Catalog item is referenced by job orders and has been deactivated instead");
      } else {
        showToast.success("Catalog item deleted successfully");
      }
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete catalog item");
      showToast.error(err instanceof Error ? err.message : "Failed to delete catalog item");
    } finally {
      setDeletingItem(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LuRefreshCw className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error && allItems.length === 0) {
    return (
      <div className="bg-negative-200 border border-negative rounded-lg p-4 flex items-center gap-3">
        <LuCircleAlert className="w-5 h-5 text-negative-950 shrink-0" />
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between bg-white rounded-xl p-4 border border-neutral-200">
        <div>
          <h3 className="text-lg font-semibold text-neutral-950">Catalog</h3>
          <p className="text-sm text-neutral-900">{allItems.length} items total</p>
        </div>
        {canCreate && (
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-950 transition-colors"
          >
            <LuPlus className="w-4 h-4" />
            Add Item
          </button>
        )}
      </div>

      {/* Search & Filter bar */}
      {allItems.length > 0 && (
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

      {/* Catalog Cards Grid */}
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
                  <LuPackage className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold text-neutral-950">{item.name}</h4>
                  {item.is_global ? (
                    <span className="text-xs font-mono bg-primary-100 text-primary px-2 py-0.5 rounded">
                      Global
                    </span>
                  ) : item.branches ? (
                    <span className="text-xs font-mono bg-neutral-100 text-primary px-2 py-0.5 rounded">
                      {item.branches.code}
                    </span>
                  ) : null}
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

            {/* Item details */}
            <div className="space-y-1 text-sm text-neutral-900 mb-3">
              <p className="text-neutral-900">{formatPrice(item.base_price)}</p>
              <p className="text-neutral-900">{typeLabel(item.type)}</p>
              {item.description && <p className="text-neutral-900 line-clamp-2">{item.description}</p>}
            </div>

            {/* Actions */}
            <div
              className={`flex items-center justify-end ${
                canUpdate || canDelete ? "gap-4 pt-3 border-t border-neutral-200" : ""
              }`}
            >
              {canUpdate && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditModal(item);
                  }}
                  className="flex items-center gap-1 text-sm text-primary hover:text-primary-900"
                >
                  <LuPencil className="w-4 h-4" />
                  Edit
                </button>
              )}
              {canDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openDeleteConfirmModal(item);
                  }}
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
            {searchQuery
              ? "No catalog items match your search."
              : 'No catalog items found. Click "Add Item" to create one.'}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white rounded-xl p-4 border border-neutral-200">
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

      {/* Add Catalog Item Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Catalog Item"
        maxWidth="lg"
      >
        <form onSubmit={handleAddItem}>
          <ModalSection title="Item Information">
            <ModalInput
              type="text"
              value={addForm.name}
              onChange={(v) => setAddForm((prev) => ({ ...prev, name: v }))}
              placeholder="Name *"
              required
            />
            <ModalSelect
              value={addForm.type}
              onChange={(v) => setAddForm((prev) => ({ ...prev, type: v }))}
              options={TYPE_OPTIONS}
            />
            <ModalInput
              type="number"
              value={addForm.base_price}
              onChange={(v) => setAddForm((prev) => ({ ...prev, base_price: v }))}
              placeholder="Base Price *"
              required
            />
            <textarea
              value={addForm.description}
              onChange={(e) =>
                setAddForm((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder="Description (optional)"
              rows={3}
              className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
            />
          </ModalSection>

          <ModalSection title="Scope">
            {isHM && (
              <ModalToggle
                label="Global Item"
                checked={addForm.is_global}
                onChange={(v) =>
                  setAddForm((prev) => ({
                    ...prev,
                    is_global: v,
                    branch_id: v ? "" : prev.branch_id,
                  }))
                }
                description="Available to all branches"
              />
            )}
            {!addForm.is_global && (
              <ModalSelect
                value={addForm.branch_id}
                onChange={(v) =>
                  setAddForm((prev) => ({ ...prev, branch_id: v }))
                }
                placeholder="Select Branch *"
                options={branchOptions}
              />
            )}
          </ModalSection>

          <ModalError message={addError} />

          <ModalButtons
            onCancel={() => setShowAddModal(false)}
            submitText={addingItem ? "Creating..." : "Create Item"}
            loading={addingItem}
          />
        </form>
      </Modal>

      {/* View Catalog Item Modal */}
      <Modal
        isOpen={showViewModal && !!viewItem}
        onClose={() => setShowViewModal(false)}
        title="Catalog Item Details"
        maxWidth="lg"
      >
        {viewItem && (
          <div>
            <ModalSection title="Item Information">
              <ModalInput
                type="text"
                value={viewItem.name}
                onChange={() => {}}
                placeholder="Name"
                disabled
              />
              <ModalSelect
                value={viewItem.type}
                onChange={() => {}}
                options={TYPE_OPTIONS}
                disabled
              />
              <ModalInput
                type="text"
                value={formatPrice(viewItem.base_price)}
                onChange={() => {}}
                placeholder="Base Price"
                disabled
              />
              <ModalSelect
                value={viewItem.status}
                onChange={() => {}}
                options={STATUS_OPTIONS}
                disabled
              />
              <textarea
                value={viewItem.description || "-"}
                readOnly
                disabled
                rows={3}
                className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none transition-all resize-none opacity-50 cursor-not-allowed"
              />
            </ModalSection>

            <ModalSection title="Scope">
              <ModalInput
                type="text"
                value={
                  viewItem.is_global
                    ? "Global (all branches)"
                    : viewItem.branches
                    ? `${viewItem.branches.name} (${viewItem.branches.code})`
                    : "-"
                }
                onChange={() => {}}
                placeholder="Branch"
                disabled
              />
            </ModalSection>

            <ModalSection title="Timestamps">
              <div className="grid grid-cols-2 gap-4">
                <ModalInput
                  type="text"
                  value={formatDate(viewItem.created_at)}
                  onChange={() => {}}
                  placeholder="Created"
                  disabled
                />
                <ModalInput
                  type="text"
                  value={formatDate(viewItem.updated_at)}
                  onChange={() => {}}
                  placeholder="Updated"
                  disabled
                />
              </div>
            </ModalSection>
          </div>
        )}
      </Modal>

      {/* Edit Catalog Item Modal */}
      <Modal
        isOpen={showEditModal && !!selectedItem}
        onClose={() => setShowEditModal(false)}
        title="Edit Catalog Item"
        maxWidth="lg"
      >
        <form onSubmit={handleEditItem}>
          <ModalSection title="Item Information">
            <ModalInput
              type="text"
              value={editForm.name}
              onChange={(v) => setEditForm((prev) => ({ ...prev, name: v }))}
              placeholder="Name *"
              required
            />
            <ModalSelect
              value={editForm.type}
              onChange={(v) => setEditForm((prev) => ({ ...prev, type: v }))}
              options={TYPE_OPTIONS}
            />
            <ModalInput
              type="number"
              value={editForm.base_price}
              onChange={(v) =>
                setEditForm((prev) => ({ ...prev, base_price: v }))
              }
              placeholder="Base Price *"
              required
            />
            <ModalSelect
              value={editForm.status}
              onChange={(v) =>
                setEditForm((prev) => ({ ...prev, status: v }))
              }
              options={STATUS_OPTIONS}
            />
            <textarea
              value={editForm.description}
              onChange={(e) =>
                setEditForm((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder="Description (optional)"
              rows={3}
              className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
            />
          </ModalSection>

          <ModalSection title="Scope">
            {isHM && (
              <ModalToggle
                label="Global Item"
                checked={editForm.is_global}
                onChange={(v) =>
                  setEditForm((prev) => ({
                    ...prev,
                    is_global: v,
                    branch_id: v ? "" : prev.branch_id,
                  }))
                }
                description="Available to all branches"
              />
            )}
            {!editForm.is_global && (
              <ModalSelect
                value={editForm.branch_id}
                onChange={(v) =>
                  setEditForm((prev) => ({ ...prev, branch_id: v }))
                }
                placeholder="Select Branch *"
                options={branchOptions}
              />
            )}
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
        title="Delete Catalog Item"
        maxWidth="sm"
      >
        {itemToDelete && (
          <div>
            <div className="bg-neutral-100 rounded-xl p-4 my-4">
              <p className="text-neutral-900">
                Are you sure you want to delete{" "}
                <strong className="text-neutral-950">
                  {itemToDelete.name}
                </strong>{" "}
                ({typeLabel(itemToDelete.type)})?
              </p>
            </div>
            <p className="text-sm text-neutral-900 mb-2">
              This item will be permanently removed. If it is referenced by other records, it will be deactivated instead.
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
                onClick={handleDeleteItem}
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
