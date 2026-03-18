import { useEffect, useMemo, useState } from "react";
import { LuPencil, LuTrash2, LuWrench, LuCheck, LuX } from "react-icons/lu";
import { laborItemsApi } from "../../lib/api";
import { showToast } from "../../lib/toast";
import { useAuth } from "../../auth";
import {
  DesktopTable,
  DesktopTableRow,
  ErrorAlert,
  MobileCard,
  MobileCardList,
  Modal,
  ModalButtons,
  ModalError,
  ModalInput,
  ModalSection,
  ModalSelect,
  PageHeader,
  StatsCards,
  TableSearchFilter,
  Pagination,
  SkeletonLoader,
} from "../../components";
import type { DesktopTableColumn, MobileCardAction, StatCard } from "../../components";
import type { LaborItem } from "../../types";

const ITEMS_PER_PAGE = 20;

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(price || 0);
}

function keepDigitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function LaborManagement() {
  const { user } = useAuth();
  const userRoles = user?.roles || [];
  const canManage = userRoles.some((r) => ["HM", "POC", "JS", "R"].includes(r));

  const [allItems, setAllItems] = useState<LaborItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [addError, setAddError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const [selected, setSelected] = useState<LaborItem | null>(null);
  const [viewItem, setViewItem] = useState<LaborItem | null>(null);
  const [itemHasReferences, setItemHasReferences] = useState(false);
  const [checkingReferences, setCheckingReferences] = useState(false);

  const [addForm, setAddForm] = useState({
    name: "",
    light_price: "",
    heavy_price: "",
    extra_heavy_price: "",
    status: "active",
  });

  const [editForm, setEditForm] = useState({
    name: "",
    light_price: "",
    heavy_price: "",
    extra_heavy_price: "",
    status: "active",
  });

  const stats = useMemo(() => {
    const total = allItems.length;
    const active = allItems.filter((i) => i.status === "active").length;
    const inactive = total - active;
    return { total, active, inactive };
  }, [allItems]);

  const { filteredItems, paginatedItems, totalPages } = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const filtered = allItems.filter((item) => {
      const matchSearch = !q || item.name.toLowerCase().includes(q);
      const matchStatus = filterStatus === "all" || item.status === filterStatus;
      return matchSearch && matchStatus;
    });

    const pages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
    const start = (currentPage - 1) * ITEMS_PER_PAGE;

    return {
      filteredItems: filtered,
      paginatedItems: filtered.slice(start, start + ITEMS_PER_PAGE),
      totalPages: pages,
    };
  }, [allItems, searchQuery, filterStatus, currentPage]);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterStatus]);

  function handleResetFilters() {
    setSearchQuery("");
    setFilterStatus("all");
    setCurrentPage(1);
  }

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);
      const res = await laborItemsApi.getAll({ limit: 1000 });
      setAllItems(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch labor items");
    } finally {
      setLoading(false);
    }
  }

  function openAddModal() {
    setAddForm({ name: "", light_price: "", heavy_price: "", extra_heavy_price: "", status: "active" });
    setAddError(null);
    setShowAddModal(true);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);

    if (!addForm.name.trim()) {
      setAddError("Labor name is required");
      return;
    }
    if (!addForm.light_price.trim() || !addForm.heavy_price.trim() || !addForm.extra_heavy_price.trim()) {
      setAddError("All price fields are required");
      return;
    }

    const parsedLightPrice = Number(addForm.light_price);
    const parsedHeavyPrice = Number(addForm.heavy_price);
    const parsedExtraHeavyPrice = Number(addForm.extra_heavy_price);
    if (
      Number.isNaN(parsedLightPrice) || parsedLightPrice < 0 ||
      Number.isNaN(parsedHeavyPrice) || parsedHeavyPrice < 0 ||
      Number.isNaN(parsedExtraHeavyPrice) || parsedExtraHeavyPrice < 0
    ) {
      setAddError("All prices must be non-negative numbers");
      return;
    }

    try {
      setAdding(true);
      await laborItemsApi.create({
        name: addForm.name.trim(),
        light_price: parsedLightPrice,
        heavy_price: parsedHeavyPrice,
        extra_heavy_price: parsedExtraHeavyPrice,
        status: addForm.status,
      });
      setShowAddModal(false);
      showToast.success("Labor item created successfully");
      fetchData();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to create labor item");
      showToast.error(err instanceof Error ? err.message : "Failed to create labor item");
    } finally {
      setAdding(false);
    }
  }

  function openEditModal(item: LaborItem) {
    setSelected(item);
    setEditForm({
      name: item.name,
      light_price: String(item.light_price),
      heavy_price: String(item.heavy_price),
      extra_heavy_price: String(item.extra_heavy_price),
      status: item.status,
    });
    setEditError(null);
    setShowEditModal(true);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setEditError(null);

    if (!editForm.name.trim()) {
      setEditError("Labor name is required");
      return;
    }
    if (!editForm.light_price.trim() || !editForm.heavy_price.trim() || !editForm.extra_heavy_price.trim()) {
      setEditError("All price fields are required");
      return;
    }

    const parsedLightPrice = Number(editForm.light_price);
    const parsedHeavyPrice = Number(editForm.heavy_price);
    const parsedExtraHeavyPrice = Number(editForm.extra_heavy_price);
    if (
      Number.isNaN(parsedLightPrice) || parsedLightPrice < 0 ||
      Number.isNaN(parsedHeavyPrice) || parsedHeavyPrice < 0 ||
      Number.isNaN(parsedExtraHeavyPrice) || parsedExtraHeavyPrice < 0
    ) {
      setEditError("All prices must be non-negative numbers");
      return;
    }

    try {
      setEditing(true);
      await laborItemsApi.update(selected.id, {
        name: editForm.name.trim(),
        light_price: parsedLightPrice,
        heavy_price: parsedHeavyPrice,
        extra_heavy_price: parsedExtraHeavyPrice,
        status: editForm.status,
      });
      setShowEditModal(false);
      setSelected(null);
      showToast.success("Labor item updated successfully");
      fetchData();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update labor item");
      showToast.error(err instanceof Error ? err.message : "Failed to update labor item");
    } finally {
      setEditing(false);
    }
  }

  async function openDeleteModal(item: LaborItem) {
    setSelected(item);
    setItemHasReferences(false);
    setCheckingReferences(true);
    setShowDeleteModal(true);
    try {
      const deleteMode = await laborItemsApi.getDeleteMode(item.id);
      setItemHasReferences(deleteMode.mode === "deactivate");
    } catch {
      setItemHasReferences(true);
    } finally {
      setCheckingReferences(false);
    }
  }

  function openViewModal(item: LaborItem) {
    setViewItem(item);
    setShowViewModal(true);
  }

  async function handleDelete() {
    if (!selected) return;
    try {
      setDeleting(true);
      const result = await laborItemsApi.delete(selected.id);
      setShowDeleteModal(false);
      setSelected(null);
      const isDeactivated = result.message?.toLowerCase().includes("deactivated");
      showToast.success(isDeactivated ? "Labor item deactivated successfully" : "Labor item deleted successfully");
      fetchData();
    } catch (err) {
      const fallback = itemHasReferences ? "Failed to deactivate labor item" : "Failed to delete labor item";
      const msg = err instanceof Error ? err.message : fallback;
      setError(msg);
      showToast.error(msg);
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return <SkeletonLoader showHeader showStats statsCount={3} rows={6} />;
  }

  if (error && allItems.length === 0) {
    return <ErrorAlert message={error} onRetry={fetchData} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Labor Items"
        subtitle="Summary of labor rates"
        buttonLabel="Add Labor Item"
        onAdd={openAddModal}
        showButton={canManage}
      />

      <StatsCards
        cards={[
          { icon: LuWrench, iconBg: "bg-primary-100", iconColor: "text-primary", label: "All Labor Items", value: stats.total },
          { icon: LuCheck, iconBg: "bg-positive-100", iconColor: "text-positive", label: "Active", value: stats.active },
          { icon: LuX, iconBg: "bg-negative-100", iconColor: "text-negative", label: "Inactive", value: stats.inactive },
        ] as StatCard[]}
      />

      <div className="bg-white border border-neutral-200 rounded-xl">
        <TableSearchFilter
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search labor items"
          primaryFilter={{
            key: "status",
            label: "Status",
            value: filterStatus,
            options: [{ value: "all", label: "All Status" }, ...STATUS_OPTIONS],
            onChange: (value) => {
              setFilterStatus(value);
              setCurrentPage(1);
            },
          }}
          onApply={fetchData}
          onReset={handleResetFilters}
          onRefresh={fetchData}
          loading={loading}
        />

        <MobileCardList isEmpty={paginatedItems.length === 0} emptyMessage="No labor items found.">
          {paginatedItems.map((item) => {
            const actions: MobileCardAction[] = [];
            if (canManage) {
              actions.push({ label: "Edit", icon: <LuPencil className="w-4 h-4" />, onClick: () => openEditModal(item) });
              actions.push({ label: "Delete", icon: <LuTrash2 className="w-4 h-4" />, onClick: () => openDeleteModal(item), className: "flex items-center gap-1 text-sm text-negative hover:text-negative-900" });
            }

            return (
              <MobileCard
                key={item.id}
                onClick={() => openViewModal(item)}
                icon={<LuWrench className="w-5 h-5 text-primary" />}
                title={item.name}
                statusBadge={{
                  label: item.status === "active" ? "Active" : "Inactive",
                  className: item.status === "active" ? "bg-positive-100 text-positive" : "bg-negative-100 text-negative",
                }}
                details={
                  <>
                    <p className="text-neutral-900">Light: {formatPrice(item.light_price)}</p>
                    <p className="text-neutral-900">Heavy: {formatPrice(item.heavy_price)}</p>
                    <p className="text-neutral-900">Extra Heavy: {formatPrice(item.extra_heavy_price)}</p>
                  </>
                }
                actions={actions}
              />
            );
          })}
        </MobileCardList>

        <DesktopTable
          columns={[
            { label: "Labor Item" },
            { label: "Light" },
            { label: "Heavy" },
            { label: "Extra Heavy" },
            { label: "Status" },
            ...(canManage ? [{ label: "Actions", align: "center" as const }] : []),
          ] as DesktopTableColumn[]}
          isEmpty={paginatedItems.length === 0}
          emptyMessage="No labor items found."
        >
          {paginatedItems.map((item) => (
            <DesktopTableRow key={item.id} onClick={() => openViewModal(item)}>
              <td className="py-3 px-4 text-sm text-neutral-900 font-medium">{item.name}</td>
              <td className="py-3 px-4 text-sm text-neutral-900 whitespace-nowrap">{formatPrice(item.light_price)}</td>
              <td className="py-3 px-4 text-sm text-neutral-900 whitespace-nowrap">{formatPrice(item.heavy_price)}</td>
              <td className="py-3 px-4 text-sm text-neutral-900 whitespace-nowrap">{formatPrice(item.extra_heavy_price)}</td>
              <td className="py-3 px-4 whitespace-nowrap">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    item.status === "active" ? "bg-positive-100 text-positive-950" : "bg-neutral-100 text-neutral-950"
                  }`}
                >
                  {item.status === "active" ? "Active" : "Inactive"}
                </span>
              </td>
              {canManage && (
                <td className="py-3 px-4 whitespace-nowrap">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditModal(item);
                      }}
                      className="p-2 text-primary-950 hover:text-primary-900 hover:bg-primary-50 rounded-lg transition-colors"
                      title="Edit labor item"
                    >
                      <LuPencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openDeleteModal(item);
                      }}
                      className="p-2 text-negative-950 hover:text-negative-900 hover:bg-negative-50 rounded-lg transition-colors"
                      title="Delete labor item"
                    >
                      <LuTrash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              )}
            </DesktopTableRow>
          ))}
        </DesktopTable>

        <Pagination
          variant="table"
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={filteredItems.length}
          itemsPerPage={ITEMS_PER_PAGE}
          entityName="labor items"
        />
      </div>

      <Modal
        isOpen={showViewModal && !!viewItem}
        onClose={() => {
          setShowViewModal(false);
          setViewItem(null);
        }}
        title="Labor Item Details"
        maxWidth="lg"
      >
        {viewItem && (
          <div>
            <ModalSection title="Labor Information">
              <ModalInput type="text" value={viewItem.name} onChange={() => {}} placeholder="Labor Name" disabled />
              <ModalInput type="text" value={formatPrice(viewItem.light_price)} onChange={() => {}} placeholder="Light Price" disabled />
              <ModalInput type="text" value={formatPrice(viewItem.heavy_price)} onChange={() => {}} placeholder="Heavy Price" disabled />
              <ModalInput type="text" value={formatPrice(viewItem.extra_heavy_price)} onChange={() => {}} placeholder="Extra Heavy Price" disabled />
            </ModalSection>

            <ModalSection title="Status">
              <ModalInput
                type="text"
                value={viewItem.status === "active" ? "Active" : "Inactive"}
                onChange={() => {}}
                placeholder="Status"
                disabled
              />
            </ModalSection>
          </div>
        )}
      </Modal>

      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add Labor Item" maxWidth="lg">
        <form onSubmit={handleAdd} className="space-y-4">
          <ModalSection title="Labor Information">
            <ModalInput
              type="text"
              value={addForm.name}
              onChange={(v) => setAddForm((prev) => ({ ...prev, name: v }))}
              placeholder="Labor Name *"
              required
            />
            <div className="space-y-3">
              <ModalInput
                type="text"
                value={addForm.light_price}
                onChange={(v) => setAddForm((prev) => ({ ...prev, light_price: keepDigitsOnly(v) }))}
                placeholder="Light Price *"
                required
              />
              <ModalInput
                type="text"
                value={addForm.heavy_price}
                onChange={(v) => setAddForm((prev) => ({ ...prev, heavy_price: keepDigitsOnly(v) }))}
                placeholder="Heavy Price *"
                required
              />
              <ModalInput
                type="text"
                value={addForm.extra_heavy_price}
                onChange={(v) => setAddForm((prev) => ({ ...prev, extra_heavy_price: keepDigitsOnly(v) }))}
                placeholder="Extra Heavy Price *"
                required
              />
            </div>
          </ModalSection>

          <ModalSection title="Status">
            <ModalSelect
              value={addForm.status}
              onChange={(v) => setAddForm((prev) => ({ ...prev, status: v }))}
              placeholder="Status"
              options={STATUS_OPTIONS}
            />
          </ModalSection>
          <ModalError message={addError} />
          <ModalButtons onCancel={() => setShowAddModal(false)} submitText={adding ? "Creating..." : "Create Labor"} loading={adding} />
        </form>
      </Modal>

      <Modal isOpen={showEditModal && !!selected} onClose={() => setShowEditModal(false)} title="Edit Labor Item" maxWidth="lg">
        <form onSubmit={handleEdit} className="space-y-4">
          <ModalSection title="Labor Information">
            <ModalInput
              type="text"
              value={editForm.name}
              onChange={(v) => setEditForm((prev) => ({ ...prev, name: v }))}
              placeholder="Labor Name *"
              required
            />
            <div className="space-y-3">
              <ModalInput
                type="text"
                value={editForm.light_price}
                onChange={(v) => setEditForm((prev) => ({ ...prev, light_price: keepDigitsOnly(v) }))}
                placeholder="Light Price *"
                required
              />
              <ModalInput
                type="text"
                value={editForm.heavy_price}
                onChange={(v) => setEditForm((prev) => ({ ...prev, heavy_price: keepDigitsOnly(v) }))}
                placeholder="Heavy Price *"
                required
              />
              <ModalInput
                type="text"
                value={editForm.extra_heavy_price}
                onChange={(v) => setEditForm((prev) => ({ ...prev, extra_heavy_price: keepDigitsOnly(v) }))}
                placeholder="Extra Heavy Price *"
                required
              />
            </div>
          </ModalSection>

          <ModalSection title="Status">
            <ModalSelect
              value={editForm.status}
              onChange={(v) => setEditForm((prev) => ({ ...prev, status: v }))}
              placeholder="Status"
              options={STATUS_OPTIONS}
            />
          </ModalSection>
          <ModalError message={editError} />
          <ModalButtons onCancel={() => setShowEditModal(false)} submitText={editing ? "Saving..." : "Save Changes"} loading={editing} />
        </form>
      </Modal>

      <Modal isOpen={showDeleteModal && !!selected} onClose={() => setShowDeleteModal(false)} title={itemHasReferences ? "Deactivate Labor Item" : "Delete Labor Item"} maxWidth="sm">
        {selected && (
          <div>
            <div className="bg-neutral-100 rounded-xl p-4 my-4">
              <p className="text-neutral-900">
                {itemHasReferences
                  ? <>Are you sure you want to deactivate <strong className="text-neutral-950">{selected.name}</strong>?</>
                  : <>Are you sure you want to delete <strong className="text-neutral-950">{selected.name}</strong>?</>
                }
              </p>
            </div>
            <p className="text-sm text-neutral-900 mb-2">
              {itemHasReferences
                ? "This labor item has existing references and will be set to inactive instead of deleted."
                : "This action cannot be undone. All labor item data will be permanently removed."
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
                className="flex-1 px-4 py-3.5 bg-negative text-white rounded-xl font-semibold hover:bg-negative-900 disabled:opacity-50 transition-colors"
              >
                {checkingReferences
                  ? "Checking..."
                  : deleting
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
