import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  LuPencil,
  LuTrash2,
  LuBox,
  LuCircleArrowUp,
  LuCircleArrowDown,
  LuHistory,
  LuTriangleAlert,
  LuPackageCheck,
  LuEllipsisVertical,
  LuSend,
} from "react-icons/lu";
import { inventoryApi, branchesApi } from "../../lib/api";
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
import type { StatCard, DesktopTableColumn } from "../../components";
import type { InventoryItem, Branch, StockMovement } from "../../types";

const ITEMS_PER_PAGE = 20;
const MAX_ITEM_NAME_LENGTH = 100;
const ITEM_NAME_SANITIZE_REGEX = /[^A-Za-z0-9 ]+/g;

const CATEGORY_PRESETS = [
  { value: "Oil & Lubricants", label: "Oil & Lubricants" },
  { value: "Filters", label: "Filters" },
  { value: "Brake Parts", label: "Brake Parts" },
  { value: "Engine Parts", label: "Engine Parts" },
  { value: "Tires", label: "Tires" },
  { value: "Batteries", label: "Batteries" },
  { value: "Accessories", label: "Accessories" },
  { value: "Cleaning Supplies", label: "Cleaning Supplies" },
  { value: "Other", label: "Other" },
];

const UOM_OPTIONS = [
  { value: "pcs", label: "Pieces (pcs)" },
  { value: "liters", label: "Liters (L)" },
  { value: "kg", label: "Kilograms (kg)" },
  { value: "bottles", label: "Bottles" },
  { value: "sets", label: "Sets" },
  { value: "rolls", label: "Rolls" },
  { value: "boxes", label: "Boxes" },
];

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(price);
}

function movementTypeLabel(type: string): string {
  switch (type) {
    case "stock_in": return "Stock In";
    case "stock_out": return "Stock Out";
    case "adjustment": return "Adjustment";
    default: return type;
  }
}

function referenceTypeLabel(type: string): string {
  switch (type) {
    case "purchase_order": return "Purchase Order";
    case "job_order": return "Job Order";
    case "adjustment": return "Manual Adjustment";
    default: return type;
  }
}

function getInventoryStatusLabel(status: InventoryItem["status"]): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "pending_approval":
      return "Pending Approval";
    case "rejected":
      return "Rejected";
    case "active":
      return "Active";
    case "inactive":
      return "Inactive";
    default:
      return status;
  }
}

function getInventoryStatusColors(status: InventoryItem["status"]): string {
  switch (status) {
    case "draft":
      return "bg-neutral-100 text-neutral-950";
    case "pending_approval":
      return "bg-primary-100 text-primary-950";
    case "rejected":
      return "bg-negative-100 text-negative-950";
    case "active":
      return "bg-positive-100 text-positive-950";
    case "inactive":
      return "bg-neutral-200 text-neutral-950";
    default:
      return "bg-neutral-100 text-neutral-950";
  }
}

function sanitizeItemNameInput(value: string): string {
  return value.replace(ITEM_NAME_SANITIZE_REGEX, "").slice(0, MAX_ITEM_NAME_LENGTH);
}

export function InventoryManagement() {
  const { user } = useAuth();
  const userRoles = user?.roles || [];
  const isHM = userRoles.includes("HM");

  // Permission checks
  const canCreate = userRoles.some((r) => ["HM", "POC", "JS"].includes(r));
  const canUpdate = canCreate;
  const canDelete = canCreate;
  const canAdjust = userRoles.some((r) => ["HM", "POC"].includes(r));
  const canStockIn = canCreate;
  const canApprove = userRoles.some((r) => ["HM", "POC"].includes(r));

  // Data state
  const [allItems, setAllItems] = useState<InventoryItem[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search, filters & pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterBranch, setFilterBranch] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [addForm, setAddForm] = useState({
    item_name: "",
    sku_code: "",
    category: "",
    unit_of_measure: "pcs",
    cost_price: "",
    reorder_threshold: "5",
    branch_id: "",
    initial_stock: "",
  });
  const [addError, setAddError] = useState<string | null>(null);

  // View modal
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewItem, setViewItem] = useState<InventoryItem | null>(null);

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [editForm, setEditForm] = useState({
    item_name: "",
    sku_code: "",
    category: "",
    unit_of_measure: "pcs",
    cost_price: "",
    reorder_threshold: "",
    status: "active",
  });
  const [editError, setEditError] = useState<string | null>(null);

  // Delete modal
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingItem, setDeletingItem] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<InventoryItem | null>(null);
  const [itemHasReferences, setItemHasReferences] = useState(false);
  const [checkingReferences, setCheckingReferences] = useState(false);

  // Adjust modal
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustingItem, setAdjustingItem] = useState(false);
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
  const [adjustForm, setAdjustForm] = useState({
    adjustment_type: "increase" as "increase" | "decrease",
    quantity: "",
    reason: "",
  });
  const [adjustError, setAdjustError] = useState<string | null>(null);

  // Stock-in modal
  const [showStockInModal, setShowStockInModal] = useState(false);
  const [stockInLoading, setStockInLoading] = useState(false);
  const [stockInItem, setStockInItem] = useState<InventoryItem | null>(null);
  const [stockInForm, setStockInForm] = useState({
    quantity: "",
    reason: "",
  });
  const [stockInError, setStockInError] = useState<string | null>(null);

  // Movement history modal
  const [showMovementsModal, setShowMovementsModal] = useState(false);
  const [movementsItem, setMovementsItem] = useState<InventoryItem | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);

  // Approval modal
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalItem, setApprovalItem] = useState<InventoryItem | null>(null);
  const [processingApproval, setProcessingApproval] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  // Reject reason modal
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  // Actions overflow dropdown
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const closeDropdown = useCallback(() => setOpenDropdownId(null), []);
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    }
    if (openDropdownId) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [openDropdownId, closeDropdown]);

  // Computed stats
  const stats = useMemo(() => {
    const active = allItems.filter((i) => i.status === "active");
    const lowStock = active.filter((i) => i.is_low_stock);
    return {
      total: allItems.length,
      active: active.length,
      lowStock: lowStock.length,
    };
  }, [allItems]);

  // Filtered + paginated
  const { filteredItems, paginatedItems, totalPages } = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const filtered = allItems.filter((item) => {
      const matchSearch =
        !q ||
        item.item_name.toLowerCase().includes(q) ||
        item.sku_code.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q);

      const matchStatus =
        filterStatus === "all" || item.status === filterStatus;

      const matchCategory =
        filterCategory === "all" || item.category === filterCategory;

      const matchBranch =
        filterBranch === "all" || item.branch_id === filterBranch;

      return matchSearch && matchStatus && matchCategory && matchBranch;
    });
    const total = Math.ceil(filtered.length / ITEMS_PER_PAGE);
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginated = filtered.slice(start, start + ITEMS_PER_PAGE);
    return { filteredItems: filtered, paginatedItems: paginated, totalPages: total };
  }, [allItems, searchQuery, filterStatus, filterCategory, filterBranch, currentPage]);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterStatus, filterCategory, filterBranch]);

  function handleResetFilters() {
    setFilterStatus("all");
    setFilterCategory("all");
    setFilterBranch("all");
    setSearchQuery("");
    setCurrentPage(1);
  }

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);
      const [inventoryRes, branchesData] = await Promise.all([
        inventoryApi.getAll({ limit: 1000 }),
        branchesApi.getAll(),
      ]);
      setAllItems(inventoryRes.data);
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
      item_name: "",
      sku_code: "",
      category: "",
      unit_of_measure: "pcs",
      cost_price: "",
      reorder_threshold: "5",
      branch_id: defaultBranchId,
      initial_stock: "",
    });
    setAddError(null);
    setShowAddModal(true);
  }

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);

    if (!addForm.item_name.trim()) { setAddError("Item name is required"); return; }
    if (addForm.item_name.trim().length > MAX_ITEM_NAME_LENGTH) {
      setAddError(`Item name must be at most ${MAX_ITEM_NAME_LENGTH} characters`);
      return;
    }
    if (/[^A-Za-z0-9 ]/.test(addForm.item_name.trim())) {
      setAddError("Item name can only contain letters, numbers, and spaces");
      return;
    }
    if (!addForm.sku_code.trim()) { setAddError("SKU code is required"); return; }
    if (!addForm.category) { setAddError("Category is required"); return; }
    if (!addForm.cost_price || isNaN(parseFloat(addForm.cost_price)) || parseFloat(addForm.cost_price) < 0) {
      setAddError("Cost price must be a valid non-negative number"); return;
    }
    if (!addForm.branch_id) { setAddError("Branch is required"); return; }

    try {
      setAddingItem(true);
      await inventoryApi.create({
        item_name: addForm.item_name.trim(),
        sku_code: addForm.sku_code.trim(),
        category: addForm.category,
        unit_of_measure: addForm.unit_of_measure,
        cost_price: parseFloat(addForm.cost_price),
        reorder_threshold: parseInt(addForm.reorder_threshold) || 0,
        branch_id: addForm.branch_id,
        initial_stock: addForm.initial_stock ? parseInt(addForm.initial_stock) : undefined,
      });
      setShowAddModal(false);
      showToast.success("Inventory item created as draft. Submit it for approval to activate.");
      fetchData();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to create inventory item");
      showToast.error(err instanceof Error ? err.message : "Failed to create inventory item");
    } finally {
      setAddingItem(false);
    }
  }

  // --- View ---
  function openViewModal(item: InventoryItem) {
    setViewItem(item);
    setShowViewModal(true);
  }

  // --- Edit ---
  function openEditModal(item: InventoryItem) {
    setSelectedItem(item);
    setEditForm({
      item_name: item.item_name,
      sku_code: item.sku_code,
      category: item.category,
      unit_of_measure: item.unit_of_measure,
      cost_price: item.cost_price.toString(),
      reorder_threshold: item.reorder_threshold.toString(),
      status: item.status,
    });
    setEditError(null);
    setShowEditModal(true);
  }

  async function handleEditItem(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedItem) return;
    setEditError(null);

    if (!editForm.item_name.trim()) { setEditError("Item name cannot be empty"); return; }
    if (editForm.item_name.trim().length > MAX_ITEM_NAME_LENGTH) {
      setEditError(`Item name must be at most ${MAX_ITEM_NAME_LENGTH} characters`);
      return;
    }
    if (/[^A-Za-z0-9 ]/.test(editForm.item_name.trim())) {
      setEditError("Item name can only contain letters, numbers, and spaces");
      return;
    }
    if (!editForm.sku_code.trim()) { setEditError("SKU code cannot be empty"); return; }
    if (!editForm.cost_price || isNaN(parseFloat(editForm.cost_price)) || parseFloat(editForm.cost_price) < 0) {
      setEditError("Cost price must be a valid non-negative number"); return;
    }

    try {
      setEditingItem(true);
      const payload: {
        item_name: string;
        sku_code: string;
        category: string;
        unit_of_measure: string;
        cost_price: number;
        reorder_threshold: number;
        status?: string;
      } = {
        item_name: editForm.item_name.trim(),
        sku_code: editForm.sku_code.trim(),
        category: editForm.category,
        unit_of_measure: editForm.unit_of_measure,
        cost_price: parseFloat(editForm.cost_price),
        reorder_threshold: parseInt(editForm.reorder_threshold) || 0,
      };

      if (selectedItem.status === "active" || selectedItem.status === "inactive") {
        payload.status = editForm.status;
      }

      await inventoryApi.update(selectedItem.id, payload);
      setShowEditModal(false);
      setSelectedItem(null);
      showToast.success("Inventory item updated successfully");
      fetchData();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update inventory item");
      showToast.error(err instanceof Error ? err.message : "Failed to update inventory item");
    } finally {
      setEditingItem(false);
    }
  }

  // --- Delete ---
  async function openDeleteConfirmModal(item: InventoryItem) {
    setItemToDelete(item);
    setItemHasReferences(false);
    setCheckingReferences(true);
    setShowDeleteConfirm(true);
    try {
      const movRes = await inventoryApi.getMovements(item.id, { limit: 1 });
      setItemHasReferences((movRes.data?.length ?? 0) > 0);
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
      const result = await inventoryApi.delete(itemToDelete.id);
      setShowDeleteConfirm(false);
      setItemToDelete(null);
      const isDeactivated = result.message?.toLowerCase().includes("deactivated");
      showToast.success(isDeactivated ? "Inventory item deactivated successfully" : "Inventory item deleted successfully");
      fetchData();
    } catch (err) {
      const failMsg = itemHasReferences ? "Failed to deactivate inventory item" : "Failed to delete inventory item";
      showToast.error(err instanceof Error ? err.message : failMsg);
    } finally {
      setDeletingItem(false);
    }
  }

  // --- Adjust ---
  function openAdjustModal(item: InventoryItem) {
    setAdjustItem(item);
    setAdjustForm({ adjustment_type: "increase", quantity: "", reason: "" });
    setAdjustError(null);
    setShowAdjustModal(true);
  }

  async function handleAdjust(e: React.FormEvent) {
    e.preventDefault();
    if (!adjustItem) return;
    setAdjustError(null);

    const qty = parseInt(adjustForm.quantity);
    if (!qty || qty < 1) { setAdjustError("Quantity must be at least 1"); return; }
    if (!adjustForm.reason.trim()) { setAdjustError("Reason is required for adjustments"); return; }

    try {
      setAdjustingItem(true);
      await inventoryApi.adjust(adjustItem.id, {
        adjustment_type: adjustForm.adjustment_type,
        quantity: qty,
        reason: adjustForm.reason.trim(),
      });
      setShowAdjustModal(false);
      showToast.success("Stock adjusted successfully");
      fetchData();
    } catch (err) {
      setAdjustError(err instanceof Error ? err.message : "Failed to adjust stock");
      showToast.error(err instanceof Error ? err.message : "Failed to adjust stock");
    } finally {
      setAdjustingItem(false);
    }
  }

  // --- Stock In ---
  function openStockInModal(item: InventoryItem) {
    setStockInItem(item);
    setStockInForm({ quantity: "", reason: "" });
    setStockInError(null);
    setShowStockInModal(true);
  }

  async function handleStockIn(e: React.FormEvent) {
    e.preventDefault();
    if (!stockInItem) return;
    setStockInError(null);

    const qty = parseInt(stockInForm.quantity);
    if (!qty || qty < 1) { setStockInError("Quantity must be at least 1"); return; }

    try {
      setStockInLoading(true);
      await inventoryApi.stockIn(stockInItem.id, {
        quantity: qty,
        reason: stockInForm.reason.trim() || undefined,
      });
      setShowStockInModal(false);
      showToast.success("Stock added successfully");
      fetchData();
    } catch (err) {
      setStockInError(err instanceof Error ? err.message : "Failed to add stock");
      showToast.error(err instanceof Error ? err.message : "Failed to add stock");
    } finally {
      setStockInLoading(false);
    }
  }

  function openApprovalModal(item: InventoryItem) {
    setApprovalItem(item);
    setApprovalError(null);
    setRejectReason("");
    setShowApprovalModal(true);
  }

  async function handleApprove() {
    if (!approvalItem) return;
    try {
      setProcessingApproval(true);
      setApprovalError(null);
      const pendingInitialStock = approvalItem.initial_stock_pending || 0;
      await inventoryApi.recordApproval(approvalItem.id, { decision: "approved" });
      setShowApprovalModal(false);
      setApprovalItem(null);
      if (pendingInitialStock > 0) {
        showToast.success(`Inventory item approved and activated. Initial stock-in posted: ${pendingInitialStock}.`);
      } else {
        showToast.success("Inventory item approved and activated with 0 initial stock.");
      }
      fetchData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to approve inventory item";
      setApprovalError(msg);
      showToast.error(msg);
    } finally {
      setProcessingApproval(false);
    }
  }

  async function handleReject() {
    if (!approvalItem) return;
    if (!rejectReason.trim()) {
      setApprovalError("Rejection reason is required");
      return;
    }

    try {
      setProcessingApproval(true);
      setApprovalError(null);
      await inventoryApi.recordApproval(approvalItem.id, {
        decision: "rejected",
        rejection_reason: rejectReason.trim(),
      });
      setShowRejectModal(false);
      setShowApprovalModal(false);
      setApprovalItem(null);
      setRejectReason("");
      showToast.success("Inventory item rejected");
      fetchData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to reject inventory item";
      setApprovalError(msg);
      showToast.error(msg);
    } finally {
      setProcessingApproval(false);
    }
  }

  if (loading) {
    return <SkeletonLoader showHeader showStats statsCount={3} rows={5} />;
  }

  if (error) {
    return <ErrorAlert message={error} onRetry={fetchData} />;
  }

  return (
    <div className="space-y-6">
      {/* Header with title and add button */}
      <PageHeader
        title="Inventory"
        subtitle="Summary of inventory items"
        buttonLabel="Add New Inventory"
        onAdd={openAddModal}
        showButton={canCreate}
      />

      {/* Summary Stats Cards */}
      <StatsCards
        cards={[
          { icon: LuBox, iconBg: "bg-primary-100", iconColor: "text-primary", label: "All Items", value: stats.total },
          { icon: LuPackageCheck, iconBg: "bg-primary-100", iconColor: "text-positive", label: "Active", value: stats.active },
          { icon: LuTriangleAlert, iconBg: "bg-negative-100", iconColor: "text-negative", label: "Low Stock", value: stats.lowStock },
        ] as StatCard[]}
      />

      {/* Table Section */}
      <div className="bg-white border border-neutral-200 rounded-xl">
        {/* Table Header with Search and Filters */}
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
              { value: "draft", label: "Draft" },
              { value: "pending_approval", label: "Pending Approval" },
              { value: "rejected", label: "Rejected" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ],
            onChange: setFilterStatus,
          }}
          advancedFilters={[
            {
              key: "category",
              label: "Category",
              value: filterCategory,
              options: [
                { value: "all", label: "All Categories" },
                ...CATEGORY_PRESETS,
              ],
              onChange: setFilterCategory,
            },
            {
              key: "branch",
              label: "Branch",
              value: filterBranch,
              options: [
                { value: "all", label: "All Branches" },
                ...branches.map((b) => ({ value: b.id, label: b.name })),
              ],
              onChange: setFilterBranch,
            },
          ]}
          onApply={fetchData}
          onReset={handleResetFilters}
          onRefresh={fetchData}
          loading={loading}
        />

        {/* Mobile Card View */}
        <MobileCardList
          isEmpty={paginatedItems.length === 0}
          emptyMessage={
            searchQuery || filterStatus !== "all" || filterCategory !== "all" || filterBranch !== "all"
              ? "No items match your filters."
              : 'No inventory items found. Click "Add New Inventory" to create one.'
          }
        >
            {paginatedItems.map((item) => (
              <MobileCard
                key={item.id}
                onClick={() => openViewModal(item)}
                icon={<LuBox className="w-5 h-5 text-primary" />}
                title={item.item_name}
                subtitle={item.branches?.code}
                statusBadge={{
                  label: getInventoryStatusLabel(item.status),
                  className: getInventoryStatusColors(item.status),
                }}
                details={
                  <>
                    <p className="text-neutral-900 font-mono">{item.sku_code}</p>
                    <p className={`text-neutral-900 ${item.is_low_stock ? "text-negative font-semibold" : ""}`}>
                      {item.current_quantity} {item.unit_of_measure} {item.is_low_stock && "(Low Stock)"}
                    </p>
                    <p className="text-neutral-900">{item.category}</p>
                  </>
                }
                extraActions={
                  (() => {
                    const canEditThis = canUpdate;
                    const canDeleteThis = canDelete && item.status === "active";
                    const showDots = true;
                    const hasActions = canEditThis || canDeleteThis || showDots;
                    if (!hasActions) return null;
                    return (
                      <>
                        {canEditThis && (
                          <button
                            onClick={(e) => { e.stopPropagation(); openEditModal(item); }}
                            className="flex items-center gap-1 text-sm text-primary hover:text-primary-900"
                          >
                            <LuPencil className="w-4 h-4" /> Edit
                          </button>
                        )}
                        {canDeleteThis && (
                          <button
                            onClick={(e) => { e.stopPropagation(); openDeleteConfirmModal(item); }}
                            className="flex items-center gap-1 text-sm text-negative hover:text-negative-900"
                          >
                            <LuTrash2 className="w-4 h-4" /> Delete
                          </button>
                        )}
                        {showDots && (
                          <div className="relative" ref={openDropdownId === `card-${item.id}` ? dropdownRef : undefined}>
                            <button
                              onClick={(e) => { e.stopPropagation(); setOpenDropdownId(openDropdownId === `card-${item.id}` ? null : `card-${item.id}`); }}
                              className="flex items-center gap-1 text-sm text-neutral-950 hover:text-neutral-900"
                              title="More actions"
                            >
                              <LuEllipsisVertical className="w-4 h-4" /> More
                            </button>
                            {openDropdownId === `card-${item.id}` && (
                              <div className="absolute right-0 mt-2 w-52 bg-white rounded-lg border border-neutral-200 py-2 z-50">
                                <button
                                  onClick={(e) => { e.stopPropagation(); closeDropdown(); setShowMovementsModal(true); setMovementsItem(item); setMovements([]); setMovementsLoading(true); inventoryApi.getMovements(item.id, { limit: 100 }).then((res) => { setMovements(res.data); }).catch(() => { }).finally(() => { setMovementsLoading(false); }); }}
                                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors"
                                >
                                  <LuHistory className="w-4 h-4" /> Movement History
                                </button>
                                {canApprove && (item.status === "draft" || item.status === "rejected" || item.status === "pending_approval") && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); closeDropdown(); openApprovalModal(item); }}
                                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors"
                                  >
                                    <LuSend className="w-4 h-4" /> Approved Item
                                  </button>
                                )}
                                {canStockIn && item.status === "active" && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); closeDropdown(); openStockInModal(item); }}
                                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors"
                                  >
                                    <LuCircleArrowUp className="w-4 h-4" /> Stock In
                                  </button>
                                )}
                                {canAdjust && item.status === "active" && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); closeDropdown(); openAdjustModal(item); }}
                                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors"
                                  >
                                    <LuCircleArrowDown className="w-4 h-4" /> Adjust Stock
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    );
                  })()
                }
              />
            ))}
        </MobileCardList>

        {/* Desktop Table View */}
        <DesktopTable
          columns={[
            { label: "Item Name" },
            { label: "SKU" },
            { label: "Stock", align: "center" },
            { label: "Branch" },
            { label: "Status" },
            { label: "Actions", align: "center" },
          ] as DesktopTableColumn[]}
          isEmpty={paginatedItems.length === 0}
          emptyMessage={
            searchQuery || filterStatus !== "all" || filterCategory !== "all" || filterBranch !== "all"
              ? "No items match your filters."
              : "No inventory items found. Click \"Add New Inventory\" to create one."
          }
        >
              {paginatedItems.map((item) => {
                const canEditThis = canUpdate;
                const canDeleteThis = canDelete && item.status === "active";
                const showDots = true; // always show for Movement History
                return (
                <DesktopTableRow key={item.id} onClick={() => openViewModal(item)}>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className="font-medium text-neutral-900">{item.item_name}</span>
                  </td>
                  <td className="py-3 px-4 text-sm text-neutral-900 whitespace-nowrap">
                    <span className="font-mono">{item.sku_code}</span>
                  </td>
                  <td className="py-3 px-4 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1">
                      <span className={`font-semibold ${item.is_low_stock ? "text-negative" : "text-neutral-900"}`}>
                        {item.current_quantity}
                      </span>
                      {item.is_low_stock && (
                        <LuTriangleAlert className="w-3.5 h-3.5 text-negative" />
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-xs font-mono bg-positive-100 text-positive-950 px-2 py-0.5 rounded">
                      {item.branches?.code || item.branch_id.substring(0, 8)}
                    </span>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getInventoryStatusColors(item.status)}`}>
                      {getInventoryStatusLabel(item.status)}
                    </span>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <div className="flex items-center justify-center gap-2">
                      {canEditThis && (
                        <button
                          onClick={(e) => { e.stopPropagation(); openEditModal(item); }}
                          className="p-2 text-primary-950 hover:text-primary-900 hover:bg-primary-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <LuPencil className="w-4 h-4" />
                        </button>
                      )}
                      {canDeleteThis && (
                        <button
                          onClick={(e) => { e.stopPropagation(); openDeleteConfirmModal(item); }}
                          className="p-2 text-negative-950 hover:text-negative-900 hover:bg-negative-50 rounded-lg transition-colors"
                          title="Deactivate"
                        >
                          <LuTrash2 className="w-4 h-4" />
                        </button>
                      )}
                      {/* More actions dropdown */}
                      {showDots && (
                        <div className="relative" ref={openDropdownId === `table-${item.id}` ? dropdownRef : undefined}>
                          <button
                            onClick={(e) => { e.stopPropagation(); setOpenDropdownId(openDropdownId === `table-${item.id}` ? null : `table-${item.id}`); }}
                            className="p-2 text-neutral-950 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
                            title="More actions"
                          >
                            <LuEllipsisVertical className="w-4 h-4" />
                          </button>
                          {openDropdownId === `table-${item.id}` && (
                            <div className="absolute right-0 mt-2 w-52 bg-white rounded-lg border border-neutral-200 py-2 z-50">
                              <button
                                onClick={(e) => { e.stopPropagation(); closeDropdown(); setShowMovementsModal(true); setMovementsItem(item); setMovements([]); setMovementsLoading(true); inventoryApi.getMovements(item.id, { limit: 100 }).then((res) => { setMovements(res.data); }).catch(() => { }).finally(() => { setMovementsLoading(false); }); }}
                                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors"
                              >
                                <LuHistory className="w-4 h-4" /> Movement History
                              </button>
                              {canApprove && (item.status === "draft" || item.status === "rejected" || item.status === "pending_approval") && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); closeDropdown(); openApprovalModal(item); }}
                                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors"
                                >
                                  <LuSend className="w-4 h-4" /> Approved Item
                                </button>
                              )}
                              {canStockIn && item.status === "active" && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); closeDropdown(); openStockInModal(item); }}
                                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors"
                                >
                                  <LuCircleArrowUp className="w-4 h-4" /> Stock In
                                </button>
                              )}
                              {canAdjust && item.status === "active" && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); closeDropdown(); openAdjustModal(item); }}
                                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors"
                                >
                                  <LuCircleArrowDown className="w-4 h-4" /> Adjust Stock
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                </DesktopTableRow>
                );
              })}
        </DesktopTable>

        {/* Pagination */}
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          variant="table"
          totalItems={filteredItems.length}
          itemsPerPage={ITEMS_PER_PAGE}
          entityName="items"
        />
      </div>

      {/* ───── Add New Inventory Modal ───── */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add New Inventory"
        maxWidth="lg"
      >
        <form onSubmit={handleAddItem}>
          <ModalSection title="Item Information">
            <ModalInput type="text" value={addForm.item_name} onChange={(v) => setAddForm(p => ({ ...p, item_name: sanitizeItemNameInput(v) }))} placeholder="Item Name *" required />
            <ModalInput type="text" value={addForm.sku_code} onChange={(v) => setAddForm(p => ({ ...p, sku_code: v.toUpperCase() }))} placeholder="SKU Code * (unique per branch)" required />
            <div className="grid grid-cols-2 gap-4">
              <ModalSelect value={addForm.category} onChange={(v) => setAddForm(p => ({ ...p, category: v }))} placeholder="Category *" options={CATEGORY_PRESETS} />
              <ModalSelect value={addForm.unit_of_measure} onChange={(v) => setAddForm(p => ({ ...p, unit_of_measure: v }))} options={UOM_OPTIONS} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <ModalInput type="number" value={addForm.cost_price} onChange={(v) => setAddForm(p => ({ ...p, cost_price: v }))} placeholder="Cost Price *" required />
              <ModalInput type="number" value={addForm.reorder_threshold} onChange={(v) => setAddForm(p => ({ ...p, reorder_threshold: v }))} placeholder="Reorder Threshold" />
            </div>
          </ModalSection>
          <ModalSection title="Branch & Initial Stock">
            <ModalSelect value={addForm.branch_id} onChange={(v) => setAddForm(p => ({ ...p, branch_id: v }))} placeholder="Select Branch *" options={branchOptions} />
            <ModalInput type="number" value={addForm.initial_stock} onChange={(v) => setAddForm(p => ({ ...p, initial_stock: v }))} placeholder="Initial Stock Quantity (applied after approval)" />
          </ModalSection>
          <ModalError message={addError} />
          <ModalButtons onCancel={() => setShowAddModal(false)} submitText={addingItem ? "Creating..." : "Create Inventory"} loading={addingItem} />
        </form>
      </Modal>

      {/* ───── View Inventory Item Modal ───── */}
      <Modal
        isOpen={showViewModal && !!viewItem}
        onClose={() => setShowViewModal(false)}
        title="Inventory Item Details"
        maxWidth="lg"
      >
        {viewItem && (
          <div>
            <ModalSection title="Stock Status">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-neutral-100 rounded-xl px-4 py-3.5 text-center">
                  <p className="text-xs text-neutral-900">Current Stock</p>
                  <p className={`text-lg font-bold ${viewItem.is_low_stock ? "text-negative" : "text-neutral-950"}`}>{viewItem.current_quantity}</p>
                </div>
                <div className="bg-neutral-100 rounded-xl px-4 py-3.5 text-center">
                  <p className="text-xs text-neutral-900">Reorder At</p>
                  <p className="text-lg font-bold text-neutral-950">{viewItem.reorder_threshold}</p>
                </div>
                <div className="bg-neutral-100 rounded-xl px-4 py-3.5 text-center">
                  <p className="text-xs text-neutral-900">Status</p>
                  <p className={`text-lg font-bold ${viewItem.status === "active" ? "text-positive" : viewItem.status === "pending_approval" ? "text-primary" : "text-neutral-950"}`}>
                    {getInventoryStatusLabel(viewItem.status)}
                  </p>
                </div>
              </div>
              {viewItem.is_low_stock && (
                <div className="bg-negative-200 border border-negative rounded-xl p-3 flex items-center gap-2">
                  <LuTriangleAlert className="w-4 h-4 text-negative-950" />
                  <span className="text-sm text-negative-950">This item is below the reorder threshold!</span>
                </div>
              )}
            </ModalSection>

            <ModalSection title="Item Information">
              <ModalInput type="text" value={viewItem.item_name} onChange={() => { }} placeholder="Item Name" disabled />
              <div className="grid grid-cols-2 gap-4">
                <ModalInput type="text" value={viewItem.sku_code} onChange={() => { }} placeholder="SKU Code" disabled />
                <ModalInput type="text" value={viewItem.category} onChange={() => { }} placeholder="Category" disabled />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <ModalInput type="text" value={viewItem.unit_of_measure} onChange={() => { }} placeholder="Unit of Measure" disabled />
                <ModalInput type="text" value={formatPrice(viewItem.cost_price)} onChange={() => { }} placeholder="Cost Price" disabled />
              </div>
              <ModalInput type="text" value={viewItem.branches ? `${viewItem.branches.name} (${viewItem.branches.code})` : viewItem.branch_id} onChange={() => { }} placeholder="Branch" disabled />
            </ModalSection>

            <ModalSection title="Timestamps">
              <div className="grid grid-cols-2 gap-4">
                <ModalInput type="text" value={formatDate(viewItem.created_at)} onChange={() => { }} placeholder="Created" disabled />
                <ModalInput type="text" value={formatDate(viewItem.updated_at)} onChange={() => { }} placeholder="Updated" disabled />
              </div>
            </ModalSection>
          </div>
        )}
      </Modal>

      {/* ───── Edit Inventory Item Modal ───── */}
      <Modal
        isOpen={showEditModal && !!selectedItem}
        onClose={() => setShowEditModal(false)}
        title="Edit Inventory Item"
        maxWidth="lg"
      >
        <form onSubmit={handleEditItem}>
          <ModalSection title="Item Information">
            <ModalInput type="text" value={editForm.item_name} onChange={(v) => setEditForm(p => ({ ...p, item_name: sanitizeItemNameInput(v) }))} placeholder="Item Name *" required />
            <ModalInput type="text" value={editForm.sku_code} onChange={(v) => setEditForm(p => ({ ...p, sku_code: v.toUpperCase() }))} placeholder="SKU Code *" required />
            <div className="grid grid-cols-2 gap-4">
              <ModalSelect value={editForm.category} onChange={(v) => setEditForm(p => ({ ...p, category: v }))} placeholder="Category *" options={CATEGORY_PRESETS} />
              <ModalSelect value={editForm.unit_of_measure} onChange={(v) => setEditForm(p => ({ ...p, unit_of_measure: v }))} options={UOM_OPTIONS} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <ModalInput type="number" value={editForm.cost_price} onChange={(v) => setEditForm(p => ({ ...p, cost_price: v }))} placeholder="Cost Price *" required />
              <ModalInput type="number" value={editForm.reorder_threshold} onChange={(v) => setEditForm(p => ({ ...p, reorder_threshold: v }))} placeholder="Reorder Threshold" />
            </div>
            {(selectedItem?.status === "active" || selectedItem?.status === "inactive") && (
              <ModalSelect
                value={editForm.status}
                onChange={(v) => setEditForm(p => ({ ...p, status: v }))}
                options={[
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ]}
              />
            )}
          </ModalSection>
          <ModalError message={editError} />
          <ModalButtons onCancel={() => setShowEditModal(false)} submitText={editingItem ? "Saving..." : "Save Changes"} loading={editingItem} />
        </form>
      </Modal>

      {/* ───── Delete / Deactivate Confirmation Modal ───── */}
      <Modal
        isOpen={showDeleteConfirm && !!itemToDelete}
        onClose={() => setShowDeleteConfirm(false)}
        title={itemHasReferences ? "Deactivate Inventory Item" : "Delete Inventory Item"}
        maxWidth="sm"
      >
        {itemToDelete && (
          <div>
            <div className="bg-neutral-100 rounded-xl p-4 my-4">
              <p className="text-neutral-900">
                {itemHasReferences
                  ? <>Are you sure you want to deactivate <strong className="text-neutral-950">{itemToDelete.item_name}</strong> ({itemToDelete.sku_code})?</>
                  : <>Are you sure you want to delete <strong className="text-neutral-950">{itemToDelete.item_name}</strong> ({itemToDelete.sku_code})?</>
                }
              </p>
            </div>
            <p className="text-sm text-neutral-900 mb-2">
              {itemHasReferences
                ? "This inventory item has existing stock movements and will be set to inactive instead of deleted."
                : "This action cannot be undone. All inventory item data will be permanently removed."
              }
            </p>
            <div className="flex gap-3 mt-6">
              <button type="button" onClick={() => setShowDeleteConfirm(false)} className="flex-1 px-4 py-3.5 border-2 border-negative text-negative rounded-xl font-semibold hover:bg-negative-200 transition-colors">
                Cancel
              </button>
              <button type="button" onClick={handleDeleteItem} disabled={deletingItem || checkingReferences} className="flex-1 px-4 py-3.5 bg-negative text-white rounded-xl font-semibold hover:bg-negative-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
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

      {/* ───── Adjust Stock Modal ───── */}
      <Modal
        isOpen={showAdjustModal && !!adjustItem}
        onClose={() => { setShowAdjustModal(false) }}
        title="Adjust Stock"
        maxWidth="lg"
      >
        {adjustItem && (
          <form onSubmit={handleAdjust}>
            <div className="bg-neutral-100 rounded-xl p-4 my-4">
              <p className="text-neutral-950 font-medium">{adjustItem.item_name}</p>
              <p className="text-sm text-neutral-900">Current Stock: <strong>{adjustItem.current_quantity}</strong> {adjustItem.unit_of_measure}</p>
            </div>
            <ModalSection title="Adjustment Details">
              <ModalSelect
                value={adjustForm.adjustment_type}
                onChange={(v) => setAdjustForm(p => ({ ...p, adjustment_type: v as "increase" | "decrease" }))}
                options={[
                  { value: "increase", label: "Increase Stock" },
                  { value: "decrease", label: "Decrease Stock" },
                ]}
              />
              <ModalInput type="number" value={adjustForm.quantity} onChange={(v) => setAdjustForm(p => ({ ...p, quantity: v }))} placeholder="Quantity *" required />
              <textarea
                value={adjustForm.reason}
                onChange={(e) => setAdjustForm(p => ({ ...p, reason: e.target.value }))}
                placeholder="Reason for adjustment *"
                rows={3}
                required
                className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
              />
            </ModalSection>
            <ModalError message={adjustError} />
            <ModalButtons onCancel={() => { setShowAdjustModal(false) }} submitText={adjustingItem ? "Adjusting..." : "Adjust Stock"} loading={adjustingItem} />
          </form>
        )}
      </Modal>

      {/* ───── Stock In Modal ───── */}
      <Modal
        isOpen={showStockInModal && !!stockInItem}
        onClose={() => { setShowStockInModal(false) }}
        title="Add Stock"
        maxWidth="lg"
      >
        {stockInItem && (
          <form onSubmit={handleStockIn}>
            <div className="bg-neutral-100 rounded-xl p-4 my-4">
              <p className="text-neutral-950 font-medium">{stockInItem.item_name}</p>
              <p className="text-sm text-neutral-900">Current Stock: <strong>{stockInItem.current_quantity}</strong> {stockInItem.unit_of_measure}</p>
            </div>
            <ModalSection title="Stock Received">
              <ModalInput type="number" value={stockInForm.quantity} onChange={(v) => setStockInForm(p => ({ ...p, quantity: v }))} placeholder="Quantity to add *" required />
              <textarea
                value={stockInForm.reason}
                onChange={(e) => setStockInForm(p => ({ ...p, reason: e.target.value }))}
                placeholder="Reason / PO reference (optional)"
                rows={3}
                className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
              />
            </ModalSection>
            <ModalError message={stockInError} />
            <ModalButtons onCancel={() => { setShowStockInModal(false) }} submitText={stockInLoading ? "Adding..." : "Add Stock"} loading={stockInLoading} />
          </form>
        )}
      </Modal>

      {/* ───── Approval Action Modal ───── */}
      <Modal
        isOpen={showApprovalModal && !!approvalItem}
        onClose={() => {
          setShowApprovalModal(false);
          setApprovalItem(null);
          setApprovalError(null);
        }}
        title="Inventory Approval"
        maxWidth="sm"
      >
        {approvalItem && (
          <div>
            <div className="bg-neutral-100 rounded-xl p-4 my-4">
              <p className="text-neutral-900">
                Record approval decision for <strong className="text-neutral-950">{approvalItem.item_name}</strong> ({approvalItem.sku_code})?
              </p>
            </div>
            <p className="text-sm text-neutral-900 mb-2">
              Select whether to approve or reject this inventory item. Initial stock on approval: <strong className="text-neutral-950">{approvalItem.initial_stock_pending || 0}</strong>
            </p>
            <ModalError message={approvalError} />

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                disabled={processingApproval}
                onClick={() => {
                  setShowApprovalModal(false);
                  setShowRejectModal(true);
                  setRejectReason("");
                  setApprovalError(null);
                }}
                className="flex-1 px-4 py-3.5 border-2 border-primary text-primary rounded-xl font-semibold hover:bg-primary-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Reject
              </button>
              <button
                type="button"
                disabled={processingApproval}
                onClick={handleApprove}
                className="flex-1 px-4 py-3.5 bg-primary text-white rounded-xl font-semibold hover:bg-primary-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {processingApproval ? "Processing..." : "Approve"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ───── Reject Reason Modal ───── */}
      <Modal
        isOpen={showRejectModal && !!approvalItem}
        onClose={() => {
          if (!processingApproval) {
            setShowRejectModal(false);
            setRejectReason("");
          }
        }}
        title="Reject Inventory Item"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Provide reason for rejection..."
            rows={4}
            className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
          />
          <ModalError message={approvalError} />
          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={() => {
                setShowRejectModal(false);
                setRejectReason("");
              }}
              disabled={processingApproval}
              className="flex-1 px-4 py-3.5 border-2 border-neutral-300 text-neutral-950 rounded-xl font-semibold hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleReject}
              disabled={processingApproval}
              className="flex-1 px-4 py-3.5 bg-negative text-white rounded-xl font-semibold hover:bg-negative-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {processingApproval ? "Processing..." : "Confirm Reject"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ───── Movement History Modal ───── */}
      <Modal
        isOpen={showMovementsModal && !!movementsItem}
        onClose={() => { setShowMovementsModal(false); }}
        title="Stock Movement History"
        maxWidth="lg"
      >
        {movementsItem && (
          <div>
            <ModalSection title="Item">
              <ModalInput type="text" value={movementsItem.item_name} onChange={() => { }} placeholder="Item" disabled />
            </ModalSection>

            <ModalSection title="History">
              {movementsLoading ? (
                <div className="space-y-4">
                  {[1, 2].map((i) => (
                    <div key={i} className="bg-neutral-100 rounded-xl px-4 py-3 animate-pulse">
                      <div className="h-4 bg-neutral-200 rounded w-3/4 mb-2" />
                      <div className="h-3 bg-neutral-200 rounded w-1/2" />
                    </div>
                  ))}
                </div>
              ) : movements.length > 0 ? (
                <div className="space-y-3">
                  {movements.map((m) => (
                    <div key={m.id} className="bg-neutral-100 rounded-xl px-4 py-3 group relative">
                      <div className="flex items-center gap-2 mb-1">
                        <LuHistory className="w-3.5 h-3.5 text-neutral-600" />
                        <span className="text-xs font-semibold uppercase text-neutral-950">
                          {movementTypeLabel(m.movement_type)}
                        </span>
                        <span className="text-xs font-medium text-neutral-950">
                          {m.movement_type === "stock_out" ? "-" : "+"}{m.quantity}
                        </span>
                        <span className="text-xs text-neutral-600 ml-auto">{formatDateTime(m.created_at)}</span>
                      </div>
                      <p className="text-xs text-neutral-900 cursor-default">
                        {referenceTypeLabel(m.reference_type)}
                      </p>
                      {/* Tooltip on hover */}
                      <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-50 w-64 bg-white rounded-lg border border-neutral-200 py-3 pointer-events-none">
                        <div className="px-4 gap-1 flex flex-col">
                          <p className="font-medium text-neutral-950">{movementTypeLabel(m.movement_type)}</p>
                          <p className="text-sm text-neutral-900">Quantity: {m.movement_type === "stock_out" ? "-" : "+"}{m.quantity}</p>
                          {m.reference_id && <p className="text-sm text-neutral-900">Reference ID: {m.reference_id}</p>}
                          {m.reason && <p className="text-sm text-neutral-900">Reason: {m.reason}</p>}
                          <p className="text-sm text-neutral-900">Date: {formatDateTime(m.created_at)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-neutral-900 text-center py-3">No movement history available.</p>
              )}
            </ModalSection>
          </div>
        )}
      </Modal>
    </div>
  );
}
