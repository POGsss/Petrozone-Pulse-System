import { useState, useEffect, useMemo } from "react";
import {
  LuPlus,
  LuPencil,
  LuTrash2,
  LuPackage,
  LuX,
} from "react-icons/lu";
import { packagesApi, pricingApi } from "../../lib/api";
import { showToast } from "../../lib/toast";
import { useAuth } from "../../auth";
import {
  Modal,
  ModalSection,
  ModalInput,
  ModalSelect,
  ModalButtons,
  ModalError,
  SearchFilter,
  PageHeader,
  Pagination,
  ErrorAlert,
  SkeletonLoader,
  CardGrid,
  GridCard,
} from "../../components";
import type { FilterGroup } from "../../components";
import type { PackageItem } from "../../types";

const ITEMS_PER_PAGE = 12;

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const CATEGORY_PRESETS = [
  "Oil & Lubricants",
  "Filters",
  "Brake Parts",
  "Engine Parts",
  "Tires",
  "Batteries",
  "Accessories",
  "Cleaning Supplies",
  "Other",
];

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function PackagesManagement() {
  const { user } = useAuth();
  const userRoles = user?.roles || [];

  // Permission checks - HM, POC, JS can manage; R and T can only view
  const canCreate = userRoles.some((r) => ["HM", "POC", "JS"].includes(r));
  const canUpdate = canCreate;
  const canDelete = canCreate;

  // Data state
  const [allItems, setAllItems] = useState<PackageItem[]>([]);
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
    description: "",
    inventory_types: [] as string[],
  });
  const [addError, setAddError] = useState<string | null>(null);

  // View modal
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewItem, setViewItem] = useState<PackageItem | null>(null);

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PackageItem | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    status: "active",
    inventory_types: [] as string[],
  });
  const [editError, setEditError] = useState<string | null>(null);

  // Delete modal
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingItem, setDeletingItem] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<PackageItem | null>(null);
  const [itemHasReferences, setItemHasReferences] = useState(false);
  const [checkingReferences, setCheckingReferences] = useState(false);

  // Category select state for add modal
  const [addCategorySelect, setAddCategorySelect] = useState("");
  // Category select state for edit modal
  const [editCategorySelect, setEditCategorySelect] = useState("");

  // Filter groups for SearchFilter
  const filterGroups: FilterGroup[] = useMemo(() => {
    return [
      {
        key: "status",
        label: "Status",
        options: STATUS_OPTIONS,
      },
    ];
  }, []);

  // Filtered + paginated
  const { paginatedItems, totalPages } = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const filtered = allItems.filter((item) => {
      // Search
      const matchSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q);

      // Filters
      const statusFilter = activeFilters.status;
      const matchStatus = !statusFilter || statusFilter === "all" || item.status === statusFilter;

      return matchSearch && matchStatus;
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
      const packageRes = await packagesApi.getAll({ limit: 1000 });
      setAllItems(packageRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }

  // --- Add ---
  async function openAddModal() {
    setAddForm({ name: "", description: "", inventory_types: [] });
    setAddError(null);
    setAddCategorySelect("");
    setShowAddModal(true);
  }

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);

    if (!addForm.name.trim()) {
      setAddError("Name is required");
      return;
    }

    try {
      setAddingItem(true);
      await packagesApi.create({
        name: addForm.name.trim(),
        description: addForm.description.trim() || undefined,
        inventory_types: addForm.inventory_types,
      });
      setShowAddModal(false);
      showToast.success("Package item created successfully");
      fetchData();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to create Package item");
      showToast.error(err instanceof Error ? err.message : "Failed to create Package item");
    } finally {
      setAddingItem(false);
    }
  }

  // --- View ---
  async function openViewModal(item: PackageItem) {
    setViewItem(item);
    setShowViewModal(true);
  }

  // --- Edit ---
  async function openEditModal(item: PackageItem) {
    setSelectedItem(item);
    setEditForm({
      name: item.name,
      description: item.description || "",
      status: item.status,
      inventory_types: item.inventory_types || [],
    });
    setEditError(null);
    setEditCategorySelect("");
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

    try {
      setEditingItem(true);
      await packagesApi.update(selectedItem.id, {
        name: editForm.name.trim(),
        description: editForm.description.trim() || null,
        status: editForm.status,
        inventory_types: editForm.inventory_types,
      });
      setShowEditModal(false);
      setSelectedItem(null);
      showToast.success("Package item updated successfully");
      fetchData();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update Package item");
      showToast.error(err instanceof Error ? err.message : "Failed to update Package item");
    } finally {
      setEditingItem(false);
    }
  }

  // --- Delete ---
  async function openDeleteConfirmModal(item: PackageItem) {
    setItemToDelete(item);
    setItemHasReferences(false);
    setCheckingReferences(true);
    setShowDeleteConfirm(true);
    try {
      const pricingRes = await pricingApi.getAll({ package_item_id: item.id, limit: 1 });
      setItemHasReferences((pricingRes.data?.length ?? 0) > 0);
    } catch {
      setItemHasReferences(true);
    } finally {
      setCheckingReferences(false);
    }
  }

  async function handleDeleteItem() {
    if (!itemToDelete) return;
    try {
      setDeletingItem(true);
      const result = await packagesApi.delete(itemToDelete.id);
      setShowDeleteConfirm(false);
      setItemToDelete(null);
      const isDeactivated = result.message?.toLowerCase().includes("deactivated");
      showToast.success(isDeactivated ? "Package item deactivated successfully" : "Package item deleted successfully");
      fetchData();
    } catch (err) {
      const failMsg = itemHasReferences ? "Failed to deactivate Package item" : "Failed to delete Package item";
      setError(err instanceof Error ? err.message : failMsg);
      showToast.error(err instanceof Error ? err.message : failMsg);
    } finally {
      setDeletingItem(false);
    }
  }

  if (loading) {
    return <SkeletonLoader showHeader rows={6} variant="grid" />;
  }

  if (error && allItems.length === 0) {
    return <ErrorAlert message={error} onRetry={fetchData} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Packages"
        subtitle={`${allItems.length} items total`}
        buttonLabel="Add New Package"
        onAdd={openAddModal}
        showButton={canCreate}
      />

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

      {/* Packages Cards Grid */}
      <CardGrid
        isEmpty={paginatedItems.length === 0}
        emptyMessage={
          searchQuery
            ? "No Package items match your search."
            : 'No package items found. Click "Add New Package" to create one.'
        }
      >
        {paginatedItems.map((item) => (
          <GridCard
            key={item.id}
            onClick={() => openViewModal(item)}
            icon={<LuPackage className="w-5 h-5 text-primary" />}
            title={item.name}
            subtitle="GLOBAL"
            statusBadge={{
              label: item.status === "active" ? "Active" : "Inactive",
              className: item.status === "active"
                ? "bg-positive-100 text-positive"
                : "bg-negative-100 text-negative",
            }}
            details={
              <>
                <p className="text-xs">{(item.inventory_types?.length ?? 0)} categor{(item.inventory_types?.length ?? 0) !== 1 ? "ies" : "y"}</p>
                {item.description && <p className="text-neutral-900 line-clamp-2">{item.description}</p>}
              </>
            }
            actions={[
              ...(canUpdate ? [{
                label: "Edit",
                icon: <LuPencil className="w-4 h-4" />,
                onClick: (e: React.MouseEvent) => { e.stopPropagation(); openEditModal(item); },
              }] : []),
              ...(canDelete ? [{
                label: "Delete",
                icon: <LuTrash2 className="w-4 h-4" />,
                onClick: (e: React.MouseEvent) => { e.stopPropagation(); openDeleteConfirmModal(item); },
                className: "flex items-center gap-1 text-sm text-negative hover:text-negative-900",
              }] : []),
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

      {/* Add Package item Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Package item"
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

          <ModalSection title="Required Categories">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <ModalSelect
                  value={addCategorySelect}
                  onChange={setAddCategorySelect}
                  placeholder="Select Category"
                  options={CATEGORY_PRESETS.map((c) => ({ value: c, label: c }))}
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  if (addCategorySelect) {
                    setAddForm((prev) => ({
                      ...prev,
                      inventory_types: [...prev.inventory_types, addCategorySelect],
                    }));
                    setAddCategorySelect("");
                  }
                }}
                disabled={!addCategorySelect}
                className="px-4.5 py-4.5 bg-primary text-white rounded-xl hover:bg-primary-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                <LuPlus className="w-4 h-4" />
              </button>
            </div>
            {addForm.inventory_types.length > 0 ? (
              <div className="mt-3 space-y-2">
                {addForm.inventory_types.map((cat, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-neutral-100 rounded-xl px-4 py-3">
                    <p className="font-medium text-neutral-950 text-sm">{cat}</p>
                    <button
                      type="button"
                      onClick={() => setAddForm((prev) => ({
                        ...prev,
                        inventory_types: prev.inventory_types.filter((_, i) => i !== idx),
                      }))}
                      className="text-negative hover:text-negative-900 p-1 ml-3"
                    >
                      <LuX className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-neutral-900 mt-1">Add categories to define which inventory types are required for this service.</p>
            )}
          </ModalSection>

          <ModalError message={addError} />

          <ModalButtons
            onCancel={() => setShowAddModal(false)}
            submitText={addingItem ? "Creating..." : "Create Package"}
            loading={addingItem}
          />
        </form>
      </Modal>

      {/* View Package item Modal */}
      <Modal
        isOpen={showViewModal && !!viewItem}
        onClose={() => setShowViewModal(false)}
        title="Package Item Details"
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
                className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none transition-all resize-none cursor-readonly"
              />
            </ModalSection>

            <ModalSection title="Required Categories">
              {viewItem.inventory_types && viewItem.inventory_types.length > 0 ? (
                <div className="space-y-2">
                  {viewItem.inventory_types.map((cat, idx) => (
                    <div key={idx} className="bg-neutral-100 rounded-xl px-4 py-3">
                      <p className="font-medium text-neutral-950 text-sm">{cat}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-neutral-900 text-center py-3">No categories specified.</p>
              )}
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

      {/* Edit Package item Modal */}
      <Modal
        isOpen={showEditModal && !!selectedItem}
        onClose={() => setShowEditModal(false)}
        title="Edit Package Item"
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

          <ModalSection title="Required Categories">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <ModalSelect
                  value={editCategorySelect}
                  onChange={setEditCategorySelect}
                  placeholder="Select Category"
                  options={CATEGORY_PRESETS.map((c) => ({ value: c, label: c }))}
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  if (editCategorySelect) {
                    setEditForm((prev) => ({
                      ...prev,
                      inventory_types: [...prev.inventory_types, editCategorySelect],
                    }));
                    setEditCategorySelect("");
                  }
                }}
                disabled={!editCategorySelect}
                className="px-4.5 py-4.5 bg-primary text-white rounded-xl hover:bg-primary-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                <LuPlus className="w-4 h-4" />
              </button>
            </div>
            {editForm.inventory_types.length > 0 ? (
              <div className="mt-3 space-y-2">
                {editForm.inventory_types.map((cat, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-neutral-100 rounded-xl px-4 py-3">
                    <p className="font-medium text-neutral-950 text-sm">{cat}</p>
                    <button
                      type="button"
                      onClick={() => setEditForm((prev) => ({
                        ...prev,
                        inventory_types: prev.inventory_types.filter((_, i) => i !== idx),
                      }))}
                      className="text-negative hover:text-negative-900 p-1 ml-3"
                    >
                      <LuX className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-neutral-900 mt-1">Add categories to define which inventory types are required for this service.</p>
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

      {/* Delete / Deactivate Confirmation Modal */}
      <Modal
        isOpen={showDeleteConfirm && !!itemToDelete}
        onClose={() => setShowDeleteConfirm(false)}
        title={itemHasReferences ? "Deactivate Package item" : "Delete Package item"}
        maxWidth="sm"
      >
        {itemToDelete && (
          <div>
            <div className="bg-neutral-100 rounded-xl p-4 my-4">
              <p className="text-neutral-900">
                {itemHasReferences
                  ? <>Are you sure you want to deactivate <strong className="text-neutral-950">{itemToDelete.name}</strong>?</>
                  : <>Are you sure you want to delete <strong className="text-neutral-950">{itemToDelete.name}</strong>?</>
                }
              </p>
            </div>
            <p className="text-sm text-neutral-900 mb-2">
              {itemHasReferences
                ? "This Package item has existing pricing records and will be set to inactive instead of deleted."
                : "This action cannot be undone. All Package item data will be permanently removed."
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
                onClick={handleDeleteItem}
                disabled={deletingItem || checkingReferences}
                className="flex-1 px-4 py-3.5 bg-negative text-white rounded-xl font-semibold hover:bg-negative-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {checkingReferences
                  ? "Checking..."
                  : deletingItem
                    ? (itemHasReferences ? "Deactivating..." : "Deleting...")
                    : (itemHasReferences ? "Deactivate" : "Delete")
                }
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
