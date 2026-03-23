import { useState, useEffect, useMemo } from "react";
import {
  LuPlus,
  LuPencil,
  LuTrash2,
  LuPackage,
  LuX,
} from "react-icons/lu";
import { packagesApi, laborItemsApi, inventoryApi } from "../../lib/api";
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
import type {
  PackageItem,
  PackageInventoryItem,
  PackageLaborItem,
  LaborItem,
  InventoryItem,
} from "../../types";

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

interface DraftPackageLabor {
  labor_item_id: string;
  quantity: number;
}

interface DraftPackageInventory {
  inventory_item_id: string;
  quantity: number;
}

export function PackagesManagement() {
  const { user } = useAuth();
  const userRoles = user?.roles || [];

  const canCreate = userRoles.some((r) => ["HM", "POC", "JS"].includes(r));
  const canUpdate = canCreate;
  const canDelete = canCreate;

  const [allItems, setAllItems] = useState<PackageItem[]>([]);
  const [laborItems, setLaborItems] = useState<LaborItem[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = useState(1);

  const [showAddModal, setShowAddModal] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    description: "",
  });
  const [addLaborLinks, setAddLaborLinks] = useState<DraftPackageLabor[]>([]);
  const [addInventoryLinks, setAddInventoryLinks] = useState<DraftPackageInventory[]>([]);
  const [addSelectedLaborId, setAddSelectedLaborId] = useState("");
  const [addSelectedInventoryId, setAddSelectedInventoryId] = useState("");
  const [addLaborQty, setAddLaborQty] = useState("1");
  const [addInventoryQty, setAddInventoryQty] = useState("1");
  const [addError, setAddError] = useState<string | null>(null);

  const [showViewModal, setShowViewModal] = useState(false);
  const [viewItem, setViewItem] = useState<PackageItem | null>(null);
  const [viewLaborLinks, setViewLaborLinks] = useState<PackageLaborItem[]>([]);
  const [viewInventoryLinks, setViewInventoryLinks] = useState<PackageInventoryItem[]>([]);
  const [viewLinksLoading, setViewLinksLoading] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PackageItem | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    status: "active",
  });
  const [editLaborLinks, setEditLaborLinks] = useState<DraftPackageLabor[]>([]);
  const [editInventoryLinks, setEditInventoryLinks] = useState<DraftPackageInventory[]>([]);
  const [editLaborDbLinks, setEditLaborDbLinks] = useState<PackageLaborItem[]>([]);
  const [editInventoryDbLinks, setEditInventoryDbLinks] = useState<PackageInventoryItem[]>([]);
  const [editSelectedLaborId, setEditSelectedLaborId] = useState("");
  const [editSelectedInventoryId, setEditSelectedInventoryId] = useState("");
  const [editLaborQty, setEditLaborQty] = useState("1");
  const [editInventoryQty, setEditInventoryQty] = useState("1");
  const [editError, setEditError] = useState<string | null>(null);
  const [editLinksLoading, setEditLinksLoading] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingItem, setDeletingItem] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<PackageItem | null>(null);
  const [itemHasReferences, setItemHasReferences] = useState(false);
  const [checkingReferences, setCheckingReferences] = useState(false);

  const filterGroups: FilterGroup[] = useMemo(() => {
    return [
      {
        key: "status",
        label: "Status",
        options: STATUS_OPTIONS,
      },
    ];
  }, []);

  const laborOptions = useMemo(
    () => laborItems.filter((l) => l.status === "active").map((l) => ({ value: l.id, label: l.name })),
    [laborItems]
  );

  const inventoryOptions = useMemo(
    () => inventoryItems.filter((i) => i.status === "active").map((i) => ({ value: i.id, label: i.item_name })),
    [inventoryItems]
  );

  const { paginatedItems, totalPages } = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const filtered = allItems.filter((item) => {
      const matchSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q);

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
      const [packageRes, laborRes, inventoryRes] = await Promise.all([
        packagesApi.getAll({ limit: 1000 }),
        laborItemsApi.getAll({ limit: 1000, status: "active" }),
        inventoryApi.getAll({ limit: 1000, status: "active" }),
      ]);
      setAllItems(packageRes.data);
      setLaborItems(laborRes.data);
      setInventoryItems(inventoryRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }

  function getLaborName(id: string): string {
    return laborItems.find((l) => l.id === id)?.name || "Unknown Labor";
  }

  function getInventoryName(id: string): string {
    return inventoryItems.find((i) => i.id === id)?.item_name || "Unknown Inventory";
  }

  function openAddModal() {
    setAddForm({ name: "", description: "" });
    setAddLaborLinks([]);
    setAddInventoryLinks([]);
    setAddSelectedLaborId("");
    setAddSelectedInventoryId("");
    setAddLaborQty("1");
    setAddInventoryQty("1");
    setAddError(null);
    setShowAddModal(true);
  }

  function addDraftLaborLink(isEdit: boolean) {
    const selectedId = isEdit ? editSelectedLaborId : addSelectedLaborId;
    const qty = parseInt(isEdit ? editLaborQty : addLaborQty, 10) || 1;

    if (!selectedId || qty <= 0) return;

    if (isEdit) {
      if (editLaborLinks.some((l) => l.labor_item_id === selectedId)) return;
      setEditLaborLinks((prev) => [...prev, { labor_item_id: selectedId, quantity: qty }]);
      setEditSelectedLaborId("");
      setEditLaborQty("1");
      return;
    }

    if (addLaborLinks.some((l) => l.labor_item_id === selectedId)) return;
    setAddLaborLinks((prev) => [...prev, { labor_item_id: selectedId, quantity: qty }]);
    setAddSelectedLaborId("");
    setAddLaborQty("1");
  }

  function addDraftInventoryLink(isEdit: boolean) {
    const selectedId = isEdit ? editSelectedInventoryId : addSelectedInventoryId;
    const qty = parseInt(isEdit ? editInventoryQty : addInventoryQty, 10) || 1;

    if (!selectedId || qty <= 0) return;

    if (isEdit) {
      if (editInventoryLinks.some((l) => l.inventory_item_id === selectedId)) return;
      setEditInventoryLinks((prev) => [...prev, { inventory_item_id: selectedId, quantity: qty }]);
      setEditSelectedInventoryId("");
      setEditInventoryQty("1");
      return;
    }

    if (addInventoryLinks.some((l) => l.inventory_item_id === selectedId)) return;
    setAddInventoryLinks((prev) => [...prev, { inventory_item_id: selectedId, quantity: qty }]);
    setAddSelectedInventoryId("");
    setAddInventoryQty("1");
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
      const created = await packagesApi.create({
        name: addForm.name.trim(),
        description: addForm.description.trim() || undefined,
      });

      if (addLaborLinks.length > 0) {
        await Promise.all(
          addLaborLinks.map((l) =>
            packagesApi.addLaborLink(created.id, {
              labor_item_id: l.labor_item_id,
              quantity: l.quantity,
            })
          )
        );
      }

      if (addInventoryLinks.length > 0) {
        await Promise.all(
          addInventoryLinks.map((l) =>
            packagesApi.addInventoryLink(created.id, {
              inventory_item_id: l.inventory_item_id,
              quantity: l.quantity,
            })
          )
        );
      }

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

  async function openViewModal(item: PackageItem) {
    setViewItem(item);
    setViewLaborLinks([]);
    setViewInventoryLinks([]);
    setViewLinksLoading(true);
    setShowViewModal(true);
    try {
      const [laborLinks, inventoryLinks] = await Promise.all([
        packagesApi.getLaborLinks(item.id),
        packagesApi.getInventoryLinks(item.id),
      ]);
      setViewLaborLinks(laborLinks);
      setViewInventoryLinks(inventoryLinks);
    } catch {
      setViewLaborLinks([]);
      setViewInventoryLinks([]);
    } finally {
      setViewLinksLoading(false);
    }
  }

  async function openEditModal(item: PackageItem) {
    setSelectedItem(item);
    setEditForm({
      name: item.name,
      description: item.description || "",
      status: item.status,
    });
    setEditError(null);
    setEditSelectedLaborId("");
    setEditSelectedInventoryId("");
    setEditLaborQty("1");
    setEditInventoryQty("1");
    setEditLaborDbLinks([]);
    setEditInventoryDbLinks([]);
    setEditLaborLinks([]);
    setEditInventoryLinks([]);
    setEditLinksLoading(true);

    try {
      const [laborLinks, inventoryLinks] = await Promise.all([
        packagesApi.getLaborLinks(item.id),
        packagesApi.getInventoryLinks(item.id),
      ]);

      setEditLaborDbLinks(laborLinks);
      setEditInventoryDbLinks(inventoryLinks);
      setEditLaborLinks(
        laborLinks.map((l) => ({ labor_item_id: l.labor_id, quantity: l.quantity || 1 }))
      );
      setEditInventoryLinks(
        inventoryLinks.map((l) => ({ inventory_item_id: l.inventory_item_id, quantity: l.quantity || 1 }))
      );
    } catch {
      setEditLaborDbLinks([]);
      setEditInventoryDbLinks([]);
      setEditLaborLinks([]);
      setEditInventoryLinks([]);
    } finally {
      setEditLinksLoading(false);
    }

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
      });

      if (editLaborDbLinks.length > 0) {
        await Promise.all(editLaborDbLinks.map((l) => packagesApi.removeLaborLink(selectedItem.id, l.id)));
      }
      if (editInventoryDbLinks.length > 0) {
        await Promise.all(editInventoryDbLinks.map((l) => packagesApi.removeInventoryLink(selectedItem.id, l.id)));
      }

      if (editLaborLinks.length > 0) {
        await Promise.all(
          editLaborLinks.map((l) =>
            packagesApi.addLaborLink(selectedItem.id, {
              labor_item_id: l.labor_item_id,
              quantity: l.quantity,
            })
          )
        );
      }

      if (editInventoryLinks.length > 0) {
        await Promise.all(
          editInventoryLinks.map((l) =>
            packagesApi.addInventoryLink(selectedItem.id, {
              inventory_item_id: l.inventory_item_id,
              quantity: l.quantity,
            })
          )
        );
      }

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

  async function openDeleteConfirmModal(item: PackageItem) {
    setItemToDelete(item);
    setItemHasReferences(false);
    setCheckingReferences(true);
    setShowDeleteConfirm(true);
    try {
      const deleteMode = await packagesApi.getDeleteMode(item.id);
      setItemHasReferences(deleteMode.mode === "deactivate");
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
      <PageHeader
        title="Packages"
        subtitle={`${allItems.length} items total`}
        buttonLabel="Add New Package"
        onAdd={openAddModal}
        showButton={canCreate}
      />

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
            subtitle="PACKAGE BUILDER"
            statusBadge={{
              label: item.status === "active" ? "Active" : "Inactive",
              className: item.status === "active"
                ? "bg-positive-100 text-positive"
                : "bg-negative-100 text-negative",
            }}
            details={item.description ? <p className="text-neutral-900 line-clamp-2">{item.description}</p> : <p className="text-xs">No description</p>}
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

      <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} variant="card" />

      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add Package Item" maxWidth="xl">
        <form onSubmit={handleAddItem}>
          <ModalSection title="Item Information">
            <ModalInput type="text" value={addForm.name} onChange={(v) => setAddForm((prev) => ({ ...prev, name: v }))} placeholder="Name *" required />
            <textarea
              value={addForm.description}
              onChange={(e) => setAddForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Description (optional)"
              rows={3}
              className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
            />
          </ModalSection>

          <ModalSection title="Labor Items">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <ModalSelect value={addSelectedLaborId} onChange={setAddSelectedLaborId} placeholder="Select Labor" options={laborOptions} />
              </div>
              <div className="w-24">
                <ModalInput type="number" value={addLaborQty} onChange={setAddLaborQty} placeholder="Qty" />
              </div>
              <button type="button" onClick={() => addDraftLaborLink(false)} className="px-4.5 py-4.5 bg-primary text-white rounded-xl hover:bg-primary-950 transition-colors shrink-0">
                <LuPlus className="w-4 h-4" />
              </button>
            </div>
            {addLaborLinks.length > 0 && (
              <div className="mt-3 space-y-2">
                {addLaborLinks.map((l) => (
                  <div key={l.labor_item_id} className="flex items-center justify-between bg-neutral-100 rounded-xl px-4 py-3">
                    <div>
                      <p className="font-medium text-neutral-950 text-sm">{getLaborName(l.labor_item_id)}</p>
                      <p className="text-xs text-neutral-900">Quantity: {l.quantity}</p>
                    </div>
                    <button type="button" onClick={() => setAddLaborLinks((prev) => prev.filter((i) => i.labor_item_id !== l.labor_item_id))} className="text-negative hover:text-negative-900 p-1 ml-3">
                      <LuX className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </ModalSection>

          <ModalSection title="Inventory Items">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <ModalSelect value={addSelectedInventoryId} onChange={setAddSelectedInventoryId} placeholder="Select Inventory" options={inventoryOptions} />
              </div>
              <div className="w-24">
                <ModalInput type="number" value={addInventoryQty} onChange={setAddInventoryQty} placeholder="Qty" />
              </div>
              <button type="button" onClick={() => addDraftInventoryLink(false)} className="px-4.5 py-4.5 bg-primary text-white rounded-xl hover:bg-primary-950 transition-colors shrink-0">
                <LuPlus className="w-4 h-4" />
              </button>
            </div>
            {addInventoryLinks.length > 0 && (
              <div className="mt-3 space-y-2">
                {addInventoryLinks.map((l) => (
                  <div key={l.inventory_item_id} className="flex items-center justify-between bg-neutral-100 rounded-xl px-4 py-3">
                    <div>
                      <p className="font-medium text-neutral-950 text-sm">{getInventoryName(l.inventory_item_id)}</p>
                      <p className="text-xs text-neutral-900">Quantity: {l.quantity}</p>
                    </div>
                    <button type="button" onClick={() => setAddInventoryLinks((prev) => prev.filter((i) => i.inventory_item_id !== l.inventory_item_id))} className="text-negative hover:text-negative-900 p-1 ml-3">
                      <LuX className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </ModalSection>

          <ModalError message={addError} />
          <ModalButtons onCancel={() => setShowAddModal(false)} submitText={addingItem ? "Creating..." : "Create Package"} loading={addingItem} />
        </form>
      </Modal>

      <Modal isOpen={showViewModal && !!viewItem} onClose={() => setShowViewModal(false)} title="Package Item Details" maxWidth="xl">
        {viewItem && (
          <div>
            <ModalSection title="Item Information">
              <ModalInput type="text" value={viewItem.name} onChange={() => {}} placeholder="Name" disabled />
              <ModalSelect value={viewItem.status} onChange={() => {}} options={STATUS_OPTIONS} disabled />
              <textarea value={viewItem.description || "-"} readOnly disabled rows={3} className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 focus:outline-none transition-all resize-none cursor-readonly" />
            </ModalSection>

            <ModalSection title="Labor Items">
              {viewLinksLoading ? (
                <div className="grid grid-cols-1 gap-4">
                  <div className="bg-neutral-100 rounded-xl px-4 py-3 animate-pulse">
                    <div className="h-4 bg-neutral-200 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-neutral-200 rounded w-1/2" />
                  </div>
                </div>
              ) : viewLaborLinks.length > 0 ? (
                <div className="space-y-2">
                  {viewLaborLinks.map((l) => (
                    <div key={l.id} className="bg-neutral-100 rounded-xl px-4 py-3 text-sm text-neutral-950">
                      <p className="font-medium text-neutral-950 text-sm">{l.labor_items?.name || "Unknown Labor"}</p>
                      <p className="text-xs text-neutral-900">Quantity: {l.quantity}</p>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-neutral-900 text-center py-3">No labor items.</p>}
            </ModalSection>

            <ModalSection title="Inventory Items">
              {viewLinksLoading ? (
                <div className="grid grid-cols-1 gap-4">
                  <div className="bg-neutral-100 rounded-xl px-4 py-3 animate-pulse">
                    <div className="h-4 bg-neutral-200 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-neutral-200 rounded w-1/2" />
                  </div>
                </div>
              ) : viewInventoryLinks.length > 0 ? (
                <div className="space-y-2">
                  {viewInventoryLinks.map((l) => (
                    <div key={l.id} className="bg-neutral-100 rounded-xl px-4 py-3 text-sm text-neutral-950">
                      <p className="font-medium text-neutral-950 text-sm">{l.inventory_items?.item_name || "Unknown Inventory"}</p>
                      <p className="text-xs text-neutral-900">Quantity: {l.quantity}</p>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-neutral-900 text-center py-3">No inventory items.</p>}
            </ModalSection>

            <ModalSection title="Timestamps">
              <div className="grid grid-cols-2 gap-4">
                <ModalInput type="text" value={formatDate(viewItem.created_at)} onChange={() => {}} placeholder="Created" disabled />
                <ModalInput type="text" value={formatDate(viewItem.updated_at)} onChange={() => {}} placeholder="Updated" disabled />
              </div>
            </ModalSection>
          </div>
        )}
      </Modal>

      <Modal isOpen={showEditModal && !!selectedItem} onClose={() => setShowEditModal(false)} title="Edit Package Item" maxWidth="xl">
        <form onSubmit={handleEditItem}>
          <ModalSection title="Item Information">
            <ModalInput type="text" value={editForm.name} onChange={(v) => setEditForm((prev) => ({ ...prev, name: v }))} placeholder="Name *" required />
            <ModalSelect value={editForm.status} onChange={(v) => setEditForm((prev) => ({ ...prev, status: v }))} options={STATUS_OPTIONS} />
            <textarea
              value={editForm.description}
              onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Description (optional)"
              rows={3}
              className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
            />
          </ModalSection>

          <ModalSection title="Labor Items">
            {editLinksLoading && (
              <div className="mb-3 grid grid-cols-1 gap-4">
                <div className="bg-neutral-100 rounded-xl px-4 py-3 animate-pulse">
                  <div className="h-4 bg-neutral-200 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-neutral-200 rounded w-1/2" />
                </div>
              </div>
            )}
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <ModalSelect value={editSelectedLaborId} onChange={setEditSelectedLaborId} placeholder="Select Labor" options={laborOptions} />
              </div>
              <div className="w-24">
                <ModalInput type="number" value={editLaborQty} onChange={setEditLaborQty} placeholder="Qty" />
              </div>
              <button type="button" onClick={() => addDraftLaborLink(true)} className="px-4.5 py-4.5 bg-primary text-white rounded-xl hover:bg-primary-950 transition-colors shrink-0">
                <LuPlus className="w-4 h-4" />
              </button>
            </div>
            {editLaborLinks.length > 0 && (
              <div className="mt-3 space-y-2">
                {editLaborLinks.map((l) => (
                  <div key={l.labor_item_id} className="flex items-center justify-between bg-neutral-100 rounded-xl px-4 py-3">
                    <div>
                      <p className="font-medium text-neutral-950 text-sm">{getLaborName(l.labor_item_id)}</p>
                      <p className="text-xs text-neutral-900">Quantity: {l.quantity}</p>
                    </div>
                    <button type="button" onClick={() => setEditLaborLinks((prev) => prev.filter((i) => i.labor_item_id !== l.labor_item_id))} className="text-negative hover:text-negative-900 p-1 ml-3">
                      <LuX className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </ModalSection>

          <ModalSection title="Inventory Items">
            {editLinksLoading && (
              <div className="mb-3 grid grid-cols-1 gap-4">
                <div className="bg-neutral-100 rounded-xl px-4 py-3 animate-pulse">
                  <div className="h-4 bg-neutral-200 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-neutral-200 rounded w-1/2" />
                </div>
              </div>
            )}
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <ModalSelect value={editSelectedInventoryId} onChange={setEditSelectedInventoryId} placeholder="Select Inventory" options={inventoryOptions} />
              </div>
              <div className="w-24">
                <ModalInput type="number" value={editInventoryQty} onChange={setEditInventoryQty} placeholder="Qty" />
              </div>
              <button type="button" onClick={() => addDraftInventoryLink(true)} className="px-4.5 py-4.5 bg-primary text-white rounded-xl hover:bg-primary-950 transition-colors shrink-0">
                <LuPlus className="w-4 h-4" />
              </button>
            </div>
            {editInventoryLinks.length > 0 && (
              <div className="mt-3 space-y-2">
                {editInventoryLinks.map((l) => (
                  <div key={l.inventory_item_id} className="flex items-center justify-between bg-neutral-100 rounded-xl px-4 py-3">
                    <div>
                      <p className="font-medium text-neutral-950 text-sm">{getInventoryName(l.inventory_item_id)}</p>
                      <p className="text-xs text-neutral-900">Quantity: {l.quantity}</p>
                    </div>
                    <button type="button" onClick={() => setEditInventoryLinks((prev) => prev.filter((i) => i.inventory_item_id !== l.inventory_item_id))} className="text-negative hover:text-negative-900 p-1 ml-3">
                      <LuX className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </ModalSection>

          <ModalError message={editError} />
          <ModalButtons onCancel={() => setShowEditModal(false)} submitText={editingItem ? "Saving..." : "Save Changes"} loading={editingItem} />
        </form>
      </Modal>

      <Modal isOpen={showDeleteConfirm && !!itemToDelete} onClose={() => setShowDeleteConfirm(false)} title={itemHasReferences ? "Deactivate Package item" : "Delete Package item"} maxWidth="sm">
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
                ? "This Package item has existing references and will be set to inactive instead of deleted."
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
