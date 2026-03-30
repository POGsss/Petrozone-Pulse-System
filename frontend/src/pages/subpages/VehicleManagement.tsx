import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  LuPlus,
  LuPencil,
  LuTrash2,
  LuCar,
  LuHistory,
  LuWrench,
  LuEllipsisVertical,
  LuX,
  LuCheck,
} from "react-icons/lu";
import { vehiclesApi, customersApi, branchesApi } from "../../lib/api";
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
import type { Vehicle, Customer, Branch, VehicleExternalRepair, VehicleRepairHistory } from "../../types";

const ITEMS_PER_PAGE = 12;

const VEHICLE_TYPE_OPTIONS = [
  { value: "sedan", label: "Sedan" },
  { value: "suv", label: "SUV" },
  { value: "truck", label: "Truck" },
  { value: "van", label: "Van" },
  { value: "motorcycle", label: "Motorcycle" },
  { value: "hatchback", label: "Hatchback" },
  { value: "coupe", label: "Coupe" },
  { value: "wagon", label: "Wagon" },
  { value: "bus", label: "Bus" },
  { value: "other", label: "Other" },
];

const VEHICLE_CLASS_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "heavy", label: "Heavy" },
  { value: "extra_heavy", label: "Extra Heavy" },
];

function vehicleClassLabel(vc: string): string {
  return VEHICLE_CLASS_OPTIONS.find((o) => o.value === vc)?.label || vc;
}

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
    hour: "numeric",
    minute: "2-digit",
  });
}

function vehicleTypeLabel(type: string): string {
  return VEHICLE_TYPE_OPTIONS.find((o) => o.value === type)?.label || type;
}

export function VehicleManagement() {
  const { user } = useAuth();
  const userRoles = user?.roles || [];
  const isHM = userRoles.includes("HM");

  // Permission checks - HM, POC, JS, R can manage vehicles
  const canCreate = userRoles.some((r) => ["HM", "POC", "JS", "R"].includes(r));
  const canUpdate = canCreate;
  const canDelete = canCreate;

  // Data state
  const [allVehicles, setAllVehicles] = useState<Vehicle[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search, filters & pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = useState(1);

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [addForm, setAddForm] = useState({
    plate_number: "",
    vehicle_type: "sedan",
    vehicle_class: "light" as string,
    orcr: "",
    model: "",
    customer_id: "",
    branch_id: "",
    color: "",
    year: "",
    engine_number: "",
    chassis_number: "",
    notes: "",
  });
  const [addError, setAddError] = useState<string | null>(null);

  // View modal
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewVehicle, setViewVehicle] = useState<Vehicle | null>(null);

  // Card dropdown actions
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const closeDropdown = useCallback(() => setOpenDropdownId(null), []);

  // Repair history modal state
  const [showRepairHistoryModal, setShowRepairHistoryModal] = useState(false);
  const [repairHistoryVehicle, setRepairHistoryVehicle] = useState<Vehicle | null>(null);
  const [repairHistory, setRepairHistory] = useState<VehicleRepairHistory[]>([]);
  const [loadingRepairHistory, setLoadingRepairHistory] = useState(false);

  // External repair modal state
  const [showExternalRepairModal, setShowExternalRepairModal] = useState(false);
  const [externalRepairVehicle, setExternalRepairVehicle] = useState<Vehicle | null>(null);
  const [externalRepairs, setExternalRepairs] = useState<VehicleExternalRepair[]>([]);
  const [originalExternalRepairs, setOriginalExternalRepairs] = useState<VehicleExternalRepair[]>([]);
  const [loadingExternalRepairs, setLoadingExternalRepairs] = useState(false);
  const [savingExternalRepair, setSavingExternalRepair] = useState(false);
  const [editingExternalRepairId, setEditingExternalRepairId] = useState<string | null>(null);
  const [externalRepairError, setExternalRepairError] = useState<string | null>(null);
  const [externalRepairForm, setExternalRepairForm] = useState({
    provider_name: "",
    description: "",
    service_date: new Date().toISOString().split("T")[0] || "",
    notes: "",
  });

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [editForm, setEditForm] = useState({
    plate_number: "",
    vehicle_type: "sedan",
    vehicle_class: "light" as string,
    orcr: "",
    model: "",
    customer_id: "",
    status: "active",
    color: "",
    year: "",
    engine_number: "",
    chassis_number: "",
    notes: "",
  });
  const [editError, setEditError] = useState<string | null>(null);

  // Delete modal
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingVehicle, setDeletingVehicle] = useState(false);
  const [vehicleToDelete, setVehicleToDelete] = useState<Vehicle | null>(null);
  const [vehicleHasReferences, setVehicleHasReferences] = useState(false);
  const [checkingReferences, setCheckingReferences] = useState(false);

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
          { value: "active", label: "Active" },
          { value: "inactive", label: "Inactive" },
        ],
      },
      {
        key: "vehicle_type",
        label: "Type",
        options: VEHICLE_TYPE_OPTIONS,
      },
      {
        key: "branch",
        label: "Branch",
        options: branchFilterOptions,
      },
    ];
  }, [branches]);

  // Filtered + paginated
  const { paginatedVehicles, totalPages } = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const filtered = allVehicles.filter((v) => {
      // Search
      const matchSearch =
        !q ||
        v.plate_number.toLowerCase().includes(q) ||
        v.model.toLowerCase().includes(q) ||
        v.orcr.toLowerCase().includes(q) ||
        v.color?.toLowerCase().includes(q) ||
        v.customers?.full_name?.toLowerCase().includes(q);

      // Filters
      const statusFilter = activeFilters.status;
      const effectiveStatusFilter = statusFilter || "all";
      const matchStatus = effectiveStatusFilter === "all" ? v.status !== "inactive" : v.status === effectiveStatusFilter;

      const typeFilter = activeFilters.vehicle_type;
      const matchType = !typeFilter || typeFilter === "all" || v.vehicle_type === typeFilter;

      const branchFilter = activeFilters.branch;
      const matchBranch = !branchFilter || branchFilter === "all" || v.branch_id === branchFilter;

      return matchSearch && matchStatus && matchType && matchBranch;
    });
    const pages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return {
      paginatedVehicles: filtered.slice(start, start + ITEMS_PER_PAGE),
      totalPages: pages,
    };
  }, [allVehicles, searchQuery, activeFilters, currentPage]);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeFilters]);

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

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);
      const [vehiclesRes, customersRes, branchesData] = await Promise.all([
        vehiclesApi.getAll({ limit: 1000 }),
        customersApi.getAll({ limit: 1000 }),
        branchesApi.getAll(),
      ]);
      setAllVehicles(vehiclesRes.data);
      setCustomers(customersRes.data);
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

  // Customers filtered by selected branch (for add/edit)
  function getCustomerOptionsForBranch(branchId: string) {
    return customers
      .filter((c) => c.branch_id === branchId && c.status === "active")
      .map((c) => ({ value: c.id, label: c.full_name }));
  }

  // --- Add ---
  function openAddModal() {
    setAddForm({
      plate_number: "",
      vehicle_type: "sedan",
      vehicle_class: "light",
      orcr: "",
      model: "",
      customer_id: "",
      branch_id: defaultBranchId,
      color: "",
      year: "",
      engine_number: "",
      chassis_number: "",
      notes: "",
    });
    setAddError(null);
    setShowAddModal(true);
  }

  async function handleAddVehicle(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);

    if (!addForm.plate_number.trim()) {
      setAddError("Plate number is required");
      return;
    }
    if (!addForm.model.trim()) {
      setAddError("Model is required");
      return;
    }
    if (!addForm.customer_id) {
      setAddError("Customer is required");
      return;
    }
    if (!addForm.branch_id) {
      setAddError("Branch is required");
      return;
    }
    if (addForm.year) {
      const y = parseInt(addForm.year);
      if (isNaN(y) || y < 1900 || y > new Date().getFullYear() + 1) {
        setAddError("Invalid year");
        return;
      }
    }

    try {
      setAddingVehicle(true);
      await vehiclesApi.create({
        plate_number: addForm.plate_number.trim(),
        vehicle_type: addForm.vehicle_type,
        vehicle_class: addForm.vehicle_class,
        orcr: addForm.orcr.trim(),
        model: addForm.model.trim(),
        customer_id: addForm.customer_id,
        branch_id: addForm.branch_id,
        color: addForm.color.trim() || undefined,
        year: addForm.year ? parseInt(addForm.year) : undefined,
        engine_number: addForm.engine_number.trim() || undefined,
        chassis_number: addForm.chassis_number.trim() || undefined,
        notes: addForm.notes.trim() || undefined,
      });
      setShowAddModal(false);
      showToast.success("Vehicle created successfully");
      fetchData();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to create vehicle");
      showToast.error(err instanceof Error ? err.message : "Failed to create vehicle");
    } finally {
      setAddingVehicle(false);
    }
  }

  // --- View ---
  async function openViewModal(vehicle: Vehicle) {
    setViewVehicle(vehicle);
    setShowViewModal(true);
  }

  async function openRepairHistoryModal(vehicle: Vehicle) {
    setRepairHistoryVehicle(vehicle);
    setRepairHistory([]);
    setLoadingRepairHistory(true);
    setShowRepairHistoryModal(true);
    closeDropdown();

    try {
      const history = await vehiclesApi.getRepairHistory(vehicle.id);
      setRepairHistory(history || []);
    } catch (err) {
      setRepairHistory([]);
      showToast.error(err instanceof Error ? err.message : "Failed to load repair history");
    } finally {
      setLoadingRepairHistory(false);
    }
  }

  async function openExternalRepairModal(vehicle: Vehicle) {
    setExternalRepairVehicle(vehicle);
    setExternalRepairs([]);
    setOriginalExternalRepairs([]);
    setExternalRepairError(null);
    setEditingExternalRepairId(null);
    setExternalRepairForm({
      provider_name: "",
      description: "",
      service_date: new Date().toISOString().split("T")[0] || "",
      notes: "",
    });
    setLoadingExternalRepairs(true);
    setShowExternalRepairModal(true);
    closeDropdown();

    try {
      const records = await vehiclesApi.getExternalRepairs(vehicle.id);
      setExternalRepairs(records || []);
      setOriginalExternalRepairs(records || []);
    } catch (err) {
      setExternalRepairs([]);
      setOriginalExternalRepairs([]);
      setExternalRepairError(err instanceof Error ? err.message : "Failed to load external repairs");
    } finally {
      setLoadingExternalRepairs(false);
    }
  }

  function handleAddExternalRepair() {
    setExternalRepairError(null);

    if (!externalRepairForm.provider_name.trim()) {
      setExternalRepairError("External shop is required");
      return;
    }
    if (!externalRepairForm.description.trim()) {
      setExternalRepairError("Repair description is required");
      return;
    }
    if (!externalRepairForm.service_date) {
      setExternalRepairError("Date is required");
      return;
    }

    if (editingExternalRepairId) {
      setExternalRepairs((prev) =>
        prev.map((item) =>
          item.id === editingExternalRepairId
            ? {
              ...item,
              repair_name: externalRepairForm.provider_name.trim(),
              provider_name: externalRepairForm.provider_name.trim(),
              description: externalRepairForm.description.trim(),
              service_date: externalRepairForm.service_date,
              notes: externalRepairForm.notes.trim() || null,
            }
            : item
        )
      );
      setEditingExternalRepairId(null);
    } else {
      const newItem: VehicleExternalRepair = {
        id: `new-${crypto.randomUUID()}`,
        vehicle_id: externalRepairVehicle?.id || "",
        repair_name: externalRepairForm.provider_name.trim(),
        provider_name: externalRepairForm.provider_name.trim(),
        description: externalRepairForm.description.trim(),
        service_date: externalRepairForm.service_date,
        notes: externalRepairForm.notes.trim() || null,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setExternalRepairs((prev) => [...prev, newItem]);
    }

    setExternalRepairForm({
      provider_name: "",
      description: "",
      service_date: new Date().toISOString().split("T")[0] || "",
      notes: "",
    });
  }

  function startEditExternalRepair(item: VehicleExternalRepair) {
    setEditingExternalRepairId(item.id);
    setExternalRepairForm({
      provider_name: item.provider_name || "",
      description: item.description || "",
      service_date: item.service_date ? String(item.service_date).split("T")[0] || "" : "",
      notes: item.notes || "",
    });
    setExternalRepairError(null);
  }

  function cancelEditExternalRepair() {
    setEditingExternalRepairId(null);
    setExternalRepairForm({
      provider_name: "",
      description: "",
      service_date: new Date().toISOString().split("T")[0] || "",
      notes: "",
    });
    setExternalRepairError(null);
  }

  function handleDeleteExternalRepair(id: string) {
    setExternalRepairs((prev) => prev.filter((item) => item.id !== id));
  }

  async function handleSaveExternalRepairs() {
    if (!externalRepairVehicle) return;
    setSavingExternalRepair(true);
    setExternalRepairError(null);

    try {
      const originalIds = new Set(originalExternalRepairs.map((r) => r.id));
      const currentIds = new Set(externalRepairs.map((r) => r.id));

      const toDelete = originalExternalRepairs.filter((r) => !currentIds.has(r.id));
      const toCreate = externalRepairs.filter((r) => r.id.startsWith("new-"));
      const toUpdate = externalRepairs.filter((r) => {
        if (r.id.startsWith("new-")) return false;
        if (!originalIds.has(r.id)) return false;
        const orig = originalExternalRepairs.find((o) => o.id === r.id);
        if (!orig) return false;
        return (
          (orig.provider_name || "") !== (r.provider_name || "") ||
          (orig.description || "") !== (r.description || "") ||
          String(orig.service_date).split("T")[0] !== String(r.service_date).split("T")[0] ||
          (orig.notes || "") !== (r.notes || "")
        );
      });

      await Promise.all([
        ...toDelete.map((r) => vehiclesApi.deleteExternalRepair(externalRepairVehicle.id, r.id)),
        ...toCreate.map((r) =>
          vehiclesApi.createExternalRepair(externalRepairVehicle.id, {
            repair_name: (r.provider_name || "").trim(),
            provider_name: (r.provider_name || "").trim(),
            description: (r.description || "").trim(),
            service_date: String(r.service_date).split("T")[0] || "",
            notes: r.notes || undefined,
          })
        ),
        ...toUpdate.map((r) =>
          vehiclesApi.updateExternalRepair(externalRepairVehicle.id, r.id, {
            repair_name: (r.provider_name || "").trim(),
            provider_name: (r.provider_name || "").trim(),
            description: (r.description || "").trim(),
            service_date: String(r.service_date).split("T")[0] || "",
            notes: r.notes || null,
          })
        ),
      ]);

      setShowExternalRepairModal(false);
      setExternalRepairVehicle(null);
      showToast.success("External repairs saved successfully");
      fetchData();
    } catch (err) {
      setExternalRepairError(err instanceof Error ? err.message : "Failed to save external repairs");
    } finally {
      setSavingExternalRepair(false);
    }
  }

  // --- Edit ---
  function openEditModal(vehicle: Vehicle) {
    setSelectedVehicle(vehicle);
    setEditForm({
      plate_number: vehicle.plate_number,
      vehicle_type: vehicle.vehicle_type,
      vehicle_class: vehicle.vehicle_class || "light",
      orcr: vehicle.orcr,
      model: vehicle.model,
      customer_id: vehicle.customer_id,
      status: vehicle.status,
      color: vehicle.color || "",
      year: vehicle.year?.toString() || "",
      engine_number: vehicle.engine_number || "",
      chassis_number: vehicle.chassis_number || "",
      notes: vehicle.notes || "",
    });
    setEditError(null);
    setShowEditModal(true);
  }

  async function handleEditVehicle(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedVehicle) return;
    setEditError(null);

    if (!editForm.plate_number.trim()) {
      setEditError("Plate number cannot be empty");
      return;
    }
    if (!editForm.model.trim()) {
      setEditError("Model cannot be empty");
      return;
    }
    if (!editForm.customer_id) {
      setEditError("Customer is required");
      return;
    }
    if (editForm.year) {
      const y = parseInt(editForm.year);
      if (isNaN(y) || y < 1900 || y > new Date().getFullYear() + 1) {
        setEditError("Invalid year");
        return;
      }
    }

    try {
      setEditingVehicle(true);
      await vehiclesApi.update(selectedVehicle.id, {
        plate_number: editForm.plate_number.trim(),
        vehicle_type: editForm.vehicle_type,
        vehicle_class: editForm.vehicle_class,
        orcr: editForm.orcr.trim(),
        model: editForm.model.trim(),
        customer_id: editForm.customer_id,
        status: editForm.status,
        color: editForm.color.trim() || null,
        year: editForm.year ? parseInt(editForm.year) : null,
        engine_number: editForm.engine_number.trim() || null,
        chassis_number: editForm.chassis_number.trim() || null,
        notes: editForm.notes.trim() || null,
      });
      setShowEditModal(false);
      setSelectedVehicle(null);
      showToast.success("Vehicle updated successfully");
      fetchData();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update vehicle");
      showToast.error(err instanceof Error ? err.message : "Failed to update vehicle");
    } finally {
      setEditingVehicle(false);
    }
  }

  // --- Delete ---
  async function openDeleteConfirmModal(vehicle: Vehicle) {
    setVehicleToDelete(vehicle);
    setVehicleHasReferences(false);
    setCheckingReferences(true);
    setShowDeleteConfirm(true);
    try {
      const result = await vehiclesApi.checkReferences(vehicle.id);
      setVehicleHasReferences(result.hasReferences);
    } catch {
      // Default to deactivate (safer) if check fails
      setVehicleHasReferences(true);
    } finally {
      setCheckingReferences(false);
    }
  }

  async function handleDeleteVehicle() {
    if (!vehicleToDelete) return;
    try {
      setDeletingVehicle(true);
      const result = await vehiclesApi.delete(vehicleToDelete.id);
      setShowDeleteConfirm(false);
      setVehicleToDelete(null);
      const isDeactivated = result.message?.toLowerCase().includes("deactivated");
      showToast.success(isDeactivated ? "Vehicle deactivated successfully" : "Vehicle deleted successfully");
      fetchData();
    } catch (err) {
      const failMsg = vehicleHasReferences ? "Failed to deactivate vehicle" : "Failed to delete vehicle";
      setError(err instanceof Error ? err.message : failMsg);
      showToast.error(err instanceof Error ? err.message : failMsg);
    } finally {
      setDeletingVehicle(false);
    }
  }

  if (loading) {
    return <SkeletonLoader showHeader rows={6} variant="grid" />;
  }

  if (error && allVehicles.length === 0) {
    return <ErrorAlert message={error} onRetry={fetchData} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Vehicles"
        subtitle={`${allVehicles.length} vehicles total`}
        buttonLabel="Add New Vehicle"
        onAdd={openAddModal}
        showButton={canCreate}
      />

      {/* Search & Filter bar */}
      {allVehicles.length > 0 && (
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

      {/* Vehicle Cards Grid */}
      <CardGrid
        isEmpty={paginatedVehicles.length === 0}
        emptyMessage={
          searchQuery
            ? "No vehicles match your search."
            : 'No vehicles found. Click "Add Vehicle" to create one.'
        }
      >
        {paginatedVehicles.map((vehicle) => (
          <GridCard
            key={vehicle.id}
            onClick={() => openViewModal(vehicle)}
            icon={<LuCar className="w-5 h-5 text-primary" />}
            title={vehicle.plate_number}
            subtitle={
              vehicle.branches ? (
                <span className="text-xs font-mono bg-neutral-100 text-primary px-2 py-0.5 rounded">
                  {vehicle.branches.code}
                </span>
              ) : undefined
            }
            statusBadge={{
              label: vehicle.status === "active" ? "Active" : "Inactive",
              className: vehicle.status === "active"
                ? "bg-positive-100 text-positive"
                : "bg-negative-100 text-negative",
            }}
            details={
              <>
                <p className="text-neutral-900">{vehicleTypeLabel(vehicle.vehicle_type)} · {vehicleClassLabel(vehicle.vehicle_class || "light")}</p>
                <p className="text-neutral-900">{vehicle.model}</p>
                <p className="text-neutral-900">{vehicle.orcr}</p>
                {vehicle.color && <p className="text-neutral-900">{vehicle.color}{vehicle.year ? ` · ${vehicle.year}` : ""}</p>}
                {vehicle.customers && <p className="text-neutral-900">{vehicle.customers.full_name}</p>}
              </>
            }
            actions={[
              ...(canUpdate ? [{
                label: "Edit",
                icon: <LuPencil className="w-4 h-4" />,
                onClick: (e: React.MouseEvent) => { e.stopPropagation(); openEditModal(vehicle); },
              }] : []),
              ...(canDelete ? [{
                label: "Delete",
                icon: <LuTrash2 className="w-4 h-4" />,
                onClick: (e: React.MouseEvent) => { e.stopPropagation(); openDeleteConfirmModal(vehicle); },
                className: "flex items-center gap-1 text-sm text-negative hover:text-negative-900",
              }] : []),
            ]}
            extraActions={
              <div className="relative" ref={openDropdownId === `vehicle-${vehicle.id}` ? dropdownRef : undefined}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenDropdownId(openDropdownId === `vehicle-${vehicle.id}` ? null : `vehicle-${vehicle.id}`);
                  }}
                  className="flex items-center gap-1 text-sm text-neutral-950 hover:text-neutral-900"
                  title="More actions"
                >
                  <LuEllipsisVertical className="w-4 h-4" /> More
                </button>
                {openDropdownId === `vehicle-${vehicle.id}` && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg border border-neutral-200 py-2 z-50">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); closeDropdown(); openRepairHistoryModal(vehicle); }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors"
                    >
                      <LuHistory className="w-4 h-4" /> Repair History
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); closeDropdown(); openExternalRepairModal(vehicle); }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors"
                    >
                      <LuWrench className="w-4 h-4" /> External Repair
                    </button>
                  </div>
                )}
              </div>
            }
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

      {/* Add Vehicle Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add New Vehicle"
        maxWidth="xl"
      >
        <form onSubmit={handleAddVehicle}>
          <ModalSection title="Vehicle Information">
            <ModalInput
              type="text"
              value={addForm.plate_number}
              onChange={(v) =>
                setAddForm((prev) => ({ ...prev, plate_number: v.toUpperCase() }))
              }
              placeholder="Plate Number *"
              required
              className="font-mono uppercase"
            />
            <ModalSelect
              value={addForm.vehicle_type}
              onChange={(v) =>
                setAddForm((prev) => ({ ...prev, vehicle_type: v }))
              }
              options={VEHICLE_TYPE_OPTIONS}
            />
            <ModalSelect
              value={addForm.vehicle_class}
              onChange={(v) =>
                setAddForm((prev) => ({ ...prev, vehicle_class: v }))
              }
              options={VEHICLE_CLASS_OPTIONS}
            />
            <ModalInput
              type="text"
              value={addForm.model}
              onChange={(v) => setAddForm((prev) => ({ ...prev, model: v }))}
              placeholder="Model *"
              required
            />
            <ModalInput
              type="text"
              value={addForm.orcr}
              onChange={(v) => setAddForm((prev) => ({ ...prev, orcr: v }))}
              placeholder="OR/CR (optional)"
            />
          </ModalSection>

          <ModalSection title="Assignment">
            <ModalSelect
              value={addForm.branch_id}
              onChange={(v) =>
                setAddForm((prev) => ({ ...prev, branch_id: v, customer_id: "" }))
              }
              placeholder="Select Branch *"
              options={branchOptions}
            />
            <ModalSelect
              value={addForm.customer_id}
              onChange={(v) =>
                setAddForm((prev) => ({ ...prev, customer_id: v }))
              }
              placeholder="Select Customer *"
              options={getCustomerOptionsForBranch(addForm.branch_id)}
              disabled={!addForm.branch_id}
            />
            {addForm.branch_id && getCustomerOptionsForBranch(addForm.branch_id).length === 0 && (
              <p className="text-xs text-negative mt-1">
                No active customers found for this branch. Create a customer first.
              </p>
            )}
          </ModalSection>

          <ModalSection title="Additional Details">
            <div className="grid grid-cols-2 gap-4">
              <ModalInput
                type="text"
                value={addForm.color}
                onChange={(v) => setAddForm((prev) => ({ ...prev, color: v }))}
                placeholder="Color"
              />
              <ModalInput
                type="number"
                value={addForm.year}
                onChange={(v) => setAddForm((prev) => ({ ...prev, year: v }))}
                placeholder="Year"
              />
            </div>
            <ModalInput
              type="text"
              value={addForm.engine_number}
              onChange={(v) =>
                setAddForm((prev) => ({ ...prev, engine_number: v }))
              }
              placeholder="Engine Number"
            />
            <ModalInput
              type="text"
              value={addForm.chassis_number}
              onChange={(v) =>
                setAddForm((prev) => ({ ...prev, chassis_number: v }))
              }
              placeholder="Chassis Number"
            />
            <textarea
              value={addForm.notes}
              onChange={(e) =>
                setAddForm((prev) => ({ ...prev, notes: e.target.value }))
              }
              placeholder="Notes (optional)"
              rows={3}
              className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
            />
          </ModalSection>

          <ModalError message={addError} />

          <ModalButtons
            onCancel={() => setShowAddModal(false)}
            submitText={addingVehicle ? "Creating..." : "Create Vehicle"}
            loading={addingVehicle}
          />
        </form>
      </Modal>

      {/* View Vehicle Modal */}
      <Modal
        isOpen={showViewModal && !!viewVehicle}
        onClose={() => setShowViewModal(false)}
        title="Vehicle Details"
        maxWidth="xl"
      >
        {viewVehicle && (
          <div>
            <ModalSection title="Vehicle Information">
              <ModalInput
                type="text"
                value={viewVehicle.plate_number}
                onChange={() => { }}
                placeholder="Plate Number"
                disabled
                className="font-mono"
              />
              <ModalSelect
                value={viewVehicle.vehicle_type}
                onChange={() => { }}
                options={VEHICLE_TYPE_OPTIONS}
                disabled
              />
              <ModalSelect
                value={viewVehicle.vehicle_class || "light"}
                onChange={() => { }}
                options={VEHICLE_CLASS_OPTIONS}
                disabled
              />
              <ModalInput
                type="text"
                value={viewVehicle.model}
                onChange={() => { }}
                placeholder="Model"
                disabled
              />
              <ModalInput
                type="text"
                value={viewVehicle.orcr}
                onChange={() => { }}
                placeholder="OR/CR"
                disabled
              />
              <ModalSelect
                value={viewVehicle.status}
                onChange={() => { }}
                options={[
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ]}
                disabled
              />
            </ModalSection>

            <ModalSection title="Assignment">
              <ModalInput
                type="text"
                value={
                  viewVehicle.customers?.full_name || "-"
                }
                onChange={() => { }}
                placeholder="Customer"
                disabled
              />
              <ModalInput
                type="text"
                value={
                  viewVehicle.branches
                    ? `${viewVehicle.branches.name} (${viewVehicle.branches.code})`
                    : "-"
                }
                onChange={() => { }}
                placeholder="Branch"
                disabled
              />
            </ModalSection>

            <ModalSection title="Additional Details">
              <div className="grid grid-cols-2 gap-4">
                <ModalInput
                  type="text"
                  value={viewVehicle.color || "-"}
                  onChange={() => { }}
                  placeholder="Color"
                  disabled
                />
                <ModalInput
                  type="text"
                  value={viewVehicle.year?.toString() || "-"}
                  onChange={() => { }}
                  placeholder="Year"
                  disabled
                />
              </div>
              <ModalInput
                type="text"
                value={viewVehicle.engine_number || "-"}
                onChange={() => { }}
                placeholder="Engine Number"
                disabled
              />
              <ModalInput
                type="text"
                value={viewVehicle.chassis_number || "-"}
                onChange={() => { }}
                placeholder="Chassis Number"
                disabled
              />
              <textarea
                value={viewVehicle.notes || "-"}
                readOnly
                disabled
                rows={3}
                className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none transition-all resize-none cursor-readonly"
              />
            </ModalSection>

            <ModalSection title="Timestamps">
              <div className="grid grid-cols-2 gap-4">
                <ModalInput
                  type="text"
                  value={formatDate(viewVehicle.created_at)}
                  onChange={() => { }}
                  placeholder="Created"
                  disabled
                />
                <ModalInput
                  type="text"
                  value={formatDate(viewVehicle.updated_at)}
                  onChange={() => { }}
                  placeholder="Updated"
                  disabled
                />
              </div>
            </ModalSection>
          </div>
        )}
      </Modal>

      {/* Vehicle Repair History Modal */}
      <Modal
        isOpen={showRepairHistoryModal && !!repairHistoryVehicle}
        onClose={() => setShowRepairHistoryModal(false)}
        title="Vehicle Repair History"
        maxWidth="xl"
      >
        {repairHistoryVehicle && (
          <div>
            <ModalSection title="Vehicle">
              <ModalInput
                type="text"
                value={`${repairHistoryVehicle.plate_number} · ${repairHistoryVehicle.model}`}
                onChange={() => { }}
                placeholder="Vehicle"
                disabled
              />
            </ModalSection>

            <ModalSection title="History">
              {loadingRepairHistory ? (
                <div className="space-y-4">
                  {[1, 2].map((i) => (
                    <div key={i} className="bg-neutral-100 rounded-xl px-4 py-3 animate-pulse">
                      <div className="h-4 bg-neutral-200 rounded w-3/4 mb-2" />
                      <div className="h-3 bg-neutral-200 rounded w-1/2" />
                    </div>
                  ))}
                </div>
              ) : repairHistory.length > 0 ? (
                <div className="space-y-3">
                  {repairHistory.map((entry) => (
                    <div key={`${entry.history_type}-${entry.id}`} className="bg-neutral-100 rounded-xl px-4 py-3">
                      <div className="flex items-center gap-2 mb-1">
                        <LuHistory className="w-3.5 h-3.5 text-neutral-600" />
                        <span className="text-xs font-semibold text-neutral-950 uppercase truncate">{entry.title}</span>
                        <span className="text-xs text-neutral-600 ml-auto">{formatDateTime(entry.occurred_at)}</span>
                      </div>
                      <p className="text-xs text-neutral-900">
                        From: {entry.history_type}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-neutral-900 text-center py-3">No repair history available.</p>
              )}
            </ModalSection>
          </div>
        )}
      </Modal>

      {/* External Repair Modal */}
      <Modal
        isOpen={showExternalRepairModal && !!externalRepairVehicle}
        onClose={() => { setShowExternalRepairModal(false); setExternalRepairVehicle(null); }}
        title="External Repair"
        maxWidth="xl"
      >
        {externalRepairVehicle && (
          <div>
            <ModalSection title={editingExternalRepairId ? "Edit Repair" : "Add Repair"}>
              <ModalInput
                type="text"
                value={externalRepairForm.provider_name}
                onChange={(v) => setExternalRepairForm((prev) => ({ ...prev, provider_name: v }))}
                placeholder="External Shop *"
              />
              <textarea
                value={externalRepairForm.description}
                onChange={(e) => setExternalRepairForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Repair Description *"
                rows={3}
                className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
              />
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <ModalInput
                    type="text"
                    value={externalRepairForm.notes}
                    onChange={(v) => setExternalRepairForm((prev) => ({ ...prev, notes: v }))}
                    placeholder="Notes"
                  />
                </div>
                <div className="flex-1">
                  <input
                    type="date"
                    value={externalRepairForm.service_date}
                    onChange={(e) => setExternalRepairForm((prev) => ({ ...prev, service_date: e.target.value }))}
                    className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                  />
                </div>
                {editingExternalRepairId ? (
                  <button
                    type="button"
                    onClick={cancelEditExternalRepair}
                    className="px-4.5 py-4.5 bg-neutral-200 text-neutral-900 rounded-xl hover:bg-neutral-300 transition-colors shrink-0"
                    title="Cancel edit"
                  >
                    <LuX className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleAddExternalRepair}
                    className="px-4.5 py-4.5 bg-primary text-white rounded-xl hover:bg-primary-950 transition-colors shrink-0"
                    title="Add external repair"
                  >
                    <LuPlus className="w-4 h-4" />
                  </button>
                )}
              </div>

              <ModalError message={externalRepairError} />
            </ModalSection>

            <ModalSection title="Repairs">
              {loadingExternalRepairs ? (
                <div className="space-y-4">
                  {[1, 2].map((i) => (
                    <div key={i} className="bg-neutral-100 rounded-xl px-4 py-3 animate-pulse">
                      <div className="h-4 bg-neutral-200 rounded w-3/4 mb-2" />
                      <div className="h-3 bg-neutral-200 rounded w-1/2" />
                    </div>
                  ))}
                </div>
              ) : externalRepairs.length > 0 ? (
                <div className="space-y-4">
                  {externalRepairs.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between bg-neutral-100 rounded-xl px-4 py-3 ${editingExternalRepairId === item.id ? "ring-2 ring-primary" : ""}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-neutral-950 text-sm truncate">{item.provider_name}</p>
                        <p className="text-xs text-neutral-900 line-clamp-1">{item.description}</p>
                        <p className="text-xs text-neutral-900">{formatDate(item.service_date)}</p>
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        {editingExternalRepairId === item.id ? (
                          <button
                            type="button"
                            onClick={handleAddExternalRepair}
                            className="text-positive hover:text-positive-950 p-1"
                            title="Save repair"
                          >
                            <LuCheck className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startEditExternalRepair(item)}
                            className="text-primary hover:text-primary-900 p-1"
                            title="Edit repair"
                          >
                            <LuPencil className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteExternalRepair(item.id)}
                          className="text-negative hover:text-negative-900 p-1"
                          title="Delete repair"
                        >
                          <LuX className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-neutral-900 text-center py-4">
                  No repairs yet. Fill in the details above and click +.
                </p>
              )}
            </ModalSection>

            <ModalButtons
              onCancel={() => { setShowExternalRepairModal(false); setExternalRepairVehicle(null); }}
              submitText={savingExternalRepair ? "Saving..." : "Save Changes"}
              loading={savingExternalRepair}
              onSubmit={handleSaveExternalRepairs}
              type="button"
            />
          </div>
        )}
      </Modal>

      {/* Edit Vehicle Modal */}
      <Modal
        isOpen={showEditModal && !!selectedVehicle}
        onClose={() => setShowEditModal(false)}
        title="Edit Vehicle"
        maxWidth="xl"
      >
        <form onSubmit={handleEditVehicle}>
          <ModalSection title="Vehicle Information">
            <ModalInput
              type="text"
              value={editForm.plate_number}
              onChange={(v) =>
                setEditForm((prev) => ({ ...prev, plate_number: v.toUpperCase() }))
              }
              placeholder="Plate Number *"
              required
              className="font-mono uppercase"
            />
            <ModalSelect
              value={editForm.vehicle_type}
              onChange={(v) =>
                setEditForm((prev) => ({ ...prev, vehicle_type: v }))
              }
              options={VEHICLE_TYPE_OPTIONS}
            />
            <ModalSelect
              value={editForm.vehicle_class}
              onChange={(v) =>
                setEditForm((prev) => ({ ...prev, vehicle_class: v }))
              }
              options={VEHICLE_CLASS_OPTIONS}
            />
            <ModalInput
              type="text"
              value={editForm.model}
              onChange={(v) => setEditForm((prev) => ({ ...prev, model: v }))}
              placeholder="Model *"
              required
            />
            <ModalInput
              type="text"
              value={editForm.orcr}
              onChange={(v) => setEditForm((prev) => ({ ...prev, orcr: v }))}
              placeholder="OR/CR (optional)"
            />
            <ModalSelect
              value={editForm.status}
              onChange={(v) =>
                setEditForm((prev) => ({ ...prev, status: v }))
              }
              options={[
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
            />
          </ModalSection>

          <ModalSection title="Assignment">
            <ModalSelect
              value={editForm.customer_id}
              onChange={(v) =>
                setEditForm((prev) => ({ ...prev, customer_id: v }))
              }
              placeholder="Select Customer *"
              options={getCustomerOptionsForBranch(
                selectedVehicle?.branch_id || ""
              )}
            />
          </ModalSection>

          <ModalSection title="Additional Details">
            <div className="grid grid-cols-2 gap-4">
              <ModalInput
                type="text"
                value={editForm.color}
                onChange={(v) =>
                  setEditForm((prev) => ({ ...prev, color: v }))
                }
                placeholder="Color"
              />
              <ModalInput
                type="number"
                value={editForm.year}
                onChange={(v) =>
                  setEditForm((prev) => ({ ...prev, year: v }))
                }
                placeholder="Year"
              />
            </div>
            <ModalInput
              type="text"
              value={editForm.engine_number}
              onChange={(v) =>
                setEditForm((prev) => ({ ...prev, engine_number: v }))
              }
              placeholder="Engine Number"
            />
            <ModalInput
              type="text"
              value={editForm.chassis_number}
              onChange={(v) =>
                setEditForm((prev) => ({ ...prev, chassis_number: v }))
              }
              placeholder="Chassis Number"
            />
            <textarea
              value={editForm.notes}
              onChange={(e) =>
                setEditForm((prev) => ({ ...prev, notes: e.target.value }))
              }
              placeholder="Notes (optional)"
              rows={3}
              className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
            />
          </ModalSection>

          <ModalError message={editError} />

          <ModalButtons
            onCancel={() => setShowEditModal(false)}
            submitText={editingVehicle ? "Saving..." : "Save Changes"}
            loading={editingVehicle}
          />
        </form>
      </Modal>

      {/* Delete / Deactivate Confirmation Modal */}
      <Modal
        isOpen={showDeleteConfirm && !!vehicleToDelete}
        onClose={() => setShowDeleteConfirm(false)}
        title={vehicleHasReferences ? "Deactivate Vehicle" : "Delete Vehicle"}
        maxWidth="sm"
      >
        {vehicleToDelete && (
          <div>
            <div className="bg-neutral-100 rounded-xl p-4 my-4">
              <p className="text-neutral-900">
                {vehicleHasReferences
                  ? <>Are you sure you want to deactivate <strong className="text-neutral-950">{vehicleToDelete.plate_number}</strong> ({vehicleToDelete.model})?</>
                  : <>Are you sure you want to delete <strong className="text-neutral-950">{vehicleToDelete.plate_number}</strong> ({vehicleToDelete.model})?</>
                }
              </p>
            </div>
            <p className="text-sm text-neutral-900 mb-2">
              {vehicleHasReferences
                ? "This vehicle has existing job orders and will be set to inactive instead of deleted."
                : "This action cannot be undone. The vehicle will be permanently removed."
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
                onClick={handleDeleteVehicle}
                disabled={deletingVehicle || checkingReferences}
                className="flex-1 px-4 py-3.5 bg-negative text-white rounded-xl font-semibold hover:bg-negative-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {checkingReferences
                  ? "Checking..."
                  : deletingVehicle
                    ? (vehicleHasReferences ? "Deactivating..." : "Deleting...")
                    : (vehicleHasReferences ? "Deactivate" : "Delete")
                }
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
