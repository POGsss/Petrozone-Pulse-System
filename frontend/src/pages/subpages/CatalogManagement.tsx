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
  LuX,
} from "react-icons/lu";
import { catalogApi, inventoryApi } from "../../lib/api";
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
} from "../../components";
import type { FilterGroup } from "../../components";
import type { CatalogItem, CatalogInventoryLink, InventoryItem } from "../../types";

const ITEMS_PER_PAGE = 12;

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

export function CatalogManagement() {
  const { user } = useAuth();
  const userRoles = user?.roles || [];

  // Permission checks - HM, POC, JS can manage; R and T can only view
  const canCreate = userRoles.some((r) => ["HM", "POC", "JS"].includes(r));
  const canUpdate = canCreate;
  const canDelete = canCreate;

  // Data state
  const [allItems, setAllItems] = useState<CatalogItem[]>([]);
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
  });
  const [addError, setAddError] = useState<string | null>(null);

  // View modal
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewItem, setViewItem] = useState<CatalogItem | null>(null);
  const [viewLinks, setViewLinks] = useState<CatalogInventoryLink[]>([]);
  const [viewLinksLoading, setViewLinksLoading] = useState(false);

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    status: "active",
  });
  const [editError, setEditError] = useState<string | null>(null);

  // Delete modal
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingItem, setDeletingItem] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<CatalogItem | null>(null);

  // Inventory counts for card display
  const [inventoryCounts, setInventoryCounts] = useState<Record<string, number>>({});

  // Add modal – draft inventory
  const [addDraftInv, setAddDraftInv] = useState<InventoryItem[]>([]);
  const [addAvailInv, setAddAvailInv] = useState<InventoryItem[]>([]);
  const [addInvSelectId, setAddInvSelectId] = useState("");
  const [addLoadingInv, setAddLoadingInv] = useState(false);

  // Edit modal – live inventory links
  const [editInvLinks, setEditInvLinks] = useState<CatalogInventoryLink[]>([]);
  const [editInvLoading, setEditInvLoading] = useState(false);
  const [editAvailInv, setEditAvailInv] = useState<InventoryItem[]>([]);
  const [editInvSelectId, setEditInvSelectId] = useState("");
  const [editInvAdding, setEditInvAdding] = useState(false);

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
      const catalogRes = await catalogApi.getAll({ limit: 1000 });
      setAllItems(catalogRes.data);
      // Load inventory link counts
      const counts: Record<string, number> = {};
      await Promise.all(
        catalogRes.data.map(async (item) => {
          try {
            const links = await catalogApi.getInventoryLinks(item.id);
            counts[item.id] = links.length;
          } catch {
            counts[item.id] = 0;
          }
        })
      );
      setInventoryCounts(counts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }

  // --- Add ---
  async function openAddModal() {
    setAddForm({ name: "", description: "" });
    setAddError(null);
    setAddDraftInv([]);
    setAddInvSelectId("");
    setAddLoadingInv(true);
    setShowAddModal(true);
    try {
      const invRes = await inventoryApi.getAll({ status: "active", limit: 500 });
      setAddAvailInv(invRes.data);
    } catch {
      // Silently fail
    } finally {
      setAddLoadingInv(false);
    }
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
      const created = await catalogApi.create({
        name: addForm.name.trim(),
        description: addForm.description.trim() || undefined,
      });
      // Add inventory links
      for (const inv of addDraftInv) {
        try {
          await catalogApi.addInventoryLink(created.id, { inventory_item_id: inv.id });
        } catch {
          // continue
        }
      }
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
  async function openViewModal(item: CatalogItem) {
    setViewItem(item);
    setViewLinks([]);
    setViewLinksLoading(true);
    setShowViewModal(true);
    try {
      const links = await catalogApi.getInventoryLinks(item.id);
      setViewLinks(links);
    } catch {
      // Silently fail
    } finally {
      setViewLinksLoading(false);
    }
  }

  // --- Edit ---
  async function openEditModal(item: CatalogItem) {
    setSelectedItem(item);
    setEditForm({
      name: item.name,
      description: item.description || "",
      status: item.status,
    });
    setEditError(null);
    setEditInvLinks([]);
    setEditInvSelectId("");
    setEditInvLoading(true);
    setShowEditModal(true);
    try {
      const [links, invRes] = await Promise.all([
        catalogApi.getInventoryLinks(item.id),
        inventoryApi.getAll({ status: "active", limit: 500 }),
      ]);
      setEditInvLinks(links);
      setEditAvailInv(invRes.data);
    } catch {
      // Silently fail
    } finally {
      setEditInvLoading(false);
    }
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
      await catalogApi.update(selectedItem.id, {
        name: editForm.name.trim(),
        description: editForm.description.trim() || null,
        status: editForm.status,
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

  // --- Edit modal: inventory link management ---
  async function handleEditAddLink() {
    if (!selectedItem || !editInvSelectId) return;
    try {
      setEditInvAdding(true);
      const newLink = await catalogApi.addInventoryLink(selectedItem.id, {
        inventory_item_id: editInvSelectId,
      });
      setEditInvLinks((prev) => [...prev, newLink]);
      setEditInvSelectId("");
      showToast.success("Inventory item linked");
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : "Failed to add link");
    } finally {
      setEditInvAdding(false);
    }
  }

  async function handleEditRemoveLink(linkId: string) {
    if (!selectedItem) return;
    try {
      await catalogApi.removeInventoryLink(selectedItem.id, linkId);
      setEditInvLinks((prev) => prev.filter((l) => l.id !== linkId));
      showToast.success("Inventory link removed");
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : "Failed to remove link");
    }
  }

  // Available inventory for add modal
  const addAvailableInvItems = useMemo(() => {
    const draftIds = new Set(addDraftInv.map((inv) => inv.id));
    return addAvailInv.filter((inv) => !draftIds.has(inv.id));
  }, [addAvailInv, addDraftInv]);

  // Available inventory for edit modal
  const editAvailableInvItems = useMemo(() => {
    const linkedIds = new Set(editInvLinks.map((l) => l.inventory_item_id));
    return editAvailInv.filter((inv) => !linkedIds.has(inv.id));
  }, [editAvailInv, editInvLinks]);

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
            Add New Catalog
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
            className="bg-white rounded-xl border border-neutral-200 p-4 cursor-pointer hover:bg-neutral-100 transition-colors"
          >
            {/* Card header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary-100 rounded-lg">
                  <LuPackage className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold text-neutral-950">{item.name}</h4>
                  <span className="text-xs font-mono bg-neutral-100 text-primary px-2 py-0.5 rounded">
                    GLOBAL
                  </span>
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
              <p className="text-xs">{inventoryCounts[item.id] ?? 0} inventory item{(inventoryCounts[item.id] ?? 0) !== 1 ? "s" : ""}</p>
              {item.description && <p className="text-neutral-900 line-clamp-2">{item.description}</p>}
            </div>

            {/* Actions */}
            {(canUpdate || canDelete) && (
              <div className="flex items-center justify-end gap-4 pt-3 border-t border-neutral-200">
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
            )}
          </div>
        ))}

        {paginatedItems.length === 0 && (
          <div className="col-span-full text-center py-12 text-neutral-900">
            {searchQuery
              ? "No catalog items match your search."
              : 'No catalog items found. Click "Add New Catalog" to create one.'}
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

          <ModalSection title="Inventory Items">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <ModalSelect
                  value={addInvSelectId}
                  onChange={setAddInvSelectId}
                  placeholder={addLoadingInv ? "Loading..." : "Select Inventory Item"}
                  options={addAvailableInvItems.map((inv) => ({
                    value: inv.id,
                    label: `${inv.item_name} (${inv.sku_code}) \u2014 ${formatPrice(inv.cost_price)}`,
                  }))}
                  disabled={addLoadingInv}
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  const inv = addAvailInv.find((i) => i.id === addInvSelectId);
                  if (inv) {
                    setAddDraftInv((prev) => [...prev, inv]);
                    setAddInvSelectId("");
                  }
                }}
                disabled={!addInvSelectId || addLoadingInv}
                className="px-4.5 py-4.5 bg-primary text-white rounded-xl hover:bg-primary-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                <LuPlus className="w-4 h-4" />
              </button>
            </div>
            {addDraftInv.length > 0 && (
              <div className="mt-3 space-y-4">
                {addDraftInv.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between bg-neutral-100 rounded-xl px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-neutral-950 text-sm truncate">{inv.item_name}</p>
                      <p className="text-xs text-neutral-900">SKU: {inv.sku_code} | {formatPrice(inv.cost_price)} / {inv.unit_of_measure || "unit"}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAddDraftInv((prev) => prev.filter((i) => i.id !== inv.id))}
                      className="text-negative hover:text-negative-900 p-1 ml-3"
                    >
                      <LuX className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </ModalSection>

          <ModalError message={addError} />

          <ModalButtons
            onCancel={() => setShowAddModal(false)}
            submitText={addingItem ? "Creating..." : "Create Catalog"}
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

            <ModalSection title="Linked Inventory">
              {viewLinksLoading ? (
                <div className="space-y-4">
                  {[1, 2].map((i) => (
                    <div key={i} className="bg-neutral-100 rounded-xl px-4 py-3 animate-pulse">
                      <div className="h-4 bg-neutral-200 rounded w-3/4 mb-2" />
                      <div className="h-3 bg-neutral-200 rounded w-1/2" />
                    </div>
                  ))}
                </div>
              ) : viewLinks.length > 0 ? (
                <div className="max-h-40 overflow-y-auto space-y-4">
                  {viewLinks.map((link) => (
                    <div
                      key={link.id}
                      className="bg-neutral-100 rounded-xl px-4 py-3"
                    >
                      <p className="font-medium text-neutral-950 text-sm">
                        {link.inventory_items?.item_name || "Unknown"}
                      </p>
                      <p className="text-xs text-neutral-900">
                        SKU: {link.inventory_items?.sku_code || "-"} · {formatPrice(link.inventory_items?.cost_price || 0)} / {link.inventory_items?.unit_of_measure || "unit"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-neutral-900 text-center py-3">No inventory items linked.</p>
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

          <ModalSection title="Inventory Items">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <ModalSelect
                  value={editInvSelectId}
                  onChange={setEditInvSelectId}
                  placeholder={editInvLoading ? "Loading..." : "Select Inventory Item"}
                  options={editAvailableInvItems.map((inv) => ({
                    value: inv.id,
                    label: `${inv.item_name} (${inv.sku_code}) \u2014 ${formatPrice(inv.cost_price)}`,
                  }))}
                  disabled={editInvLoading}
                />
              </div>
              <button
                type="button"
                onClick={handleEditAddLink}
                disabled={editInvAdding || !editInvSelectId}
                className="px-4.5 py-4.5 bg-primary text-white rounded-xl hover:bg-primary-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                {editInvAdding ? (
                  <LuRefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <LuPlus className="w-4 h-4" />
                )}
              </button>
            </div>
            {editInvLoading ? (
              <div className="mt-3 space-y-4">
                {[1, 2].map((i) => (
                  <div key={i} className="bg-neutral-100 rounded-xl px-4 py-3 animate-pulse">
                    <div className="h-4 bg-neutral-200 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-neutral-200 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : editInvLinks.length > 0 ? (
              <div className="mt-3 space-y-4">
                {editInvLinks.map((link) => (
                  <div key={link.id} className="flex items-center justify-between bg-neutral-100 rounded-xl px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-neutral-950 text-sm truncate">
                        {link.inventory_items?.item_name || "Unknown"}
                      </p>
                      <p className="text-xs text-neutral-900">
                        SKU: {link.inventory_items?.sku_code || "-"} | {formatPrice(link.inventory_items?.cost_price || 0)} / {link.inventory_items?.unit_of_measure || "unit"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleEditRemoveLink(link.id)}
                      className="text-negative hover:text-negative-900 p-1 ml-3"
                    >
                      <LuX className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-neutral-900 text-center py-3">No inventory items linked.</p>
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
                </strong>?
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
