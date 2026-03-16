import { useState, useEffect, useMemo } from "react";
import {
  LuPencil,
  LuTrash2,
  LuDollarSign,
  LuCheck,
  LuX,
} from "react-icons/lu";
import { pricingApi, packagesApi } from "../../lib/api";
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
import type { PricingMatrix, PackageItem } from "../../types";

const ITEMS_PER_PAGE = 20;

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

export function PricingManagement() {
  const { user } = useAuth();
  const userRoles = user?.roles || [];

  // Permission checks
  const canCreate = userRoles.some((r) => ["HM", "POC", "JS", "R"].includes(r));
  const canUpdate = canCreate;
  const canDelete = canCreate;

  // Data state
  const [allPricingMatrices, setAllPricingMatrices] = useState<PricingMatrix[]>([]);
  const [packageItems, setPackageItems] = useState<PackageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  // View detail modal
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewItem, setViewItem] = useState<PricingMatrix | null>(null);

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [addForm, setAddForm] = useState({
    package_item_id: "",
    light_price: "",
    heavy_price: "",
    extra_heavy_price: "",
    status: "active",
  });
  const [addError, setAddError] = useState<string | null>(null);

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PricingMatrix | null>(null);
  const [editForm, setEditForm] = useState({
    package_item_id: "",
    light_price: "",
    heavy_price: "",
    extra_heavy_price: "",
    status: "active",
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
        p.package_items?.name?.toLowerCase().includes(q);

      const matchStatus = filterStatus === "all" || p.status === filterStatus;

      return matchSearch && matchStatus;
    });
    const pages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return {
      filteredItems: filtered,
      paginatedItems: filtered.slice(start, start + ITEMS_PER_PAGE),
      totalPages: pages,
    };
  }, [allPricingMatrices, searchQuery, filterStatus, currentPage]);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterStatus]);

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);

      const fetches: [Promise<any>, Promise<any> | null] = [
        pricingApi.getAll({ limit: 1000 }),
        canCreate ? packagesApi.getAll({ limit: 1000 }) : Promise.resolve(null),
      ];

      const [pricingRes, packageRes] = await Promise.all(fetches);
      setAllPricingMatrices(pricingRes.data);
      if (packageRes?.data) setPackageItems(packageRes.data);
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
    setAddForm({
      package_item_id: "",
      light_price: "",
      heavy_price: "",
      extra_heavy_price: "",
      status: "active",
    });
    setAddError(null);
    setShowAddModal(true);
  }

  // Create handler
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);

    if (!addForm.package_item_id) {
      setAddError("Please select a Package item");
      return;
    }
    const lp = parseFloat(addForm.light_price);
    const hp = parseFloat(addForm.heavy_price);
    const ehp = parseFloat(addForm.extra_heavy_price);
    if (isNaN(lp) || lp < 0 || isNaN(hp) || hp < 0 || isNaN(ehp) || ehp < 0) {
      setAddError("All three prices must be valid non-negative numbers");
      return;
    }

    try {
      setAddingItem(true);
      await pricingApi.create({
        package_item_id: addForm.package_item_id,
        light_price: lp,
        heavy_price: hp,
        extra_heavy_price: ehp,
        status: addForm.status,
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
      package_item_id: item.package_item_id,
      light_price: String(item.light_price),
      heavy_price: String(item.heavy_price),
      extra_heavy_price: String(item.extra_heavy_price),
      status: item.status,
    });
    setEditError(null);
    setShowEditModal(true);
  }

  // Update handler
  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedItem) return;
    setEditError(null);

    if (!editForm.package_item_id) {
      setEditError("Please select a Package item");
      return;
    }
    const lp = parseFloat(editForm.light_price);
    const hp = parseFloat(editForm.heavy_price);
    const ehp = parseFloat(editForm.extra_heavy_price);
    if (isNaN(lp) || lp < 0 || isNaN(hp) || hp < 0 || isNaN(ehp) || ehp < 0) {
      setEditError("All three prices must be valid non-negative numbers");
      return;
    }

    try {
      setEditingItem(true);
      await pricingApi.update(selectedItem.id, {
        package_item_id: editForm.package_item_id,
        light_price: lp,
        heavy_price: hp,
        extra_heavy_price: ehp,
        status: editForm.status,
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
      showToast.error(err instanceof Error ? err.message : "Failed to delete pricing rule");
    } finally {
      setDeletingItem(false);
    }
  }

  // Reset filters
  function handleResetFilters() {
    setFilterStatus("all");
    setSearchQuery("");
    setCurrentPage(1);
  }

  // Get active Package items for forms
  function getActivePackageItems() {
    return packageItems.filter((c) => c.status === "active");
  }

  if (loading && allPricingMatrices.length === 0) {
    return <SkeletonLoader showHeader showStats statsCount={3} rows={5} />;
  }

  if (error && allPricingMatrices.length === 0) {
    return <ErrorAlert message={error} onRetry={fetchData} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pricing Matrices"
        subtitle="Summary of pricing rules"
        buttonLabel="Add Pricing Matrix"
        onAdd={openAddModal}
        showButton={canCreate}
      />

      <StatsCards
        cards={
          [
            { icon: LuDollarSign, iconBg: "bg-primary-100", iconColor: "text-primary", label: "All Rules", value: stats.total },
            { icon: LuCheck, iconBg: "bg-positive-100", iconColor: "text-positive", label: "Active", value: stats.active },
            { icon: LuX, iconBg: "bg-negative-100", iconColor: "text-negative", label: "Inactive", value: stats.inactive },
          ] as StatCard[]
        }
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
              ...STATUS_OPTIONS,
            ],
            onChange: (v) => {
              setFilterStatus(v);
              setCurrentPage(1);
            },
          }}
          onApply={fetchData}
          onReset={handleResetFilters}
          onRefresh={fetchData}
          loading={loading}
        />

        {/* Mobile Card View */}
        <MobileCardList
          isEmpty={paginatedItems.length === 0}
          emptyMessage="No pricing rules found."
        >
          {paginatedItems.map((item) => {
            const actions: MobileCardAction[] = [];
            if (canUpdate) actions.push({ label: "Edit", icon: <LuPencil className="w-4 h-4" />, onClick: () => openEditModal(item) });
            if (canDelete) actions.push({ label: "Delete", icon: <LuTrash2 className="w-4 h-4" />, onClick: () => openDeleteModal(item), className: "flex items-center gap-1 text-sm text-negative hover:text-negative-900" });
            return (
              <MobileCard
                key={item.id}
                onClick={() => openViewModal(item)}
                icon={<LuDollarSign className="w-5 h-5 text-primary" />}
                title={item.package_items?.name || "Unknown Item"}
                statusBadge={{
                  label: item.status === "active" ? "Active" : "Inactive",
                  className: item.status === "active" ? "bg-positive-100 text-positive" : "bg-negative-100 text-negative",
                }}
                details={
                  <>
                    <p className="text-neutral-900">Light: {formatCurrency(item.light_price)}</p>
                    <p className="text-neutral-900">Heavy: {formatCurrency(item.heavy_price)}</p>
                    <p className="text-neutral-900">Extra Heavy: {formatCurrency(item.extra_heavy_price)}</p>
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
            { label: "Package item" },
            { label: "Light" },
            { label: "Heavy" },
            { label: "Extra Heavy" },
            { label: "Status" },
            ...((canUpdate || canDelete) ? [{ label: "Actions", align: "center" as const }] : []),
          ] as DesktopTableColumn[]}
          isEmpty={paginatedItems.length === 0}
          emptyMessage="No pricing rules found."
        >
              {paginatedItems.map((item) => (
                <DesktopTableRow
                  key={item.id}
                  onClick={() => openViewModal(item)}
                >
                  <td className="py-3 px-4 text-sm text-neutral-900">
                    <span className="font-medium">{item.package_items?.name || "Unknown"}</span>
                  </td>
                  <td className="py-3 px-4 text-sm text-neutral-900 whitespace-nowrap font-medium">
                    {formatCurrency(item.light_price)}
                  </td>
                  <td className="py-3 px-4 text-sm text-neutral-900 whitespace-nowrap font-medium">
                    {formatCurrency(item.heavy_price)}
                  </td>
                  <td className="py-3 px-4 text-sm text-neutral-900 whitespace-nowrap font-medium">
                    {formatCurrency(item.extra_heavy_price)}
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
          entityName="pricing rules"
        />
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
                value={viewItem.package_items?.name || "Unknown Item"}
                onChange={() => { }}
                placeholder="Package item"
                disabled
              />
              <ModalInput
                type="text"
                value={formatCurrency(viewItem.light_price)}
                onChange={() => { }}
                placeholder="Light Vehicle Price"
                disabled
              />
              <ModalInput
                type="text"
                value={formatCurrency(viewItem.heavy_price)}
                onChange={() => { }}
                placeholder="Heavy Vehicle Price"
                disabled
              />
              <ModalInput
                type="text"
                value={formatCurrency(viewItem.extra_heavy_price)}
                onChange={() => { }}
                placeholder="Extra Heavy Vehicle Price"
                disabled
              />
            </ModalSection>

            <ModalSection title="Status">
              <ModalSelect
                value={viewItem.status}
                onChange={() => { }}
                options={STATUS_OPTIONS}
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

      {/* Add Pricing Matrix Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Pricing Matrix"
        maxWidth="lg"
      >
        <form onSubmit={handleAdd}>
          <ModalSection title="Pricing Information">
            <ModalSelect
              value={addForm.package_item_id}
              onChange={(v) => setAddForm((prev) => ({ ...prev, package_item_id: v }))}
              options={[
                { value: "", label: "Select Package item" },
                ...getActivePackageItems().map((c) => ({
                  value: c.id,
                  label: c.name,
                })),
              ]}
            />

            <ModalInput
              type="number"
              value={addForm.light_price}
              onChange={(v) => setAddForm((prev) => ({ ...prev, light_price: v }))}
              placeholder="Light Vehicle Price"
              required
            />

            <ModalInput
              type="number"
              value={addForm.heavy_price}
              onChange={(v) => setAddForm((prev) => ({ ...prev, heavy_price: v }))}
              placeholder="Heavy Vehicle Price"
              required
            />

            <ModalInput
              type="number"
              value={addForm.extra_heavy_price}
              onChange={(v) => setAddForm((prev) => ({ ...prev, extra_heavy_price: v }))}
              placeholder="Extra Heavy Vehicle Price"
              required
            />

            <ModalSelect
              value={addForm.status}
              onChange={(v) => setAddForm((prev) => ({ ...prev, status: v }))}
              options={STATUS_OPTIONS}
            />
          </ModalSection>

          <ModalError message={addError} />

          <ModalButtons
            onCancel={() => setShowAddModal(false)}
            submitText={addingItem ? "Creating..." : "Create Pricing"}
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
              value={editForm.package_item_id}
              onChange={(v) => setEditForm((prev) => ({ ...prev, package_item_id: v }))}
              options={[
                { value: "", label: "Select Package item" },
                ...getActivePackageItems().map((c) => ({
                  value: c.id,
                  label: c.name,
                })),
              ]}
            />

            <ModalInput
              type="number"
              value={editForm.light_price}
              onChange={(v) => setEditForm((prev) => ({ ...prev, light_price: v }))}
              placeholder="Light Vehicle Price"
              required
            />

            <ModalInput
              type="number"
              value={editForm.heavy_price}
              onChange={(v) => setEditForm((prev) => ({ ...prev, heavy_price: v }))}
              placeholder="Heavy Vehicle Price"
              required
            />

            <ModalInput
              type="number"
              value={editForm.extra_heavy_price}
              onChange={(v) => setEditForm((prev) => ({ ...prev, extra_heavy_price: v }))}
              placeholder="Extra Heavy Vehicle Price"
              required
            />

            <ModalSelect
              value={editForm.status}
              onChange={(v) => setEditForm((prev) => ({ ...prev, status: v }))}
              options={STATUS_OPTIONS}
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
                Are you sure you want to delete the pricing rule for{" "}
                <strong className="text-neutral-950">
                  {itemToDelete.package_items?.name || "Unknown Item"}
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
