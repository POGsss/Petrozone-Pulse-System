import { useState, useEffect, useMemo, useCallback } from "react";
import {
  LuPlus,
  LuCircleAlert,
  LuRefreshCw,
  LuTrash2,
  LuClipboardList,
  LuChevronLeft,
  LuChevronRight,
  LuX,
  LuPencil,
  LuWrench,
  LuCheck,
} from "react-icons/lu";
import { jobOrdersApi, branchesApi, customersApi, vehiclesApi, catalogApi, pricingApi, thirdPartyRepairsApi } from "../../lib/api";
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
import type { JobOrder, Branch, Customer, Vehicle, CatalogItem, ResolvedPricing, ThirdPartyRepair } from "../../types";

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

// Item being added to the order (before submission)
interface DraftItem {
  catalog_item_id: string;
  catalog_item_name: string;
  catalog_item_type: string;
  quantity: number;
  base_price: number;
  labor_price: number | null;
  packaging_price: number | null;
  line_total: number;
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
  const canDelete = userRoles.some((r) => ["POC", "JS", "R"].includes(r));

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
  const [addNotes, setAddNotes] = useState("");
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [draftRepairs, setDraftRepairs] = useState<DraftRepair[]>([]);
  const [newRepairProvider, setNewRepairProvider] = useState("");
  const [newRepairDescription, setNewRepairDescription] = useState("");
  const [newRepairCost, setNewRepairCost] = useState("");
  const [newRepairDate, setNewRepairDate] = useState(new Date().toISOString().split("T")[0]);

  // Lookups for add modal
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(false);

  // Add item sub-form
  const [selectedCatalogItemId, setSelectedCatalogItemId] = useState("");
  const [selectedQty, setSelectedQty] = useState("1");
  const [resolvingPrice, setResolvingPrice] = useState(false);

  // Edit modal (notes only)
  const [showEditModal, setShowEditModal] = useState(false);
  const [editOrder, setEditOrder] = useState<JobOrder | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editingOrder, setEditingOrder] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete modal
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingOrder, setDeletingOrder] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<JobOrder | null>(null);

  // Third-party repairs (view modal)
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

  // Filter groups for SearchFilter
  const filterGroups: FilterGroup[] = useMemo(() => {
    const branchFilterOptions = branches.map((b) => ({
      value: b.id,
      label: b.name,
    }));
    return [
      {
        key: "branch",
        label: "Branch",
        options: branchFilterOptions,
      },
    ];
  }, [branches]);

  // Filtered + paginated
  const { paginatedItems, totalPages, filteredCount } = useMemo(() => {
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

      return matchSearch && matchBranch;
    });
    const pages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return {
      paginatedItems: filtered.slice(start, start + ITEMS_PER_PAGE),
      totalPages: pages,
      filteredCount: filtered.length,
    };
  }, [allOrders, searchQuery, activeFilters, currentPage]);

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
      const [ordersRes, branchesData] = await Promise.all([
        jobOrdersApi.getAll({ limit: 1000 }),
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

  // Vehicle options filtered by customer
  const vehicleOptions = useMemo(() => {
    return vehicles
      .filter((v) => v.status === "active" && (!addCustomerId || v.customer_id === addCustomerId))
      .map((v) => ({ value: v.id, label: `${v.plate_number} — ${v.model}` }));
  }, [vehicles, addCustomerId]);

  // Catalog item options (active items visible to user)
  const catalogItemOptions = useMemo(() => {
    return catalogItems
      .filter((i) => i.status === "active")
      .map((i) => ({ value: i.id, label: `${i.name} (${i.type})` }));
  }, [catalogItems]);

  // Draft total
  const draftTotal = useMemo(
    () => draftItems.reduce((sum, item) => sum + item.line_total, 0),
    [draftItems]
  );

  const draftRepairsTotal = useMemo(
    () => draftRepairs.reduce((sum, r) => sum + r.cost, 0),
    [draftRepairs]
  );

  // Load lookups when add modal opens
  const loadLookups = useCallback(async (branchId: string) => {
    try {
      setLoadingLookups(true);
      const [custRes, vehRes, catRes] = await Promise.all([
        customersApi.getAll({ limit: 1000, branch_id: branchId || undefined }),
        vehiclesApi.getAll({ limit: 1000, branch_id: branchId || undefined }),
        catalogApi.getAll({ limit: 1000 }),
      ]);
      setCustomers(custRes.data);
      setVehicles(vehRes.data);
      setCatalogItems(catRes.data);
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
    setAddNotes("");
    setDraftItems([]);
    setDraftRepairs([]);
    setNewRepairProvider("");
    setNewRepairDescription("");
    setNewRepairCost("");
    setNewRepairDate(new Date().toISOString().split("T")[0]);
    setSelectedCatalogItemId("");
    setSelectedQty("1");
    setAddError(null);
    setShowAddModal(true);
    loadLookups(branch);
  }

  // When branch changes, reload lookups and clear customer/vehicle
  function handleBranchChange(newBranchId: string) {
    setAddBranchId(newBranchId);
    setAddCustomerId("");
    setAddVehicleId("");
    setDraftItems([]);
    loadLookups(newBranchId);
  }

  // When customer changes, clear vehicle
  function handleCustomerChange(newCustomerId: string) {
    setAddCustomerId(newCustomerId);
    setAddVehicleId("");
  }

  // Add a catalog item to draft
  async function handleAddDraftItem() {
    if (!selectedCatalogItemId || !addBranchId) return;
    const qty = parseInt(selectedQty) || 1;

    // Check if already added
    if (draftItems.some((d) => d.catalog_item_id === selectedCatalogItemId)) {
      setAddError("This item is already in the order");
      return;
    }

    try {
      setResolvingPrice(true);
      setAddError(null);

      // Resolve pricing
      let resolved: ResolvedPricing;
      try {
        resolved = await pricingApi.resolve(selectedCatalogItemId, addBranchId);
      } catch {
        // Fallback: use catalog item base price only
        const catItem = catalogItems.find((c) => c.id === selectedCatalogItemId);
        if (!catItem) {
          setAddError("Catalog item not found");
          return;
        }
        resolved = {
          catalog_item: { id: catItem.id, name: catItem.name, type: catItem.type, base_price: catItem.base_price },
          pricing_rules: [],
          resolved_prices: { base_price: catItem.base_price, labor: null, packaging: null },
        };
      }

      const { resolved_prices, catalog_item } = resolved;
      const lineTotal =
        (resolved_prices.base_price + (resolved_prices.labor || 0) + (resolved_prices.packaging || 0)) * qty;

      setDraftItems((prev) => [
        ...prev,
        {
          catalog_item_id: catalog_item.id,
          catalog_item_name: catalog_item.name,
          catalog_item_type: catalog_item.type,
          quantity: qty,
          base_price: resolved_prices.base_price,
          labor_price: resolved_prices.labor,
          packaging_price: resolved_prices.packaging,
          line_total: lineTotal,
        },
      ]);
      setSelectedCatalogItemId("");
      setSelectedQty("1");
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to resolve pricing");
    } finally {
      setResolvingPrice(false);
    }
  }

  function removeDraftItem(catalogItemId: string) {
    setDraftItems((prev) => prev.filter((d) => d.catalog_item_id !== catalogItemId));
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
    if (draftItems.length === 0) { setAddError("Add at least one item"); return; }

    try {
      setAddingOrder(true);
      const createdOrder = await jobOrdersApi.create({
        customer_id: addCustomerId,
        vehicle_id: addVehicleId,
        branch_id: addBranchId,
        notes: addNotes.trim() || undefined,
        items: draftItems.map((d) => ({
          catalog_item_id: d.catalog_item_id,
          quantity: d.quantity,
        })),
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
    try {
      const [full, repairsRes] = await Promise.all([
        jobOrdersApi.getById(order.id),
        thirdPartyRepairsApi.getAll({ job_order_id: order.id }),
      ]);
      setViewOrder(full);
      setRepairs(repairsRes.data);
    } catch {
      // Keep showing list data if fetch fails
    } finally {
      setLoadingView(false);
      setLoadingRepairs(false);
    }
  }

  // --- Edit (notes only) ---
  function openEditModal(order: JobOrder) {
    setEditOrder(order);
    setEditNotes(order.notes || "");
    setEditError(null);
    setShowEditModal(true);
  }

  async function handleEditOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!editOrder) return;
    setEditError(null);

    try {
      setEditingOrder(true);
      await jobOrdersApi.update(editOrder.id, { notes: editNotes.trim() || null });
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
    setShowDeleteConfirm(true);
  }

  async function handleDeleteOrder() {
    if (!orderToDelete) return;
    try {
      setDeletingOrder(true);
      await jobOrdersApi.delete(orderToDelete.id);
      setShowDeleteConfirm(false);
      setOrderToDelete(null);
      showToast.success("Job order deleted successfully");
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete job order");
      showToast.error(err instanceof Error ? err.message : "Failed to delete job order");
    } finally {
      setDeletingOrder(false);
    }
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
    return (
      <div className="flex items-center justify-center py-12">
        <LuRefreshCw className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error && allOrders.length === 0) {
    return (
      <div className="bg-negative-200 border border-negative rounded-lg p-4 flex items-center gap-3">
        <LuCircleAlert className="w-5 h-5 text-negative-950 shrink-0" />
        <div>
          <p className="text-sm text-negative-950">{error}</p>
          <button onClick={fetchData} className="text-sm text-negative-600 hover:underline mt-1">
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
          <h3 className="text-lg font-semibold text-neutral-950">Job Orders</h3>
          <p className="text-sm text-neutral-900">{allOrders.length} orders total</p>
        </div>
        {canCreate && (
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-950 transition-colors"
          >
            <LuPlus className="w-4 h-4" />
            Create Job Order
          </button>
        )}
      </div>

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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {paginatedItems.map((order) => (
          <div
            key={order.id}
            onClick={() => openViewModal(order)}
            className="bg-white rounded-xl border border-neutral-200 p-4 cursor-pointer hover:bg-neutral-50 transition-colors"
          >
            {/* Card header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary-100 rounded-lg">
                  <LuClipboardList className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold text-neutral-950">Job - {order.order_number}</h4>
                  {order.branches && (
                    <span className="text-xs font-mono bg-neutral-100 text-primary px-2 py-0.5 rounded">
                      {order.branches.code}
                    </span>
                  )}
                </div>
              </div>
              <span className="px-2 py-1 rounded text-xs font-medium bg-positive-100 text-positive">
                {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
              </span>
            </div>

            {/* Order details */}
            <div className="space-y-1 text-sm text-neutral-900 mb-3">
              <p className="text-neutral-900">{formatPrice(order.total_amount)}</p>
              <p className="text-neutral-900">{order.vehicles ? `${order.vehicles.plate_number} ${order.vehicles.model}` : "—"}</p>
              <p className="text-neutral-900">{order.customers?.full_name || "—"}</p>
              <p className="text-neutral-900">{formatDate(order.created_at)}</p>
            </div>

            {/* Actions */}
            <div
              className={`flex items-center justify-end ${canUpdate || canDelete ? "gap-4 pt-3 border-t border-neutral-200" : ""
                }`}
            >
              {canUpdate && (
                <button
                  onClick={(e) => { e.stopPropagation(); openRepairActionModal(order); }}
                  className="flex items-center gap-1 text-sm text-positive hover:text-positive-900"
                >
                  <LuWrench className="w-4 h-4" />
                  Repair
                </button>
              )}
              {canUpdate && (
                <button
                  onClick={(e) => { e.stopPropagation(); openEditModal(order); }}
                  className="flex items-center gap-1 text-sm text-primary hover:text-primary-900"
                >
                  <LuPencil className="w-4 h-4" />
                  Edit
                </button>
              )}
              {canDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); openDeleteConfirmModal(order); }}
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
              ? "No job orders match your search."
              : 'No job orders found. Click "Create Job Order" to create one.'}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white rounded-xl p-4 border border-neutral-200">
          <p className="text-sm text-neutral-900">
            Page {currentPage} of {totalPages} ({filteredCount} orders)
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

      {/* ========== Create Job Order Modal ========== */}
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
              onChange={setAddVehicleId}
              placeholder={loadingLookups ? "Loading vehicles..." : "Select Vehicle *"}
              options={vehicleOptions}
              disabled={loadingLookups || !addCustomerId}
            />
            <textarea
              value={addNotes}
              onChange={(e) => setAddNotes(e.target.value)}
              placeholder="Notes (optional)"
              rows={2}
              className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
            />
          </ModalSection>

          <ModalSection title="Items">
            {/* Add item row */}
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <ModalSelect
                  value={selectedCatalogItemId}
                  onChange={setSelectedCatalogItemId}
                  placeholder={loadingLookups ? "Loading..." : "Select Catalog Item"}
                  options={catalogItemOptions}
                  disabled={loadingLookups || !addBranchId}
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
              <button
                type="button"
                onClick={handleAddDraftItem}
                disabled={!selectedCatalogItemId || resolvingPrice}
                className="px-4.5 py-4.5 bg-primary text-white rounded-xl hover:bg-primary-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                {resolvingPrice ? (
                  <LuRefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <LuPlus className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Draft items list */}
            {draftItems.length > 0 && (
              <div className="mt-3 space-y-4">
                {draftItems.map((item) => (
                  <div
                    key={item.catalog_item_id}
                    className="flex items-center justify-between bg-neutral-100 rounded-xl px-4 py-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-neutral-950 text-sm truncate">
                        {item.catalog_item_name}
                        <span className="text-neutral-900 font-normal ml-1">({item.catalog_item_type})</span>
                      </p>
                      <p className="text-xs text-neutral-900">
                        Base: {formatPrice(item.base_price)}
                        {item.labor_price != null && ` + Labor: ${formatPrice(item.labor_price)}`}
                        {item.packaging_price != null && ` + Pkg: ${formatPrice(item.packaging_price)}`}
                        {" × "}{item.quantity}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 ml-3">
                      <span className="font-semibold text-neutral-950 text-sm whitespace-nowrap">
                        {formatPrice(item.line_total)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeDraftItem(item.catalog_item_id)}
                        className="text-negative hover:text-negative-900 p-1"
                      >
                        <LuX className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}

                {/* Total */}
                <div className="flex justify-between items-center px-4 py-3 bg-primary-100 rounded-xl">
                  <span className="font-semibold text-neutral-950">Total</span>
                  <span className="font-bold text-primary text-lg">{formatPrice(draftTotal)}</span>
                </div>
              </div>
            )}

            {draftItems.length === 0 && (
              <p className="text-sm text-neutral-900 text-center py-4">
                No items added yet. Select a catalog item and click +.
              </p>
            )}
          </ModalSection>

          <ModalSection title="Third-Party Repairs">
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
              rows={2}
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
            submitText={addingOrder ? "Creating..." : "Create Order"}
            loading={addingOrder}
          />
        </form>
      </Modal>

      {/* ========== View Job Order Modal ========== */}
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
                  value={viewOrder.status.charAt(0).toUpperCase() + viewOrder.status.slice(1)}
                  onChange={() => { }}
                  placeholder="Status"
                  disabled
                />
                <ModalInput
                  type="text"
                  value={formatPrice(viewOrder.total_amount + repairs.reduce((sum, r) => sum + r.cost, 0))}
                  onChange={() => { }}
                  placeholder="Total"
                  disabled
                />
              </div>
            </ModalSection>

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
            </ModalSection>

            {/* Items section */}
            <ModalSection title="Items">
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
                    <div
                      key={item.id}
                      className="flex items-center justify-between bg-neutral-100 rounded-xl px-4 py-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-neutral-950 text-sm truncate">
                          {item.catalog_item_name}
                          <span className="text-neutral-900 font-normal ml-1">({item.catalog_item_type})</span>
                        </p>
                        <p className="text-xs text-neutral-900">
                          Base: {formatPrice(item.base_price)}
                          {item.labor_price != null && ` + Labor: ${formatPrice(item.labor_price)}`}
                          {item.packaging_price != null && ` + Pkg: ${formatPrice(item.packaging_price)}`}
                          {" × "}{item.quantity}
                        </p>
                      </div>
                      <span className="font-semibold text-neutral-950 text-sm whitespace-nowrap ml-3">
                        {formatPrice(item.line_total)}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center px-4 py-3 bg-primary-100 rounded-xl">
                    <span className="font-semibold text-neutral-950">Items Total</span>
                    <span className="font-bold text-primary text-lg">
                      {formatPrice(viewOrder.total_amount)}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-neutral-900 text-center py-3">No items.</p>
              )}
            </ModalSection>

            {/* Third-Party Repairs section */}
            <ModalSection title="Third-Party Repairs">
              {loadingRepairs ? (
                <div className="space-y-4">
                  {[1, 2].map((i) => (
                    <div key={i} className="bg-neutral-100 rounded-xl px-4 py-3 animate-pulse">
                      <div className="h-4 bg-neutral-200 rounded w-3/4 mb-2" />
                      <div className="h-3 bg-neutral-200 rounded w-1/2" />
                    </div>
                  ))}
                </div>
              ) : repairs.length > 0 ? (
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
                  <div className="flex justify-between items-center px-4 py-3 bg-primary-100 rounded-xl">
                    <span className="font-semibold text-neutral-950">Repairs Total</span>
                    <span className="font-bold text-primary text-lg">
                      {formatPrice(repairs.reduce((sum, r) => sum + r.cost, 0))}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-neutral-900 text-center py-3">No third-party repairs.</p>
              )}
            </ModalSection>

            {viewOrder.notes && (
              <ModalSection title="Notes">
                <textarea
                  value={viewOrder.notes}
                  readOnly
                  disabled
                  rows={3}
                  className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 focus:outline-none transition-all resize-none opacity-50 cursor-not-allowed"
                />
              </ModalSection>
            )}

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

      {/* ========== Manage Repairs Modal (wrench action) ========== */}
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
                rows={2}
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

      {/* ========== Edit Job Order Modal (notes only) ========== */}
      <Modal
        isOpen={showEditModal && !!editOrder}
        onClose={() => setShowEditModal(false)}
        title="Edit Job Order Notes"
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
              rows={4}
              className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
            />
          </ModalSection>

          <ModalError message={editError} />

          <ModalButtons
            onCancel={() => setShowEditModal(false)}
            submitText={editingOrder ? "Saving..." : "Save Changes"}
            loading={editingOrder}
          />
        </form>
      </Modal>

      {/* ========== Delete Confirmation Modal ========== */}
      <Modal
        isOpen={showDeleteConfirm && !!orderToDelete}
        onClose={() => setShowDeleteConfirm(false)}
        title="Delete Job Order"
        maxWidth="sm"
      >
        {orderToDelete && (
          <div>
            <div className="bg-neutral-100 rounded-xl p-4 my-4">
              <p className="text-neutral-900">
                Are you sure you want to delete{" "}
                <strong className="text-neutral-950">{orderToDelete.order_number}</strong>?
              </p>
            </div>
            <p className="text-sm text-neutral-900 mb-2">
              This will permanently remove the job order and all its items.
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
                {deletingOrder ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}