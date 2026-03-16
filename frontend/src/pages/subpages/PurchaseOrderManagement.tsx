import { useState, useEffect, useMemo, useRef, useCallback, type ChangeEvent } from "react";
import {
  LuPlus,
  LuPencil,
  LuTrash2,
  LuEllipsisVertical,
  LuShoppingCart,
  LuSend,
  LuPackageCheck,
  LuBan,
  LuBadgeCheck,
  LuClipboardList,
  LuFileText,
  LuX,
} from "react-icons/lu";
import { purchaseOrdersApi, branchesApi, suppliersApi, supplierProductsApi } from "../../lib/api";
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
import type { PurchaseOrder, Branch, Supplier, SupplierProduct } from "../../types";

const ITEMS_PER_PAGE = 20;
const MANUAL_PO_SUFFIX_PATTERN = /^\d{1,6}$/;

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

function statusBadge(status: string) {
  switch (status) {
    case "draft":
      return "bg-neutral-100 text-neutral-950";
    case "submitted":
      return "bg-primary-100 text-primary-950";
    case "approved":
      return "bg-positive-100 text-positive-950";
    case "received":
      return "bg-positive-100 text-positive-950";
    case "cancelled":
      return "bg-negative-100 text-negative-950";
    case "deactivated":
      return "bg-negative-100 text-negative-950";
    default:
      return "bg-neutral-100 text-neutral-950";
  }
}

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function canModifyReceipt(order: PurchaseOrder): boolean {
  return order.status === "approved" || order.status === "received" || !!order.receipt_attachment;
}

// Draft item for the plus-button pattern
interface DraftPOItem {
  inventory_item_id: string;
  item_name: string;
  sku_code: string;
  quantity_ordered: number;
  unit_cost: number;
  line_total: number;
}

export function PurchaseOrderManagement() {
  const { user } = useAuth();
  const userRoles = user?.roles || [];
  const isHM = userRoles.includes("HM");

  // RBAC: HM, POC, JS, R
  const canCreate = userRoles.some((r) => ["HM", "POC", "JS", "R"].includes(r));
  const canUpdate = canCreate;
  const canDelete = canCreate;
  const canApprove = userRoles.some((r) => ["HM", "POC"].includes(r));

  // Data state
  const [allOrders, setAllOrders] = useState<PurchaseOrder[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierProducts, setSupplierProducts] = useState<SupplierProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search, filters & pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterBranch, setFilterBranch] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addForm, setAddForm] = useState({
    po_number: "",
    supplier_id: "",
    order_date: new Date().toISOString().split("T")[0],
    expected_delivery_date: "",
    branch_id: "",
    notes: "",
  });
  const [addError, setAddError] = useState<string | null>(null);

  // Add modal — plus-button item pattern
  const [selectedInventoryId, setSelectedInventoryId] = useState("");
  const [selectedQty, setSelectedQty] = useState("1");
  const [selectedUnitCost, setSelectedUnitCost] = useState("");
  const [draftItems, setDraftItems] = useState<DraftPOItem[]>([]);

  // View modal
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewOrder, setViewOrder] = useState<PurchaseOrder | null>(null);

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [editForm, setEditForm] = useState({
    supplier_id: "",
    order_date: "",
    expected_delivery_date: "",
    notes: "",
  });
  const [editError, setEditError] = useState<string | null>(null);

  // Edit modal — plus-button item pattern
  const [editSelectedInventoryId, setEditSelectedInventoryId] = useState("");
  const [editSelectedQty, setEditSelectedQty] = useState("1");
  const [editSelectedUnitCost, setEditSelectedUnitCost] = useState("");
  const [editDraftItems, setEditDraftItems] = useState<DraftPOItem[]>([]);

  // Delete modal
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<PurchaseOrder | null>(null);
  const [orderHasReferences, setOrderHasReferences] = useState(false);

  // Submit confirmation modal
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [orderToSubmit, setOrderToSubmit] = useState<PurchaseOrder | null>(null);
  const [processingSubmit, setProcessingSubmit] = useState(false);

  // Approve confirmation modal
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [orderToApprove, setOrderToApprove] = useState<PurchaseOrder | null>(null);
  const [processingApprove, setProcessingApprove] = useState(false);

  // Cancel confirmation modal
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState<PurchaseOrder | null>(null);
  const [processingCancel, setProcessingCancel] = useState(false);

  // Receive confirmation modal
  const [showReceiveConfirm, setShowReceiveConfirm] = useState(false);
  const [orderToReceive, setOrderToReceive] = useState<PurchaseOrder | null>(null);
  const [processingReceive, setProcessingReceive] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptOrder, setReceiptOrder] = useState<PurchaseOrder | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [receiptTargetOrderId, setReceiptTargetOrderId] = useState<string | null>(null);
  const receiptInputRef = useRef<HTMLInputElement | null>(null);

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

  // Computed stats (3 cards: Total, Submitted, Received)
  const stats = useMemo(() => {
    const submitted = allOrders.filter((o) => o.status === "submitted").length;
    const received = allOrders.filter((o) => o.status === "received").length;
    return { total: allOrders.length, submitted, received };
  }, [allOrders]);

  // Filtered + paginated
  const { paginatedItems, totalPages, filteredCount } = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const filtered = allOrders.filter((order) => {
      const matchSearch =
        !q ||
        order.po_number.toLowerCase().includes(q) ||
        (order.supplier_name && order.supplier_name.toLowerCase().includes(q));

      const matchStatus =
        filterStatus === "all" || order.status === filterStatus;

      const matchBranch =
        filterBranch === "all" || order.branch_id === filterBranch;

      return matchSearch && matchStatus && matchBranch;
    });
    const pages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return {
      paginatedItems: filtered.slice(start, start + ITEMS_PER_PAGE),
      totalPages: pages,
      filteredCount: filtered.length,
    };
  }, [allOrders, searchQuery, filterStatus, filterBranch, currentPage]);

  useEffect(() => {
    if (filterStatus === "deactivated") {
      fetchData("deactivated");
      return;
    }
    fetchData("all");
  }, [filterStatus]);
  useEffect(() => { setCurrentPage(1); }, [searchQuery, filterStatus, filterBranch]);

  function handleResetFilters() {
    setFilterStatus("all");
    setFilterBranch("all");
    setSearchQuery("");
    setCurrentPage(1);
  }

  async function fetchData(statusFilter: string = "all") {
    try {
      setLoading(true);
      setError(null);
      const [poRes, branchesData, suppliersRes, spRes] = await Promise.all([
        purchaseOrdersApi.getAll({ limit: 1000, status: statusFilter === "all" ? undefined : statusFilter }),
        branchesApi.getAll(),
        suppliersApi.getAll({ limit: 1000, status: "active" }),
        supplierProductsApi.getAll({ limit: 1000, status: "active" }),
      ]);
      setAllOrders(poRes.data);
      setBranches(branchesData);
      setSuppliers(suppliersRes.data);
      setSupplierProducts(spRes.data);
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

  // Suppliers filtered by selected branch
  function getSuppliersForBranch(branchId: string) {
    if (!branchId) return suppliers;
    return suppliers.filter((s) => s.branch_id === branchId);
  }

  // Supplier options for selects
  function getSupplierOptions(branchId: string) {
    return getSuppliersForBranch(branchId).map((s) => ({
      value: s.id,
      label: s.supplier_name,
    }));
  }

  function getBranchCode(branchId: string): string {
    if (!branchId) return "";
    if (!isHM && user?.branches) {
      const match = user.branches.find((b) => b.branch_id === branchId);
      return match?.branches.code || "";
    }
    return branches.find((b) => b.id === branchId)?.code || "";
  }

  // Supplier products filtered by supplier (and optionally branch)
  function getProductsForSupplier(supplierId: string, branchId?: string) {
    if (!supplierId) return [];
    let products = supplierProducts.filter((sp) => sp.supplier_id === supplierId && sp.inventory_item_id);
    if (branchId) {
      products = products.filter((sp) => sp.branch_id === branchId);
    }
    return products;
  }

  // Inventory item options from supplier products
  function getSupplierItemOptions(supplierId: string, branchId?: string) {
    return getProductsForSupplier(supplierId, branchId).map((sp) => ({
      value: sp.inventory_item_id!,
      label: sp.inventory_items
        ? `${sp.inventory_items.item_name} (${sp.inventory_items.sku_code})`
        : sp.product_name,
    }));
  }

  // ─── Add (plus-button pattern) ───────────────────────────────────────
  function openAddModal() {
    setAddForm({
      po_number: "",
      supplier_id: "",
      order_date: new Date().toISOString().split("T")[0],
      expected_delivery_date: "",
      branch_id: defaultBranchId,
      notes: "",
    });
    setDraftItems([]);
    setSelectedInventoryId("");
    setSelectedQty("1");
    setSelectedUnitCost("");
    setAddError(null);
    setShowAddModal(true);
  }

  function handleAddDraftItem() {
    if (!selectedInventoryId) return;
    const qty = parseInt(selectedQty) || 1;
    const cost = parseFloat(selectedUnitCost) || 0;

    // Find the supplier product that links to this inventory item
    const sp = getProductsForSupplier(addForm.supplier_id, addForm.branch_id)
      .find((p) => p.inventory_item_id === selectedInventoryId);
    if (!sp) return;

    const itemName = sp.inventory_items?.item_name || sp.product_name;
    const skuCode = sp.inventory_items?.sku_code || "";

    // Check for duplicate
    if (draftItems.some((d) => d.inventory_item_id === selectedInventoryId)) {
      setAddError("This item is already added.");
      return;
    }

    setDraftItems([
      ...draftItems,
      {
        inventory_item_id: selectedInventoryId,
        item_name: itemName,
        sku_code: skuCode,
        quantity_ordered: qty,
        unit_cost: cost,
        line_total: qty * cost,
      },
    ]);
    setSelectedInventoryId("");
    setSelectedQty("1");
    setSelectedUnitCost("");
    setAddError(null);
  }

  function removeDraftItem(itemId: string) {
    setDraftItems(draftItems.filter((d) => d.inventory_item_id !== itemId));
  }

  const draftTotal = useMemo(
    () => draftItems.reduce((sum, i) => sum + i.line_total, 0),
    [draftItems]
  );

  // Auto-fill unit cost from supplier product when item selected
  function handleInventorySelect(itemId: string) {
    setSelectedInventoryId(itemId);
    if (itemId) {
      const sp = getProductsForSupplier(addForm.supplier_id, addForm.branch_id)
        .find((p) => p.inventory_item_id === itemId);
      if (sp) {
        setSelectedUnitCost(sp.unit_cost.toString());
      }
    }
  }

  function handleEditInventorySelect(itemId: string) {
    setEditSelectedInventoryId(itemId);
    if (itemId) {
      const sp = getProductsForSupplier(editForm.supplier_id, selectedOrder?.branch_id)
        .find((p) => p.inventory_item_id === itemId);
      if (sp) {
        setEditSelectedUnitCost(sp.unit_cost.toString());
      }
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);

    const poSuffix = addForm.po_number.trim();

    if (!addForm.branch_id) { setAddError("Branch is required"); return; }
    if (!addForm.order_date) { setAddError("Order date is required"); return; }
    if (draftItems.length === 0) { setAddError("At least one item is required"); return; }
    if (poSuffix && !MANUAL_PO_SUFFIX_PATTERN.test(poSuffix)) {
      setAddError("PO number suffix must be numeric and up to 6 digits.");
      return;
    }

    const branchCode = getBranchCode(addForm.branch_id);
    if (poSuffix && !branchCode) { setAddError("Unable to resolve branch code for PO number."); return; }

    const normalizedSuffix = poSuffix ? poSuffix.padStart(6, "0") : "";
    const manualPoNumber = normalizedSuffix ? `PO-${branchCode.toUpperCase()}-${normalizedSuffix}` : "";

    for (let i = 0; i < draftItems.length; i++) {
      const item = draftItems[i];
      if (item.quantity_ordered < 1) { setAddError(`Item #${i + 1}: Quantity must be at least 1`); return; }
      if (item.unit_cost < 0) { setAddError(`Item #${i + 1}: Unit cost must be a non-negative number`); return; }
    }

    try {
      setAddLoading(true);
      await purchaseOrdersApi.create({
        po_number: manualPoNumber || undefined,
        supplier_id: addForm.supplier_id || undefined,
        order_date: addForm.order_date,
        expected_delivery_date: addForm.expected_delivery_date || undefined,
        branch_id: addForm.branch_id,
        notes: addForm.notes.trim() || undefined,
        items: draftItems.map((i) => ({
          inventory_item_id: i.inventory_item_id,
          quantity_ordered: i.quantity_ordered,
          unit_cost: i.unit_cost,
        })),
      });
      setShowAddModal(false);
      showToast.success("Purchase order created successfully");
      fetchData();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to create purchase order");
      showToast.error(err instanceof Error ? err.message : "Failed to create purchase order");
    } finally {
      setAddLoading(false);
    }
  }

  // ─── View ────────────────────────────────────────────────────────────
  function openViewModal(order: PurchaseOrder) {
    setViewOrder(order);
    setShowViewModal(true);
  }

  // ─── Edit (plus-button pattern) ──────────────────────────────────────
  function openEditModal(order: PurchaseOrder) {
    setSelectedOrder(order);
    setEditForm({
      supplier_id: order.supplier_id || "",
      order_date: order.order_date,
      expected_delivery_date: order.expected_delivery_date || "",
      notes: order.notes || "",
    });
    setEditDraftItems(
      (order.purchase_order_items || []).map((item) => ({
        inventory_item_id: item.inventory_item_id,
        item_name: item.inventory_items?.item_name || "Unknown",
        sku_code: item.inventory_items?.sku_code || "",
        quantity_ordered: item.quantity_ordered,
        unit_cost: item.unit_cost,
        line_total: item.quantity_ordered * item.unit_cost,
      }))
    );
    setEditSelectedInventoryId("");
    setEditSelectedQty("1");
    setEditSelectedUnitCost("");
    setEditError(null);
    setShowEditModal(true);
  }

  function handleAddEditDraftItem() {
    if (!editSelectedInventoryId) return;
    const qty = parseInt(editSelectedQty) || 1;
    const cost = parseFloat(editSelectedUnitCost) || 0;

    const sp = getProductsForSupplier(editForm.supplier_id, selectedOrder?.branch_id)
      .find((p) => p.inventory_item_id === editSelectedInventoryId);
    if (!sp) return;

    const itemName = sp.inventory_items?.item_name || sp.product_name;
    const skuCode = sp.inventory_items?.sku_code || "";

    if (editDraftItems.some((d) => d.inventory_item_id === editSelectedInventoryId)) {
      setEditError("This item is already added.");
      return;
    }

    setEditDraftItems([
      ...editDraftItems,
      {
        inventory_item_id: editSelectedInventoryId,
        item_name: itemName,
        sku_code: skuCode,
        quantity_ordered: qty,
        unit_cost: cost,
        line_total: qty * cost,
      },
    ]);
    setEditSelectedInventoryId("");
    setEditSelectedQty("1");
    setEditSelectedUnitCost("");
    setEditError(null);
  }

  function removeEditDraftItem(itemId: string) {
    setEditDraftItems(editDraftItems.filter((d) => d.inventory_item_id !== itemId));
  }

  const editDraftTotal = useMemo(
    () => editDraftItems.reduce((sum, i) => sum + i.line_total, 0),
    [editDraftItems]
  );

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOrder) return;
    setEditError(null);

    if (!editForm.order_date) { setEditError("Order date is required"); return; }
    if (editDraftItems.length === 0) { setEditError("At least one item is required"); return; }

    for (let i = 0; i < editDraftItems.length; i++) {
      const item = editDraftItems[i];
      if (item.quantity_ordered < 1) { setEditError(`Item #${i + 1}: Quantity must be at least 1`); return; }
      if (item.unit_cost < 0) { setEditError(`Item #${i + 1}: Unit cost must be a non-negative number`); return; }
    }

    try {
      setEditLoading(true);
      await purchaseOrdersApi.update(selectedOrder.id, {
        supplier_id: editForm.supplier_id || undefined,
        order_date: editForm.order_date,
        expected_delivery_date: editForm.expected_delivery_date || undefined,
        notes: editForm.notes.trim() || undefined,
        items: editDraftItems.map((i) => ({
          inventory_item_id: i.inventory_item_id,
          quantity_ordered: i.quantity_ordered,
          unit_cost: i.unit_cost,
        })),
      });
      setShowEditModal(false);
      setSelectedOrder(null);
      showToast.success("Purchase order updated successfully");
      fetchData();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update purchase order");
      showToast.error(err instanceof Error ? err.message : "Failed to update purchase order");
    } finally {
      setEditLoading(false);
    }
  }

  // ─── Delete ──────────────────────────────────────────────────────────
  function openDeleteModal(order: PurchaseOrder) {
    setOrderToDelete(order);
    setOrderHasReferences(order.status !== "draft");
    setShowDeleteConfirm(true);
  }

  async function handleDelete() {
    if (!orderToDelete) return;
    try {
      setDeleteLoading(true);
      await purchaseOrdersApi.delete(orderToDelete.id);
      setShowDeleteConfirm(false);
      setOrderToDelete(null);
      showToast.success("Purchase order deleted");
      fetchData();
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : "Failed to delete purchase order");
    } finally {
      setDeleteLoading(false);
    }
  }

  // ─── Submit PO confirmation ──────────────────────────────────────────
  function openSubmitConfirm(order: PurchaseOrder) {
    setOrderToSubmit(order);
    setShowSubmitConfirm(true);
  }

  async function handleConfirmSubmit() {
    if (!orderToSubmit) return;
    try {
      setProcessingSubmit(true);
      await purchaseOrdersApi.submit(orderToSubmit.id);
      showToast.success(`PO ${orderToSubmit.po_number} submitted`);
      setShowSubmitConfirm(false);
      setOrderToSubmit(null);
      fetchData();
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : "Failed to submit PO");
    } finally {
      setProcessingSubmit(false);
    }
  }

  // ─── Cancel PO confirmation ──────────────────────────────────────────
  function openCancelConfirm(order: PurchaseOrder) {
    setOrderToCancel(order);
    setShowCancelConfirm(true);
  }

  async function handleConfirmCancel() {
    if (!orderToCancel) return;
    try {
      setProcessingCancel(true);
      await purchaseOrdersApi.cancel(orderToCancel.id);
      showToast.success(`PO ${orderToCancel.po_number} cancelled`);
      setShowCancelConfirm(false);
      setOrderToCancel(null);
      fetchData();
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : "Failed to cancel PO");
    } finally {
      setProcessingCancel(false);
    }
  }

  // ─── Approve PO confirmation ─────────────────────────────────────────
  function openApproveConfirm(order: PurchaseOrder) {
    setOrderToApprove(order);
    setShowApproveConfirm(true);
  }

  async function handleConfirmApprove() {
    if (!orderToApprove) return;
    try {
      setProcessingApprove(true);
      await purchaseOrdersApi.approve(orderToApprove.id);
      showToast.success(`PO ${orderToApprove.po_number} approved`);
      setShowApproveConfirm(false);
      setOrderToApprove(null);
      fetchData();
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : "Failed to approve PO");
    } finally {
      setProcessingApprove(false);
    }
  }

  // ─── Receive PO ─────────────────────────────────────────────────────
  function openReceiveConfirm(order: PurchaseOrder) {
    setOrderToReceive(order);
    setShowReceiveConfirm(true);
  }

  function openReceiptModal(order: PurchaseOrder) {
    setReceiptOrder(order);
    setShowReceiptModal(true);
  }

  function openReceiptPicker(orderId: string) {
    setReceiptTargetOrderId(orderId);
    if (receiptInputRef.current) {
      receiptInputRef.current.value = "";
      receiptInputRef.current.click();
    }
  }

  async function handleReceiptFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !receiptTargetOrderId) return;

    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      showToast.error("Receipt upload failed");
      return;
    }

    try {
      setUploadingReceipt(true);
      const updated = await purchaseOrdersApi.uploadPurchaseOrderReceipt(receiptTargetOrderId, file);

      if (viewOrder?.id === updated.id) {
        setViewOrder(updated);
      }
      if (orderToReceive?.id === updated.id) {
        setOrderToReceive(updated);
      }
      if (receiptOrder?.id === updated.id) {
        setReceiptOrder(updated);
      }

      showToast.success("Receipt uploaded successfully");
      fetchData();
    } catch {
      showToast.error("Receipt upload failed");
    } finally {
      setUploadingReceipt(false);
      setReceiptTargetOrderId(null);
    }
  }
  async function handleConfirmReceive() {
    if (!orderToReceive || processingReceive) return;
    setProcessingReceive(true);
    try {
      await purchaseOrdersApi.receive(orderToReceive.id);
      showToast.success(`PO ${orderToReceive.po_number} received — stock has been updated`);
      setShowReceiveConfirm(false);
      setOrderToReceive(null);
      fetchData();
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : "Failed to receive PO");
    } finally {
      setProcessingReceive(false);
    }
  }

  // ─── Helpers: count available dropdown actions for a given order ────
  function getDropdownActions(order: PurchaseOrder) {
    const actions: string[] = [];
    if (order.status === "draft") actions.push("submit");
    if (order.status === "submitted" && canApprove) actions.push("approve");
    if (order.status === "approved") actions.push("receive");
    actions.push("receipt");
    if (["draft", "submitted"].includes(order.status)) actions.push("cancel");
    return actions;
  }

  // ─── Loading / Error ─────────────────────────────────────────────────
  if (loading) {
    return <SkeletonLoader showHeader showStats statsCount={3} rows={5} />;
  }

  if (error) {
    return <ErrorAlert message={error} onRetry={fetchData} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Purchase Orders"
        subtitle="Summary of purchase orders"
        buttonLabel="Create Purchase Order"
        onAdd={openAddModal}
        showButton={canCreate}
      />

      {/* Summary Stats Cards */}
      <StatsCards
        cards={[
          { icon: LuClipboardList, iconBg: "bg-primary-100", iconColor: "text-primary", label: "Total", value: stats.total },
          { icon: LuSend, iconBg: "bg-primary-100", iconColor: "text-primary", label: "Submitted", value: stats.submitted },
          { icon: LuPackageCheck, iconBg: "bg-positive-100", iconColor: "text-positive", label: "Received", value: stats.received },
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
              { value: "submitted", label: "Submitted" },
              { value: "approved", label: "Approved" },
              { value: "received", label: "Received" },
              { value: "cancelled", label: "Cancelled" },
              { value: "deactivated", label: "Deactivated" },
            ],
            onChange: (v) => { setFilterStatus(v); setCurrentPage(1); },
          }}
          advancedFilters={[{
            key: "branch",
            label: "Branch",
            value: filterBranch,
            options: [
              { value: "all", label: "All Branches" },
              ...branches.map((b) => ({ value: b.id, label: b.name })),
            ],
            onChange: (v) => { setFilterBranch(v); setCurrentPage(1); },
          }]}
          onApply={fetchData}
          onReset={handleResetFilters}
          onRefresh={fetchData}
          loading={loading}
        />

        {/* Mobile Card View */}
        <MobileCardList
          isEmpty={paginatedItems.length === 0}
          emptyMessage={
            searchQuery || filterStatus !== "all" || filterBranch !== "all"
              ? "No purchase orders match your filters."
              : 'No purchase orders found. Click "Create Purchase Order" to create one.'
          }
        >
            {paginatedItems.map((order) => {
              const dropdownActions = getDropdownActions(order);
              const showDots = dropdownActions.length > 0;
              const canEditThis = canUpdate && ["draft", "submitted"].includes(order.status);
              const canDeleteThis = canDelete && order.status !== "received";
              const hasActions = canEditThis || canDeleteThis || showDots;

              return (
                <MobileCard
                  key={order.id}
                  onClick={() => openViewModal(order)}
                  icon={<LuShoppingCart className="w-5 h-5 text-primary" />}
                  title={order.po_number}
                  subtitle={order.branches?.code}
                  statusBadge={{ label: statusLabel(order.status), className: statusBadge(order.status) }}
                  details={
                    <>
                      <p className="text-neutral-900">{formatPrice(order.total_amount)}</p>
                      {order.supplier_name && <p className="text-neutral-900">{order.supplier_name}</p>}
                      <p className="text-neutral-900">{formatDate(order.created_at)}</p>
                    </>
                  }
                  extraActions={
                    hasActions ? (
                      <>
                        {canEditThis && (
                          <button onClick={(e) => { e.stopPropagation(); openEditModal(order); }} className="flex items-center gap-1 text-sm text-primary hover:text-primary-900"><LuPencil className="w-4 h-4" /> Edit</button>
                        )}
                        {canDeleteThis && (
                          <button onClick={(e) => { e.stopPropagation(); openDeleteModal(order); }} className="flex items-center gap-1 text-sm text-negative hover:text-negative-900"><LuTrash2 className="w-4 h-4" /> Delete</button>
                        )}
                        {showDots && (
                          <div className="relative" ref={openDropdownId === `card-${order.id}` ? dropdownRef : undefined}>
                            <button
                              onClick={(e) => { e.stopPropagation(); setOpenDropdownId(openDropdownId === `card-${order.id}` ? null : `card-${order.id}`); }}
                              className="flex items-center gap-1 text-sm text-neutral-950 hover:text-neutral-900"
                              title="More actions"
                            >
                              <LuEllipsisVertical className="w-4 h-4" /> More
                            </button>
                            {openDropdownId === `card-${order.id}` && (
                              <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg border border-neutral-200 py-2 z-50">
                                {order.status === "draft" && (
                                  <button onClick={(e) => { e.stopPropagation(); closeDropdown(); openSubmitConfirm(order); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors"><LuSend className="w-4 h-4" /> Submit PO</button>
                                )}
                                {order.status === "submitted" && canApprove && (
                                  <button onClick={(e) => { e.stopPropagation(); closeDropdown(); openApproveConfirm(order); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors"><LuBadgeCheck className="w-4 h-4" /> Approve PO</button>
                                )}
                                {order.status === "approved" && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); closeDropdown(); openReceiveConfirm(order); }}
                                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors"
                                  >
                                    <LuPackageCheck className="w-4 h-4" /> Receive &amp; Stock In
                                  </button>
                                )}
                                <button
                                  onClick={(e) => { e.stopPropagation(); closeDropdown(); openReceiptModal(order); }}
                                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors"
                                >
                                  <LuFileText className="w-4 h-4" /> Receipt
                                </button>
                                {["draft", "submitted"].includes(order.status) && (
                                  <button onClick={(e) => { e.stopPropagation(); closeDropdown(); openCancelConfirm(order); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors"><LuBan className="w-4 h-4" /> Cancel PO</button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    ) : undefined
                  }
                />
              );
            })}
        </MobileCardList>

        {/* Desktop Table View */}
        <DesktopTable
          columns={[
            { label: "PO Number" },
            { label: "Supplier" },
            { label: "Total" },
            { label: "Branch" },
            { label: "Status" },
            { label: "Actions", align: "center" },
          ] as DesktopTableColumn[]}
          isEmpty={paginatedItems.length === 0}
          emptyMessage={
            searchQuery || filterStatus !== "all" || filterBranch !== "all"
              ? "No purchase orders match your filters."
              : 'No purchase orders found. Click "Create Purchase Order" to create one.'
          }
        >
              {paginatedItems.map((order) => {
                const dropdownActions = getDropdownActions(order);
                const showDots = dropdownActions.length > 0;

                return (
                  <DesktopTableRow key={order.id} onClick={() => openViewModal(order)}>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-medium text-neutral-900">{order.po_number}</span>
                    </td>
                    <td className="py-3 px-4 text-sm text-neutral-900 whitespace-nowrap">
                      {order.supplier_name || <span className="text-neutral-500 italic">—</span>}
                    </td>
                    <td className="py-3 px-4 text-sm text-neutral-900 whitespace-nowrap font-medium">
                      {formatPrice(order.total_amount)}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-xs font-mono bg-positive-100 text-positive-950 px-2 py-0.5 rounded">
                        {order.branches?.code || order.branch_id.substring(0, 8)}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusBadge(order.status)}`}>
                        {statusLabel(order.status)}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center justify-center gap-2">
                        {canUpdate && ["draft", "submitted"].includes(order.status) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); openEditModal(order); }}
                            className="p-2 text-primary-950 hover:text-primary-900 hover:bg-primary-50 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <LuPencil className="w-4 h-4" />
                          </button>
                        )}
                        {canDelete && order.status !== "received" && (
                          <button
                            onClick={(e) => { e.stopPropagation(); openDeleteModal(order); }}
                            className="p-2 text-negative-950 hover:text-negative-900 hover:bg-negative-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <LuTrash2 className="w-4 h-4" />
                          </button>
                        )}
                        {showDots && (
                          <div className="relative" ref={openDropdownId === `table-${order.id}` ? dropdownRef : undefined}>
                            <button
                              onClick={(e) => { e.stopPropagation(); setOpenDropdownId(openDropdownId === `table-${order.id}` ? null : `table-${order.id}`); }}
                              className="p-2 text-neutral-950 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
                              title="More actions"
                            >
                              <LuEllipsisVertical className="w-4 h-4" />
                            </button>
                            {openDropdownId === `table-${order.id}` && (
                              <div className="absolute right-0 mt-2 w-52 bg-white rounded-lg border border-neutral-200 py-2 z-50">
                                {order.status === "draft" && (
                                  <button onClick={(e) => { e.stopPropagation(); closeDropdown(); openSubmitConfirm(order); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors"><LuSend className="w-4 h-4" /> Submit PO</button>
                                )}
                                {order.status === "submitted" && canApprove && (
                                  <button onClick={(e) => { e.stopPropagation(); closeDropdown(); openApproveConfirm(order); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors"><LuBadgeCheck className="w-4 h-4" /> Approve PO</button>
                                )}
                                {order.status === "approved" && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); closeDropdown(); openReceiveConfirm(order); }}
                                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors"
                                  >
                                    <LuPackageCheck className="w-4 h-4" /> Receive &amp; Stock In
                                  </button>
                                )}
                                <button
                                  onClick={(e) => { e.stopPropagation(); closeDropdown(); openReceiptModal(order); }}
                                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors"
                                >
                                  <LuFileText className="w-4 h-4" /> Receipt
                                </button>
                                {["draft", "submitted"].includes(order.status) && (
                                  <button onClick={(e) => { e.stopPropagation(); closeDropdown(); openCancelConfirm(order); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors"><LuBan className="w-4 h-4" /> Cancel PO</button>
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
          variant="table"
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={filteredCount}
          itemsPerPage={ITEMS_PER_PAGE}
          entityName="orders"
        />
      </div>

      {/* ═══════════════════ ADD MODAL ═══════════════════ */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Create Purchase Order" maxWidth="lg">
        <form onSubmit={handleAdd}>
          <ModalSection title="Purchase Information">
            <ModalInput
              type="number"
              value={addForm.po_number}
              onChange={(v) => setAddForm({ ...addForm, po_number: v.replace(/\D/g, "").slice(0, 6) })}
              placeholder="PO Number Suffix (max 6 digits; auto if blank)"
            />
            <div className="grid grid-cols-2 gap-4">
              <ModalSelect
                value={addForm.branch_id}
                onChange={(v) => setAddForm({ ...addForm, branch_id: v, supplier_id: "" })}
                options={branchOptions}
                placeholder="Select Branch *"
              />
              <ModalSelect
                value={addForm.supplier_id}
                onChange={(v) => {
                  setAddForm({ ...addForm, supplier_id: v });
                  // Clear item selections when supplier changes
                  setDraftItems([]);
                  setSelectedInventoryId("");
                  setSelectedUnitCost("");
                }}
                options={getSupplierOptions(addForm.branch_id)}
                placeholder="Select Supplier *"
                disabled={!addForm.branch_id}
              />
            </div>
            <textarea
              value={addForm.notes}
              onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
              placeholder="Notes (optional)"
              rows={2}
              className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
            />
          </ModalSection>

          <ModalSection title="Order Date and Expected Delivery">
            <div className="grid grid-cols-2 gap-4">
              <ModalInput type="date" value={addForm.order_date} onChange={(v) => setAddForm({ ...addForm, order_date: v })} required />
              <ModalInput type="date" value={addForm.expected_delivery_date} onChange={(v) => setAddForm({ ...addForm, expected_delivery_date: v })} />
            </div>
          </ModalSection>

          <ModalSection title="Order Items">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <ModalSelect
                  value={selectedInventoryId}
                  onChange={handleInventorySelect}
                  placeholder="Select Item"
                  options={getSupplierItemOptions(addForm.supplier_id, addForm.branch_id)}
                  disabled={!addForm.supplier_id}
                />
              </div>
              <div className="w-20">
                <ModalInput
                  type="number"
                  value={selectedQty}
                  onChange={setSelectedQty}
                  placeholder="Qty"
                />
              </div>
              <div className="w-25">
                <ModalInput
                  type="number"
                  value={selectedUnitCost}
                  onChange={setSelectedUnitCost}
                  placeholder="Cost"
                />
              </div>
              <button
                type="button"
                onClick={handleAddDraftItem}
                disabled={!selectedInventoryId}
                className="px-4.5 py-4.5 bg-primary text-white rounded-xl hover:bg-primary-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                <LuPlus className="w-4 h-4" />
              </button>
            </div>

            {/* Draft items list */}
            {draftItems.length > 0 && (
              <div className="mt-3 space-y-4">
                {draftItems.map((item) => (
                  <div
                    key={item.inventory_item_id}
                    className="flex items-center justify-between bg-neutral-100 rounded-xl px-4 py-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-neutral-950 text-sm truncate">
                        {item.item_name}
                        <span className="text-neutral-900 font-normal ml-1">({item.sku_code})</span>
                      </p>
                      <p className="text-xs text-neutral-900">
                        {formatPrice(item.unit_cost)} × {item.quantity_ordered}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 ml-3">
                      <span className="font-semibold text-neutral-950 text-sm whitespace-nowrap">
                        {formatPrice(item.line_total)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeDraftItem(item.inventory_item_id)}
                        className="text-negative hover:text-negative-900 p-1"
                      >
                        <LuX className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}

                {/* Total card */}
                <div className="flex justify-between items-center px-4 py-3 bg-primary-100 rounded-xl">
                  <span className="font-semibold text-neutral-950">Total</span>
                  <span className="font-bold text-primary text-lg">{formatPrice(draftTotal)}</span>
                </div>
              </div>
            )}

            {draftItems.length === 0 && (
              <p className="text-sm text-neutral-900 text-center py-4">
                {!addForm.supplier_id
                  ? "Select a branch and supplier first to see available items."
                  : "No items added yet. Select an item and click +."}
              </p>
            )}
          </ModalSection>

          <ModalError message={addError} />
          <ModalButtons
            onCancel={() => setShowAddModal(false)}
            submitText={addLoading ? "Creating..." : "Create Purchase"}
            loading={addLoading}
          />
        </form>
      </Modal>

      {/* ═══════════════════ VIEW MODAL ═══════════════════ */}
      <Modal isOpen={showViewModal && !!viewOrder} onClose={() => { setShowViewModal(false); setViewOrder(null); }} title="Purchase Order Details" maxWidth="lg">
        {viewOrder && (
          <div>
            <ModalSection title="Purchase Information">
              <ModalInput type="text" value={viewOrder.po_number} onChange={() => { }} placeholder="PO Number" disabled />
              <div className="grid grid-cols-2 gap-4">
                <ModalInput type="text" value={statusLabel(viewOrder.status)} onChange={() => { }} placeholder="Status" disabled />
                <ModalInput type="text" value={formatPrice(viewOrder.total_amount)} onChange={() => { }} placeholder="Total Amount" disabled />
              </div>
            </ModalSection>

            <ModalSection title="Supplier & Branch">
              <ModalInput type="text" value={viewOrder.suppliers?.supplier_name || viewOrder.supplier_name || "—"} onChange={() => { }} placeholder="Supplier" disabled />
              <ModalInput type="text" value={viewOrder.branches ? `${viewOrder.branches.name} (${viewOrder.branches.code})` : "—"} onChange={() => { }} placeholder="Branch" disabled />
            </ModalSection>

            <ModalSection title="Order Date and Expected Delivery">
              <div className="grid grid-cols-2 gap-4">
                <ModalInput type="text" value={formatDate(viewOrder.order_date)} onChange={() => { }} placeholder="Order Date" disabled />
                <ModalInput type="text" value={viewOrder.expected_delivery_date ? formatDate(viewOrder.expected_delivery_date) : "—"} onChange={() => { }} placeholder="Expected Delivery" disabled />
              </div>
              {viewOrder.received_at && (
                <ModalInput type="text" value={formatDate(viewOrder.received_at)} onChange={() => { }} placeholder="Received At" disabled />
              )}
            </ModalSection>

            {/* Items section */}
            <ModalSection title="Order Items">
              {viewOrder.purchase_order_items && viewOrder.purchase_order_items.length > 0 ? (
                <div className="space-y-4">
                  {viewOrder.purchase_order_items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between bg-neutral-100 rounded-xl px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-neutral-950 text-sm truncate">
                          {item.inventory_items?.item_name || "Unknown"}
                          <span className="text-neutral-900 font-normal ml-1">({item.inventory_items?.sku_code || "—"})</span>
                        </p>
                        <p className="text-xs text-neutral-900">
                          {formatPrice(item.unit_cost)} × {item.quantity_ordered}
                          {item.quantity_received > 0 && ` (Received: ${item.quantity_received})`}
                        </p>
                      </div>
                      <span className="font-semibold text-neutral-950 text-sm whitespace-nowrap ml-3">
                        {formatPrice(item.quantity_ordered * item.unit_cost)}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center px-4 py-3 bg-primary-100 rounded-xl">
                    <span className="font-semibold text-neutral-950">Total</span>
                    <span className="font-bold text-primary text-lg">{formatPrice(viewOrder.total_amount)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-neutral-900 text-center py-3">No items.</p>
              )}
            </ModalSection>

            {viewOrder.notes && (
              <ModalSection title="Notes">
                <textarea value={viewOrder.notes} readOnly disabled rows={3}
                  className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 focus:outline-none transition-all resize-none cursor-default" />
              </ModalSection>
            )}

            <ModalSection title="Timestamps">
              <div className="grid grid-cols-2 gap-4">
                <ModalInput type="text" value={formatDateTime(viewOrder.created_at)} onChange={() => { }} placeholder="Created" disabled />
                <ModalInput type="text" value={formatDateTime(viewOrder.updated_at)} onChange={() => { }} placeholder="Updated" disabled />
              </div>
            </ModalSection>
          </div>
        )}
      </Modal>

      {/* ═══════════════════ EDIT MODAL ═══════════════════ */}
      <Modal isOpen={showEditModal && !!selectedOrder} onClose={() => setShowEditModal(false)} title="Edit Purchase Order" maxWidth="lg">
        {selectedOrder && (
          <form onSubmit={handleEdit}>
            <ModalSection title="Purchase Order Details">
              <ModalInput type="text" value={selectedOrder.po_number} onChange={() => { }} placeholder="PO Number" disabled />
              <div className="grid grid-cols-2 gap-4">
                <ModalSelect
                  value={editForm.supplier_id}
                  onChange={(v) => {
                    setEditForm({ ...editForm, supplier_id: v });
                    // Clear item selections when supplier changes
                    setEditDraftItems([]);
                    setEditSelectedInventoryId("");
                    setEditSelectedUnitCost("");
                  }}
                  options={getSupplierOptions(selectedOrder.branch_id)}
                  placeholder="Select Supplier"
                />
                <ModalInput type="text" value={selectedOrder.branches?.name || "—"} onChange={() => { }} placeholder="Branch" disabled />
              </div>
              <textarea
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                placeholder="Notes (optional)"
                rows={2}
                className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
              />
            </ModalSection>

            <ModalSection title="Order Date and Expected Delivery">
              <div className="grid grid-cols-2 gap-4">
                <ModalInput type="date" value={editForm.order_date} onChange={(v) => setEditForm({ ...editForm, order_date: v })} required />
                <ModalInput type="date" value={editForm.expected_delivery_date} onChange={(v) => setEditForm({ ...editForm, expected_delivery_date: v })} />
              </div>
            </ModalSection>

            <ModalSection title="Order Items">
              {/* Add item row */}
              <div className="flex gap-2 items-end mt-2">
                <div className="flex-1">
                  <ModalSelect
                    value={editSelectedInventoryId}
                    onChange={handleEditInventorySelect}
                    placeholder="Select Item"
                    options={getSupplierItemOptions(editForm.supplier_id, selectedOrder.branch_id)}
                    disabled={!editForm.supplier_id}
                  />
                </div>
                <div className="w-20">
                  <ModalInput
                    type="number"
                    value={editSelectedQty}
                    onChange={setEditSelectedQty}
                    placeholder="Qty"
                  />
                </div>
                <div className="w-25">
                  <ModalInput
                    type="number"
                    value={editSelectedUnitCost}
                    onChange={setEditSelectedUnitCost}
                    placeholder="Cost"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddEditDraftItem}
                  disabled={!editSelectedInventoryId}
                  className="px-4.5 py-4.5 bg-primary text-white rounded-xl hover:bg-primary-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                >
                  <LuPlus className="w-4 h-4" />
                </button>
              </div>

              {/* Existing items */}
              {editDraftItems.map((item) => (
                <div
                  key={item.inventory_item_id}
                  className="flex items-center justify-between bg-neutral-100 rounded-xl px-4 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-neutral-950 text-sm truncate">
                      {item.item_name}
                      <span className="text-neutral-900 font-normal ml-1">({item.sku_code})</span>
                    </p>
                    <p className="text-xs text-neutral-900">
                      {formatPrice(item.unit_cost)} × {item.quantity_ordered}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-3">
                    <span className="font-semibold text-neutral-950 text-sm whitespace-nowrap">
                      {formatPrice(item.line_total)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeEditDraftItem(item.inventory_item_id)}
                      className="text-negative hover:text-negative-900 p-1"
                      title="Remove item"
                    >
                      <LuX className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}

              {/* Total */}
              {editDraftItems.length > 0 && (
                <div className="flex justify-between items-center px-4 py-3 bg-primary-100 rounded-xl mt-3">
                  <span className="font-semibold text-neutral-950">Total</span>
                  <span className="font-bold text-primary text-lg">{formatPrice(editDraftTotal)}</span>
                </div>
              )}

              {editDraftItems.length === 0 && (
                <p className="text-sm text-neutral-900 text-center py-4">
                  {!editForm.supplier_id
                    ? "Select a supplier first to see available items."
                    : "No items. Select an item and click + to add."}
                </p>
              )}
            </ModalSection>

            <ModalError message={editError} />
            <ModalButtons
              onCancel={() => setShowEditModal(false)}
              submitText={editLoading ? "Saving..." : "Save Changes"}
              loading={editLoading}
            />
          </form>
        )}
      </Modal>

      {/* ═══════════════════ DELETE / DEACTIVATE CONFIRM MODAL ═══════════════════ */}
      <Modal isOpen={showDeleteConfirm && !!orderToDelete} onClose={() => setShowDeleteConfirm(false)} title={orderHasReferences ? "Deactivate Purchase Order" : "Delete Purchase Order"} maxWidth="sm">
        {orderToDelete && (
          <div>
            <div className="bg-neutral-100 rounded-xl p-4 my-4">
              <p className="text-neutral-900">
                {orderHasReferences
                  ? <>Are you sure you want to deactivate <strong className="text-neutral-950">{orderToDelete.po_number}</strong>?</>
                  : <>Are you sure you want to delete <strong className="text-neutral-950">{orderToDelete.po_number}</strong>?</>
                }
              </p>
            </div>
            <p className="text-sm text-neutral-900 mb-2">
              {orderHasReferences
                ? "This purchase order has progressed beyond draft and will be set to deactivated instead of deleted."
                : "This action cannot be undone. The purchase order and all its items will be permanently removed."
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
                onClick={handleDelete}
                disabled={deleteLoading}
                className="flex-1 px-4 py-3.5 bg-negative text-white rounded-xl font-semibold hover:bg-negative-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {deleteLoading
                  ? (orderHasReferences ? "Deactivating..." : "Deleting...")
                  : (orderHasReferences ? "Deactivate" : "Delete")
                }
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ═══════════════════ SUBMIT PO CONFIRM MODAL ═══════════════════ */}
      <Modal isOpen={showSubmitConfirm && !!orderToSubmit} onClose={() => setShowSubmitConfirm(false)} title="Submit Purchase Order" maxWidth="sm">
        {orderToSubmit && (
          <div>
            <div className="bg-neutral-100 rounded-xl p-4 my-4">
              <p className="text-neutral-900">
                Submit purchase order{" "}
                <strong className="text-neutral-950">{orderToSubmit.po_number}</strong> for processing?
              </p>
            </div>
            <p className="text-sm text-neutral-900 mb-2">
              This will change the status from Draft to Submitted. The PO will be available for approval.
            </p>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowSubmitConfirm(false)}
                className="flex-1 px-4 py-3.5 border-2 border-primary text-primary rounded-xl font-semibold hover:bg-primary-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSubmit}
                disabled={processingSubmit}
                className="flex-1 px-4 py-3.5 bg-primary text-white rounded-xl font-semibold hover:bg-primary-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {processingSubmit ? "Submitting..." : "Submit PO"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ═══════════════════ APPROVE PO CONFIRM MODAL ═══════════════════ */}
      <Modal isOpen={showApproveConfirm && !!orderToApprove} onClose={() => setShowApproveConfirm(false)} title="Approve Purchase Order" maxWidth="sm">
        {orderToApprove && (
          <div>
            <div className="bg-neutral-100 rounded-xl p-4 my-4">
              <p className="text-neutral-900">
                Approve purchase order{" "}
                <strong className="text-neutral-950">{orderToApprove.po_number}</strong>?
              </p>
            </div>
            <p className="text-sm text-neutral-900 mb-2">
              This will change the status from Submitted to Approved. The PO will be locked from editing and available for receiving.
            </p>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowApproveConfirm(false)}
                className="flex-1 px-4 py-3.5 border-2 border-primary text-primary rounded-xl font-semibold hover:bg-primary-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmApprove}
                disabled={processingApprove}
                className="flex-1 px-4 py-3.5 bg-primary text-white rounded-xl font-semibold hover:bg-primary-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {processingApprove ? "Approving..." : "Approve PO"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ═══════════════════ CANCEL PO CONFIRM MODAL ═══════════════════ */}
      <Modal isOpen={showCancelConfirm && !!orderToCancel} onClose={() => setShowCancelConfirm(false)} title="Cancel Purchase Order" maxWidth="sm">
        {orderToCancel && (
          <div>
            <div className="bg-neutral-100 rounded-xl p-4 my-4">
              <p className="text-neutral-900">
                Are you sure you want to cancel{" "}
                <strong className="text-neutral-950">{orderToCancel.po_number}</strong>?
              </p>
            </div>
            <p className="text-sm text-neutral-900 mb-2">
              This will change the purchase order status to cancelled. This action cannot be undone.
            </p>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowCancelConfirm(false)}
                className="flex-1 px-4 py-3.5 border-2 border-negative text-negative rounded-xl font-semibold hover:bg-negative-200 transition-colors"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={processingCancel}
                className="flex-1 px-4 py-3.5 bg-negative text-white rounded-xl font-semibold hover:bg-negative-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {processingCancel ? "Cancelling..." : "Cancel PO"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ═══════════════════ RECEIPT MODAL ═══════════════════ */}
      <Modal isOpen={showReceiptModal && !!receiptOrder} onClose={() => { setShowReceiptModal(false); setReceiptOrder(null); }} title="Receipt" maxWidth="lg">
        {receiptOrder && (() => {
          const receiptUrl = receiptOrder.receipt_attachment || "";
          const isPdf = /\.pdf($|\?)/i.test(receiptUrl);

          return (
            <div>
              <ModalSection title="Basic Information">
                <ModalInput
                  type="text"
                  value={receiptOrder.po_number}
                  onChange={() => {}}
                  placeholder="PO Number"
                  disabled
                />
                <ModalInput
                  type="text"
                  value={statusLabel(receiptOrder.status)}
                  onChange={() => {}}
                  placeholder="Status"
                  disabled
                />
              </ModalSection>

              {receiptOrder.receipt_attachment && (
                <ModalSection title="Receipt Preview">
                  <div className="space-y-4">
                    <div className="bg-neutral-100 rounded-xl p-3">
                      {isPdf ? (
                        <iframe
                          src={receiptUrl}
                          title="Receipt Preview"
                          className="w-full h-[520px] rounded-lg border border-neutral-200"
                        />
                      ) : (
                        <img
                          src={receiptUrl}
                          alt="Receipt Preview"
                          className="w-full max-h-[520px] object-contain rounded-lg border border-neutral-200 bg-white"
                        />
                      )}
                    </div>
                  </div>
                </ModalSection>
              )}

              <ModalSection title="Actions">
                <div className="flex flex-wrap gap-2">
                  {!receiptOrder.receipt_attachment ? (
                    <button
                      type="button"
                      onClick={() => openReceiptPicker(receiptOrder.id)}
                      disabled={uploadingReceipt || !canModifyReceipt(receiptOrder)}
                      className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                        uploadingReceipt || !canModifyReceipt(receiptOrder)
                          ? "bg-primary text-white opacity-50 cursor-not-allowed"
                          : "bg-primary text-white"
                      }`}
                    >
                      {uploadingReceipt && receiptTargetOrderId === receiptOrder.id ? "Uploading..." : "Upload Receipt"}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          window.open(receiptOrder.receipt_attachment!, "_blank", "noopener,noreferrer");
                        }}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all bg-neutral-100 text-neutral hover:bg-neutral-200"
                      >
                        Download Receipt
                      </button>

                      <button
                        type="button"
                        onClick={() => openReceiptPicker(receiptOrder.id)}
                        disabled={uploadingReceipt}
                        className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                          uploadingReceipt
                            ? "bg-primary text-white opacity-50 cursor-not-allowed"
                            : "bg-primary text-white"
                        }`}
                      >
                        {uploadingReceipt && receiptTargetOrderId === receiptOrder.id ? "Replacing..." : "Replace Receipt"}
                      </button>
                    </>
                  )}
                </div>
                {!canModifyReceipt(receiptOrder) && !receiptOrder.receipt_attachment && (
                  <p className="text-sm text-neutral-900 mt-2">Receipt can only be uploaded when PO is approved or received.</p>
                )}
              </ModalSection>
            </div>
          );
        })()}
      </Modal>

      {/* ═══════════════════ RECEIVE PO CONFIRM MODAL ═══════════════════ */}
      <Modal isOpen={showReceiveConfirm && !!orderToReceive} onClose={() => setShowReceiveConfirm(false)} title="Receive Purchase Order" maxWidth="sm">
        {orderToReceive && (
          <div>
            <div className="bg-neutral-100 rounded-xl p-4 my-4">
              <p className="text-neutral-900">
                Receive purchase order{" "}
                <strong className="text-neutral-950">{orderToReceive.po_number}</strong> and stock in all items?
              </p>
            </div>
            <p className="text-sm text-neutral-900 mb-2">
              This will mark the PO as received, create stock-in movements for every line item, and update on-hand quantities. <strong>This action is irreversible.</strong>
            </p>
            {!orderToReceive.receipt_attachment && (
              <p className="text-sm text-negative mb-2">Upload receipt before receiving purchase order.</p>
            )}
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowReceiveConfirm(false)}
                className="flex-1 px-4 py-3.5 border-2 border-primary text-primary rounded-xl font-semibold hover:bg-primary-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReceive}
                disabled={processingReceive || !orderToReceive.receipt_attachment}
                className="flex-1 px-4 py-3.5 bg-primary text-white rounded-xl font-semibold hover:bg-primary-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {processingReceive ? "Receiving..." : "Receive"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <input
        ref={receiptInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/jpg,image/png,application/pdf"
        className="hidden"
        onChange={handleReceiptFileChange}
      />
    </div>
  );
}
