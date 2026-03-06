import { useState, useEffect, useMemo } from "react";
import {
  LuPencil,
  LuTrash2,
  LuCar,
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
import type { Vehicle, Customer, Branch } from "../../types";

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
      const matchStatus = !statusFilter || statusFilter === "all" || v.status === statusFilter;

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
    if (!addForm.orcr.trim()) {
      setAddError("OR/CR is required");
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
  function openViewModal(vehicle: Vehicle) {
    setViewVehicle(vehicle);
    setShowViewModal(true);
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
    if (!editForm.orcr.trim()) {
      setEditError("OR/CR cannot be empty");
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
    setShowDeleteConfirm(true);
    try {
      const result = await vehiclesApi.checkReferences(vehicle.id);
      setVehicleHasReferences(result.hasReferences);
    } catch {
      // Default to deactivate (safer) if check fails
      setVehicleHasReferences(true);
    }
  }

  async function handleDeleteVehicle() {
    if (!vehicleToDelete) return;
    try {
      setDeletingVehicle(true);
      const result = await vehiclesApi.delete(vehicleToDelete.id);
      setShowDeleteConfirm(false);
      setVehicleToDelete(null);
      showToast.success(result.message || "Vehicle deleted successfully");
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete vehicle");
      showToast.error(err instanceof Error ? err.message : "Failed to delete vehicle");
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
        maxWidth="lg"
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
              placeholder="OR/CR *"
              required
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
        maxWidth="lg"
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

      {/* Edit Vehicle Modal */}
      <Modal
        isOpen={showEditModal && !!selectedVehicle}
        onClose={() => setShowEditModal(false)}
        title="Edit Vehicle"
        maxWidth="lg"
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
              placeholder="OR/CR *"
              required
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

      {/* Delete Confirmation Modal */}
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
                Are you sure you want to {vehicleHasReferences ? "deactivate" : "delete"}{" "}
                <strong className="text-neutral-950">
                  {vehicleToDelete.plate_number}
                </strong>{" "}
                ({vehicleToDelete.model})?
              </p>
            </div>
            <p className="text-sm text-neutral-900 mb-2">
              {vehicleHasReferences
                ? "The vehicle will be marked as inactive and hidden from active lists."
                : "This vehicle will be permanently removed. This action cannot be undone."}
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
                disabled={deletingVehicle}
                className="flex-1 px-4 py-3.5 bg-negative text-white rounded-xl font-semibold hover:bg-negative-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {deletingVehicle
                  ? (vehicleHasReferences ? "Deactivating..." : "Deleting...")
                  : (vehicleHasReferences ? "Deactivate" : "Delete")}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
