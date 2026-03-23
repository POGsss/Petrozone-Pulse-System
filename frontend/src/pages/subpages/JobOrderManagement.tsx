import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  LuPlus,
  LuRefreshCw,
  LuTrash2,
  LuClipboardList,
  LuX,
  LuPencil,
  LuWrench,
  LuCheck,
  LuSend,
  LuBan,
  LuHistory,
  LuEllipsisVertical,
  LuPlay,
  LuPackageCheck,
  LuCircleCheck,
  LuCreditCard,
  LuFileText,
} from "react-icons/lu";
import { jobOrdersApi, branchesApi, customersApi, vehiclesApi, packagesApi, laborItemsApi, thirdPartyRepairsApi, inventoryApi } from "../../lib/api";
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
import type { JobOrder, JobOrderItem, JobOrderHistory, Branch, Customer, Vehicle, PackageItem, PackageInventoryItem, ThirdPartyRepair, VehicleClass, InventoryItem, LaborItem } from "../../types";

const ITEMS_PER_PAGE = 12;

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

function getLaborPriceByVehicleClass(laborItem: LaborItem, vehicleClass: VehicleClass): number {
  if (vehicleClass === "light") return laborItem.light_price || 0;
  if (vehicleClass === "heavy") return laborItem.heavy_price || 0;
  return laborItem.extra_heavy_price || 0;
}

function computeOrderItemsTotal(order: JobOrder): number {
  if (order.job_order_lines && order.job_order_lines.length > 0) {
    return order.job_order_lines.reduce((sum, line) => sum + (line.total || 0), 0);
  }
  return (order.job_order_items || []).reduce((sum, item) => sum + (item.line_total || 0), 0);
}

function computeOrderGrandTotal(order: JobOrder, repairsOverride?: ThirdPartyRepair[]): number {
  if (order.job_type === "backorder") {
    return Number(order.total_amount || 0);
  }

  const itemsTotal = computeOrderItemsTotal(order);
  const repairsTotal = repairsOverride
    ? repairsOverride.reduce((sum, repair) => sum + (repair.cost || 0), 0)
    : (order.third_party_repairs || []).reduce((sum, repair) => sum + (repair.cost || 0), 0);
  return itemsTotal + repairsTotal;
}

// Status display helpers
function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: "Draft",
    pending_approval: "Pending",
    approved: "Approved",
    in_progress: "In Progress",
    ready_for_release: "Ready",
    pending_payment: "Payment",
    completed: "Completed",
    rejected: "Rejected",
    cancelled: "Cancelled",
    deactivated: "Deactivated",
  };
  return labels[status] || status.charAt(0).toUpperCase() + status.slice(1);
}

function getStatusColors(status: string): string {
  const colors: Record<string, string> = {
    draft: "bg-neutral-100 text-neutral-950",
    pending_approval: "bg-primary-100 text-primary-950",
    approved: "bg-positive-100 text-positive-950",
    in_progress: "bg-neutral-100 text-neutral-950",
    ready_for_release: "bg-primary-100 text-primary-950",
    pending_payment: "bg-secondary-100 text-secondary-950",
    completed: "bg-positive-100 text-positive-950",
    rejected: "bg-negative-100 text-negative-950",
    cancelled: "bg-negative-100 text-negative-950",
    deactivated: "bg-negative-100 text-negative-950",
  };
  return colors[status] || "bg-neutral-100 text-neutral-950";
}

// Item being added to the order (before submission)
interface DraftItem {
  labor_item_id: string;
  labor_item_name: string;
  package_item_id: string;
  package_item_name: string;
  quantity: number;
  labor_price: number;
  inventory_cost: number;
  line_total: number;
  inventory_quantities: Array<{
    inventory_item_id: string;
    inventory_item_name: string;
    unit_cost: number;
    quantity: number;
    category?: string;
    available_items?: Array<{ id: string; item_name: string; cost_price: number }>;
  }>;
}

interface DraftPackageLine {
  package_item_id: string;
  package_item_name: string;
  quantity: number;
  unit_price: number;
  total: number;
  base_labor_components: Array<{ labor_item_id: string; labor_item_name: string; quantity: number; unit_price: number }>;
  base_inventory_components: Array<{ inventory_item_id: string; inventory_item_name: string; quantity: number; unit_price: number }>;
  vehicle_specific_labor_components: Array<{ labor_item_id: string; labor_item_name: string; quantity: number; unit_price: number }>;
  vehicle_specific_inventory_components: Array<{ inventory_item_id: string; inventory_item_name: string; quantity: number; unit_price: number }>;
}

interface DraftLaborLine {
  labor_item_id: string;
  labor_item_name: string;
  quantity: number;
  unit_price: number;
  total: number;
}

interface DraftInventoryLine {
  inventory_item_id: string;
  inventory_item_name: string;
  quantity: number;
  unit_price: number;
  total: number;
}

interface DraftRepair {
  id: string;
  provider_name: string;
  description: string;
  cost: number;
  repair_date: string;
}

export function JobOrderManagement() {
  const { user } = useAuth();
  const userRoles = user?.roles || [];
  const isHM = userRoles.includes("HM");

  // Permission checks
  const canCreate = userRoles.some((r) => ["POC", "JS", "R"].includes(r));
  const canUpdate = userRoles.some((r) => ["POC", "JS", "R", "T"].includes(r));
  const canEditItems = userRoles.some((r) => ["POC", "JS", "R"].includes(r));
  const canDelete = userRoles.some((r) => ["POC", "JS", "R"].includes(r));
  const canRepair = userRoles.some((r) => ["HM", "POC", "JS", "R", "T"].includes(r));
  const canApproval = userRoles.some((r) => ["R", "T"].includes(r));
  const canApproveRework = userRoles.includes("HM");
  const canPayment = userRoles.some((r) => ["R", "T"].includes(r));
  const canStartWork = userRoles.includes("T");
  const canMarkReady = userRoles.some((r) => ["T", "POC"].includes(r));
  const canComplete = userRoles.some((r) => ["HM", "POC"].includes(r));

  // Data state
  const [allOrders, setAllOrders] = useState<JobOrder[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search, filters & pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = useState(1);

  // View modal
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewOrder, setViewOrder] = useState<JobOrder | null>(null);
  const [loadingView, setLoadingView] = useState(false);

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addingOrder, setAddingOrder] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Add form state
  const [addBranchId, setAddBranchId] = useState("");
  const [addCustomerId, setAddCustomerId] = useState("");
  const [addVehicleId, setAddVehicleId] = useState("");
  const [addVehicleClass, setAddVehicleClass] = useState<VehicleClass>("light");
  const [addSameAsCustomer, setAddSameAsCustomer] = useState(true);
  const [addDeliveredBy, setAddDeliveredBy] = useState("");
  const [addNotes, setAddNotes] = useState("");
  const [draftPackageLines, setDraftPackageLines] = useState<DraftPackageLine[]>([]);
  const [draftLaborLines, setDraftLaborLines] = useState<DraftLaborLine[]>([]);
  const [draftInventoryLines, setDraftInventoryLines] = useState<DraftInventoryLine[]>([]);
  const [draftRepairs, setDraftRepairs] = useState<DraftRepair[]>([]);
  const [addOdometer, setAddOdometer] = useState("");
  const [addVehicleBay, setAddVehicleBay] = useState("");
  const [newRepairProvider, setNewRepairProvider] = useState("");
  const [newRepairDescription, setNewRepairDescription] = useState("");
  const [newRepairCost, setNewRepairCost] = useState("");
  const [newRepairDate, setNewRepairDate] = useState(new Date().toISOString().split("T")[0]);

  // Lookups for add modal
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [packageItems, setPackageItems] = useState<PackageItem[]>([]);
  const [laborItems, setLaborItems] = useState<LaborItem[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(false);

  // Add item sub-form
  const [selectedPackageItemId, setSelectedPackageItemId] = useState("");
  const [selectedLaborItemId, setSelectedLaborItemId] = useState("");
  const [selectedInventoryItemId, setSelectedInventoryItemId] = useState("");
  const [vehicleSpecificTypeByPackage, setVehicleSpecificTypeByPackage] = useState<Record<string, "labor" | "inventory" | "">>({});
  const [vehicleSpecificItemByPackage, setVehicleSpecificItemByPackage] = useState<Record<string, string>>({});
  const [selectedPackageQty, setSelectedPackageQty] = useState("1");
  const [selectedLaborQty, setSelectedLaborQty] = useState("1");
  const [selectedInventoryQty, setSelectedInventoryQty] = useState("1");
  const [resolvingPrice, setResolvingPrice] = useState(false);

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editOrder, setEditOrder] = useState<JobOrder | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editingOrder, setEditingOrder] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Edit modal items state (for created/rejected orders)
  const [editItems, setEditItems] = useState<JobOrderItem[]>([]);
  const [origEditItems, setOrigEditItems] = useState<JobOrderItem[]>([]);
  const [editDraftItems, setEditDraftItems] = useState<DraftItem[]>([]);
  const [editPackageItems, setEditPackageItems] = useState<PackageItem[]>([]);
  const [editLaborItems, setEditLaborItems] = useState<LaborItem[]>([]);
  const [editInventoryItems, setEditInventoryItems] = useState<InventoryItem[]>([]);
  const [editLoadingItems, setEditLoadingItems] = useState(false);
  const [editSelectedPackageId, setEditSelectedPackageId] = useState("");
  const [editSelectedLaborId, setEditSelectedLaborId] = useState("");
  const [editSelectedQty, setEditSelectedQty] = useState("1");
  const [editResolvingPrice, setEditResolvingPrice] = useState(false);

  // Edit modal line-based states
  const [editLinePackageLines, setEditLinePackageLines] = useState<DraftPackageLine[]>([]);
  const [editLineLaborLines, setEditLineLaborLines] = useState<DraftLaborLine[]>([]);
  const [editLineInventoryLines, setEditLineInventoryLines] = useState<DraftInventoryLine[]>([]);
  const [editLineSelectedPackageId, setEditLineSelectedPackageId] = useState("");
  const [editLineSelectedLaborId, setEditLineSelectedLaborId] = useState("");
  const [editLineSelectedInventoryId, setEditLineSelectedInventoryId] = useState("");
  const [editLineSelectedPackageQty, setEditLineSelectedPackageQty] = useState("1");
  const [editLineSelectedLaborQty, setEditLineSelectedLaborQty] = useState("1");
  const [editLineSelectedInventoryQty, setEditLineSelectedInventoryQty] = useState("1");
  const [editVehicleSpecificTypeByPackage, setEditVehicleSpecificTypeByPackage] = useState<Record<string, "labor" | "inventory" | "">>({});
  const [editVehicleSpecificItemByPackage, setEditVehicleSpecificItemByPackage] = useState<Record<string, string>>({});

  // Delete modal
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingOrder, setDeletingOrder] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<JobOrder | null>(null);
  const [orderHasReferences, setOrderHasReferences] = useState(false);

  // Third Party Repairs (view modal)
  const [repairs, setRepairs] = useState<ThirdPartyRepair[]>([]);
  const [loadingRepairs, setLoadingRepairs] = useState(false);

  // Repair action modal (wrench button)
  const [showRepairActionModal, setShowRepairActionModal] = useState(false);
  const [repairActionOrder, setRepairActionOrder] = useState<JobOrder | null>(null);
  const [actionRepairs, setActionRepairs] = useState<ThirdPartyRepair[]>([]);
  const [originalActionRepairs, setOriginalActionRepairs] = useState<ThirdPartyRepair[]>([]);
  const [loadingActionRepairs, setLoadingActionRepairs] = useState(false);
  const [savingActionRepairs, setSavingActionRepairs] = useState(false);
  const [actionRepairProvider, setActionRepairProvider] = useState("");
  const [actionRepairDescription, setActionRepairDescription] = useState("");
  const [actionRepairCost, setActionRepairCost] = useState("");
  const [actionRepairDate, setActionRepairDate] = useState(new Date().toISOString().split("T")[0]);
  const [actionRepairError, setActionRepairError] = useState<string | null>(null);
  const [editingActionRepairId, setEditingActionRepairId] = useState<string | null>(null);

  // Approval processing state
  const [processingApproval, setProcessingApproval] = useState(false);

  // Cancel processing state
  const [processingCancel, setProcessingCancel] = useState(false);

  // History state
  const [history, setHistory] = useState<JobOrderHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Cancel confirmation modal
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState<JobOrder | null>(null);

  // Approval action modal
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalOrder, setApprovalOrder] = useState<JobOrder | null>(null);

  // Payment modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState<JobOrder | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completeOrder, setCompleteOrder] = useState<JobOrder | null>(null);
  const [completePickedUpBy, setCompletePickedUpBy] = useState("");
  const [processingComplete, setProcessingComplete] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [showPaymentDetailsModal, setShowPaymentDetailsModal] = useState(false);
  const [paymentDetailsOrder, setPaymentDetailsOrder] = useState<JobOrder | null>(null);
  const [savingPaymentDetails, setSavingPaymentDetails] = useState(false);
  const [paymentInvoiceNumber, setPaymentInvoiceNumber] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentMode, setPaymentMode] = useState<"cash" | "gcash" | "other">("cash");

  // Rework modal state
  const [showReworkModal, setShowReworkModal] = useState(false);
  const [reworkSourceOrder, setReworkSourceOrder] = useState<JobOrder | null>(null);
  const [reworkReason, setReworkReason] = useState("");
  const [reworkVehicleBay, setReworkVehicleBay] = useState("");
  const [isFreeRework, setIsFreeRework] = useState(true);
  const [creatingRework, setCreatingRework] = useState(false);
  const [reworkError, setReworkError] = useState<string | null>(null);

  // Shared reason modal (for cancel & reject actions)
  const [showReasonModal, setShowReasonModal] = useState(false);
  const [reasonModalAction, setReasonModalAction] = useState<"cancel" | "reject">("cancel");
  const [reasonText, setReasonText] = useState("");

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
        options: [
          { value: "draft", label: "Draft" },
          { value: "pending_approval", label: "Pending Approval" },
          { value: "approved", label: "Approved" },
          { value: "in_progress", label: "In Progress" },
          { value: "ready_for_release", label: "Ready for Release" },
          { value: "pending_payment", label: "Payment" },
          { value: "completed", label: "Completed" },
          { value: "rejected", label: "Rejected" },
          { value: "cancelled", label: "Cancelled" },
          { value: "deactivated", label: "Deactivated" },
        ],
      },
      {
        key: "branch",
        label: "Branch",
        options: branchFilterOptions,
      },
    ];
  }, [branches]);

  // Filtered + paginated
  const { paginatedItems, totalPages } = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const filtered = allOrders.filter((order) => {
      const matchSearch =
        !q ||
        order.order_number.toLowerCase().includes(q) ||
        order.customers?.full_name?.toLowerCase().includes(q) ||
        order.vehicles?.plate_number?.toLowerCase().includes(q) ||
        order.notes?.toLowerCase().includes(q);

      const branchFilter = activeFilters.branch;
      const matchBranch =
        !branchFilter || branchFilter === "all" || order.branch_id === branchFilter;

      const statusFilter = activeFilters.status;
      const matchStatus =
        !statusFilter || statusFilter === "all" || order.status === statusFilter;

      return matchSearch && matchBranch && matchStatus;
    });
    const pages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return {
      paginatedItems: filtered.slice(start, start + ITEMS_PER_PAGE),
      totalPages: pages,
      filteredCount: filtered.length,
    };
  }, [allOrders, searchQuery, activeFilters, currentPage]);

  const orderNumberById = useMemo(() => {
    const map = new Map<string, string>();
    allOrders.forEach((order) => {
      map.set(order.id, order.order_number);
    });
    return map;
  }, [allOrders]);

  const reworksByReference = useMemo(() => {
    const map = new Map<string, JobOrder[]>();
    allOrders.forEach((order) => {
      if (order.is_deleted) return;
      if (order.job_type !== "backorder" || !order.reference_job_order_id) return;
      const current = map.get(order.reference_job_order_id) || [];
      map.set(order.reference_job_order_id, [...current, order]);
    });
    return map;
  }, [allOrders]);

  const viewRelatedReworks = useMemo(() => {
    if (!viewOrder) return [] as JobOrder[];
    return reworksByReference.get(viewOrder.id) || [];
  }, [viewOrder, reworksByReference]);

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
      const apiParams: Parameters<typeof jobOrdersApi.getAll>[0] = {
        limit: 1000,
        include_deleted: true,
      };
      const [ordersRes, branchesData] = await Promise.all([
        jobOrdersApi.getAll(apiParams),
        branchesApi.getAll(),
      ]);
      setAllOrders(ordersRes.data);
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

  // Customer options filtered by branch
  const customerOptions = useMemo(() => {
    return customers
      .filter((c) => c.status === "active" && (!addBranchId || c.branch_id === addBranchId))
      .map((c) => ({ value: c.id, label: c.full_name }));
  }, [customers, addBranchId]);

  const selectedAddCustomer = useMemo(
    () => customers.find((c) => c.id === addCustomerId) || null,
    [customers, addCustomerId]
  );

  // Vehicle options filtered by customer
  const vehicleOptions = useMemo(() => {
    return vehicles
      .filter((v) => v.status === "active" && (!addCustomerId || v.customer_id === addCustomerId))
      .map((v) => ({ value: v.id, label: `${v.model} (${v.plate_number})` }));
  }, [vehicles, addCustomerId]);

  // Package item options (active items visible to user)
  const packageItemOptions = useMemo(() => {
    return packageItems
      .filter((i) => i.status === "active")
      .map((i) => ({ value: i.id, label: i.name }));
  }, [packageItems]);

  const laborItemOptions = useMemo(() => {
    return laborItems
      .filter((i) => i.status === "active")
      .map((i) => ({ value: i.id, label: `${i.name} (${formatPrice(getLaborPriceByVehicleClass(i, addVehicleClass))})` }));
  }, [laborItems, addVehicleClass]);

  const inventoryItemOptions = useMemo(() => {
    return inventoryItems
      .filter((i) => i.status === "active")
      .map((i) => ({ value: i.id, label: `${i.item_name} (${formatPrice(i.cost_price || 0)})` }));
  }, [inventoryItems]);

  // Draft total
  const draftTotal = useMemo(
    () =>
      draftPackageLines.reduce((sum, item) => sum + item.total, 0) +
      draftLaborLines.reduce((sum, item) => sum + item.total, 0) +
      draftInventoryLines.reduce((sum, item) => sum + item.total, 0),
    [draftPackageLines, draftLaborLines, draftInventoryLines]
  );

  const draftRepairsTotal = useMemo(
    () => draftRepairs.reduce((sum, r) => sum + r.cost, 0),
    [draftRepairs]
  );

  // Edit modal: Package item options
  const editPackageItemOptions = useMemo(() => {
    return editPackageItems
      .filter((i) => i.status === "active")
      .map((i) => ({ value: i.id, label: i.name }));
  }, [editPackageItems]);

  const editLaborItemOptions = useMemo(() => {
    const vehicleClass = editOrder?.vehicle_class || "light";
    return editLaborItems
      .filter((i) => i.status === "active")
      .map((i) => ({ value: i.id, label: `${i.name} (${formatPrice(getLaborPriceByVehicleClass(i, vehicleClass))})` }));
  }, [editLaborItems, editOrder]);

  const editInventoryItemOptions = useMemo(() => {
    return editInventoryItems
      .filter((i) => i.status === "active")
      .map((i) => ({ value: i.id, label: `${i.item_name} (${formatPrice(i.cost_price || 0)})` }));
  }, [editInventoryItems]);

  // Edit modal: items total
  const editItemsTotal = useMemo(
    () =>
      editItems.reduce((sum, i) => sum + i.line_total, 0) +
      editDraftItems.reduce((sum, d) => sum + d.line_total, 0),
    [editItems, editDraftItems]
  );

  const editLineItemsTotal = useMemo(
    () =>
      editLinePackageLines.reduce((sum, item) => sum + item.total, 0) +
      editLineLaborLines.reduce((sum, item) => sum + item.total, 0) +
      editLineInventoryLines.reduce((sum, item) => sum + item.total, 0),
    [editLinePackageLines, editLineLaborLines, editLineInventoryLines]
  );

  const viewLinePackageLines = useMemo(
    () => (viewOrder?.job_order_lines || []).filter((line) => line.line_type === "package"),
    [viewOrder]
  );

  const viewLineLaborLines = useMemo(
    () => (viewOrder?.job_order_lines || []).filter((line) => line.line_type === "labor"),
    [viewOrder]
  );

  const viewLineInventoryLines = useMemo(
    () => (viewOrder?.job_order_lines || []).filter((line) => line.line_type === "inventory"),
    [viewOrder]
  );

  const viewGrandTotal = useMemo(
    () => {
      if (!viewOrder) return 0;
      return computeOrderGrandTotal(viewOrder, repairs);
    },
    [viewOrder, repairs]
  );

  // Load lookups when add modal opens
  const loadLookups = useCallback(async (branchId: string) => {
    try {
      setLoadingLookups(true);
      const [custRes, vehRes, catRes, laborRes, invRes] = await Promise.all([
        customersApi.getAll({ limit: 1000, branch_id: branchId || undefined }),
        vehiclesApi.getAll({ limit: 1000, branch_id: branchId || undefined }),
        packagesApi.getAll({ limit: 1000 }),
        laborItemsApi.getAll({ limit: 1000, status: "active" }),
        inventoryApi.getAll({ limit: 1000, branch_id: branchId || undefined, status: "active" }),
      ]);
      setCustomers(custRes.data);
      setVehicles(vehRes.data);
      setPackageItems(catRes.data);
      setLaborItems(laborRes.data);
      setInventoryItems(invRes.data);
    } catch {
      // Silently fail — will show empty dropdowns
    } finally {
      setLoadingLookups(false);
    }
  }, []);

  // --- Add ---
  function openAddModal() {
    const branch = defaultBranchId;
    setAddBranchId(branch);
    setAddCustomerId("");
    setAddVehicleId("");
    setAddVehicleClass("light");
    setAddSameAsCustomer(true);
    setAddDeliveredBy("");
    setAddNotes("");
    setAddOdometer("");
    setAddVehicleBay("");
    setDraftPackageLines([]);
    setDraftLaborLines([]);
    setDraftInventoryLines([]);
    setDraftRepairs([]);
    setNewRepairProvider("");
    setNewRepairDescription("");
    setNewRepairCost("");
    setNewRepairDate(new Date().toISOString().split("T")[0]);
    setSelectedPackageItemId("");
    setSelectedLaborItemId("");
    setSelectedInventoryItemId("");
    setSelectedPackageQty("1");
    setSelectedLaborQty("1");
    setSelectedInventoryQty("1");
    setVehicleSpecificTypeByPackage({});
    setVehicleSpecificItemByPackage({});
    setAddError(null);
    setShowAddModal(true);
    loadLookups(branch);
  }

  // When branch changes, reload lookups and clear customer/vehicle
  function handleBranchChange(newBranchId: string) {
    setAddBranchId(newBranchId);
    setAddCustomerId("");
    setAddVehicleId("");
    setAddSameAsCustomer(true);
    setAddDeliveredBy("");
    setDraftPackageLines([]);
    setDraftLaborLines([]);
    setDraftInventoryLines([]);
    setVehicleSpecificTypeByPackage({});
    setVehicleSpecificItemByPackage({});
    loadLookups(newBranchId);
  }

  // When customer changes, clear vehicle
  function handleCustomerChange(newCustomerId: string) {
    setAddCustomerId(newCustomerId);
    setAddVehicleId("");
    setAddVehicleClass("light");
    if (!addSameAsCustomer) return;
    const selected = customers.find((c) => c.id === newCustomerId);
    setAddDeliveredBy(selected?.full_name || "");
  }

  useEffect(() => {
    if (!addSameAsCustomer) return;
    setAddDeliveredBy(selectedAddCustomer?.full_name || "");
  }, [addSameAsCustomer, selectedAddCustomer]);

  // When vehicle changes, auto-set vehicle class from selected vehicle
  function handleVehicleChange(newVehicleId: string) {
    setAddVehicleId(newVehicleId);
    if (newVehicleId) {
      const selectedVehicle = vehicles.find((v) => v.id === newVehicleId);
      if (selectedVehicle?.vehicle_class) {
        const newClass = selectedVehicle.vehicle_class as VehicleClass;
        setAddVehicleClass(newClass);
        setSelectedLaborItemId("");
      } else {
        setAddVehicleClass("light");
        setSelectedLaborItemId("");
      }
    } else {
      setAddVehicleClass("light");
      setSelectedLaborItemId("");
    }
  }

  function recomputeDraftPackageLine(line: DraftPackageLine): DraftPackageLine {
    const unitPrice =
      line.base_labor_components.reduce((sum, c) => sum + c.unit_price * c.quantity, 0) +
      line.base_inventory_components.reduce((sum, c) => sum + c.unit_price * c.quantity, 0) +
      line.vehicle_specific_labor_components.reduce((sum, c) => sum + c.unit_price * c.quantity, 0) +
      line.vehicle_specific_inventory_components.reduce((sum, c) => sum + c.unit_price * c.quantity, 0);

    return {
      ...line,
      unit_price: unitPrice,
      total: unitPrice * line.quantity,
    };
  }

  async function handleAddDraftPackageLine() {
    if (!selectedPackageItemId || !addBranchId) return;
    const qty = parseInt(selectedPackageQty, 10) || 1;

    if (draftPackageLines.some((d) => d.package_item_id === selectedPackageItemId)) {
      setAddError("This package is already in the order");
      return;
    }

    try {
      setResolvingPrice(true);
      setAddError(null);

      const packageItem = packageItems.find((p) => p.id === selectedPackageItemId);
      if (!packageItem) {
        setAddError("Package item not found");
        return;
      }

      const [pkgLaborLinks, pkgInventoryLinks] = await Promise.all([
        packagesApi.getLaborLinks(packageItem.id),
        packagesApi.getInventoryLinks(packageItem.id),
      ]);

      const baseLaborComponents = pkgLaborLinks.map((link) => {
        const name = link.labor_items?.name || "Unknown Labor";
        const unitPrice = link.labor_items
          ? getLaborPriceByVehicleClass(
              {
                id: link.labor_items.id,
                name,
                light_price: link.labor_items.light_price,
                heavy_price: link.labor_items.heavy_price,
                extra_heavy_price: link.labor_items.extra_heavy_price,
                status: (link.labor_items.status as "active" | "inactive") || "active",
                created_at: "",
              },
              addVehicleClass
            )
          : 0;
        return {
          labor_item_id: link.labor_id,
          labor_item_name: name,
          quantity: link.quantity || 1,
          unit_price: unitPrice,
        };
      });

      const baseInventoryComponents = pkgInventoryLinks.map((link) => ({
        inventory_item_id: link.inventory_item_id,
        inventory_item_name: link.inventory_items?.item_name || "Unknown Inventory",
        quantity: link.quantity || 1,
        unit_price: link.inventory_items?.cost_price || 0,
      }));

      const line: DraftPackageLine = recomputeDraftPackageLine({
        package_item_id: packageItem.id,
        package_item_name: packageItem.name,
        quantity: qty,
        unit_price: 0,
        total: 0,
        base_labor_components: baseLaborComponents,
        base_inventory_components: baseInventoryComponents,
        vehicle_specific_labor_components: [],
        vehicle_specific_inventory_components: [],
      });

      setDraftPackageLines((prev) => [...prev, line]);
      setSelectedPackageItemId("");
      setSelectedPackageQty("1");
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add package");
    } finally {
      setResolvingPrice(false);
    }
  }

  function handleRemoveDraftPackageLine(packageItemId: string) {
    setDraftPackageLines((prev) => prev.filter((d) => d.package_item_id !== packageItemId));
    setVehicleSpecificTypeByPackage((prev) => {
      const next = { ...prev };
      delete next[packageItemId];
      return next;
    });
    setVehicleSpecificItemByPackage((prev) => {
      const next = { ...prev };
      delete next[packageItemId];
      return next;
    });
  }

  function handleUpdateDraftPackageQty(packageItemId: string, qty: number) {
    if (qty < 1) return;
    setDraftPackageLines((prev) =>
      prev.map((line) =>
        line.package_item_id === packageItemId
          ? recomputeDraftPackageLine({ ...line, quantity: qty })
          : line
      )
    );
  }

  function handleAddVehicleSpecificLabor(packageItemId: string, laborItemId: string, qty = 1) {
    const laborItem = laborItems.find((l) => l.id === laborItemId);
    if (!laborItem) return;
    setDraftPackageLines((prev) =>
      prev.map((line) => {
        if (line.package_item_id !== packageItemId) return line;
        const nextLine = {
          ...line,
          vehicle_specific_labor_components: [
            ...line.vehicle_specific_labor_components,
            {
              labor_item_id: laborItem.id,
              labor_item_name: laborItem.name,
              quantity: qty,
              unit_price: getLaborPriceByVehicleClass(laborItem, addVehicleClass),
            },
          ],
        };
        return recomputeDraftPackageLine(nextLine);
      })
    );
  }

  function handleAddVehicleSpecificInventory(packageItemId: string, inventoryItemId: string, qty = 1) {
    const inventoryItem = inventoryItems.find((i) => i.id === inventoryItemId);
    if (!inventoryItem) return;
    setDraftPackageLines((prev) =>
      prev.map((line) => {
        if (line.package_item_id !== packageItemId) return line;
        const nextLine = {
          ...line,
          vehicle_specific_inventory_components: [
            ...line.vehicle_specific_inventory_components,
            {
              inventory_item_id: inventoryItem.id,
              inventory_item_name: inventoryItem.item_name,
              quantity: qty,
              unit_price: inventoryItem.cost_price || 0,
            },
          ],
        };
        return recomputeDraftPackageLine(nextLine);
      })
    );
  }

  function handleRemoveVehicleSpecificLabor(packageItemId: string, index: number) {
    setDraftPackageLines((prev) =>
      prev.map((line) => {
        if (line.package_item_id !== packageItemId) return line;
        const nextLine = {
          ...line,
          vehicle_specific_labor_components: line.vehicle_specific_labor_components.filter((_, idx) => idx !== index),
        };
        return recomputeDraftPackageLine(nextLine);
      })
    );
  }

  function handleRemoveVehicleSpecificInventory(packageItemId: string, index: number) {
    setDraftPackageLines((prev) =>
      prev.map((line) => {
        if (line.package_item_id !== packageItemId) return line;
        const nextLine = {
          ...line,
          vehicle_specific_inventory_components: line.vehicle_specific_inventory_components.filter((_, idx) => idx !== index),
        };
        return recomputeDraftPackageLine(nextLine);
      })
    );
  }

  function handleVehicleSpecificTypeChange(packageItemId: string, type: "labor" | "inventory" | "") {
    setVehicleSpecificTypeByPackage((prev) => ({
      ...prev,
      [packageItemId]: type,
    }));
    setVehicleSpecificItemByPackage((prev) => ({
      ...prev,
      [packageItemId]: "",
    }));
  }

  function handleVehicleSpecificItemChange(packageItemId: string, itemId: string) {
    setVehicleSpecificItemByPackage((prev) => ({
      ...prev,
      [packageItemId]: itemId,
    }));
  }

  function handleAddVehicleSpecificComponent(packageItemId: string) {
    const selectedType = vehicleSpecificTypeByPackage[packageItemId] || "";
    const selectedItemId = vehicleSpecificItemByPackage[packageItemId] || "";

    if (!selectedType || !selectedItemId) return;

    if (selectedType === "labor") {
      handleAddVehicleSpecificLabor(packageItemId, selectedItemId, 1);
    } else {
      handleAddVehicleSpecificInventory(packageItemId, selectedItemId, 1);
    }

    setVehicleSpecificItemByPackage((prev) => ({
      ...prev,
      [packageItemId]: "",
    }));
  }

  function handleAddDraftLaborLine() {
    if (!selectedLaborItemId) return;
    const qty = parseInt(selectedLaborQty, 10) || 1;
    const laborItem = laborItems.find((l) => l.id === selectedLaborItemId);
    if (!laborItem) return;
    setDraftLaborLines((prev) => [
      ...prev,
      {
        labor_item_id: laborItem.id,
        labor_item_name: laborItem.name,
        quantity: qty,
        unit_price: getLaborPriceByVehicleClass(laborItem, addVehicleClass),
        total: getLaborPriceByVehicleClass(laborItem, addVehicleClass) * qty,
      },
    ]);
    setSelectedLaborItemId("");
    setSelectedLaborQty("1");
  }

  function handleRemoveDraftLaborLine(laborItemId: string, index: number) {
    setDraftLaborLines((prev) => prev.filter((line, idx) => !(line.labor_item_id === laborItemId && idx === index)));
  }

  function handleAddDraftInventoryLine() {
    if (!selectedInventoryItemId) return;
    const qty = parseInt(selectedInventoryQty, 10) || 1;
    const invItem = inventoryItems.find((i) => i.id === selectedInventoryItemId);
    if (!invItem) return;
    setDraftInventoryLines((prev) => [
      ...prev,
      {
        inventory_item_id: invItem.id,
        inventory_item_name: invItem.item_name,
        quantity: qty,
        unit_price: invItem.cost_price || 0,
        total: (invItem.cost_price || 0) * qty,
      },
    ]);
    setSelectedInventoryItemId("");
    setSelectedInventoryQty("1");
  }

  function handleRemoveDraftInventoryLine(inventoryItemId: string, index: number) {
    setDraftInventoryLines((prev) => prev.filter((line, idx) => !(line.inventory_item_id === inventoryItemId && idx === index)));
  }

  // Draft repair functions for create modal
  function handleAddDraftRepair() {
    if (!newRepairProvider.trim()) { setAddError("Provider name is required"); return; }
    if (!newRepairDescription.trim()) { setAddError("Description is required"); return; }
    if (!newRepairCost || isNaN(Number(newRepairCost)) || Number(newRepairCost) < 0) {
      setAddError("Valid cost is required"); return;
    }
    if (!newRepairDate) { setAddError("Repair date is required"); return; }

    setDraftRepairs((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        provider_name: newRepairProvider.trim(),
        description: newRepairDescription.trim(),
        cost: Number(newRepairCost),
        repair_date: newRepairDate,
      },
    ]);
    setNewRepairProvider("");
    setNewRepairDescription("");
    setNewRepairCost("");
    setNewRepairDate(new Date().toISOString().split("T")[0]);
    setAddError(null);
  }

  function removeDraftRepair(id: string) {
    setDraftRepairs((prev) => prev.filter((r) => r.id !== id));
  }

  async function handleCreateOrder(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);

    if (!addBranchId) { setAddError("Branch is required"); return; }
    if (!addCustomerId) { setAddError("Customer is required"); return; }
    if (!addVehicleId) { setAddError("Vehicle is required"); return; }
    if (!addDeliveredBy.trim()) { setAddError("Delivered By is required"); return; }
    if (!addOdometer.trim()) { setAddError("Odometer reading is required"); return; }
    if (isNaN(parseInt(addOdometer, 10)) || parseInt(addOdometer, 10) < 0) {
      setAddError("Odometer reading must be a non-negative number");
      return;
    }
    if (!addVehicleBay) { setAddError("Vehicle bay is required"); return; }
    if (draftPackageLines.length + draftLaborLines.length + draftInventoryLines.length === 0) {
      setAddError("Add at least one line item");
      return;
    }

    try {
      setAddingOrder(true);
      const createdOrder = await jobOrdersApi.create({
        customer_id: addCustomerId,
        vehicle_id: addVehicleId,
        branch_id: addBranchId,
        vehicle_class: addVehicleClass,
        delivered_by: addDeliveredBy.trim(),
        same_as_customer: addSameAsCustomer,
        notes: addNotes.trim() || undefined,
        odometer_reading: parseInt(addOdometer, 10),
        vehicle_bay: addVehicleBay,
        lines: [
          ...draftPackageLines.map((line) => ({
            line_type: "package" as const,
            reference_id: line.package_item_id,
            quantity: line.quantity,
            vehicle_specific_components: {
              labor: line.vehicle_specific_labor_components.map((c) => ({
                labor_item_id: c.labor_item_id,
                quantity: c.quantity,
              })),
              inventory: line.vehicle_specific_inventory_components.map((c) => ({
                inventory_item_id: c.inventory_item_id,
                quantity: c.quantity,
              })),
            },
          })),
          ...draftLaborLines.map((line) => ({
            line_type: "labor" as const,
            reference_id: line.labor_item_id,
            quantity: line.quantity,
          })),
          ...draftInventoryLines.map((line) => ({
            line_type: "inventory" as const,
            reference_id: line.inventory_item_id,
            quantity: line.quantity,
          })),
        ],
      });

      // Create draft repairs if any
      if (draftRepairs.length > 0 && createdOrder?.id) {
        await Promise.all(
          draftRepairs.map((r) =>
            thirdPartyRepairsApi.create({
              job_order_id: createdOrder.id,
              provider_name: r.provider_name,
              description: r.description,
              cost: r.cost,
              repair_date: r.repair_date,
            })
          )
        );
      }

      setShowAddModal(false);
      showToast.success("Job order created successfully");
      fetchData();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to create job order");
      showToast.error(err instanceof Error ? err.message : "Failed to create job order");
    } finally {
      setAddingOrder(false);
    }
  }

  // --- View ---
  async function openViewModal(order: JobOrder) {
    // Show immediately with list data
    setViewOrder(order);
    setLoadingView(true);
    setShowViewModal(true);
    setRepairs([]);
    setLoadingRepairs(true);
    setHistory([]);
    setLoadingHistory(true);

    // Fetch each resource independently so one failure doesn't block the others
    const fullPromise = jobOrdersApi.getById(order.id)
      .then((full) => { setViewOrder(full); })
      .catch(() => { /* Keep showing list data */ })
      .finally(() => { setLoadingView(false); });

    const repairsPromise = thirdPartyRepairsApi.getAll({ job_order_id: order.id })
      .then((res) => { setRepairs(res.data); })
      .catch(() => { /* Repairs unavailable */ })
      .finally(() => { setLoadingRepairs(false); });

    const historyPromise = jobOrdersApi.getHistory(order.id)
      .then((res) => { setHistory(res); })
      .catch(() => { /* History unavailable */ })
      .finally(() => { setLoadingHistory(false); });

    await Promise.allSettled([fullPromise, repairsPromise, historyPromise]);
  }

  function openReworkModal(order: JobOrder) {
    const existingReworks = reworksByReference.get(order.id) || [];
    if (existingReworks.length > 0) {
      showToast.error("This job order already has a rework job order.");
      return;
    }

    setReworkSourceOrder(order);
    setReworkReason("");
    setReworkVehicleBay(order.vehicle_bay || "");
    setIsFreeRework(true);
    setReworkError(null);
    setShowReworkModal(true);
  }

  async function handleCreateRework() {
    if (!reworkSourceOrder) return;
    const existingReworks = reworksByReference.get(reworkSourceOrder.id) || [];
    if (existingReworks.length > 0) {
      setReworkError("This job order already has a rework job order.");
      return;
    }

    if (!reworkReason.trim()) {
      setReworkError("Rework reason is required");
      return;
    }

    try {
      setCreatingRework(true);
      setReworkError(null);
      await jobOrdersApi.createRework({
        reference_job_order_id: reworkSourceOrder.id,
        rework_reason: reworkReason.trim(),
        is_free_rework: isFreeRework,
        vehicle_bay: reworkVehicleBay || undefined,
      });
      setShowReworkModal(false);
      setReworkSourceOrder(null);
      showToast.success("Rework job order created and submitted for approval");
      fetchData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create rework job order";
      setReworkError(msg);
      showToast.error(msg);
    } finally {
      setCreatingRework(false);
    }
  }

  // --- Edit ---
  const isEditableStatus = (status: string) => status === "draft";

  function openEditModal(order: JobOrder) {
    setEditOrder(order);
    setEditNotes(order.notes || "");
    setEditError(null);
    setEditItems([]);
    setOrigEditItems([]);
    setEditDraftItems([]);
    setEditSelectedPackageId("");
    setEditSelectedLaborId("");
    setEditSelectedQty("1");
    setEditLinePackageLines([]);
    setEditLineLaborLines([]);
    setEditLineInventoryLines([]);
    setEditLineSelectedPackageId("");
    setEditLineSelectedLaborId("");
    setEditLineSelectedInventoryId("");
    setEditLineSelectedPackageQty("1");
    setEditLineSelectedLaborQty("1");
    setEditLineSelectedInventoryQty("1");
    setEditVehicleSpecificTypeByPackage({});
    setEditVehicleSpecificItemByPackage({});
    setShowEditModal(true);

    // If status allows item editing and user has package access, load items + package
    if (isEditableStatus(order.status) && canEditItems) {
      loadEditModalData(order);
    }
  }

  async function loadEditModalData(order: JobOrder) {
    setEditLoadingItems(true);
    try {
      const [fullOrder, catRes, laborRes, invRes] = await Promise.all([
        jobOrdersApi.getById(order.id),
        packagesApi.getAll({ limit: 1000 }),
        laborItemsApi.getAll({ limit: 1000, status: "active" }),
        inventoryApi.getAll({ limit: 1000, branch_id: order.branch_id, status: "active" }),
      ]);
      setEditOrder(fullOrder);
      const items = fullOrder.job_order_items || [];
      const packageItems = catRes.data;
      setEditPackageItems(packageItems);
      setEditLaborItems(laborRes.data);
      setEditInventoryItems(invRes.data);

      if (fullOrder.job_order_lines && fullOrder.job_order_lines.length > 0) {
        const packageLines: DraftPackageLine[] = [];
        const laborLines: DraftLaborLine[] = [];
        const inventoryLines: DraftInventoryLine[] = [];

        for (const line of fullOrder.job_order_lines) {
          if (line.line_type === "package") {
            const baseLabor = line.metadata?.base_components?.labor || [];
            const baseInventory = line.metadata?.base_components?.inventory || [];
            const vehicleSpecificLabor = line.metadata?.vehicle_specific_components?.labor || [];
            const vehicleSpecificInventory = line.metadata?.vehicle_specific_components?.inventory || [];

            packageLines.push({
              package_item_id: line.reference_id || "",
              package_item_name: line.name,
              quantity: line.quantity,
              unit_price: line.unit_price,
              total: line.total,
              base_labor_components: baseLabor.map((c) => ({
                labor_item_id: c.labor_item_id || "",
                labor_item_name: c.name,
                quantity: c.quantity,
                unit_price: c.unit_price,
              })),
              base_inventory_components: baseInventory.map((c) => ({
                inventory_item_id: c.inventory_item_id || "",
                inventory_item_name: c.name,
                quantity: c.quantity,
                unit_price: c.unit_price,
              })),
              vehicle_specific_labor_components: vehicleSpecificLabor.map((c) => ({
                labor_item_id: c.labor_item_id || "",
                labor_item_name: c.name,
                quantity: c.quantity,
                unit_price: c.unit_price,
              })),
              vehicle_specific_inventory_components: vehicleSpecificInventory.map((c) => ({
                inventory_item_id: c.inventory_item_id || "",
                inventory_item_name: c.name,
                quantity: c.quantity,
                unit_price: c.unit_price,
              })),
            });
          } else if (line.line_type === "labor") {
            laborLines.push({
              labor_item_id: line.reference_id || "",
              labor_item_name: line.name,
              quantity: line.quantity,
              unit_price: line.unit_price,
              total: line.total,
            });
          } else if (line.line_type === "inventory") {
            inventoryLines.push({
              inventory_item_id: line.reference_id || "",
              inventory_item_name: line.name,
              quantity: line.quantity,
              unit_price: line.unit_price,
              total: line.total,
            });
          }
        }

        setEditLinePackageLines(packageLines);
        setEditLineLaborLines(laborLines);
        setEditLineInventoryLines(inventoryLines);
      }

      // Augment existing items' inventories with available alternatives
      const augmentedItems = await Promise.all(
        items.map(async (item: JobOrderItem) => {
          const catItem = packageItems.find((c: PackageItem) => c.id === item.package_item_id);
          const invTypes = catItem?.inventory_types || [];
          if (invTypes.length === 0 || !item.job_order_item_inventories?.length) return item;

          // Fetch available items per category
          try {
            const catResults = await Promise.all(
              invTypes.map((t: string) =>
                inventoryApi.getAll({ category: t, branch_id: order.branch_id, status: "active", limit: 500 })
              )
            );
            const updatedInv = item.job_order_item_inventories.map((inv, idx) => {
              const categoryIdx = Math.min(idx, invTypes.length - 1);
              const availItems = (catResults[categoryIdx]?.data || []).map((it: InventoryItem) => ({
                id: it.id,
                item_name: it.item_name,
                cost_price: it.cost_price,
              }));
              return { ...inv, category: invTypes[categoryIdx], available_items: availItems };
            });
            return { ...item, job_order_item_inventories: updatedInv };
          } catch {
            return item;
          }
        })
      );

      setEditItems(augmentedItems);
      setOrigEditItems(augmentedItems);
    } catch {
      // Fail silently — items section won't populate
    } finally {
      setEditLoadingItems(false);
    }
  }

  function handleEditItemQtyChange(itemId: string, newQty: number) {
    if (newQty < 1) return;
    setEditItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const unitPrice = (item.labor_price || 0) + (item.inventory_cost || 0);
        return { ...item, quantity: newQty, line_total: unitPrice * newQty };
      })
    );
  }

  function handleEditInvQtyChange(itemId: string, inventoryItemId: string, newQty: number) {
    if (newQty < 0) return;
    setEditItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const updatedInv = (item.job_order_item_inventories || []).map((inv) =>
          inv.inventory_item_id === inventoryItemId
            ? { ...inv, quantity: newQty, line_total: newQty * inv.unit_cost }
            : inv
        );
        const newInvCost = updatedInv.reduce((sum, inv) => sum + inv.unit_cost * inv.quantity, 0);
        const newLineTotal = ((item.labor_price || 0) + newInvCost) * item.quantity;
        return { ...item, job_order_item_inventories: updatedInv, inventory_cost: newInvCost, line_total: newLineTotal };
      })
    );
  }

  function changeEditExistingInventoryItem(itemId: string, invIndex: number, newItemId: string) {
    setEditItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const updatedInv = (item.job_order_item_inventories || []).map((inv, idx) => {
          if (idx !== invIndex) return inv;
          const available = inv.available_items || [];
          const selected = available.find((a) => a.id === newItemId);
          if (!selected) return inv;
          return {
            ...inv,
            inventory_item_id: selected.id,
            inventory_item_name: selected.item_name,
            unit_cost: selected.cost_price,
            line_total: selected.cost_price * inv.quantity,
          };
        });
        const newInvCost = updatedInv.reduce((sum, inv) => sum + inv.unit_cost * inv.quantity, 0);
        const newLineTotal = ((item.labor_price || 0) + newInvCost) * item.quantity;
        return { ...item, job_order_item_inventories: updatedInv, inventory_cost: newInvCost, line_total: newLineTotal };
      })
    );
  }

  function handleRemoveEditItem(itemId: string) {
    if (editItems.length + editDraftItems.length <= 1) {
      setEditError("Job order must have at least 1 item");
      return;
    }
    setEditError(null);
    setEditItems((prev) => prev.filter((i) => i.id !== itemId));
  }

  async function handleAddEditDraftItem() {
    if (!editSelectedPackageId || !editSelectedLaborId || !editOrder) return;
    const qty = parseInt(editSelectedQty) || 1;

    // Check duplicates in both existing and draft
    if (
      editItems.some((i) => i.package_item_id === editSelectedPackageId) ||
      editDraftItems.some((d) => d.package_item_id === editSelectedPackageId)
    ) {
      setEditError("This item is already in the order");
      return;
    }

    try {
      setEditResolvingPrice(true);
      setEditError(null);

      const packageItem = editPackageItems.find((c) => c.id === editSelectedPackageId);
      if (!packageItem) {
        setEditError("Package item not found");
        return;
      }

      const laborItem = editLaborItems.find((l) => l.id === editSelectedLaborId);
      if (!laborItem) {
        setEditError("Labor item not found");
        return;
      }

      const vehicleClass = editOrder.vehicle_class || "light";
      const laborPrice = getLaborPriceByVehicleClass(laborItem, vehicleClass);

      // Fetch inventory based on Package item's inventory_types or legacy links
      let editInvQuantities: Array<{
        inventory_item_id: string;
        inventory_item_name: string;
        unit_cost: number;
        quantity: number;
        category?: string;
        available_items?: Array<{ id: string; item_name: string; cost_price: number }>;
      }> = [];

      const catItemData = editPackageItems.find((c) => c.id === packageItem.id);
      const invTypes = catItemData?.inventory_types || [];

      if (invTypes.length > 0) {
        // Category-based: fetch available items per required category
        try {
          const catResults = await Promise.all(
            invTypes.map((t) => inventoryApi.getAll({ category: t, branch_id: editOrder.branch_id, status: "active", limit: 500 }))
          );
          for (let i = 0; i < invTypes.length; i++) {
            const items = catResults[i]?.data || [];
            const availableItems = items.map((it) => ({ id: it.id, item_name: it.item_name, cost_price: it.cost_price }));
            if (items.length > 0) {
              editInvQuantities.push({
                inventory_item_id: items[0].id,
                inventory_item_name: items[0].item_name,
                unit_cost: items[0].cost_price,
                quantity: 1,
                category: invTypes[i],
                available_items: availableItems,
              });
            } else {
              editInvQuantities.push({
                inventory_item_id: "",
                inventory_item_name: `No ${invTypes[i]} items available`,
                unit_cost: 0,
                quantity: 1,
                category: invTypes[i],
                available_items: [],
              });
            }
          }
        } catch {
          // ignore
        }
      } else {
        // Legacy: use package_inventory_links template
        try {
          const linksRes = await packagesApi.getInventoryLinks(packageItem.id);
          if (linksRes && linksRes.length > 0) {
            editInvQuantities = linksRes.map((l: PackageInventoryItem) => ({
              inventory_item_id: l.inventory_items?.id || l.inventory_item_id,
              inventory_item_name: l.inventory_items?.item_name || "Unknown",
              unit_cost: l.inventory_items?.cost_price || 0,
              quantity: l.quantity || 1,
            }));
          }
        } catch {
          // ignore
        }
      }

      const editInvCost = editInvQuantities.reduce(
        (sum, iq) => sum + iq.unit_cost * iq.quantity,
        0
      );

      const lineTotal = (laborPrice + editInvCost) * qty;

      setEditDraftItems((prev) => [
        ...prev,
        {
          labor_item_id: laborItem.id,
          labor_item_name: laborItem.name,
          package_item_id: packageItem.id,
          package_item_name: packageItem.name,
          quantity: qty,
          labor_price: laborPrice,
          inventory_cost: editInvCost,
          line_total: lineTotal,
          inventory_quantities: editInvQuantities,
        },
      ]);
      setEditSelectedPackageId("");
      setEditSelectedLaborId("");
      setEditSelectedQty("1");
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to add item");
    } finally {
      setEditResolvingPrice(false);
    }
  }

  function handleRemoveEditDraftItem(packageItemId: string) {
    if (editItems.length + editDraftItems.length <= 1) {
      setEditError("Job order must have at least 1 item");
      return;
    }
    setEditError(null);
    setEditDraftItems((prev) => prev.filter((d) => d.package_item_id !== packageItemId));
  }

  function changeEditDraftInventoryItem(packageItemId: string, slotIndex: number, newItemId: string) {
    setEditDraftItems((prev) =>
      prev.map((item) => {
        if (item.package_item_id !== packageItemId) return item;
        const updatedInv = item.inventory_quantities.map((iq, idx) => {
          if (idx !== slotIndex) return iq;
          const available = iq.available_items || [];
          const selected = available.find((a) => a.id === newItemId);
          if (!selected) return iq;
          return {
            ...iq,
            inventory_item_id: selected.id,
            inventory_item_name: selected.item_name,
            unit_cost: selected.cost_price,
          };
        });
        const newInvCost = updatedInv.reduce((sum, iq) => sum + iq.unit_cost * iq.quantity, 0);
        return {
          ...item,
          inventory_quantities: updatedInv,
          inventory_cost: newInvCost,
          line_total: (item.labor_price + newInvCost) * item.quantity,
        };
      })
    );
  }

  async function handleAddEditLinePackage() {
    if (!editLineSelectedPackageId || !editOrder) return;
    const qty = parseInt(editLineSelectedPackageQty, 10) || 1;
    if (qty < 1) return;

    if (editLinePackageLines.some((d) => d.package_item_id === editLineSelectedPackageId)) {
      setEditError("This package is already in the order");
      return;
    }

    try {
      setEditResolvingPrice(true);
      setEditError(null);

      const packageItem = editPackageItems.find((p) => p.id === editLineSelectedPackageId);
      if (!packageItem) {
        setEditError("Package item not found");
        return;
      }

      const [pkgLaborLinks, pkgInventoryLinks] = await Promise.all([
        packagesApi.getLaborLinks(packageItem.id),
        packagesApi.getInventoryLinks(packageItem.id),
      ]);

      const vehicleClass = (editOrder.vehicle_class || "light") as VehicleClass;
      const baseLaborComponents = pkgLaborLinks.map((link) => {
        const name = link.labor_items?.name || "Unknown Labor";
        const unitPrice = link.labor_items
          ? getLaborPriceByVehicleClass(
              {
                id: link.labor_items.id,
                name,
                light_price: link.labor_items.light_price,
                heavy_price: link.labor_items.heavy_price,
                extra_heavy_price: link.labor_items.extra_heavy_price,
                status: (link.labor_items.status as "active" | "inactive") || "active",
                created_at: "",
              },
              vehicleClass
            )
          : 0;
        return {
          labor_item_id: link.labor_id,
          labor_item_name: name,
          quantity: link.quantity || 1,
          unit_price: unitPrice,
        };
      });

      const baseInventoryComponents = pkgInventoryLinks.map((link) => ({
        inventory_item_id: link.inventory_item_id,
        inventory_item_name: link.inventory_items?.item_name || "Unknown Inventory",
        quantity: link.quantity || 1,
        unit_price: link.inventory_items?.cost_price || 0,
      }));

      const line = recomputeDraftPackageLine({
        package_item_id: packageItem.id,
        package_item_name: packageItem.name,
        quantity: qty,
        unit_price: 0,
        total: 0,
        base_labor_components: baseLaborComponents,
        base_inventory_components: baseInventoryComponents,
        vehicle_specific_labor_components: [],
        vehicle_specific_inventory_components: [],
      });

      setEditLinePackageLines((prev) => [...prev, line]);
      setEditLineSelectedPackageId("");
      setEditLineSelectedPackageQty("1");
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to add package");
    } finally {
      setEditResolvingPrice(false);
    }
  }

  function handleRemoveEditLinePackage(packageItemId: string) {
    setEditLinePackageLines((prev) => prev.filter((line) => line.package_item_id !== packageItemId));
    setEditVehicleSpecificTypeByPackage((prev) => {
      const next = { ...prev };
      delete next[packageItemId];
      return next;
    });
    setEditVehicleSpecificItemByPackage((prev) => {
      const next = { ...prev };
      delete next[packageItemId];
      return next;
    });
  }

  function handleEditLinePackageQty(packageItemId: string, qty: number) {
    if (qty < 1) return;
    setEditLinePackageLines((prev) =>
      prev.map((line) =>
        line.package_item_id === packageItemId
          ? recomputeDraftPackageLine({ ...line, quantity: qty })
          : line
      )
    );
  }

  function handleAddEditVehicleSpecificLabor(packageItemId: string, laborItemId: string, qty = 1) {
    const laborItem = editLaborItems.find((l) => l.id === laborItemId);
    if (!laborItem || !editOrder) return;
    const vehicleClass = (editOrder.vehicle_class || "light") as VehicleClass;
    setEditLinePackageLines((prev) =>
      prev.map((line) => {
        if (line.package_item_id !== packageItemId) return line;
        const nextLine = {
          ...line,
          vehicle_specific_labor_components: [
            ...line.vehicle_specific_labor_components,
            {
              labor_item_id: laborItem.id,
              labor_item_name: laborItem.name,
              quantity: qty,
              unit_price: getLaborPriceByVehicleClass(laborItem, vehicleClass),
            },
          ],
        };
        return recomputeDraftPackageLine(nextLine);
      })
    );
  }

  function handleAddEditVehicleSpecificInventory(packageItemId: string, inventoryItemId: string, qty = 1) {
    const inventoryItem = editInventoryItems.find((i) => i.id === inventoryItemId);
    if (!inventoryItem) return;
    setEditLinePackageLines((prev) =>
      prev.map((line) => {
        if (line.package_item_id !== packageItemId) return line;
        const nextLine = {
          ...line,
          vehicle_specific_inventory_components: [
            ...line.vehicle_specific_inventory_components,
            {
              inventory_item_id: inventoryItem.id,
              inventory_item_name: inventoryItem.item_name,
              quantity: qty,
              unit_price: inventoryItem.cost_price || 0,
            },
          ],
        };
        return recomputeDraftPackageLine(nextLine);
      })
    );
  }

  function handleRemoveEditVehicleSpecificLabor(packageItemId: string, index: number) {
    setEditLinePackageLines((prev) =>
      prev.map((line) => {
        if (line.package_item_id !== packageItemId) return line;
        const nextLine = {
          ...line,
          vehicle_specific_labor_components: line.vehicle_specific_labor_components.filter((_, idx) => idx !== index),
        };
        return recomputeDraftPackageLine(nextLine);
      })
    );
  }

  function handleRemoveEditVehicleSpecificInventory(packageItemId: string, index: number) {
    setEditLinePackageLines((prev) =>
      prev.map((line) => {
        if (line.package_item_id !== packageItemId) return line;
        const nextLine = {
          ...line,
          vehicle_specific_inventory_components: line.vehicle_specific_inventory_components.filter((_, idx) => idx !== index),
        };
        return recomputeDraftPackageLine(nextLine);
      })
    );
  }

  function handleEditVehicleSpecificTypeChange(packageItemId: string, type: "labor" | "inventory" | "") {
    setEditVehicleSpecificTypeByPackage((prev) => ({
      ...prev,
      [packageItemId]: type,
    }));
    setEditVehicleSpecificItemByPackage((prev) => ({
      ...prev,
      [packageItemId]: "",
    }));
  }

  function handleEditVehicleSpecificItemChange(packageItemId: string, itemId: string) {
    setEditVehicleSpecificItemByPackage((prev) => ({
      ...prev,
      [packageItemId]: itemId,
    }));
  }

  function handleAddEditVehicleSpecificComponent(packageItemId: string) {
    const selectedType = editVehicleSpecificTypeByPackage[packageItemId] || "";
    const selectedItemId = editVehicleSpecificItemByPackage[packageItemId] || "";

    if (!selectedType || !selectedItemId) return;

    if (selectedType === "labor") {
      handleAddEditVehicleSpecificLabor(packageItemId, selectedItemId, 1);
    } else {
      handleAddEditVehicleSpecificInventory(packageItemId, selectedItemId, 1);
    }

    setEditVehicleSpecificItemByPackage((prev) => ({
      ...prev,
      [packageItemId]: "",
    }));
  }

  function handleAddEditLineLabor() {
    if (!editLineSelectedLaborId || !editOrder) return;
    const qty = parseInt(editLineSelectedLaborQty, 10) || 1;
    if (qty < 1) return;
    const laborItem = editLaborItems.find((l) => l.id === editLineSelectedLaborId);
    if (!laborItem) return;

    setEditLineLaborLines((prev) => [
      ...prev,
      {
        labor_item_id: laborItem.id,
        labor_item_name: laborItem.name,
        quantity: qty,
        unit_price: getLaborPriceByVehicleClass(laborItem, (editOrder.vehicle_class || "light") as VehicleClass),
        total: getLaborPriceByVehicleClass(laborItem, (editOrder.vehicle_class || "light") as VehicleClass) * qty,
      },
    ]);
    setEditLineSelectedLaborId("");
    setEditLineSelectedLaborQty("1");
  }

  function handleRemoveEditLineLabor(index: number) {
    setEditLineLaborLines((prev) => prev.filter((_, idx) => idx !== index));
  }

  function handleAddEditLineInventory() {
    if (!editLineSelectedInventoryId) return;
    const qty = parseInt(editLineSelectedInventoryQty, 10) || 1;
    if (qty < 1) return;
    const invItem = editInventoryItems.find((i) => i.id === editLineSelectedInventoryId);
    if (!invItem) return;

    setEditLineInventoryLines((prev) => [
      ...prev,
      {
        inventory_item_id: invItem.id,
        inventory_item_name: invItem.item_name,
        quantity: qty,
        unit_price: invItem.cost_price || 0,
        total: (invItem.cost_price || 0) * qty,
      },
    ]);
    setEditLineSelectedInventoryId("");
    setEditLineSelectedInventoryQty("1");
  }

  function handleRemoveEditLineInventory(index: number) {
    setEditLineInventoryLines((prev) => prev.filter((_, idx) => idx !== index));
  }

  async function handleEditOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!editOrder) return;
    setEditError(null);

    const hasLineBasedItems = (editOrder.job_order_lines?.length || 0) > 0;
    const canEditItems = isEditableStatus(editOrder.status) && !hasLineBasedItems;
    const canEditLineItems = isEditableStatus(editOrder.status) && hasLineBasedItems;

    // Validate: must have at least 1 item
    if (canEditItems && editItems.length + editDraftItems.length === 0) {
      setEditError("Job order must have at least 1 item");
      return;
    }
    if (canEditLineItems && editLinePackageLines.length + editLineLaborLines.length + editLineInventoryLines.length === 0) {
      setEditError("Job order must have at least 1 line item");
      return;
    }

    try {
      setEditingOrder(true);

      if (hasLineBasedItems) {
        const linesPayload = [
          ...editLinePackageLines.map((line) => ({
            line_type: "package" as const,
            reference_id: line.package_item_id,
            quantity: line.quantity,
            vehicle_specific_components: {
              labor: line.vehicle_specific_labor_components.map((c) => ({
                labor_item_id: c.labor_item_id,
                quantity: c.quantity,
              })),
              inventory: line.vehicle_specific_inventory_components.map((c) => ({
                inventory_item_id: c.inventory_item_id,
                quantity: c.quantity,
              })),
            },
          })),
          ...editLineLaborLines.map((line) => ({
            line_type: "labor" as const,
            reference_id: line.labor_item_id,
            quantity: line.quantity,
          })),
          ...editLineInventoryLines.map((line) => ({
            line_type: "inventory" as const,
            reference_id: line.inventory_item_id,
            quantity: line.quantity,
          })),
        ];

        await jobOrdersApi.patch(editOrder.id, {
          notes: editNotes.trim() || null,
          lines: linesPayload,
        });

        setShowEditModal(false);
        setEditOrder(null);
        showToast.success("Job order updated successfully");
        fetchData();
        return;
      }

      // Save notes
      await jobOrdersApi.update(editOrder.id, { notes: editNotes.trim() || null });

      // Process item changes if status allows
      if (canEditItems) {
        // Find removed items
        const currentIds = new Set(editItems.map((i) => i.id));
        const removedItems = origEditItems.filter((i) => !currentIds.has(i.id));

        // Find updated items (qty or inventory changed)
        const updatedItems = editItems.filter((item) => {
          const orig = origEditItems.find((o) => o.id === item.id);
          if (!orig) return false;
          if (orig.quantity !== item.quantity) return true;
          // Check if any inventory snapshot quantity changed
          const origSnaps = orig.job_order_item_inventories || [];
          const newSnaps = item.job_order_item_inventories || [];
          return newSnaps.some((snap) => {
            const origSnap = origSnaps.find((s) => s.inventory_item_id === snap.inventory_item_id);
            return origSnap && origSnap.quantity !== snap.quantity;
          });
        });

        // Process removals
        for (const item of removedItems) {
          await jobOrdersApi.removeItem(editOrder.id, item.id);
        }

        // Process updates
        for (const item of updatedItems) {
          const invQuantities = (item.job_order_item_inventories || []).map((inv) => ({
            inventory_item_id: inv.inventory_item_id,
            quantity: inv.quantity,
          }));
          await jobOrdersApi.updateItem(editOrder.id, item.id, {
            quantity: item.quantity,
            inventory_quantities: invQuantities.length > 0 ? invQuantities : undefined,
          });
        }

        // Process new items
        for (const draft of editDraftItems) {
          await jobOrdersApi.addItem(editOrder.id, {
            package_item_id: draft.package_item_id,
            labor_item_id: draft.labor_item_id,
            quantity: draft.quantity,
            inventory_quantities: draft.inventory_quantities.map((iq) => ({
              inventory_item_id: iq.inventory_item_id,
              quantity: iq.quantity,
            })),
          });
        }
      }

      setShowEditModal(false);
      setEditOrder(null);
      showToast.success("Job order updated successfully");
      fetchData();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update job order");
      showToast.error(err instanceof Error ? err.message : "Failed to update job order");
    } finally {
      setEditingOrder(false);
    }
  }

  // --- Delete ---
  function openDeleteConfirmModal(order: JobOrder) {
    setOrderToDelete(order);
    // Draft orders will be hard deleted, non-draft will be deactivated
    setOrderHasReferences(order.status !== "draft");
    setShowDeleteConfirm(true);
  }

  async function handleDeleteOrder() {
    if (!orderToDelete) return;
    try {
      setDeletingOrder(true);
      const result = await jobOrdersApi.delete(orderToDelete.id);
      setShowDeleteConfirm(false);
      setOrderToDelete(null);
      const isDeactivated = result.message?.toLowerCase().includes("deactivated");
      showToast.success(isDeactivated ? "Job order deactivated successfully" : "Job order deleted successfully");
      fetchData();
    } catch (err) {
      const failMsg = orderHasReferences ? "Failed to deactivate job order" : "Failed to delete job order";
      setError(err instanceof Error ? err.message : failMsg);
      showToast.error(err instanceof Error ? err.message : failMsg);
    } finally {
      setDeletingOrder(false);
    }
  }

  async function handleRestoreOrder(order: JobOrder) {
    try {
      const result = await jobOrdersApi.restore(order.id);
      showToast.success(result.message || "Job order restored successfully");
      fetchData();
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : "Failed to restore job order");
    }
  }

  // --- Cancel ---
  async function handleCancelOrder(order: JobOrder) {
    if (!reasonText.trim()) {
      showToast.error("Please provide a cancellation reason");
      return;
    }
    try {
      setProcessingCancel(true);
      await jobOrdersApi.cancel(order.id, { cancellation_reason: reasonText.trim() });
      showToast.success("Job order cancelled");
      setShowCancelConfirm(false);
      setShowReasonModal(false);
      setOrderToCancel(null);
      setReasonText("");
      setShowViewModal(false);
      setViewOrder(null);
      fetchData();
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : "Failed to cancel job order");
    } finally {
      setProcessingCancel(false);
    }
  }

  // --- Open JO History from card/dropdown ---
  function openHistoryFromCard(order: JobOrder) {
    setViewOrder(order);
    setHistory([]);
    setLoadingHistory(true);
    setShowHistoryModal(true);
    jobOrdersApi.getHistory(order.id)
      .then((res) => { setHistory(res); })
      .catch(() => { })
      .finally(() => { setLoadingHistory(false); });
  }

  // --- Open Cancel Confirmation from card/dropdown ---
  function openCancelConfirmModal(order: JobOrder) {
    setOrderToCancel(order);
    setReasonText("");
    setShowCancelConfirm(true);
  }

  // --- Open Approval Modal from card/dropdown ---
  function openApprovalModal(order: JobOrder) {
    setApprovalOrder(order);
    setShowApprovalModal(true);
  }

  // --- Open Payment Modal from card/dropdown ---
  function openPaymentModal(order: JobOrder) {
    setPaymentOrder(order);
    setShowPaymentModal(true);
  }

  function openCompleteModal(order: JobOrder) {
    setCompleteOrder(order);
    setCompletePickedUpBy(order.picked_up_by || "");
    setCompleteError(null);
    setShowCompleteModal(true);
  }

  // --- Open Payment Details Modal from card/dropdown ---
  function openPaymentDetailsModal(order: JobOrder) {
    setPaymentDetailsOrder(order);
    setPaymentInvoiceNumber(order.invoice_number || "");
    setPaymentReference(order.payment_reference || "");
    setPaymentMode((order.payment_mode as "cash" | "gcash" | "other") || "cash");
    setShowPaymentDetailsModal(true);
  }

  // --- Repair Action Modal (wrench button) ---
  async function openRepairActionModal(order: JobOrder) {
    setRepairActionOrder(order);
    setActionRepairs([]);
    setLoadingActionRepairs(true);
    setActionRepairProvider("");
    setActionRepairDescription("");
    setActionRepairCost("");
    setActionRepairDate(new Date().toISOString().split("T")[0]);
    setActionRepairError(null);
    setEditingActionRepairId(null);
    setShowRepairActionModal(true);

    try {
      const res = await thirdPartyRepairsApi.getAll({ job_order_id: order.id });
      setActionRepairs(res.data);
      setOriginalActionRepairs(res.data);
    } catch {
      setActionRepairError("Failed to load repairs");
    } finally {
      setLoadingActionRepairs(false);
    }
  }

  // Add/edit repair locally (staged, not yet saved)
  function handleActionAddRepair() {
    if (!repairActionOrder) return;
    setActionRepairError(null);

    if (!actionRepairProvider.trim()) { setActionRepairError("Provider name is required"); return; }
    if (!actionRepairDescription.trim()) { setActionRepairError("Description is required"); return; }
    if (!actionRepairCost || isNaN(Number(actionRepairCost)) || Number(actionRepairCost) < 0) {
      setActionRepairError("Valid cost is required"); return;
    }
    if (!actionRepairDate) { setActionRepairError("Repair date is required"); return; }

    if (editingActionRepairId) {
      // Update locally
      setActionRepairs((prev) =>
        prev.map((r) =>
          r.id === editingActionRepairId
            ? {
              ...r,
              provider_name: actionRepairProvider.trim(),
              description: actionRepairDescription.trim(),
              cost: Number(actionRepairCost),
              repair_date: actionRepairDate,
            }
            : r
        )
      );
      setEditingActionRepairId(null);
    } else {
      // Add locally with temp ID
      const tempRepair: ThirdPartyRepair = {
        id: `new-${crypto.randomUUID()}`,
        job_order_id: repairActionOrder.id,
        provider_name: actionRepairProvider.trim(),
        description: actionRepairDescription.trim(),
        cost: Number(actionRepairCost),
        repair_date: actionRepairDate,
        notes: null,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setActionRepairs((prev) => [...prev, tempRepair]);
    }

    setActionRepairProvider("");
    setActionRepairDescription("");
    setActionRepairCost("");
    setActionRepairDate(new Date().toISOString().split("T")[0]);
  }

  function startEditActionRepair(repair: ThirdPartyRepair) {
    setEditingActionRepairId(repair.id);
    setActionRepairProvider(repair.provider_name);
    setActionRepairDescription(repair.description);
    setActionRepairCost(String(repair.cost));
    setActionRepairDate(repair.repair_date);
    setActionRepairError(null);
  }

  function cancelEditActionRepair() {
    setEditingActionRepairId(null);
    setActionRepairProvider("");
    setActionRepairDescription("");
    setActionRepairCost("");
    setActionRepairDate(new Date().toISOString().split("T")[0]);
    setActionRepairError(null);
  }

  // Delete repair locally (staged)
  function handleActionDeleteRepair(repairId: string) {
    setActionRepairs((prev) => prev.filter((r) => r.id !== repairId));
  }

  // Save all changes (diff original vs current, call APIs)
  async function handleSaveActionRepairs() {
    if (!repairActionOrder) return;
    setSavingActionRepairs(true);
    setActionRepairError(null);

    try {
      const originalIds = new Set(originalActionRepairs.map((r) => r.id));
      const currentIds = new Set(actionRepairs.map((r) => r.id));

      // Deleted: in original but not in current
      const toDelete = originalActionRepairs.filter((r) => !currentIds.has(r.id));

      // New: IDs starting with "new-"
      const toCreate = actionRepairs.filter((r) => r.id.startsWith("new-"));

      // Updated: in both, but fields differ
      const toUpdate = actionRepairs.filter((r) => {
        if (r.id.startsWith("new-")) return false;
        if (!originalIds.has(r.id)) return false;
        const orig = originalActionRepairs.find((o) => o.id === r.id);
        if (!orig) return false;
        return (
          orig.provider_name !== r.provider_name ||
          orig.description !== r.description ||
          orig.cost !== r.cost ||
          orig.repair_date !== r.repair_date
        );
      });

      await Promise.all([
        ...toDelete.map((r) => thirdPartyRepairsApi.delete(r.id)),
        ...toCreate.map((r) =>
          thirdPartyRepairsApi.create({
            job_order_id: repairActionOrder.id,
            provider_name: r.provider_name,
            description: r.description,
            cost: r.cost,
            repair_date: r.repair_date,
          })
        ),
        ...toUpdate.map((r) =>
          thirdPartyRepairsApi.update(r.id, {
            provider_name: r.provider_name,
            description: r.description,
            cost: r.cost,
            repair_date: r.repair_date,
          })
        ),
      ]);

      setShowRepairActionModal(false);
      setRepairActionOrder(null);
      showToast.success("Repairs saved successfully");
      fetchData();
    } catch (err) {
      setActionRepairError(err instanceof Error ? err.message : "Failed to save repairs");
    } finally {
      setSavingActionRepairs(false);
    }
  }

  if (loading) {
    return <SkeletonLoader showHeader rows={6} variant="grid" />;
  }

  if (error && allOrders.length === 0) {
    return <ErrorAlert message={error} onRetry={fetchData} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Job Orders"
        subtitle={`${allOrders.length} orders total`}
        buttonLabel={canCreate ? "Create Job Order" : undefined}
        onAdd={canCreate ? openAddModal : undefined}
      />

      {/* Search & Filter bar */}
      {allOrders.length > 0 && (
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

      {/* Order Cards Grid */}
      <CardGrid
        isEmpty={paginatedItems.length === 0}
        emptyMessage={
          searchQuery
            ? "No job orders match your search."
            : 'No job orders found. Click "Create Job Order" to create one.'
        }
      >
        {paginatedItems.map((order) => {
          const referenceOrderNumber = order.reference_job_order_id
            ? orderNumberById.get(order.reference_job_order_id)
            : null;
          const relatedReworks = reworksByReference.get(order.id) || [];
          const hasExistingRework = relatedReworks.length > 0;

          return (
          <GridCard
            key={order.id}
            onClick={() => openViewModal(order)}
            icon={<LuClipboardList className="w-5 h-5 text-primary" />}
            title={`Job - ${order.order_number}`}
            subtitle={
              order.job_type === "backorder" ? (
                <span className="text-xs font-semibold bg-secondary-100 text-secondary-950 px-2 py-0.5 rounded">
                  BACKORDER
                </span>
              ) : order.branches ? (
                <span className="text-xs font-mono bg-neutral-100 text-primary px-2 py-0.5 rounded">
                  {order.branches.code}
                </span>
              ) : undefined
            }
            statusBadge={{
              label: getStatusLabel(order.status),
              className: getStatusColors(order.status),
            }}
            details={
              <>
                <p className="text-neutral-900">{formatPrice(computeOrderGrandTotal(order))}</p>
                <p className="text-neutral-900">{order.vehicles ? `${order.vehicles.plate_number} ${order.vehicles.model}` : "—"}</p>
                <p className="text-neutral-900">{order.customers?.full_name || "—"}</p>
                <p className="text-neutral-900">
                  {order.job_type === "backorder"
                    ? `Rework of ${referenceOrderNumber || "Unknown"}`
                    : relatedReworks.length > 0
                      ? `Reworks: ${relatedReworks.length}`
                      : formatDate(order.created_at)}
                </p>
              </>
            }
            actions={[
              ...(order.status !== "deactivated" && canUpdate ? [{
                label: "Edit",
                icon: <LuPencil className="w-4 h-4" />,
                onClick: (e: React.MouseEvent) => { e.stopPropagation(); openEditModal(order); },
              }] : []),
              ...(order.status !== "deactivated" && canDelete ? [{
                label: "Delete",
                icon: <LuTrash2 className="w-4 h-4" />,
                onClick: (e: React.MouseEvent) => { e.stopPropagation(); openDeleteConfirmModal(order); },
                className: "flex items-center gap-1 text-sm text-negative hover:text-negative-900",
              }] : []),
            ]}
            extraActions={
              <div className="relative flex items-center gap-2" ref={openDropdownId === `card-${order.id}` ? dropdownRef : undefined}>
                {canDelete && order.status === "deactivated" && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      await handleRestoreOrder(order);
                    }}
                    className="inline-flex items-center gap-1 text-sm text-positive hover:text-positive-950"
                    title="Restore job order"
                  >
                    <LuRefreshCw className="w-4 h-4" /> Restore
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); setOpenDropdownId(openDropdownId === `card-${order.id}` ? null : `card-${order.id}`); }}
                  className="inline-flex items-center gap-1 text-sm text-neutral-950 hover:text-neutral-900"
                  title="More actions"
                >
                  <LuEllipsisVertical className="w-4 h-4" /> More
                </button>
                {openDropdownId === `card-${order.id}` && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg border border-neutral-200 py-2 z-50">
                    <button
                      onClick={(e) => { e.stopPropagation(); closeDropdown(); openHistoryFromCard(order); }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors"
                    >
                      <LuHistory className="w-4 h-4" /> Job Order History
                    </button>
                    {((order.job_type !== "backorder" && canApproval && (order.status === "draft" || order.status === "pending_approval")) ||
                      (order.job_type === "backorder" && canApproveRework && order.status === "pending_approval")) && (
                      <button
                        onClick={(e) => { e.stopPropagation(); closeDropdown(); openApprovalModal(order); }}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors"
                      >
                        <LuSend className="w-4 h-4" /> {order.job_type === "backorder" ? "Rework Approval" : "Customer Approval"}
                      </button>
                    )}
                    {canApproval && (order.status === "draft" || order.status === "pending_approval") && (
                      <button
                        onClick={(e) => { e.stopPropagation(); closeDropdown(); openCancelConfirmModal(order); }}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors"
                      >
                        <LuBan className="w-4 h-4" /> Cancel Job Order
                      </button>
                    )}
                    {canStartWork && order.status === "approved" && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation(); closeDropdown();
                          try {
                            await jobOrdersApi.startWork(order.id);
                            showToast.success("Work started — status changed to In Progress");
                            fetchData();
                          } catch (err) {
                            showToast.error(err instanceof Error ? err.message : "Failed to start work");
                          }
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors"
                      >
                        <LuPlay className="w-4 h-4" /> Start Work
                      </button>
                    )}
                    {canMarkReady && order.status === "in_progress" && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation(); closeDropdown();
                          try {
                            await jobOrdersApi.markReady(order.id);
                            showToast.success("Marked ready for release");
                            fetchData();
                          } catch (err) {
                            showToast.error(err instanceof Error ? err.message : "Failed to mark ready");
                          }
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors"
                      >
                        <LuPackageCheck className="w-4 h-4" /> Mark Ready
                      </button>
                    )}
                    {canPayment && order.status === "ready_for_release" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); closeDropdown(); openPaymentModal(order); }}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors"
                      >
                        <LuCreditCard className="w-4 h-4" /> Record Payment
                      </button>
                    )}
                    {canComplete && order.status === "pending_payment" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          closeDropdown();
                          openCompleteModal(order);
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors"
                      >
                        <LuCircleCheck className="w-4 h-4" /> Complete
                      </button>
                    )}
                    {canRepair && order.status === "draft" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); closeDropdown(); openRepairActionModal(order); }}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors"
                      >
                        <LuWrench className="w-4 h-4" /> Manage Repairs
                      </button>
                    )}
                    {canCreate && order.status === "completed" && order.job_type !== "backorder" && !hasExistingRework && (
                      <button
                        onClick={(e) => { e.stopPropagation(); closeDropdown(); openReworkModal(order); }}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors"
                      >
                        <LuRefreshCw className="w-4 h-4" /> Rework Job
                      </button>
                    )}
                    {canPayment && (
                      <button
                        onClick={(e) => { e.stopPropagation(); closeDropdown(); openPaymentDetailsModal(order); }}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors"
                      >
                        <LuFileText className="w-4 h-4" /> Payment Method
                      </button>
                    )}
                  </div>
                )}
              </div>
            }
          />
          );
        })}
      </CardGrid>

      {/* Pagination */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        variant="card"
      />

      {/* --- Create Job Order Modal --- */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Create Job Order"
        maxWidth="lg"
      >
        <form onSubmit={handleCreateOrder}>
          <ModalSection title="Order Details">
            <ModalSelect
              value={addBranchId}
              onChange={handleBranchChange}
              placeholder="Select Branch *"
              options={branchOptions}
            />
            <ModalSelect
              value={addCustomerId}
              onChange={handleCustomerChange}
              placeholder={loadingLookups ? "Loading customers..." : "Select Customer *"}
              options={customerOptions}
              disabled={loadingLookups || !addBranchId}
            />
            <ModalSelect
              value={addVehicleId}
              onChange={handleVehicleChange}
              placeholder={loadingLookups ? "Loading vehicles..." : "Select Vehicle *"}
              options={vehicleOptions}
              disabled={loadingLookups || !addCustomerId}
            />
            <ModalInput
              type="text"
              value={addVehicleClass === "light" ? "Light Vehicle" : addVehicleClass === "heavy" ? "Heavy Vehicle" : addVehicleClass === "extra_heavy" ? "Extra Heavy Vehicle" : "Light Vehicle"}
              onChange={() => {}}
              placeholder="Vehicle Class"
              disabled
            />
            <textarea
              value={addNotes}
              onChange={(e) => setAddNotes(e.target.value)}
              placeholder="Notes (optional)"
              rows={3}
              className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
            />
            <div className="grid grid-cols-2 gap-4">
              <ModalInput
                type="number"
                value={addOdometer}
                onChange={setAddOdometer}
                placeholder="Odometer Reading (km) *"
                required
              />
              <ModalSelect
                value={addVehicleBay}
                onChange={setAddVehicleBay}
                placeholder="Vehicle Bay *"
                options={[
                  { value: "bay1", label: "Bay 1" },
                  { value: "bay2", label: "Bay 2" },
                ]}
              />
            </div>
          </ModalSection>

          <ModalSection title="Delivered & Pickup">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setAddSameAsCustomer((prev) => {
                    const next = !prev;
                    if (next) {
                      setAddDeliveredBy(selectedAddCustomer?.full_name || "");
                    }
                    return next;
                  });
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${addSameAsCustomer ? "bg-primary" : "bg-neutral-200"}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${addSameAsCustomer ? "translate-x-6" : "translate-x-1"}`}
                />
              </button>
              <span className="text-sm text-neutral-900">Same as Customer</span>
            </div>
            <ModalInput
              type="text"
              value={addDeliveredBy}
              onChange={setAddDeliveredBy}
              placeholder="Delivered By *"
              required
              disabled={addSameAsCustomer}
            />
            <ModalInput
              type="text"
              value=""
              onChange={() => {}}
              placeholder="Picked Up By (set on completion)"
              disabled
            />
          </ModalSection>

          <ModalSection title="Packages">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <ModalSelect
                  value={selectedPackageItemId}
                  onChange={setSelectedPackageItemId}
                  placeholder={loadingLookups ? "Loading..." : "Select package..."}
                  options={packageItemOptions}
                  disabled={loadingLookups || !addBranchId}
                />
              </div>
              <div className="w-20">
                <ModalInput type="number" value={selectedPackageQty} onChange={setSelectedPackageQty} placeholder="Qty" />
              </div>
              <button
                type="button"
                onClick={handleAddDraftPackageLine}
                disabled={!selectedPackageItemId || resolvingPrice}
                className="px-4.5 py-4.5 bg-primary text-white rounded-xl hover:bg-primary-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                {resolvingPrice ? <LuRefreshCw className="w-4 h-4 animate-spin" /> : <LuPlus className="w-4 h-4" />}
              </button>
            </div>

            {draftPackageLines.length > 0 && (
              <div className="mt-3 space-y-3">
                {draftPackageLines.map((line) => (
                  <div key={line.package_item_id} className="bg-neutral-100 rounded-xl p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-neutral-950 text-sm truncate">{line.package_item_name}</p>
                        <p className="text-xs text-neutral-900">Package total: {formatPrice(line.total)}</p>
                      </div>
                      <input
                        type="number"
                        min={1}
                        value={line.quantity}
                        onChange={(e) => handleUpdateDraftPackageQty(line.package_item_id, parseInt(e.target.value, 10) || 1)}
                        className="w-14 px-2 py-1 bg-white rounded text-xs text-center text-neutral-950 focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button type="button" onClick={() => handleRemoveDraftPackageLine(line.package_item_id)} className="text-negative hover:text-negative-900 p-1">
                        <LuX className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="mt-2 border-t border-neutral-200 pt-2 space-y-2">
                      <p className="text-xs font-semibold text-primary uppercase">Base Components</p>
                      <div>
                        <p className="text-[11px] font-semibold text-neutral-900 uppercase">Labor</p>
                        {line.base_labor_components.length > 0 ? line.base_labor_components.map((c, idx) => (
                          <div key={`base-labor-${idx}`} className="flex justify-between text-xs text-neutral-900">
                            <span>{c.labor_item_name}</span>
                            <span>{formatPrice(c.unit_price * c.quantity)}</span>
                          </div>
                        )) : <p className="text-xs text-neutral-900">None</p>}
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold text-neutral-900 uppercase">Inventory</p>
                        {line.base_inventory_components.length > 0 ? line.base_inventory_components.map((c, idx) => (
                          <div key={`base-inv-${idx}`} className="flex justify-between text-xs text-neutral-900">
                            <span>{c.inventory_item_name}</span>
                            <span>{formatPrice(c.unit_price * c.quantity)}</span>
                          </div>
                        )) : <p className="text-xs text-neutral-900">None</p>}
                      </div>
                    </div>

                    <div className="mt-2 border-t border-neutral-200 pt-2 space-y-2">
                      <p className="text-xs font-semibold text-primary uppercase">Vehicle-Specific Components - {addVehicleClass.replace("_", " ")}</p>
                      <div>
                        <p className="text-[11px] font-semibold text-neutral-900 uppercase">Labor</p>
                        {line.vehicle_specific_labor_components.length > 0 ? line.vehicle_specific_labor_components.map((c, idx) => (
                          <div key={`extra-labor-${idx}`} className="flex items-center justify-between gap-2 text-xs text-neutral-900">
                            <span className="flex-1 truncate">{c.labor_item_name}</span>
                            <span>{formatPrice(c.unit_price * c.quantity)}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveVehicleSpecificLabor(line.package_item_id, idx)}
                              className="text-negative hover:text-negative-900 p-0.5"
                              title="Remove item"
                            >
                              <LuX className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )) : <p className="text-xs text-neutral-900">None</p>}
                      </div>

                      <div>
                        <p className="text-[11px] font-semibold text-neutral-900 uppercase">Inventory</p>
                        {line.vehicle_specific_inventory_components.length > 0 ? line.vehicle_specific_inventory_components.map((c, idx) => (
                          <div key={`extra-inv-${idx}`} className="flex items-center justify-between gap-2 text-xs text-neutral-900">
                            <span className="flex-1 truncate">{c.inventory_item_name}</span>
                            <span>{formatPrice(c.unit_price * c.quantity)}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveVehicleSpecificInventory(line.package_item_id, idx)}
                              className="text-negative hover:text-negative-900 p-0.5"
                              title="Remove item"
                            >
                              <LuX className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )) : <p className="text-xs text-neutral-900">None</p>}
                      </div>

                      <div className="flex gap-2 items-end pt-1">
                        <div className="w-40">
                          <ModalSelect
                            value={vehicleSpecificTypeByPackage[line.package_item_id] || ""}
                            onChange={(value) =>
                              handleVehicleSpecificTypeChange(
                                line.package_item_id,
                                value === "labor" || value === "inventory" ? value : ""
                              )
                            }
                            placeholder="Type..."
                            options={[
                              { value: "labor", label: "Labor" },
                              { value: "inventory", label: "Inventory" },
                            ]}
                            className="bg-white"
                          />
                        </div>
                        <div className="flex-1">
                          <ModalSelect
                            value={vehicleSpecificItemByPackage[line.package_item_id] || ""}
                            onChange={(value) => handleVehicleSpecificItemChange(line.package_item_id, value)}
                            placeholder={
                              (vehicleSpecificTypeByPackage[line.package_item_id] || "") === "labor"
                                ? "Select labor..."
                                : (vehicleSpecificTypeByPackage[line.package_item_id] || "") === "inventory"
                                  ? "Select inventory..."
                                  : "Select item..."
                            }
                            options={
                              (vehicleSpecificTypeByPackage[line.package_item_id] || "") === "labor"
                                ? laborItemOptions
                                : (vehicleSpecificTypeByPackage[line.package_item_id] || "") === "inventory"
                                  ? inventoryItemOptions
                                  : []
                            }
                            disabled={!(vehicleSpecificTypeByPackage[line.package_item_id] || "")}
                            className="bg-white"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAddVehicleSpecificComponent(line.package_item_id)}
                          disabled={!(vehicleSpecificTypeByPackage[line.package_item_id] || "") || !(vehicleSpecificItemByPackage[line.package_item_id] || "")}
                          className="px-4.5 py-4.5 bg-primary text-white rounded-xl hover:bg-primary-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                        >
                          <LuPlus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ModalSection>

          <ModalSection title="Labor">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <ModalSelect value={selectedLaborItemId} onChange={setSelectedLaborItemId} placeholder="Select labor..." options={laborItemOptions} />
              </div>
              <div className="w-20">
                <ModalInput type="number" value={selectedLaborQty} onChange={setSelectedLaborQty} placeholder="Qty" />
              </div>
              <button type="button" onClick={handleAddDraftLaborLine} className="px-4.5 py-4.5 bg-primary text-white rounded-xl hover:bg-primary-950 transition-colors shrink-0">
                <LuPlus className="w-4 h-4" />
              </button>
            </div>
            {draftLaborLines.length > 0 && (
              <div className="mt-3 space-y-2">
                {draftLaborLines.map((line, idx) => (
                  <div key={`${line.labor_item_id}-${idx}`} className="flex items-center justify-between bg-neutral-100 rounded-xl px-4 py-3">
                    <div>
                      <p className="font-medium text-neutral-950 text-sm">{line.labor_item_name}</p>
                      <p className="text-xs text-neutral-900">Quantity: {line.quantity}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-neutral-950 text-sm">{formatPrice(line.total)}</span>
                      <button type="button" onClick={() => handleRemoveDraftLaborLine(line.labor_item_id, idx)} className="text-negative hover:text-negative-900 p-1">
                        <LuX className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ModalSection>

          <ModalSection title="Inventory">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <ModalSelect value={selectedInventoryItemId} onChange={setSelectedInventoryItemId} placeholder="Select inventory..." options={inventoryItemOptions} />
              </div>
              <div className="w-20">
                <ModalInput type="number" value={selectedInventoryQty} onChange={setSelectedInventoryQty} placeholder="Qty" />
              </div>
              <button type="button" onClick={handleAddDraftInventoryLine} className="px-4.5 py-4.5 bg-primary text-white rounded-xl hover:bg-primary-950 transition-colors shrink-0">
                <LuPlus className="w-4 h-4" />
              </button>
            </div>
            {draftInventoryLines.length > 0 && (
              <div className="mt-3 space-y-2">
                {draftInventoryLines.map((line, idx) => (
                  <div key={`${line.inventory_item_id}-${idx}`} className="flex items-center justify-between bg-neutral-100 rounded-xl px-4 py-3">
                    <div>
                      <p className="font-medium text-neutral-950 text-sm">{line.inventory_item_name}</p>
                      <p className="text-xs text-neutral-900">Quantity: {line.quantity}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-neutral-950 text-sm">{formatPrice(line.total)}</span>
                      <button type="button" onClick={() => handleRemoveDraftInventoryLine(line.inventory_item_id, idx)} className="text-negative hover:text-negative-900 p-1">
                        <LuX className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ModalSection>

          <ModalSection title="Items Total">
            <div className="flex justify-between items-center px-4 py-3 bg-primary-100 rounded-xl">
              <span className="font-semibold text-neutral-950">Grand Total</span>
              <span className="font-bold text-primary text-lg">{formatPrice(draftTotal)}</span>
            </div>
          </ModalSection>

          <ModalSection title="Third Party Repairs">
            {/* Add repair inputs */}
            <ModalInput
              type="text"
              value={newRepairProvider}
              onChange={setNewRepairProvider}
              placeholder="Provider Name"
            />
            <textarea
              value={newRepairDescription}
              onChange={(e) => setNewRepairDescription(e.target.value)}
              placeholder="Description"
              rows={3}
              className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
            />
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <ModalInput
                  type="number"
                  value={newRepairCost}
                  onChange={setNewRepairCost}
                  placeholder="Cost (PHP)"
                />
              </div>
              <div className="flex-1">
                <input
                  type="date"
                  value={newRepairDate}
                  onChange={(e) => setNewRepairDate(e.target.value)}
                  className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                />
              </div>
              <button
                type="button"
                onClick={handleAddDraftRepair}
                className="px-4.5 py-4.5 bg-primary text-white rounded-xl hover:bg-primary-950 transition-colors shrink-0"
              >
                <LuPlus className="w-4 h-4" />
              </button>
            </div>

            {/* Draft repairs list */}
            {draftRepairs.length > 0 && (
              <div className="mt-3 space-y-4">
                {draftRepairs.map((repair) => (
                  <div
                    key={repair.id}
                    className="flex items-center justify-between bg-neutral-100 rounded-xl px-4 py-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-neutral-950 text-sm truncate">
                        {repair.provider_name}
                      </p>
                      <p className="text-xs text-neutral-900 line-clamp-1">{repair.description}</p>
                      <p className="text-xs text-neutral-900">{formatDate(repair.repair_date)}</p>
                    </div>
                    <div className="flex items-center gap-3 ml-3">
                      <span className="font-semibold text-neutral-950 text-sm whitespace-nowrap">
                        {formatPrice(repair.cost)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeDraftRepair(repair.id)}
                        className="text-negative hover:text-negative-900 p-1"
                      >
                        <LuX className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}

                {/* Repairs Total */}
                <div className="flex justify-between items-center px-4 py-3 bg-primary-100 rounded-xl">
                  <span className="font-semibold text-neutral-950">Repairs Total</span>
                  <span className="font-bold text-primary text-lg">{formatPrice(draftRepairsTotal)}</span>
                </div>
              </div>
            )}

            {draftRepairs.length === 0 && (
              <p className="text-sm text-neutral-900 text-center py-4">
                No repairs added. Fill in the details above and click +.
              </p>
            )}
          </ModalSection>

          <ModalError message={addError} />

          <ModalButtons
            onCancel={() => setShowAddModal(false)}
            submitText={addingOrder ? "Creating..." : "Create Job"}
            loading={addingOrder}
          />
        </form>
      </Modal>

      {/* --- View Job Order Modal --- */}
      <Modal
        isOpen={showViewModal && !!viewOrder}
        onClose={() => { setShowViewModal(false); setViewOrder(null); }}
        title="Job Order Details"
        maxWidth="lg"
      >
        {viewOrder && (
          <div>
            <ModalSection title="Order Information">
              <ModalInput type="text" value={viewOrder.order_number} onChange={() => { }} placeholder="Order #" disabled />
              <div className="grid grid-cols-2 gap-4">
                <ModalInput
                  type="text"
                  value={getStatusLabel(viewOrder.status)}
                  onChange={() => { }}
                  placeholder="Status"
                  disabled
                />
                <ModalInput
                  type="text"
                  value={formatPrice(computeOrderGrandTotal(viewOrder, repairs))}
                  onChange={() => { }}
                  placeholder="Total"
                  disabled
                />
              </div>
              {(viewOrder.status === "approved" || viewOrder.status === "rejected") && (
                <ModalInput
                  type="text"
                  value={viewOrder.approved_at ? formatDateTime(viewOrder.approved_at) : "—"}
                  onChange={() => { }}
                  placeholder={viewOrder.status === "approved" ? "Approved At" : "Rejected At"}
                  disabled
                />
              )}
              {viewOrder.assigned_technician_id && ["in_progress", "ready_for_release", "pending_payment", "completed"].includes(viewOrder.status) && (
                <ModalInput
                  type="text"
                  value={viewOrder.assigned_technician?.full_name || viewOrder.assigned_technician?.email || "—"}
                  onChange={() => { }}
                  placeholder="Assigned Technician"
                  disabled
                />
              )}
              {viewOrder.job_type === "backorder" && (
                <>
                  <ModalInput
                    type="text"
                    value={`Rework of ${viewOrder.reference_job_order_id ? (orderNumberById.get(viewOrder.reference_job_order_id) || viewOrder.reference_job_order_id) : "—"}`}
                    onChange={() => {}}
                    placeholder="Reference Job Order"
                    disabled
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <ModalInput
                      type="text"
                      value={viewOrder.approval_status?.toLocaleLowerCase() || "—"}
                      onChange={() => {}}
                      placeholder="Approval Status"
                      disabled
                    />
                    <ModalInput
                      type="text"
                      value={viewOrder.is_free_rework ? "Free" : "Paid"}
                      onChange={() => {}}
                      placeholder="Free Rework"
                      disabled
                    />
                  </div>
                  <textarea
                    value={viewOrder.rework_reason || "—"}
                    readOnly
                    disabled
                    rows={3}
                    className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 focus:outline-none transition-all resize-none cursor-readonly"
                  />
                </>
              )}
            </ModalSection>

            {viewOrder.job_type !== "backorder" && viewRelatedReworks.length > 0 && (
              <ModalSection title="Related Reworks">
                <div className="space-y-2">
                  {viewRelatedReworks.map((rework) => (
                    <div key={rework.id} className="flex items-center justify-between bg-neutral-100 rounded-xl px-4 py-3.5">
                      <span className="text-neutral-950">{rework.order_number}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${getStatusColors(rework.status)}`}>
                        {getStatusLabel(rework.status)}
                      </span>
                    </div>
                  ))}
                </div>
              </ModalSection>
            )}

            <ModalSection title="Customer & Vehicle">
              <ModalInput
                type="text"
                value={viewOrder.customers?.full_name || "—"}
                onChange={() => { }}
                placeholder="Customer"
                disabled
              />
              <ModalInput
                type="text"
                value={
                  viewOrder.vehicles
                    ? `${viewOrder.vehicles.plate_number} — ${viewOrder.vehicles.model} (${viewOrder.vehicles.vehicle_type})`
                    : "—"
                }
                onChange={() => { }}
                placeholder="Vehicle"
                disabled
              />
              <ModalInput
                type="text"
                value={
                  viewOrder.branches
                    ? `${viewOrder.branches.name} (${viewOrder.branches.code})`
                    : "—"
                }
                onChange={() => { }}
                placeholder="Branch"
                disabled
              />
              <div className="grid grid-cols-2 gap-4">
                <ModalInput
                  type="text"
                  value={viewOrder.odometer_reading != null ? `${viewOrder.odometer_reading.toLocaleString()} km` : "—"}
                  onChange={() => { }}
                  placeholder="Odometer"
                  disabled
                />
                <ModalInput
                  type="text"
                  value={viewOrder.vehicle_bay ? (viewOrder.vehicle_bay === "bay1" ? "Bay 1" : viewOrder.vehicle_bay === "bay2" ? "Bay 2" : viewOrder.vehicle_bay) : "—"}
                  onChange={() => { }}
                  placeholder="Vehicle Bay"
                  disabled
                />
              </div>
            </ModalSection>

            <ModalSection title="Delivered & Pickup">
              <ModalInput
                type="text"
                value={viewOrder.delivered_by || "—"}
                onChange={() => {}}
                placeholder="Delivered By"
                disabled
              />
              <ModalInput
                type="text"
                value={viewOrder.picked_up_by || "—"}
                onChange={() => {}}
                placeholder="Picked Up By"
                disabled
              />
            </ModalSection>

            {/* Items section */}
            {viewOrder.job_order_lines && viewOrder.job_order_lines.length > 0 ? (
              <>
                {viewLinePackageLines.length > 0 && (
                  <ModalSection title="Packages">
                    {loadingView ? (
                      <div className="space-y-4">
                        {[1, 2].map((i) => (
                          <div key={i} className="bg-neutral-100 rounded-xl px-4 py-3 animate-pulse">
                            <div className="h-4 bg-neutral-200 rounded w-3/4 mb-2" />
                            <div className="h-3 bg-neutral-200 rounded w-1/2" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {viewLinePackageLines.map((line) => (
                          <div key={line.id} className="bg-neutral-100 rounded-xl p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-neutral-950 text-sm truncate">{line.name}</p>
                                <p className="text-xs text-neutral-900">Package total: {formatPrice(line.total)}</p>
                              </div>
                              <span className="text-xs text-neutral-900 whitespace-nowrap">Qty: {line.quantity}</span>
                            </div>

                            <div className="mt-2 border-t border-neutral-200 pt-2 space-y-2">
                              <p className="text-xs font-semibold text-primary uppercase">Base Components</p>
                              <div>
                                <p className="text-[11px] font-semibold text-neutral-900 uppercase">Labor</p>
                                {(line.metadata?.base_components?.labor || []).length > 0 ? (
                                  (line.metadata?.base_components?.labor || []).map((c, idx) => (
                                    <div key={`view-base-labor-${line.id}-${idx}`} className="flex justify-between text-xs text-neutral-900">
                                      <span>{c.name}</span>
                                      <span>{formatPrice(c.unit_price * c.quantity)}</span>
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-xs text-neutral-900">None</p>
                                )}
                              </div>
                              <div>
                                <p className="text-[11px] font-semibold text-neutral-900 uppercase">Inventory</p>
                                {(line.metadata?.base_components?.inventory || []).length > 0 ? (
                                  (line.metadata?.base_components?.inventory || []).map((c, idx) => (
                                    <div key={`view-base-inv-${line.id}-${idx}`} className="flex justify-between text-xs text-neutral-900">
                                      <span>{c.name}</span>
                                      <span>{formatPrice(c.unit_price * c.quantity)}</span>
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-xs text-neutral-900">None</p>
                                )}
                              </div>
                            </div>

                            <div className="mt-2 border-t border-neutral-200 pt-2 space-y-2">
                              <p className="text-xs font-semibold text-primary uppercase">Vehicle-Specific Components</p>
                              <div>
                                <p className="text-[11px] font-semibold text-neutral-900 uppercase">Labor</p>
                                {(line.metadata?.vehicle_specific_components?.labor || []).length > 0 ? (
                                  (line.metadata?.vehicle_specific_components?.labor || []).map((c, idx) => (
                                    <div key={`view-extra-labor-${line.id}-${idx}`} className="flex justify-between text-xs text-neutral-900">
                                      <span>{c.name}</span>
                                      <span>{formatPrice(c.unit_price * c.quantity)}</span>
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-xs text-neutral-900">None</p>
                                )}
                              </div>

                              <div>
                                <p className="text-[11px] font-semibold text-neutral-900 uppercase">Inventory</p>
                                {(line.metadata?.vehicle_specific_components?.inventory || []).length > 0 ? (
                                  (line.metadata?.vehicle_specific_components?.inventory || []).map((c, idx) => (
                                    <div key={`view-extra-inv-${line.id}-${idx}`} className="flex justify-between text-xs text-neutral-900">
                                      <span>{c.name}</span>
                                      <span>{formatPrice(c.unit_price * c.quantity)}</span>
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-xs text-neutral-900">None</p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </ModalSection>
                )}

                {viewLineLaborLines.length > 0 && (
                  <ModalSection title="Labor">
                    <div className="space-y-3">
                      {viewLineLaborLines.map((line) => (
                        <div key={line.id} className="bg-neutral-100 rounded-xl px-4 py-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-neutral-950 text-sm">{line.name}</p>
                              <p className="text-xs text-neutral-900">Quantity: {line.quantity}</p>
                            </div>
                            <span className="font-semibold text-neutral-950 text-sm">{formatPrice(line.total)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ModalSection>
                )}

                {viewLineInventoryLines.length > 0 && (
                  <ModalSection title="Inventory">
                    <div className="space-y-3">
                      {viewLineInventoryLines.map((line) => (
                        <div key={line.id} className="bg-neutral-100 rounded-xl px-4 py-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-neutral-950 text-sm">{line.name}</p>
                              <p className="text-xs text-neutral-900">Quantity: {line.quantity}</p>
                            </div>
                            <span className="font-semibold text-neutral-950 text-sm">{formatPrice(line.total)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ModalSection>
                )}

              </>
            ) : viewOrder.job_type !== "backorder" ? (
              <ModalSection title="Items Lists">
                {loadingView && !viewOrder.job_order_items ? (
                    <div className="space-y-4">
                      {[1, 2].map((i) => (
                        <div key={i} className="bg-neutral-100 rounded-xl px-4 py-3 animate-pulse">
                          <div className="h-4 bg-neutral-200 rounded w-3/4 mb-2" />
                          <div className="h-3 bg-neutral-200 rounded w-1/2" />
                        </div>
                      ))}
                    </div>
                ) : viewOrder.job_order_items && viewOrder.job_order_items.length > 0 ? (
                  <div className="space-y-4">
                    {viewOrder.job_order_items.map((item) => (
                      <div key={item.id} className="bg-neutral-100 rounded-xl px-4 py-3">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-neutral-950 text-sm truncate">
                              {item.package_item_name}
                            </p>
                            <p className="text-xs text-neutral-900">
                              Labor: {formatPrice(item.labor_price || 0)}
                              {(item.inventory_cost ?? 0) > 0 && ` + Inventory: ${formatPrice(item.inventory_cost)}`}
                              {" × "}{item.quantity}
                            </p>
                          </div>
                          <span className="font-semibold text-neutral-950 text-sm whitespace-nowrap ml-3">
                            {formatPrice(item.line_total)}
                          </span>
                        </div>
                        {item.job_order_item_inventories && item.job_order_item_inventories.length > 0 && (
                          <div className="mt-2 pl-3 border-l-2 border-neutral-200 space-y-1">
                            {item.job_order_item_inventories.map((inv) => (
                              <div key={inv.id} className="flex items-center justify-between text-xs text-neutral-900">
                                <span className="truncate">{inv.inventory_item_name}</span>
                                <span className="whitespace-nowrap ml-2">
                                  {inv.quantity} · {formatPrice(inv.line_total)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-neutral-900 text-center py-3">No items.</p>
                )}
              </ModalSection>
            ) : null}

            {/* Third Party Repairs section */}
            {repairs.length > 0 && (
              <ModalSection title="Third Party Repairs">
                {loadingRepairs ? (
                  <div className="space-y-4">
                    {[1, 2].map((i) => (
                      <div key={i} className="bg-neutral-100 rounded-xl px-4 py-3 animate-pulse">
                        <div className="h-4 bg-neutral-200 rounded w-3/4 mb-2" />
                        <div className="h-3 bg-neutral-200 rounded w-1/2" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {repairs.map((repair) => (
                      <div
                        key={repair.id}
                        className="flex items-center justify-between bg-neutral-100 rounded-xl px-4 py-3"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-neutral-950 text-sm truncate">
                            {repair.provider_name}
                          </p>
                          <p className="text-xs text-neutral-900 line-clamp-1">
                            {repair.description}
                          </p>
                          <p className="text-xs text-neutral-900">
                            {formatDate(repair.repair_date)}
                          </p>
                        </div>
                        <span className="font-semibold text-neutral-950 text-sm whitespace-nowrap ml-3">
                          {formatPrice(repair.cost)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </ModalSection>
            )}

            <ModalSection title="Grand Total">
              <div className="flex justify-between items-center px-4 py-3 bg-primary-100 rounded-xl">
                <span className="font-semibold text-neutral-950">Grand Total</span>
                <span className="font-bold text-primary text-lg">{formatPrice(viewGrandTotal)}</span>
              </div>
            </ModalSection>

            {viewOrder.notes && (
              <ModalSection title="Notes">
                <textarea
                  value={viewOrder.notes}
                  readOnly
                  disabled
                  rows={3}
                  className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 focus:outline-none transition-all resize-none cursor-readonly"
                />
              </ModalSection>
            )}

            <ModalSection title="Recent History">
              {loadingHistory ? (
                <div className="bg-neutral-100 rounded-xl px-4 py-3 animate-pulse space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i}>
                      <div className="h-3 bg-neutral-200 rounded w-3/4 mb-1" />
                      <div className="h-2 bg-neutral-200 rounded w-1/2" />
                    </div>
                  ))}
                </div>
              ) : history.length > 0 ? (
                <>
                  <div
                    className="bg-neutral-100 rounded-xl px-4 py-3 divide-y divide-neutral-200 cursor-pointer hover:bg-neutral-200/60 transition-colors"
                    onClick={() => { setShowHistoryModal(true); setShowViewModal(false); }}
                  >
                    {history.slice(0, 3).map((entry) => (
                      <div key={entry.id} className="py-2.5 first:pt-0 last:pb-0">
                        <div className="flex items-center gap-2">
                          <LuHistory className="w-3 h-3 text-neutral-600 shrink-0" />
                          <span className="text-xs font-semibold text-neutral-950 uppercase">{entry.action}</span>
                          <span className="text-xs text-neutral-600 ml-auto">{formatDateTime(entry.created_at)}</span>
                        </div>
                        {entry.user_profiles && (
                          <p className="text-xs text-neutral-900 ml-5">
                            By: {entry.user_profiles.full_name || entry.user_profiles.email}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-neutral-900 text-center py-3">No history available.</p>
              )}
            </ModalSection>

            <ModalSection title="Timestamps">
              <div className="grid grid-cols-2 gap-4">
                <ModalInput
                  type="text"
                  value={formatDateTime(viewOrder.created_at)}
                  onChange={() => { }}
                  placeholder="Created"
                  disabled
                />
                <ModalInput
                  type="text"
                  value={formatDateTime(viewOrder.updated_at)}
                  onChange={() => { }}
                  placeholder="Updated"
                  disabled
                />
              </div>
            </ModalSection>
          </div>
        )}
      </Modal>

      {/* --- Job Order History Modal --- */}
      <Modal
        isOpen={showHistoryModal && !!viewOrder}
        onClose={() => { setShowHistoryModal(false); }}
        title="Job Order History"
        maxWidth="lg"
      >
        {viewOrder && (
          <div>
            <ModalSection title="Order">
              <ModalInput type="text" value={viewOrder.order_number} onChange={() => { }} placeholder="Order #" disabled />
            </ModalSection>

            <ModalSection title="History">
              {loadingHistory ? (
                <div className="space-y-4">
                  {[1, 2].map((i) => (
                    <div key={i} className="bg-neutral-100 rounded-xl px-4 py-3 animate-pulse">
                      <div className="h-4 bg-neutral-200 rounded w-3/4 mb-2" />
                      <div className="h-3 bg-neutral-200 rounded w-1/2" />
                    </div>
                  ))}
                </div>
              ) : history.length > 0 ? (
                <div className="space-y-3">
                  {history.map((entry) => (
                    <div key={entry.id} className="bg-neutral-100 rounded-xl px-4 py-3">
                      <div className="flex items-center gap-2 mb-1">
                        <LuHistory className="w-3.5 h-3.5 text-neutral-600" />
                        <span className="text-xs font-semibold text-neutral-950 uppercase">{entry.action}</span>
                        <span className="text-xs text-neutral-600 ml-auto">{formatDateTime(entry.created_at)}</span>
                      </div>
                      {entry.user_profiles && (
                        <p className="text-xs text-neutral-900">
                          By: {entry.user_profiles.full_name || entry.user_profiles.email}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-neutral-900 text-center py-3">No history available.</p>
              )}
            </ModalSection>
          </div>
        )}
      </Modal>

      {/* --- Manage Repairs Modal (wrench action) --- */}
      <Modal
        isOpen={showRepairActionModal && !!repairActionOrder}
        onClose={() => { setShowRepairActionModal(false); setRepairActionOrder(null); }}
        title="Third Party Repair"
        maxWidth="lg"
      >
        {repairActionOrder && (
          <div>
            <ModalSection title={editingActionRepairId ? "Edit Repair" : "Add Repair"}>
              <ModalInput
                type="text"
                value={actionRepairProvider}
                onChange={setActionRepairProvider}
                placeholder="Provider Name *"
              />
              <textarea
                value={actionRepairDescription}
                onChange={(e) => setActionRepairDescription(e.target.value)}
                placeholder="Description *"
                rows={3}
                className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
              />
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <ModalInput
                    type="number"
                    value={actionRepairCost}
                    onChange={setActionRepairCost}
                    placeholder="Cost (PHP) *"
                  />
                </div>
                <div className="flex-1">
                  <input
                    type="date"
                    value={actionRepairDate}
                    onChange={(e) => setActionRepairDate(e.target.value)}
                    className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                  />
                </div>
                {editingActionRepairId ? (
                  <>
                    <button
                      type="button"
                      onClick={handleActionAddRepair}
                      className="px-4.5 py-4.5 bg-positive text-white rounded-xl hover:bg-positive-950 transition-colors shrink-0"
                      title="Save changes"
                    >
                      <LuCheck className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditActionRepair}
                      className="px-4.5 py-4.5 bg-neutral-200 text-neutral-900 rounded-xl hover:bg-neutral-300 transition-colors shrink-0"
                      title="Cancel edit"
                    >
                      <LuX className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleActionAddRepair}
                    className="px-4.5 py-4.5 bg-primary text-white rounded-xl hover:bg-primary-950 transition-colors shrink-0"
                    title="Add repair"
                  >
                    <LuPlus className="w-4 h-4" />
                  </button>
                )}
              </div>

              <ModalError message={actionRepairError} />
            </ModalSection>

            <ModalSection title="Repairs">
              {loadingActionRepairs ? (
                <div className="space-y-4">
                  {[1, 2].map((i) => (
                    <div key={i} className="bg-neutral-100 rounded-xl px-4 py-3 animate-pulse">
                      <div className="h-4 bg-neutral-200 rounded w-3/4 mb-2" />
                      <div className="h-3 bg-neutral-200 rounded w-1/2" />
                    </div>
                  ))}
                </div>
              ) : actionRepairs.length > 0 ? (
                <div className="space-y-4">
                  {actionRepairs.map((repair) => (
                    <div
                      key={repair.id}
                      className={`flex items-center justify-between bg-neutral-100 rounded-xl px-4 py-3 ${editingActionRepairId === repair.id ? "ring-2 ring-primary" : ""}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-neutral-950 text-sm truncate">
                          {repair.provider_name}
                        </p>
                        <p className="text-xs text-neutral-900 line-clamp-1">{repair.description}</p>
                        <p className="text-xs text-neutral-900">{formatDate(repair.repair_date)}</p>
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        <span className="font-semibold text-neutral-950 text-sm whitespace-nowrap">
                          {formatPrice(repair.cost)}
                        </span>
                        <button
                          type="button"
                          onClick={() => startEditActionRepair(repair)}
                          className="text-primary hover:text-primary-900 p-1"
                          title="Edit repair"
                        >
                          <LuPencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleActionDeleteRepair(repair.id)}
                          className="text-negative hover:text-negative-900 p-1"
                          title="Delete repair"
                        >
                          <LuX className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Repairs Total */}
                  <div className="flex justify-between items-center px-4 py-3 bg-primary-100 rounded-xl">
                    <span className="font-semibold text-neutral-950">Repairs Total</span>
                    <span className="font-bold text-primary text-lg">
                      {formatPrice(actionRepairs.reduce((sum, r) => sum + r.cost, 0))}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-neutral-900 text-center py-4">
                  No repairs yet. Fill in the details above and click +.
                </p>
              )}
            </ModalSection>

            <ModalButtons
              onCancel={() => { setShowRepairActionModal(false); setRepairActionOrder(null); }}
              submitText={savingActionRepairs ? "Saving..." : "Save Changes"}
              loading={savingActionRepairs}
              onSubmit={handleSaveActionRepairs}
              type="button"
            />
          </div>
        )}
      </Modal>

      {/* --- Edit Job Order Modal --- */}
      <Modal
        isOpen={showEditModal && !!editOrder}
        onClose={() => setShowEditModal(false)}
        title="Edit Job Order"
        maxWidth="lg"
      >
        <form onSubmit={handleEditOrder}>
          <ModalSection title="Order">
            <ModalInput
              type="text"
              value={editOrder?.order_number || ""}
              onChange={() => { }}
              placeholder="Order #"
              disabled
            />
          </ModalSection>
          <ModalSection title="Notes">
            <textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="Notes (optional)"
              rows={3}
              className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
            />
          </ModalSection>

          {/* Line-based items editor for draft orders */}
          {editOrder && isEditableStatus(editOrder.status) && canEditItems && (editOrder.job_order_lines || []).length > 0 && (
            <>
              <ModalSection title="Packages">
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <ModalSelect
                      value={editLineSelectedPackageId}
                      onChange={setEditLineSelectedPackageId}
                      placeholder="Select package..."
                      options={editPackageItemOptions}
                    />
                  </div>
                  <div className="w-20">
                    <ModalInput type="number" value={editLineSelectedPackageQty} onChange={setEditLineSelectedPackageQty} placeholder="Qty" />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddEditLinePackage}
                    disabled={!editLineSelectedPackageId || editResolvingPrice}
                    className="px-4.5 py-4.5 bg-primary text-white rounded-xl hover:bg-primary-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                  >
                    {editResolvingPrice ? <LuRefreshCw className="w-4 h-4 animate-spin" /> : <LuPlus className="w-4 h-4" />}
                  </button>
                </div>

                {editLinePackageLines.length > 0 && (
                  <div className="mt-3 space-y-3">
                    {editLinePackageLines.map((line) => (
                      <div key={line.package_item_id} className="bg-neutral-100 rounded-xl p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-neutral-950 text-sm truncate">{line.package_item_name}</p>
                            <p className="text-xs text-neutral-900">Package total: {formatPrice(line.total)}</p>
                          </div>
                          <input
                            type="number"
                            min={1}
                            value={line.quantity}
                            onChange={(e) => handleEditLinePackageQty(line.package_item_id, parseInt(e.target.value, 10) || 1)}
                            className="w-14 px-2 py-1 bg-white rounded text-xs text-center text-neutral-950 focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <button type="button" onClick={() => handleRemoveEditLinePackage(line.package_item_id)} className="text-negative hover:text-negative-900 p-1">
                            <LuX className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="mt-2 border-t border-neutral-200 pt-2 space-y-2">
                          <p className="text-xs font-semibold text-primary uppercase">Base Components</p>
                          <div>
                            <p className="text-[11px] font-semibold text-neutral-900 uppercase">Labor</p>
                            {line.base_labor_components.length > 0 ? line.base_labor_components.map((c, idx) => (
                              <div key={`edit-base-labor-${idx}`} className="flex justify-between text-xs text-neutral-900">
                                <span>{c.labor_item_name}</span>
                                <span>{formatPrice(c.unit_price * c.quantity)}</span>
                              </div>
                            )) : <p className="text-xs text-neutral-900">None</p>}
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold text-neutral-900 uppercase">Inventory</p>
                            {line.base_inventory_components.length > 0 ? line.base_inventory_components.map((c, idx) => (
                              <div key={`edit-base-inv-${idx}`} className="flex justify-between text-xs text-neutral-900">
                                <span>{c.inventory_item_name}</span>
                                <span>{formatPrice(c.unit_price * c.quantity)}</span>
                              </div>
                            )) : <p className="text-xs text-neutral-900">None</p>}
                          </div>
                        </div>

                        <div className="mt-2 border-t border-neutral-200 pt-2 space-y-2">
                          <p className="text-xs font-semibold text-primary uppercase">Vehicle-Specific Components - {(editOrder?.vehicle_class || "light").replace("_", " ")}</p>
                          <div>
                            <p className="text-[11px] font-semibold text-neutral-900 uppercase">Labor</p>
                            {line.vehicle_specific_labor_components.length > 0 ? line.vehicle_specific_labor_components.map((c, idx) => (
                              <div key={`edit-extra-labor-${idx}`} className="flex items-center justify-between gap-2 text-xs text-neutral-900">
                                <span className="flex-1 truncate">{c.labor_item_name}</span>
                                <span>{formatPrice(c.unit_price * c.quantity)}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveEditVehicleSpecificLabor(line.package_item_id, idx)}
                                  className="text-negative hover:text-negative-900 p-0.5"
                                  title="Remove item"
                                >
                                  <LuX className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )) : <p className="text-xs text-neutral-900">None</p>}
                          </div>

                          <div>
                            <p className="text-[11px] font-semibold text-neutral-900 uppercase">Inventory</p>
                            {line.vehicle_specific_inventory_components.length > 0 ? line.vehicle_specific_inventory_components.map((c, idx) => (
                              <div key={`edit-extra-inv-${idx}`} className="flex items-center justify-between gap-2 text-xs text-neutral-900">
                                <span className="flex-1 truncate">{c.inventory_item_name}</span>
                                <span>{formatPrice(c.unit_price * c.quantity)}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveEditVehicleSpecificInventory(line.package_item_id, idx)}
                                  className="text-negative hover:text-negative-900 p-0.5"
                                  title="Remove item"
                                >
                                  <LuX className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )) : <p className="text-xs text-neutral-900">None</p>}
                          </div>

                          <div className="flex gap-2 items-end pt-1">
                            <div className="w-40">
                              <ModalSelect
                                value={editVehicleSpecificTypeByPackage[line.package_item_id] || ""}
                                onChange={(value) =>
                                  handleEditVehicleSpecificTypeChange(
                                    line.package_item_id,
                                    value === "labor" || value === "inventory" ? value : ""
                                  )
                                }
                                placeholder="Type..."
                                options={[
                                  { value: "labor", label: "Labor" },
                                  { value: "inventory", label: "Inventory" },
                                ]}
                                className="bg-white"
                              />
                            </div>
                            <div className="flex-1">
                              <ModalSelect
                                value={editVehicleSpecificItemByPackage[line.package_item_id] || ""}
                                onChange={(value) => handleEditVehicleSpecificItemChange(line.package_item_id, value)}
                                placeholder={
                                  (editVehicleSpecificTypeByPackage[line.package_item_id] || "") === "labor"
                                    ? "Select labor..."
                                    : (editVehicleSpecificTypeByPackage[line.package_item_id] || "") === "inventory"
                                      ? "Select inventory..."
                                      : "Select item..."
                                }
                                options={
                                  (editVehicleSpecificTypeByPackage[line.package_item_id] || "") === "labor"
                                    ? editLaborItemOptions
                                    : (editVehicleSpecificTypeByPackage[line.package_item_id] || "") === "inventory"
                                      ? editInventoryItemOptions
                                      : []
                                }
                                disabled={!(editVehicleSpecificTypeByPackage[line.package_item_id] || "")}
                                className="bg-white"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => handleAddEditVehicleSpecificComponent(line.package_item_id)}
                              disabled={!(editVehicleSpecificTypeByPackage[line.package_item_id] || "") || !(editVehicleSpecificItemByPackage[line.package_item_id] || "")}
                              className="px-4.5 py-4.5 bg-primary text-white rounded-xl hover:bg-primary-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                            >
                              <LuPlus className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ModalSection>

              <ModalSection title="Labor">
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <ModalSelect value={editLineSelectedLaborId} onChange={setEditLineSelectedLaborId} placeholder="Select labor..." options={editLaborItemOptions} />
                  </div>
                  <div className="w-20">
                    <ModalInput type="number" value={editLineSelectedLaborQty} onChange={setEditLineSelectedLaborQty} placeholder="Qty" />
                  </div>
                  <button type="button" onClick={handleAddEditLineLabor} className="px-4.5 py-4.5 bg-primary text-white rounded-xl hover:bg-primary-950 transition-colors shrink-0">
                    <LuPlus className="w-4 h-4" />
                  </button>
                </div>
                {editLineLaborLines.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {editLineLaborLines.map((line, idx) => (
                      <div key={`${line.labor_item_id}-${idx}`} className="flex items-center justify-between bg-neutral-100 rounded-xl px-4 py-3">
                        <div>
                          <p className="font-medium text-neutral-950 text-sm">{line.labor_item_name}</p>
                          <p className="text-xs text-neutral-900">Quantity: {line.quantity}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-neutral-950 text-sm">{formatPrice(line.total)}</span>
                          <button type="button" onClick={() => handleRemoveEditLineLabor(idx)} className="text-negative hover:text-negative-900 p-1">
                            <LuX className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ModalSection>

              <ModalSection title="Inventory">
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <ModalSelect value={editLineSelectedInventoryId} onChange={setEditLineSelectedInventoryId} placeholder="Select inventory..." options={editInventoryItemOptions} />
                  </div>
                  <div className="w-20">
                    <ModalInput type="number" value={editLineSelectedInventoryQty} onChange={setEditLineSelectedInventoryQty} placeholder="Qty" />
                  </div>
                  <button type="button" onClick={handleAddEditLineInventory} className="px-4.5 py-4.5 bg-primary text-white rounded-xl hover:bg-primary-950 transition-colors shrink-0">
                    <LuPlus className="w-4 h-4" />
                  </button>
                </div>
                {editLineInventoryLines.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {editLineInventoryLines.map((line, idx) => (
                      <div key={`${line.inventory_item_id}-${idx}`} className="flex items-center justify-between bg-neutral-100 rounded-xl px-4 py-3">
                        <div>
                          <p className="font-medium text-neutral-950 text-sm">{line.inventory_item_name}</p>
                          <p className="text-xs text-neutral-900">Quantity: {line.quantity}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-neutral-950 text-sm">{formatPrice(line.total)}</span>
                          <button type="button" onClick={() => handleRemoveEditLineInventory(idx)} className="text-negative hover:text-negative-900 p-1">
                            <LuX className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ModalSection>

              <ModalSection title="Items Total">
                <div className="flex justify-between items-center px-4 py-3 bg-primary-100 rounded-xl">
                  <span className="font-semibold text-neutral-950">Grand Total</span>
                  <span className="font-bold text-primary text-lg">{formatPrice(editLineItemsTotal)}</span>
                </div>
              </ModalSection>
            </>
          )}

          {/* Items section — only for created/rejected orders and roles with package access */}
          {editOrder && isEditableStatus(editOrder.status) && canEditItems && (!editOrder.job_order_lines || editOrder.job_order_lines.length === 0) && (
            <ModalSection title="Items Lists">
              {editLoadingItems ? (
                <p className="text-sm text-neutral-900 text-center py-4">Loading items...</p>
              ) : (
                <>
                  {/* Add item row */}
                  <div className="flex gap-2 items-end mt-2">
                    <div className="flex-1">
                      <ModalSelect
                        value={editSelectedPackageId}
                        onChange={setEditSelectedPackageId}
                        placeholder="Select Package item"
                        options={editPackageItemOptions}
                      />
                    </div>
                    <div className="flex-1">
                      <ModalSelect
                        value={editSelectedLaborId}
                        onChange={setEditSelectedLaborId}
                        placeholder="Select Labor"
                        options={editLaborItemOptions}
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
                    <button
                      type="button"
                      onClick={handleAddEditDraftItem}
                      disabled={!editSelectedPackageId || !editSelectedLaborId || editResolvingPrice}
                      className="px-4.5 py-4.5 bg-primary text-white rounded-xl hover:bg-primary-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                    >
                      {editResolvingPrice ? (
                        <LuRefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <LuPlus className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  {/* Existing items */}
                  {editItems.map((item) => (
                    <div
                      key={item.id}
                      className="bg-neutral-100 rounded-xl px-4 py-3 mb-4"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-neutral-950 text-sm truncate">
                            {item.package_item_name}
                          </p>
                          <p className="text-xs text-neutral-900">
                            Labor: {formatPrice(item.labor_price || 0)}
                            {(item.inventory_cost ?? 0) > 0 && ` + Inventory: ${formatPrice(item.inventory_cost)}`}
                            {" \u00d7 "}{item.quantity}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 ml-3">
                          <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => handleEditItemQtyChange(item.id, parseInt(e.target.value) || 1)}
                            className="w-16 px-2 py-1.5 bg-white rounded-lg text-center text-sm text-neutral-950 focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                          <span className="font-semibold text-neutral-950 text-sm whitespace-nowrap">
                            {formatPrice(item.line_total)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveEditItem(item.id)}
                            className="text-negative hover:text-negative-900 p-1"
                            title="Remove item"
                          >
                            <LuX className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      {/* Inventory sub-items with editable quantities and item selection */}
                      {item.job_order_item_inventories && item.job_order_item_inventories.length > 0 && (
                        <div className="mt-2 pl-3 border-l-2 border-neutral-200 space-y-1">
                          {item.job_order_item_inventories.map((inv, invIdx) => (
                            <div key={inv.id} className="flex items-center justify-between text-xs text-neutral-900">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                {inv.available_items && inv.available_items.length > 1 ? (
                                  <select
                                    value={inv.inventory_item_id}
                                    onChange={(e) => changeEditExistingInventoryItem(item.id, invIdx, e.target.value)}
                                    className="appearance-none flex-1 min-w-0 text-xs focus:outline-none focus:ring-1 focus:ring-primary truncate"
                                  >
                                    {inv.available_items.map((opt) => (
                                      <option key={opt.id} value={opt.id}>
                                        {opt.item_name} ({formatPrice(opt.cost_price)})
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="truncate flex-1">{inv.inventory_item_name} ({formatPrice(inv.unit_cost * inv.quantity)})</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 ml-2">
                                <input
                                  type="number"
                                  min={0}
                                  value={inv.quantity}
                                  onChange={(e) =>
                                    handleEditInvQtyChange(item.id, inv.inventory_item_id, parseInt(e.target.value) || 0)
                                  }
                                  className="w-14 px-1 py-0.5 bg-white rounded text-center text-xs text-neutral-950 focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* New draft items */}
                  {editDraftItems.map((item) => (
                    <div
                      key={item.package_item_id}
                      className="bg-primary-100 rounded-xl px-4 py-3 mb-4"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-neutral-950 text-sm truncate">
                            {item.package_item_name}
                            <span className="text-primary text-xs ml-2">(new)</span>
                          </p>
                          <p className="text-xs text-neutral-900">
                            Labor: {formatPrice(item.labor_price)}
                            {item.inventory_cost > 0 && ` + Inventory: ${formatPrice(item.inventory_cost)}`}
                            {" \u00d7 "}{item.quantity}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 ml-3">
                          <span className="font-semibold text-neutral-950 text-sm whitespace-nowrap">
                            {formatPrice(item.line_total)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveEditDraftItem(item.package_item_id)}
                            className="text-negative hover:text-negative-900 p-1"
                            title="Remove item"
                          >
                            <LuX className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      {/* Inventory items with editable selection */}
                      {item.inventory_quantities.length > 0 && (
                        <div className="mt-2 pl-3 border-l-2 border-neutral-200 space-y-2">
                          {item.inventory_quantities.map((iq, slotIdx) => (
                            <div key={slotIdx} className="text-xs text-neutral-900">
                              <div className="flex items-center gap-2">
                                {iq.available_items && iq.available_items.length > 1 ? (
                                  <select
                                    value={iq.inventory_item_id}
                                    onChange={(e) => changeEditDraftInventoryItem(item.package_item_id, slotIdx, e.target.value)}
                                    className="appearance-none flex-1 min-w-0 text-xs focus:outline-none focus:ring-1 focus:ring-primary truncate"
                                  >
                                    {iq.available_items.map((opt) => (
                                      <option key={opt.id} value={opt.id}>
                                        {opt.item_name} ({formatPrice(opt.cost_price)})
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="truncate flex-1">{iq.inventory_item_name} ({formatPrice(iq.unit_cost * iq.quantity)})</span>
                                )}
                                <span className="text-xs text-neutral-900 w-14 text-center">×{iq.quantity}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Total */}
                  {(editItems.length > 0 || editDraftItems.length > 0) && (
                    <div className="flex justify-between items-center px-4 py-3 bg-primary-100 rounded-xl mt-3">
                      <span className="font-semibold text-neutral-950">Items Total</span>
                      <span className="font-bold text-primary text-lg">{formatPrice(editItemsTotal)}</span>
                    </div>
                  )}

                  {editItems.length === 0 && editDraftItems.length === 0 && (
                    <p className="text-sm text-neutral-900 text-center py-4">
                      No items. Select a Package item and Labor, then click + to add.
                    </p>
                  )}
                </>
              )}
            </ModalSection>
          )}

          <ModalError message={editError} />

          <ModalButtons
            onCancel={() => setShowEditModal(false)}
            submitText={editingOrder ? "Saving..." : "Save Changes"}
            loading={editingOrder}
          />
        </form>
      </Modal>

      {/* --- Delete / Deactivate Confirmation Modal --- */}
      <Modal
        isOpen={showDeleteConfirm && !!orderToDelete}
        onClose={() => setShowDeleteConfirm(false)}
        title={orderHasReferences ? "Deactivate Job Order" : "Delete Job Order"}
        maxWidth="sm"
      >
        {orderToDelete && (
          <div>
            <div className="bg-neutral-100 rounded-xl p-4 my-4">
              <p className="text-neutral-900">
                {orderHasReferences
                  ? <>Are you sure you want to deactivate <strong className="text-neutral-950">{orderToDelete.order_number}</strong>?</>
                  : <>Are you sure you want to delete <strong className="text-neutral-950">{orderToDelete.order_number}</strong>?</>
                }
              </p>
            </div>
            <p className="text-sm text-neutral-900 mb-2">
              {orderHasReferences
                ? "This job order has progressed beyond draft and will be set to deactivated instead of deleted."
                : "This action cannot be undone. The job order and all its items will be permanently removed."
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
                onClick={handleDeleteOrder}
                disabled={deletingOrder}
                className="flex-1 px-4 py-3.5 bg-negative text-white rounded-xl font-semibold hover:bg-negative-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {deletingOrder
                  ? (orderHasReferences ? "Deactivating..." : "Deleting...")
                  : (orderHasReferences ? "Deactivate" : "Delete")
                }
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* --- Cancel Job Order Confirmation Modal --- */}
      <Modal
        isOpen={showCancelConfirm && !!orderToCancel}
        onClose={() => setShowCancelConfirm(false)}
        title="Cancel Job Order"
        maxWidth="sm"
      >
        {orderToCancel && (
          <div>
            <div className="bg-neutral-100 rounded-xl p-4 my-4">
              <p className="text-neutral-900">
                Are you sure you want to cancel{" "}
                <strong className="text-neutral-950">{orderToCancel.order_number}</strong>?
              </p>
            </div>
            <p className="text-sm text-neutral-900 mb-2">
              This will change the job order status to cancelled. This action cannot be undone.
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
                onClick={() => {
                  setShowCancelConfirm(false);
                  setReasonText("");
                  setReasonModalAction("cancel");
                  setShowReasonModal(true);
                }}
                className="flex-1 px-4 py-3.5 bg-negative text-white rounded-xl font-semibold hover:bg-negative-950 transition-colors"
              >
                Proceed
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* --- Customer Approval Modal --- */}
      <Modal
        isOpen={showApprovalModal && !!approvalOrder}
        onClose={() => setShowApprovalModal(false)}
        title="Customer Approval"
        maxWidth="sm"
      >
        {approvalOrder && (
          <div>
            <div className="bg-neutral-100 rounded-xl p-4 my-4">
              <p className="text-neutral-900">
                {approvalOrder.status === "draft" && (
                  <>Request customer approval for <strong className="text-neutral-950">{approvalOrder.order_number}</strong>?</>
                )}
                {approvalOrder.status === "pending_approval" && (
                  <>
                    {approvalOrder.job_type === "backorder"
                      ? <>Record HM rework decision for <strong className="text-neutral-950">{approvalOrder.order_number}</strong>?</>
                      : <>Record the customer's decision for <strong className="text-neutral-950">{approvalOrder.order_number}</strong>?</>}
                  </>
                )}
              </p>
            </div>
            <p className="text-sm text-neutral-900 mb-2">
              {approvalOrder.status === "draft" && "This will change the status to Pending Approval and notify the customer for review."}
              {approvalOrder.status === "pending_approval" &&
                (approvalOrder.job_type === "backorder"
                  ? "Select whether HM approves or rejects this rework job order."
                  : "Select whether the customer approved or rejected this job order.")}
            </p>

            {approvalOrder.status === "draft" && (
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowApprovalModal(false)}
                  className="flex-1 px-4 py-3.5 border-2 border-primary text-primary rounded-xl font-semibold hover:bg-primary-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={processingApproval}
                  onClick={async () => {
                    try {
                      setProcessingApproval(true);
                      await jobOrdersApi.requestApproval(approvalOrder.id);
                      setShowApprovalModal(false);
                      setApprovalOrder(null);
                      showToast.success("Approval requested — status changed to Pending Approval");
                      fetchData();
                    } catch (err) {
                      showToast.error(err instanceof Error ? err.message : "Failed to request approval");
                    } finally {
                      setProcessingApproval(false);
                    }
                  }}
                  className="flex-1 px-4 py-3.5 bg-primary text-white rounded-xl font-semibold hover:bg-primary-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {processingApproval ? "Processing..." : "Request"}
                </button>
              </div>
            )}

            {approvalOrder.status === "pending_approval" && (
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  disabled={processingApproval}
                  onClick={() => {
                    setShowApprovalModal(false);
                    setReasonText("");
                    setReasonModalAction("reject");
                    setShowReasonModal(true);
                  }}
                  className="flex-1 px-4 py-3.5 border-2 border-primary text-primary rounded-xl font-semibold hover:bg-primary-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Reject
                </button>
                <button
                  type="button"
                  disabled={processingApproval}
                  onClick={async () => {
                    try {
                      setProcessingApproval(true);
                      if (approvalOrder.job_type === "backorder") {
                        await jobOrdersApi.approveRework(approvalOrder.id, { decision: "approved" });
                      } else {
                        await jobOrdersApi.recordApproval(approvalOrder.id, { decision: "approved" });
                      }
                      setShowApprovalModal(false);
                      setApprovalOrder(null);
                      showToast.success(
                        approvalOrder.job_type === "backorder"
                          ? "Rework approved"
                          : "Customer approved the job order"
                      );
                      fetchData();
                    } catch (err) {
                      showToast.error(err instanceof Error ? err.message : "Failed to record approval");
                    } finally {
                      setProcessingApproval(false);
                    }
                  }}
                  className="flex-1 px-4 py-3.5 bg-primary text-white rounded-xl font-semibold hover:bg-primary-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {processingApproval ? "Processing..." : "Approve"}
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* --- Complete Job Order Modal --- */}
      <Modal
        isOpen={showCompleteModal && !!completeOrder}
        onClose={() => {
          setShowCompleteModal(false);
          setCompleteOrder(null);
          setCompletePickedUpBy("");
          setCompleteError(null);
        }}
        title="Complete Job Order"
        maxWidth="sm"
      >
        {completeOrder && (
          <div>
            <div className="bg-neutral-100 rounded-xl p-4 my-4">
              <p className="text-neutral-900">
                Complete <strong className="text-neutral-950">{completeOrder.order_number}</strong>.
              </p>
            </div>
            <ModalInput
              type="text"
              value={completePickedUpBy}
              onChange={(value) => {
                setCompletePickedUpBy(value);
                if (completeError) setCompleteError(null);
              }}
              placeholder="Picked Up By *"
              required
            />
            <ModalError message={completeError} />
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  setShowCompleteModal(false);
                  setCompleteOrder(null);
                  setCompletePickedUpBy("");
                  setCompleteError(null);
                }}
                className="flex-1 px-4 py-3.5 border-2 border-primary text-primary rounded-xl font-semibold hover:bg-primary-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={processingComplete}
                onClick={async () => {
                  if (!completePickedUpBy.trim()) {
                    setCompleteError("Picked Up By is required before completion.");
                    return;
                  }

                  try {
                    setProcessingComplete(true);
                    await jobOrdersApi.complete(completeOrder.id, {
                      picked_up_by: completePickedUpBy.trim(),
                    });
                    setShowCompleteModal(false);
                    setCompleteOrder(null);
                    setCompletePickedUpBy("");
                    setCompleteError(null);
                    showToast.success("Job order completed");
                    fetchData();
                  } catch (err) {
                    const message = err instanceof Error ? err.message : "Failed to complete";
                    setCompleteError(message);
                    showToast.error(message);
                  } finally {
                    setProcessingComplete(false);
                  }
                }}
                className="flex-1 px-4 py-3.5 bg-primary text-white rounded-xl font-semibold hover:bg-primary-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {processingComplete ? "Processing..." : "Complete"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* --- Payment Modal --- */}
      <Modal
        isOpen={showPaymentModal && !!paymentOrder}
        onClose={() => {
          setShowPaymentModal(false);
          setPaymentOrder(null);
        }}
        title="Record Payment"
        maxWidth="sm"
      >
        {paymentOrder && (
          <div>
            {(() => {
              const requiresPaymentDetails = !paymentOrder.is_free_rework;
              return (
                <>
            <div className="bg-neutral-100 rounded-xl p-4 my-4">
              <p className="text-neutral-900">
                Confirm payment for <strong className="text-neutral-950">{paymentOrder.order_number}</strong>? The total amount to be paid is <strong className="text-neutral-950">{new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(paymentOrder.total_amount)}</strong>
              </p>
            </div>

            {requiresPaymentDetails && (!paymentOrder.invoice_number || !paymentOrder.payment_reference) ? (
              <p className="text-sm text-neutral-900 mb-2">Add Payment Method details first before confirming Record Payment.</p>
            ) : (
              <p className="text-sm text-neutral-900 mb-2">This will mark the job order as payment received and change the status to Pending Payment.</p>
            )}

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  setShowPaymentModal(false);
                  setPaymentOrder(null);
                }}
                className="flex-1 px-4 py-3.5 border-2 border-primary text-primary rounded-xl font-semibold hover:bg-primary-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={processingPayment || (requiresPaymentDetails && (!paymentOrder.invoice_number || !paymentOrder.payment_reference))}
                onClick={async () => {
                  try {
                    setProcessingPayment(true);
                    await jobOrdersApi.recordPayment(paymentOrder.id);
                    setShowPaymentModal(false);
                    setPaymentOrder(null);
                    showToast.success("Payment recorded — status changed to Pending Payment");
                    fetchData();
                  } catch (err) {
                    showToast.error(err instanceof Error ? err.message : "Failed to record payment");
                  } finally {
                    setProcessingPayment(false);
                  }
                }}
                className="flex-1 px-4 py-3.5 bg-primary text-white rounded-xl font-semibold hover:bg-primary-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {processingPayment ? "Processing..." : "Confirm"}
              </button>
            </div>
                </>
              );
            })()}
          </div>
        )}
      </Modal>

      {/* --- Payment Details Modal --- */}
      <Modal
        isOpen={showPaymentDetailsModal && !!paymentDetailsOrder}
        onClose={() => {
          setShowPaymentDetailsModal(false);
          setPaymentDetailsOrder(null);
        }}
        title="Payment Method"
        maxWidth="lg"
      >
        {paymentDetailsOrder && (
          <div>
            <ModalSection title="Basic Information">
              <ModalInput
                type="text"
                value={paymentDetailsOrder.order_number}
                onChange={() => {}}
                placeholder="Job Order"
                disabled
              />
              <ModalInput
                type="text"
                value={new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(paymentDetailsOrder.total_amount)}
                onChange={() => {}}
                placeholder="Total Amount"
                disabled
              />
            </ModalSection>

            <ModalSection title="Payment Details">
              <ModalInput
                type="text"
                value={paymentInvoiceNumber}
                onChange={setPaymentInvoiceNumber}
                placeholder="Invoice #"
                disabled={paymentDetailsOrder.status !== "ready_for_release"}
                required
              />
              <ModalInput
                type="text"
                value={paymentReference}
                onChange={setPaymentReference}
                placeholder="Payment Reference"
                disabled={paymentDetailsOrder.status !== "ready_for_release"}
                required
              />
              <ModalSelect
                value={paymentMode}
                onChange={(value) => setPaymentMode((value as "cash" | "gcash" | "other") || "cash")}
                disabled={paymentDetailsOrder.status !== "ready_for_release"}
                options={[
                  { value: "cash", label: "Cash" },
                  { value: "gcash", label: "GCash" },
                  { value: "other", label: "Other" },
                ]}
              />
            </ModalSection>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  setShowPaymentDetailsModal(false);
                  setPaymentDetailsOrder(null);
                }}
                className="flex-1 px-4 py-3.5 border-2 border-primary text-primary rounded-xl font-semibold hover:bg-primary-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={paymentDetailsOrder.status !== "ready_for_release" || savingPaymentDetails || !paymentInvoiceNumber.trim() || !paymentReference.trim()}
                onClick={async () => {
                  try {
                    setSavingPaymentDetails(true);
                    await jobOrdersApi.updatePaymentDetails(paymentDetailsOrder.id, {
                      invoice_number: paymentInvoiceNumber.trim(),
                      payment_reference: paymentReference.trim(),
                      payment_mode: paymentMode,
                    });
                    setShowPaymentDetailsModal(false);
                    setPaymentDetailsOrder(null);
                    showToast.success("Payment details saved");
                    fetchData();
                  } catch (err) {
                    showToast.error(err instanceof Error ? err.message : "Failed to save payment details");
                  } finally {
                    setSavingPaymentDetails(false);
                  }
                }}
                className="flex-1 px-4 py-3.5 bg-primary text-white rounded-xl font-semibold hover:bg-primary-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {savingPaymentDetails ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* --- Rework Job Modal --- */}
      <Modal
        isOpen={showReworkModal && !!reworkSourceOrder}
        onClose={() => {
          setShowReworkModal(false);
          setReworkSourceOrder(null);
        }}
        title="Rework Job"
        maxWidth="lg"
      >
        {reworkSourceOrder && (
          <div>
            <ModalSection title="Original Job Order">
              <div className="bg-primary-100 rounded-xl px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-neutral-950 truncate">Job - {reworkSourceOrder.order_number}</p>
                  <p className="text-xs text-primary truncate">
                    {reworkSourceOrder.vehicles?.plate_number || "—"} {reworkSourceOrder.vehicles?.model || ""} - {reworkSourceOrder.customers?.full_name || "—"} - {formatDate(reworkSourceOrder.created_at)}
                  </p>
                </div>
              </div>
            </ModalSection>

            <ModalSection title="Pre-filled Information">
              <ModalInput
                type="text"
                value={reworkSourceOrder.order_number}
                onChange={() => {}}
                placeholder="Job Reference"
                disabled
              />

              <div className="grid grid-cols-2 gap-4">
                <ModalInput
                  type="text"
                  value={reworkSourceOrder.customers?.full_name || "—"}
                  onChange={() => {}}
                  placeholder="Name"
                  disabled
                />
                <ModalInput
                  type="text"
                  value={reworkSourceOrder.vehicles ? `${reworkSourceOrder.vehicles.plate_number} ${reworkSourceOrder.vehicles.model}` : "—"}
                  onChange={() => {}}
                  placeholder="Vehicle"
                  disabled
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <ModalInput
                  type="text"
                  value={reworkSourceOrder.vehicle_class ? reworkSourceOrder.vehicle_class.replace("_", " ") : "—"}
                  onChange={() => {}}
                  placeholder="Type"
                  disabled
                />
                <ModalInput
                  type="text"
                  value={reworkSourceOrder.branches?.code || reworkSourceOrder.branches?.name || "—"}
                  onChange={() => {}}
                  placeholder="Branch"
                  disabled
                />
              </div>

              <ModalSelect
                value={reworkVehicleBay}
                onChange={setReworkVehicleBay}
                placeholder="Vehicle Bay *"
                options={[
                  { value: "bay1", label: "Bay 1" },
                  { value: "bay2", label: "Bay 2" },
                ]}
              />
            </ModalSection>

            <ModalSection title="Rework Details">
              <textarea
                value={reworkReason}
                onChange={(e) => setReworkReason(e.target.value)}
                placeholder="Rework Reason *"
                rows={3}
                className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
              />

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsFreeRework((prev) => !prev)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isFreeRework ? "bg-primary" : "bg-neutral-200"}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isFreeRework ? "translate-x-6" : "translate-x-1"}`}
                  />
                </button>
                <span className="text-sm text-neutral-900">{isFreeRework ? "Free" : "Paid"}</span>
              </div>

              <div className="flex justify-between items-center px-4 py-3 bg-primary-100 rounded-xl">
                <span className="font-semibold text-neutral-950">Grand Total</span>
                <span className="font-bold text-primary text-lg">{formatPrice(isFreeRework ? 0 : (reworkSourceOrder.total_amount || 0))}</span>
              </div>
            </ModalSection>

            <ModalError message={reworkError} />

            <ModalButtons
              onCancel={() => {
                setShowReworkModal(false);
                setReworkSourceOrder(null);
              }}
              submitText={creatingRework ? "Submitting..." : "Submit"}
              cancelText="Cancel"
              loading={creatingRework}
              type="button"
              onSubmit={handleCreateRework}
              disabled={!reworkReason.trim() || !reworkVehicleBay}
            />
          </div>
        )}
      </Modal>

      {/* --- Shared Reason Modal (Cancel / Reject) --- */}
      <Modal
        isOpen={showReasonModal && (reasonModalAction === "cancel" ? !!orderToCancel : !!approvalOrder)}
        onClose={() => {
          setShowReasonModal(false);
          setReasonText("");
        }}
        title={reasonModalAction === "cancel" ? "Cancel Job Order" : "Reject Job Order"}
        maxWidth="lg"
      >
        {(() => {
          const targetOrder = reasonModalAction === "cancel" ? orderToCancel : approvalOrder;
          if (!targetOrder) return null;
          return (
            <div>
              <ModalSection title="Basic Information">
                <ModalInput
                  type="text"
                  value={targetOrder.order_number}
                  onChange={() => {}}
                  placeholder="Order #"
                  disabled
                />
                <ModalInput
                  type="text"
                  value={getStatusLabel(targetOrder.status)}
                  onChange={() => {}}
                  placeholder="Status"
                  disabled
                />
              </ModalSection>

              <ModalSection title={`Reason for ${reasonModalAction === "cancel" ? "Cancellation" : "Rejection"}`}>
                <textarea
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                  placeholder={reasonModalAction === "cancel" ? "Provide a reason for cancelling this job order..." : "Provide a reason for rejecting this job order..."}
                  className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                  rows={3}
                />
              </ModalSection>

              <ModalButtons
                onCancel={() => {
                  setShowReasonModal(false);
                  setReasonText("");
                }}
                cancelText="Cancel"
                submitText={reasonModalAction === "cancel"
                  ? (processingCancel ? "Cancelling..." : "Save")
                  : (processingApproval ? "Processing..." : "Save")}
                type="button"
                onSubmit={async () => {
                  if (reasonModalAction === "cancel" && orderToCancel) {
                    handleCancelOrder(orderToCancel);
                  } else if (reasonModalAction === "reject" && approvalOrder) {
                    try {
                      setProcessingApproval(true);
                      if (approvalOrder.job_type === "backorder") {
                        await jobOrdersApi.approveRework(approvalOrder.id, {
                          decision: "rejected",
                          rejection_reason: reasonText.trim(),
                        });
                      } else {
                        await jobOrdersApi.recordApproval(approvalOrder.id, {
                          decision: "rejected",
                          rejection_reason: reasonText.trim(),
                        });
                      }
                      setShowReasonModal(false);
                      setReasonText("");
                      setApprovalOrder(null);
                      showToast.success(
                        approvalOrder.job_type === "backorder"
                          ? "Rework rejected"
                          : "Customer rejected the job order"
                      );
                      fetchData();
                    } catch (err) {
                      showToast.error(err instanceof Error ? err.message : "Failed to record rejection");
                    } finally {
                      setProcessingApproval(false);
                    }
                  }
                }}
                disabled={!reasonText.trim()}
                loading={reasonModalAction === "cancel" ? processingCancel : processingApproval}
                loadingText={reasonModalAction === "cancel" ? "Cancelling..." : "Processing..."}
              />
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
