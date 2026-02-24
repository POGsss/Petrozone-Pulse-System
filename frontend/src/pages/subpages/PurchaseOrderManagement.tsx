import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  LuPlus,
  LuCircleAlert,
  LuRefreshCw,
  LuSearch,
  LuPencil,
  LuTrash2,
  LuChevronLeft,
  LuChevronRight,
  LuFilter,
  LuEllipsisVertical,
  LuShoppingCart,
  LuSend,
  LuPackageCheck,
  LuCircleX,
  LuEye,
  LuClipboardList,
} from "react-icons/lu";
import { purchaseOrdersApi, branchesApi, inventoryApi } from "../../lib/api";
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
import type { PurchaseOrder, PurchaseOrderItem, Branch, InventoryItem } from "../../types";

const ITEMS_PER_PAGE = 10;

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

function statusBadge(status: string) {
  switch (status) {
    case "draft":
      return "bg-neutral-200 text-neutral-900";
    case "submitted":
      return "bg-primary-100 text-primary-950";
    case "received":
      return "bg-positive-100 text-positive-950";
    case "cancelled":
      return "bg-negative-100 text-negative-950";
    default:
      return "bg-neutral-200 text-neutral-900";
  }
}

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

// Item row type for the add/edit form
interface POItemRow {
  inventory_item_id: string;
  quantity_ordered: string;
  unit_cost: string;
}

export function PurchaseOrderManagement() {
  const { user } = useAuth();
  const userRoles = user?.roles || [];
  const isHM = userRoles.includes("HM");

  // RBAC: HM, POC, JS, R
  const canCreate = userRoles.some((r) => ["HM", "POC", "JS", "R"].includes(r));
  const canUpdate = canCreate;
  const canDelete = canCreate;

  // Data state
  const [allOrders, setAllOrders] = useState<PurchaseOrder[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search, filters & pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterBranch, setFilterBranch] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addForm, setAddForm] = useState({
    po_number: "",
    supplier_name: "",
    order_date: new Date().toISOString().split("T")[0],
    expected_delivery_date: "",
    branch_id: "",
    notes: "",
  });
  const [addItems, setAddItems] = useState<POItemRow[]>([
    { inventory_item_id: "", quantity_ordered: "", unit_cost: "" },
  ]);
  const [addError, setAddError] = useState<string | null>(null);

  // View modal
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewOrder, setViewOrder] = useState<PurchaseOrder | null>(null);

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [editForm, setEditForm] = useState({
    supplier_name: "",
    order_date: "",
    expected_delivery_date: "",
    notes: "",
  });
  const [editItems, setEditItems] = useState<POItemRow[]>([]);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete modal
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<PurchaseOrder | null>(null);

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
    const draft = allOrders.filter((o) => o.status === "draft").length;
    const submitted = allOrders.filter((o) => o.status === "submitted").length;
    const received = allOrders.filter((o) => o.status === "received").length;
    return { total: allOrders.length, draft, submitted, received };
  }, [allOrders]);

  // Filtered + paginated
  const { filteredItems, paginatedItems, totalPages } = useMemo(() => {
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
    const total = Math.ceil(filtered.length / ITEMS_PER_PAGE);
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginated = filtered.slice(start, start + ITEMS_PER_PAGE);
    return { filteredItems: filtered, paginatedItems: paginated, totalPages: total };
  }, [allOrders, searchQuery, filterStatus, filterBranch, currentPage]);

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { setCurrentPage(1); }, [searchQuery, filterStatus, filterBranch]);

  function handleResetFilters() {
    setFilterStatus("all");
    setFilterBranch("all");
    setSearchQuery("");
    setCurrentPage(1);
  }

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);
      const [poRes, branchesData, invRes] = await Promise.all([
        purchaseOrdersApi.getAll({ limit: 1000 }),
        branchesApi.getAll(),
        inventoryApi.getAll({ limit: 1000, status: "active" }),
      ]);
      setAllOrders(poRes.data);
      setBranches(branchesData);
      setInventoryItems(invRes.data);
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

  // Inventory items filtered by selected branch for add/edit
  function getInventoryForBranch(branchId: string) {
    if (!branchId) return inventoryItems;
    return inventoryItems.filter((i) => i.branch_id === branchId);
  }

  // ─── Add ─────────────────────────────────────────────────────────────
  function openAddModal() {
    setAddForm({
      po_number: "",
      supplier_name: "",
      order_date: new Date().toISOString().split("T")[0],
      expected_delivery_date: "",
      branch_id: defaultBranchId,
      notes: "",
    });
    setAddItems([{ inventory_item_id: "", quantity_ordered: "", unit_cost: "" }]);
    setAddError(null);
    setShowAddModal(true);
  }

  function addItemRow() {
    setAddItems([...addItems, { inventory_item_id: "", quantity_ordered: "", unit_cost: "" }]);
  }

  function removeAddItemRow(idx: number) {
    if (addItems.length <= 1) return;
    setAddItems(addItems.filter((_, i) => i !== idx));
  }

  function updateAddItem(idx: number, field: keyof POItemRow, val: string) {
    const updated = [...addItems];
    updated[idx] = { ...updated[idx], [field]: val };
    // If inventory item selected and unit_cost is empty, prefill with item cost_price
    if (field === "inventory_item_id" && val) {
      const invItem = inventoryItems.find((i) => i.id === val);
      if (invItem && !updated[idx].unit_cost) {
        updated[idx].unit_cost = invItem.cost_price.toString();
      }
    }
    setAddItems(updated);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);

    if (!addForm.branch_id) { setAddError("Branch is required"); return; }
    if (!addForm.order_date) { setAddError("Order date is required"); return; }

    // Validate items
    for (let i = 0; i < addItems.length; i++) {
      const item = addItems[i];
      if (!item.inventory_item_id) { setAddError(`Item #${i + 1}: Select an inventory item`); return; }
      if (!item.quantity_ordered || parseInt(item.quantity_ordered) < 1) {
        setAddError(`Item #${i + 1}: Quantity must be at least 1`); return;
      }
      if (item.unit_cost === "" || parseFloat(item.unit_cost) < 0) {
        setAddError(`Item #${i + 1}: Unit cost must be a non-negative number`); return;
      }
    }

    try {
      setAddLoading(true);
      await purchaseOrdersApi.create({
        po_number: addForm.po_number.trim() || undefined,
        supplier_name: addForm.supplier_name.trim() || undefined,
        order_date: addForm.order_date,
        expected_delivery_date: addForm.expected_delivery_date || undefined,
        branch_id: addForm.branch_id,
        notes: addForm.notes.trim() || undefined,
        items: addItems.map((i) => ({
          inventory_item_id: i.inventory_item_id,
          quantity_ordered: parseInt(i.quantity_ordered),
          unit_cost: parseFloat(i.unit_cost),
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

  // ─── Edit ────────────────────────────────────────────────────────────
  function openEditModal(order: PurchaseOrder) {
    setSelectedOrder(order);
    setEditForm({
      supplier_name: order.supplier_name || "",
      order_date: order.order_date,
      expected_delivery_date: order.expected_delivery_date || "",
      notes: order.notes || "",
    });
    setEditItems(
      (order.purchase_order_items || []).map((item) => ({
        inventory_item_id: item.inventory_item_id,
        quantity_ordered: item.quantity_ordered.toString(),
        unit_cost: item.unit_cost.toString(),
      }))
    );
    if (editItems.length === 0) {
      setEditItems([{ inventory_item_id: "", quantity_ordered: "", unit_cost: "" }]);
    }
    setEditError(null);
    setShowEditModal(true);
  }

  function addEditItemRow() {
    setEditItems([...editItems, { inventory_item_id: "", quantity_ordered: "", unit_cost: "" }]);
  }

  function removeEditItemRow(idx: number) {
    if (editItems.length <= 1) return;
    setEditItems(editItems.filter((_, i) => i !== idx));
  }

  function updateEditItem(idx: number, field: keyof POItemRow, val: string) {
    const updated = [...editItems];
    updated[idx] = { ...updated[idx], [field]: val };
    if (field === "inventory_item_id" && val) {
      const invItem = inventoryItems.find((i) => i.id === val);
      if (invItem && !updated[idx].unit_cost) {
        updated[idx].unit_cost = invItem.cost_price.toString();
      }
    }
    setEditItems(updated);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOrder) return;
    setEditError(null);

    if (!editForm.order_date) { setEditError("Order date is required"); return; }

    for (let i = 0; i < editItems.length; i++) {
      const item = editItems[i];
      if (!item.inventory_item_id) { setEditError(`Item #${i + 1}: Select an inventory item`); return; }
      if (!item.quantity_ordered || parseInt(item.quantity_ordered) < 1) {
        setEditError(`Item #${i + 1}: Quantity must be at least 1`); return;
      }
      if (item.unit_cost === "" || parseFloat(item.unit_cost) < 0) {
        setEditError(`Item #${i + 1}: Unit cost must be a non-negative number`); return;
      }
    }

    try {
      setEditLoading(true);
      await purchaseOrdersApi.update(selectedOrder.id, {
        supplier_name: editForm.supplier_name.trim() || undefined,
        order_date: editForm.order_date,
        expected_delivery_date: editForm.expected_delivery_date || undefined,
        notes: editForm.notes.trim() || undefined,
        items: editItems.map((i) => ({
          inventory_item_id: i.inventory_item_id,
          quantity_ordered: parseInt(i.quantity_ordered),
          unit_cost: parseFloat(i.unit_cost),
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

  // ─── Status transitions ─────────────────────────────────────────────
  async function handleSubmitPO(order: PurchaseOrder) {
    try {
      await purchaseOrdersApi.submit(order.id);
      showToast.success(`PO ${order.po_number} submitted`);
      fetchData();
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : "Failed to submit PO");
    }
  }

  async function handleReceivePO(order: PurchaseOrder) {
    try {
      await purchaseOrdersApi.receive(order.id);
      showToast.success(`PO ${order.po_number} received — stock has been updated`);
      fetchData();
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : "Failed to receive PO");
    }
  }

  async function handleCancelPO(order: PurchaseOrder) {
    try {
      await purchaseOrdersApi.cancel(order.id);
      showToast.success(`PO ${order.po_number} cancelled`);
      fetchData();
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : "Failed to cancel PO");
    }
  }

  // Compute line total for display
  function lineTotal(item: POItemRow): number {
    const qty = parseInt(item.quantity_ordered) || 0;
    const cost = parseFloat(item.unit_cost) || 0;
    return qty * cost;
  }

  function computeTotal(items: POItemRow[]): number {
    return items.reduce((sum, i) => sum + lineTotal(i), 0);
  }

  // ─── Render helpers ──────────────────────────────────────────────────
  function renderItemsTable(items: PurchaseOrderItem[]) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50">
              <th className="text-left py-2 px-3 text-xs font-medium text-neutral-900">Item</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-neutral-900">SKU</th>
              <th className="text-center py-2 px-3 text-xs font-medium text-neutral-900">Qty Ordered</th>
              <th className="text-center py-2 px-3 text-xs font-medium text-neutral-900">Qty Received</th>
              <th className="text-right py-2 px-3 text-xs font-medium text-neutral-900">Unit Cost</th>
              <th className="text-right py-2 px-3 text-xs font-medium text-neutral-900">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-neutral-100">
                <td className="py-2 px-3 text-neutral-950">{item.inventory_items?.item_name || "—"}</td>
                <td className="py-2 px-3 font-mono text-neutral-900">{item.inventory_items?.sku_code || "—"}</td>
                <td className="py-2 px-3 text-center text-neutral-900">{item.quantity_ordered}</td>
                <td className="py-2 px-3 text-center text-neutral-900">{item.quantity_received}</td>
                <td className="py-2 px-3 text-right text-neutral-900">{formatPrice(item.unit_cost)}</td>
                <td className="py-2 px-3 text-right font-medium text-neutral-950">
                  {formatPrice(item.quantity_ordered * item.unit_cost)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // ─── Loading / Error ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LuRefreshCw className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-negative-200 border border-negative rounded-lg p-4 flex items-center gap-3">
        <LuCircleAlert className="w-5 h-5 text-negative-950 flex-shrink-0" />
        <div>
          <p className="text-sm text-negative-950">{error}</p>
          <button onClick={fetchData} className="text-sm text-negative-900 hover:underline mt-1">Try again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between bg-white rounded-xl p-4 border border-neutral-200">
        <div>
          <h3 className="text-lg font-semibold text-neutral-950">Purchase Orders</h3>
          <p className="text-sm text-neutral-900">Manage inventory procurement</p>
        </div>
        {canCreate && (
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-950 transition-colors"
          >
            <LuPlus className="w-4 h-4" />
            New Purchase Order
          </button>
        )}
      </div>

      {/* Summary Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 rounded-lg">
              <LuClipboardList className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-neutral-900">Total</p>
              <p className="text-2xl font-bold text-neutral-950">{stats.total}</p>
            </div>
          </div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-neutral-100 rounded-lg">
              <LuPencil className="w-5 h-5 text-neutral-600" />
            </div>
            <div>
              <p className="text-sm text-neutral-900">Draft</p>
              <p className="text-2xl font-bold text-neutral-950">{stats.draft}</p>
            </div>
          </div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 rounded-lg">
              <LuSend className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-neutral-900">Submitted</p>
              <p className="text-2xl font-bold text-neutral-950">{stats.submitted}</p>
            </div>
          </div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-positive-100 rounded-lg">
              <LuPackageCheck className="w-5 h-5 text-positive" />
            </div>
            <div>
              <p className="text-sm text-neutral-900">Received</p>
              <p className="text-2xl font-bold text-neutral-950">{stats.received}</p>
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
                placeholder="Search PO number or supplier..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:border-primary w-full sm:w-72"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={filterStatus}
                onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }}
                className="appearance-none px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              >
                <option value="all">All Status</option>
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
                <option value="received">Received</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${showFilters ? "border-primary bg-primary-100 text-primary" : "border-neutral-200 text-neutral-950 hover:bg-neutral-100"}`}
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
                <label className="block text-xs text-neutral-900 mb-1">Branch</label>
                <select
                  value={filterBranch}
                  onChange={(e) => { setFilterBranch(e.target.value); setCurrentPage(1); }}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="all">All Branches</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end gap-2">
                <button onClick={fetchData} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-950 transition-colors">Apply</button>
                <button onClick={handleResetFilters} className="px-4 py-2 border border-neutral-200 rounded-lg text-sm font-medium text-neutral-950 hover:bg-neutral-100 transition-colors">Reset</button>
              </div>
            </div>
          )}
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden p-4">
          <div className="grid grid-cols-1 gap-4">
            {paginatedItems.map((order) => (
              <div
                key={order.id}
                onClick={() => openViewModal(order)}
                className="bg-white rounded-xl border border-neutral-200 p-4 cursor-pointer hover:bg-neutral-50 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary-100 rounded-lg">
                      <LuShoppingCart className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-neutral-950">{order.po_number}</h4>
                      {order.branches && (
                        <span className="text-xs font-mono bg-neutral-100 text-primary px-2 py-0.5 rounded">
                          {order.branches.code}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${statusBadge(order.status)}`}>
                    {statusLabel(order.status)}
                  </span>
                </div>

                <div className="space-y-1 text-sm text-neutral-900 mb-3">
                  {order.supplier_name && <p>{order.supplier_name}</p>}
                  <p className="font-semibold text-neutral-950">{formatPrice(order.total_amount)}</p>
                </div>

                <div className="flex items-center justify-end gap-4 pt-3 border-t border-neutral-200">
                  {canUpdate && ["draft", "submitted"].includes(order.status) && (
                    <button onClick={(e) => { e.stopPropagation(); openEditModal(order); }} className="flex items-center gap-1 text-sm text-primary hover:text-primary-900"><LuPencil className="w-4 h-4" /> Edit</button>
                  )}
                  {canDelete && order.status !== "received" && (
                    <button onClick={(e) => { e.stopPropagation(); openDeleteModal(order); }} className="flex items-center gap-1 text-sm text-negative hover:text-negative-900"><LuTrash2 className="w-4 h-4" /> Delete</button>
                  )}
                  <div className="relative" ref={openDropdownId === `card-${order.id}` ? dropdownRef : undefined}>
                    <button
                      onClick={(e) => { e.stopPropagation(); setOpenDropdownId(openDropdownId === `card-${order.id}` ? null : `card-${order.id}`); }}
                      className="flex items-center gap-1 text-sm text-neutral-950 hover:text-neutral-900"
                    >
                      <LuEllipsisVertical className="w-4 h-4" /> More
                    </button>
                    {openDropdownId === `card-${order.id}` && (
                      <div className="absolute right-0 mt-2 w-52 bg-white rounded-lg border border-neutral-200 py-2 z-50">
                        {order.status === "draft" && (
                          <button onClick={(e) => { e.stopPropagation(); closeDropdown(); handleSubmitPO(order); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors"><LuSend className="w-4 h-4" /> Submit</button>
                        )}
                        {order.status === "submitted" && (
                          <button onClick={(e) => { e.stopPropagation(); closeDropdown(); handleReceivePO(order); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-positive hover:bg-neutral-100 transition-colors"><LuPackageCheck className="w-4 h-4" /> Receive &amp; Stock In</button>
                        )}
                        {["draft", "submitted"].includes(order.status) && (
                          <button onClick={(e) => { e.stopPropagation(); closeDropdown(); handleCancelPO(order); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-negative hover:bg-neutral-100 transition-colors"><LuCircleX className="w-4 h-4" /> Cancel</button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {paginatedItems.length === 0 && (
              <div className="text-center py-12 text-neutral-900">
                {searchQuery || filterStatus !== "all" || filterBranch !== "all"
                  ? "No purchase orders match your filters."
                  : 'No purchase orders found. Click "New Purchase Order" to create one.'}
              </div>
            )}
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-100">
                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950 whitespace-nowrap">PO Number</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950 whitespace-nowrap">Supplier</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-neutral-950 whitespace-nowrap">Total</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950 whitespace-nowrap">Branch</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950 whitespace-nowrap">Status</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-neutral-950 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((order) => (
                <tr key={order.id} onClick={() => openViewModal(order)} className="border-b border-neutral-200 hover:bg-neutral-100 transition-colors cursor-pointer">
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className="font-medium text-neutral-900">{order.po_number}</span>
                  </td>
                  <td className="py-3 px-4 text-sm text-neutral-900 whitespace-nowrap">
                    {order.supplier_name || <span className="text-neutral-500 italic">—</span>}
                  </td>
                  <td className="py-3 px-4 text-sm text-right text-neutral-900 whitespace-nowrap font-medium">
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
                      <button
                        onClick={(e) => { e.stopPropagation(); openViewModal(order); }}
                        className="p-2 text-neutral-950 hover:text-primary hover:bg-primary-50 rounded-lg transition-colors"
                        title="View"
                      >
                        <LuEye className="w-4 h-4" />
                      </button>
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
                              <button onClick={(e) => { e.stopPropagation(); closeDropdown(); handleSubmitPO(order); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors"><LuSend className="w-4 h-4" /> Submit PO</button>
                            )}
                            {order.status === "submitted" && (
                              <button onClick={(e) => { e.stopPropagation(); closeDropdown(); handleReceivePO(order); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-positive hover:bg-neutral-100 transition-colors"><LuPackageCheck className="w-4 h-4" /> Receive &amp; Stock In</button>
                            )}
                            {["draft", "submitted"].includes(order.status) && (
                              <button onClick={(e) => { e.stopPropagation(); closeDropdown(); handleCancelPO(order); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-negative hover:bg-neutral-100 transition-colors"><LuCircleX className="w-4 h-4" /> Cancel PO</button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {paginatedItems.length === 0 && (
            <div className="text-center py-12 text-neutral-900">
              {searchQuery || filterStatus !== "all" || filterBranch !== "all"
                ? "No purchase orders match your filters."
                : "No purchase orders found. Click \"New Purchase Order\" to create one."}
            </div>
          )}
        </div>

        {/* Pagination */}
        {filteredItems.length > ITEMS_PER_PAGE && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4">
            <p className="text-sm text-neutral-900">
              {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredItems.length)} of {filteredItems.length} orders
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-2 border border-neutral-200 rounded-lg text-sm text-neutral-950 hover:bg-neutral-100 disabled:opacity-50"><LuChevronLeft className="w-4 h-4" /></button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).slice(Math.max(0, currentPage - 3), currentPage + 2).map((page) => (
                <button key={page} onClick={() => setCurrentPage(page)} className={`px-3 py-1 border rounded-lg text-sm font-medium ${page === currentPage ? "bg-primary text-white border-primary" : "border-neutral-200 text-neutral-950 hover:bg-neutral-100"}`}>{page}</button>
              ))}
              <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-2 border border-neutral-200 rounded-lg text-sm text-neutral-950 hover:bg-neutral-100 disabled:opacity-50"><LuChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════ ADD MODAL ═══════════════════ */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="New Purchase Order" maxWidth="lg">
        <form onSubmit={handleAdd}>
          <ModalSection title="Purchase Order Details">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ModalInput value={addForm.po_number} onChange={(v) => setAddForm({ ...addForm, po_number: v })} placeholder="PO Number (auto if blank)" />
              <ModalInput value={addForm.supplier_name} onChange={(v) => setAddForm({ ...addForm, supplier_name: v })} placeholder="Supplier / vendor name" />
              <div>
                <label className="block text-xs text-neutral-600 mb-1">Order Date *</label>
                <input type="date" value={addForm.order_date} onChange={(e) => setAddForm({ ...addForm, order_date: e.target.value })} required className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 text-sm focus:outline-none focus:ring-2 focus:ring-primary border-0" />
              </div>
              <div>
                <label className="block text-xs text-neutral-600 mb-1">Expected Delivery</label>
                <input type="date" value={addForm.expected_delivery_date} onChange={(e) => setAddForm({ ...addForm, expected_delivery_date: e.target.value })} className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 text-sm focus:outline-none focus:ring-2 focus:ring-primary border-0" />
              </div>
              <ModalSelect value={addForm.branch_id} onChange={(v) => setAddForm({ ...addForm, branch_id: v })} options={branchOptions} placeholder="Select Branch *" />
              <ModalInput value={addForm.notes} onChange={(v) => setAddForm({ ...addForm, notes: v })} placeholder="Optional notes" />
            </div>
          </ModalSection>

          <ModalSection title="Order Items">
            <div className="space-y-3">
              {addItems.map((item, idx) => {
                const branchInv = getInventoryForBranch(addForm.branch_id);
                return (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-5">
                      {idx === 0 && <label className="block text-xs text-neutral-900 mb-1">Inventory Item</label>}
                      <select
                        value={item.inventory_item_id}
                        onChange={(e) => updateAddItem(idx, "inventory_item_id", e.target.value)}
                        className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                        required
                      >
                        <option value="">Select item</option>
                        {branchInv.map((inv) => (
                          <option key={inv.id} value={inv.id}>{inv.item_name} ({inv.sku_code})</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      {idx === 0 && <label className="block text-xs text-neutral-900 mb-1">Qty</label>}
                      <input
                        type="number"
                        min="1"
                        value={item.quantity_ordered}
                        onChange={(e) => updateAddItem(idx, "quantity_ordered", e.target.value)}
                        className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                        placeholder="Qty"
                        required
                      />
                    </div>
                    <div className="col-span-2">
                      {idx === 0 && <label className="block text-xs text-neutral-900 mb-1">Unit Cost</label>}
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unit_cost}
                        onChange={(e) => updateAddItem(idx, "unit_cost", e.target.value)}
                        className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                        placeholder="Cost"
                        required
                      />
                    </div>
                    <div className="col-span-2 text-right text-sm font-medium text-neutral-900 py-2">
                      {formatPrice(lineTotal(item))}
                    </div>
                    <div className="col-span-1 flex justify-center">
                      {addItems.length > 1 && (
                        <button type="button" onClick={() => removeAddItemRow(idx)} className="p-2 text-negative hover:text-negative-900 rounded-lg"><LuTrash2 className="w-4 h-4" /></button>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center justify-between pt-2">
                <button type="button" onClick={addItemRow} className="flex items-center gap-1 text-sm text-primary hover:text-primary-900 font-medium">
                  <LuPlus className="w-4 h-4" /> Add Item
                </button>
                <p className="text-sm font-semibold text-neutral-950">Total: {formatPrice(computeTotal(addItems))}</p>
              </div>
            </div>
          </ModalSection>

          {addError && <ModalError message={addError} />}
          <ModalButtons
            submitText="Create Purchase Order"
            onCancel={() => setShowAddModal(false)}
            loading={addLoading}
          />
        </form>
      </Modal>

      {/* ═══════════════════ VIEW MODAL ═══════════════════ */}
      <Modal isOpen={showViewModal} onClose={() => setShowViewModal(false)} title={`Purchase Order — ${viewOrder?.po_number || ""}`} maxWidth="lg">
        {viewOrder && (
          <div className="space-y-5">
            <ModalSection title="Order Details">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <span className="text-neutral-600">PO Number</span>
                  <p className="font-medium text-neutral-950">{viewOrder.po_number}</p>
                </div>
                <div>
                  <span className="text-neutral-600">Status</span>
                  <p><span className={`px-3 py-1 rounded-full text-xs font-medium ${statusBadge(viewOrder.status)}`}>{statusLabel(viewOrder.status)}</span></p>
                </div>
                <div>
                  <span className="text-neutral-600">Supplier</span>
                  <p className="font-medium text-neutral-950">{viewOrder.supplier_name || "—"}</p>
                </div>
                <div>
                  <span className="text-neutral-600">Branch</span>
                  <p className="font-medium text-neutral-950">{viewOrder.branches?.name || "—"}</p>
                </div>
                <div>
                  <span className="text-neutral-600">Order Date</span>
                  <p className="font-medium text-neutral-950">{formatDate(viewOrder.order_date)}</p>
                </div>
                <div>
                  <span className="text-neutral-600">Expected Delivery</span>
                  <p className="font-medium text-neutral-950">{viewOrder.expected_delivery_date ? formatDate(viewOrder.expected_delivery_date) : "—"}</p>
                </div>
                <div>
                  <span className="text-neutral-600">Total Amount</span>
                  <p className="font-semibold text-neutral-950">{formatPrice(viewOrder.total_amount)}</p>
                </div>
                {viewOrder.received_at && (
                  <div>
                    <span className="text-neutral-600">Received At</span>
                    <p className="font-medium text-neutral-950">{formatDate(viewOrder.received_at)}</p>
                  </div>
                )}
                {viewOrder.notes && (
                  <div className="col-span-2">
                    <span className="text-neutral-600">Notes</span>
                    <p className="text-neutral-900">{viewOrder.notes}</p>
                  </div>
                )}
              </div>
            </ModalSection>

            <ModalSection title="Items">
              {viewOrder.purchase_order_items && viewOrder.purchase_order_items.length > 0
                ? renderItemsTable(viewOrder.purchase_order_items)
                : <p className="text-sm text-neutral-600">No items.</p>}
            </ModalSection>

            {/* Actions from view modal */}
            <div className="flex flex-wrap gap-2 pt-2">
              {canUpdate && viewOrder.status === "draft" && (
                <button onClick={() => { setShowViewModal(false); handleSubmitPO(viewOrder); }} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-950 transition-colors"><LuSend className="w-4 h-4" /> Submit</button>
              )}
              {canUpdate && viewOrder.status === "submitted" && (
                <button onClick={() => { setShowViewModal(false); handleReceivePO(viewOrder); }} className="flex items-center gap-2 px-4 py-2 bg-positive text-white rounded-lg text-sm font-medium hover:bg-positive-950 transition-colors"><LuPackageCheck className="w-4 h-4" /> Receive &amp; Stock In</button>
              )}
              {canUpdate && ["draft", "submitted"].includes(viewOrder.status) && (
                <button onClick={() => { setShowViewModal(false); openEditModal(viewOrder); }} className="flex items-center gap-2 px-4 py-2 border border-neutral-200 rounded-lg text-sm font-medium text-neutral-950 hover:bg-neutral-100 transition-colors"><LuPencil className="w-4 h-4" /> Edit</button>
              )}
              {canUpdate && ["draft", "submitted"].includes(viewOrder.status) && (
                <button onClick={() => { setShowViewModal(false); handleCancelPO(viewOrder); }} className="flex items-center gap-2 px-4 py-2 border border-negative text-negative rounded-lg text-sm font-medium hover:bg-negative-100 transition-colors"><LuCircleX className="w-4 h-4" /> Cancel</button>
              )}
              <button onClick={() => setShowViewModal(false)} className="flex items-center gap-2 px-4 py-2 border border-neutral-200 rounded-lg text-sm font-medium text-neutral-950 hover:bg-neutral-100 transition-colors">Close</button>
            </div>
          </div>
        )}
      </Modal>

      {/* ═══════════════════ EDIT MODAL ═══════════════════ */}
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title={`Edit Purchase Order — ${selectedOrder?.po_number || ""}`} maxWidth="lg">
        {selectedOrder && (
          <form onSubmit={handleEdit}>
            <ModalSection title="Purchase Order Details">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ModalInput value={selectedOrder.po_number} onChange={() => {}} placeholder="PO Number" disabled />
                <ModalInput value={editForm.supplier_name} onChange={(v) => setEditForm({ ...editForm, supplier_name: v })} placeholder="Supplier / vendor name" />
                <div>
                  <label className="block text-xs text-neutral-600 mb-1">Order Date *</label>
                  <input type="date" value={editForm.order_date} onChange={(e) => setEditForm({ ...editForm, order_date: e.target.value })} required className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 text-sm focus:outline-none focus:ring-2 focus:ring-primary border-0" />
                </div>
                <div>
                  <label className="block text-xs text-neutral-600 mb-1">Expected Delivery</label>
                  <input type="date" value={editForm.expected_delivery_date} onChange={(e) => setEditForm({ ...editForm, expected_delivery_date: e.target.value })} className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 text-sm focus:outline-none focus:ring-2 focus:ring-primary border-0" />
                </div>
                <ModalInput value={editForm.notes} onChange={(v) => setEditForm({ ...editForm, notes: v })} placeholder="Optional notes" />
              </div>
            </ModalSection>

            <ModalSection title="Order Items">
              <div className="space-y-3">
                {editItems.map((item, idx) => {
                  const branchInv = getInventoryForBranch(selectedOrder.branch_id);
                  return (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-5">
                        {idx === 0 && <label className="block text-xs text-neutral-900 mb-1">Inventory Item</label>}
                        <select
                          value={item.inventory_item_id}
                          onChange={(e) => updateEditItem(idx, "inventory_item_id", e.target.value)}
                          className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                          required
                        >
                          <option value="">Select item</option>
                          {branchInv.map((inv) => (
                            <option key={inv.id} value={inv.id}>{inv.item_name} ({inv.sku_code})</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        {idx === 0 && <label className="block text-xs text-neutral-900 mb-1">Qty</label>}
                        <input
                          type="number"
                          min="1"
                          value={item.quantity_ordered}
                          onChange={(e) => updateEditItem(idx, "quantity_ordered", e.target.value)}
                          className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                          placeholder="Qty"
                          required
                        />
                      </div>
                      <div className="col-span-2">
                        {idx === 0 && <label className="block text-xs text-neutral-900 mb-1">Unit Cost</label>}
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unit_cost}
                          onChange={(e) => updateEditItem(idx, "unit_cost", e.target.value)}
                          className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                          placeholder="Cost"
                          required
                        />
                      </div>
                      <div className="col-span-2 text-right text-sm font-medium text-neutral-900 py-2">
                        {formatPrice(lineTotal(item))}
                      </div>
                      <div className="col-span-1 flex justify-center">
                        {editItems.length > 1 && (
                          <button type="button" onClick={() => removeEditItemRow(idx)} className="p-2 text-negative hover:text-negative-900 rounded-lg"><LuTrash2 className="w-4 h-4" /></button>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between pt-2">
                  <button type="button" onClick={addEditItemRow} className="flex items-center gap-1 text-sm text-primary hover:text-primary-900 font-medium">
                    <LuPlus className="w-4 h-4" /> Add Item
                  </button>
                  <p className="text-sm font-semibold text-neutral-950">Total: {formatPrice(computeTotal(editItems))}</p>
                </div>
              </div>
            </ModalSection>

            {editError && <ModalError message={editError} />}
            <ModalButtons
              submitText="Save Changes"
              onCancel={() => setShowEditModal(false)}
              loading={editLoading}
            />
          </form>
        )}
      </Modal>

      {/* ═══════════════════ DELETE CONFIRM MODAL ═══════════════════ */}
      <Modal isOpen={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} title="Delete Purchase Order" maxWidth="sm">
        {orderToDelete && (
          <div>
            <div className="bg-negative-100 rounded-xl p-4 my-4">
              <p className="text-sm text-negative-950">
                Are you sure you want to delete purchase order <strong>{orderToDelete.po_number}</strong>? This action will soft-delete the record.
              </p>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-3 border-2 border-neutral-200 text-neutral-950 rounded-xl font-semibold hover:bg-neutral-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteLoading}
                className="flex-1 px-4 py-3 bg-negative text-white rounded-xl font-semibold hover:bg-negative-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {deleteLoading ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
