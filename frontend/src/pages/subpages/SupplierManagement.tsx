import { useState, useEffect, useMemo } from "react";
import { LuPlus, LuCircleAlert, LuRefreshCw, LuPencil, LuTrash2, LuTruck } from "react-icons/lu";
import { useAuth } from "../../auth";
import { suppliersApi, branchesApi } from "../../lib/api";
import { showToast } from "../../lib/toast";
import { Modal, ModalSection, ModalInput, ModalSelect, ModalButtons, ModalError, SearchFilter } from "../../components";
import type { FilterGroup } from "../../components";
import type { Supplier, Branch } from "../../types";

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function SupplierManagement() {
  const { user } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add supplier modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [addForm, setAddForm] = useState({
    supplier_name: "",
    contact_person: "",
    email: "",
    phone: "",
    address: "",
    branch_id: "",
    notes: "",
  });
  const [addError, setAddError] = useState<string | null>(null);

  // Edit supplier modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [editForm, setEditForm] = useState({
    supplier_name: "",
    contact_person: "",
    email: "",
    phone: "",
    address: "",
    status: "active" as "active" | "inactive",
    notes: "",
  });
  const [editError, setEditError] = useState<string | null>(null);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingSupplier, setDeletingSupplier] = useState(false);
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null);

  // View modal
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewSupplier, setViewSupplier] = useState<Supplier | null>(null);

  // Search & filters
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});

  // Fetch data on mount
  useEffect(() => {
    fetchSuppliers();
    fetchBranches();
  }, []);

  // Set default branch_id when branches load
  useEffect(() => {
    if (branches.length > 0 && !addForm.branch_id) {
      const primaryBranch = user?.branches?.find(b => b.is_primary);
      const defaultBranchId = primaryBranch?.branch_id || branches[0].id;
      setAddForm(prev => ({ ...prev, branch_id: defaultBranchId }));
    }
  }, [branches, user]);

  async function fetchSuppliers() {
    try {
      setLoading(true);
      setError(null);
      const result = await suppliersApi.getAll();
      setSuppliers(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch suppliers");
    } finally {
      setLoading(false);
    }
  }

  async function fetchBranches() {
    try {
      const data = await branchesApi.getAll();
      setBranches(data.filter((b: Branch) => b.is_active));
    } catch (err) {
      console.error("Failed to fetch branches:", err);
    }
  }

  // Filter groups
  const filterGroups: FilterGroup[] = [
    {
      key: "status",
      label: "Status",
      options: [
        { value: "active", label: "Active" },
        { value: "inactive", label: "Inactive" },
      ],
    },
  ];

  // Filtered suppliers
  const filteredSuppliers = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return suppliers.filter((s) => {
      const matchSearch =
        !q ||
        s.supplier_name.toLowerCase().includes(q) ||
        s.contact_person.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.phone.toLowerCase().includes(q) ||
        s.address.toLowerCase().includes(q);

      const statusFilter = activeFilters.status;
      const matchStatus =
        !statusFilter ||
        statusFilter === "all" ||
        statusFilter === s.status;

      return matchSearch && matchStatus;
    });
  }, [suppliers, searchQuery, activeFilters]);

  // Validate form
  function validateForm(form: { supplier_name: string; contact_person: string; email: string; phone: string; address: string }): string | null {
    if (!form.supplier_name.trim()) return "Supplier name is required";
    if (!form.contact_person.trim()) return "Contact person is required";
    if (!form.email.trim()) return "Email is required";
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email)) return "Invalid email format";
    
    if (!form.phone.trim()) return "Phone number is required";
    const phoneDigits = form.phone.replace(/[^0-9]/g, "");
    if (phoneDigits.length < 7 || phoneDigits.length > 20) return "Phone number must be between 7 and 20 digits";
    
    if (!form.address.trim()) return "Address is required";
    
    return null;
  }

  // Add supplier handler
  async function handleAddSupplier(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);

    const validationError = validateForm(addForm);
    if (validationError) {
      setAddError(validationError);
      return;
    }

    if (!addForm.branch_id) {
      setAddError("Branch is required");
      return;
    }

    try {
      setAddingSupplier(true);
      await suppliersApi.create({
        supplier_name: addForm.supplier_name.trim(),
        contact_person: addForm.contact_person.trim(),
        email: addForm.email.trim(),
        phone: addForm.phone.trim(),
        address: addForm.address.trim(),
        branch_id: addForm.branch_id,
        notes: addForm.notes.trim() || undefined,
      });

      // Reset form and close modal
      setAddForm({
        supplier_name: "",
        contact_person: "",
        email: "",
        phone: "",
        address: "",
        branch_id: addForm.branch_id,
        notes: "",
      });
      setShowAddModal(false);

      showToast.success("Supplier created successfully");
      fetchSuppliers();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to create supplier");
      showToast.error(err instanceof Error ? err.message : "Failed to create supplier");
    } finally {
      setAddingSupplier(false);
    }
  }

  // Open edit modal
  function openEditModal(supplier: Supplier) {
    setSelectedSupplier(supplier);
    setEditForm({
      supplier_name: supplier.supplier_name,
      contact_person: supplier.contact_person,
      email: supplier.email,
      phone: supplier.phone,
      address: supplier.address,
      status: supplier.status,
      notes: supplier.notes || "",
    });
    setEditError(null);
    setShowEditModal(true);
  }

  // Edit supplier handler
  async function handleEditSupplier(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSupplier) return;

    setEditError(null);

    const validationError = validateForm(editForm);
    if (validationError) {
      setEditError(validationError);
      return;
    }

    try {
      setEditingSupplier(true);
      await suppliersApi.update(selectedSupplier.id, {
        supplier_name: editForm.supplier_name.trim(),
        contact_person: editForm.contact_person.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone.trim(),
        address: editForm.address.trim(),
        status: editForm.status,
        notes: editForm.notes.trim() || null,
      });

      setShowEditModal(false);
      setSelectedSupplier(null);

      showToast.success("Supplier updated successfully");
      fetchSuppliers();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update supplier");
      showToast.error(err instanceof Error ? err.message : "Failed to update supplier");
    } finally {
      setEditingSupplier(false);
    }
  }

  // Open delete confirmation
  function openDeleteConfirm(supplier: Supplier) {
    setSupplierToDelete(supplier);
    setShowDeleteConfirm(true);
  }

  // Delete supplier handler
  async function handleDeleteSupplier() {
    if (!supplierToDelete) return;

    try {
      setDeletingSupplier(true);
      await suppliersApi.delete(supplierToDelete.id);

      setShowDeleteConfirm(false);
      setSupplierToDelete(null);

      showToast.success("Supplier deleted successfully");
      fetchSuppliers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete supplier");
      showToast.error(err instanceof Error ? err.message : "Failed to delete supplier");
    } finally {
      setDeletingSupplier(false);
    }
  }

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
        <LuCircleAlert className="w-5 h-5 text-negative-950 shrink-0" />
        <div>
          <p className="text-sm text-negative-950">{error}</p>
          <button
            onClick={fetchSuppliers}
            className="text-sm text-negative-600 hover:underline mt-1"
          >
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
          <h3 className="text-lg font-semibold text-neutral-950">Suppliers</h3>
          <p className="text-sm text-neutral-900">{suppliers.length} suppliers total</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-950 transition-colors"
        >
          <LuPlus className="w-4 h-4" />
          Add New Supplier
        </button>
      </div>

      {/* Search & Filter bar */}
      {suppliers.length > 0 && (
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

      {/* Suppliers grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSuppliers.map((supplier) => (
          <div
            key={supplier.id}
            onClick={() => {
              setViewSupplier(supplier);
              setShowViewModal(true);
            }}
            className="bg-white rounded-xl border p-4 border-neutral-200 cursor-pointer hover:bg-neutral-50 transition-colors"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary-100 rounded-lg">
                  <LuTruck className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold text-neutral-950">{supplier.supplier_name}</h4>
                  {supplier.branches && (
                    <span className="text-xs font-mono bg-neutral-100 text-primary px-2 py-0.5 rounded">
                      {supplier.branches.code}
                    </span>
                  )}
                </div>
              </div>
              <span
                className={`px-2 py-1 rounded text-xs font-medium ${supplier.status === "active"
                    ? "bg-positive-100 text-positive"
                    : "bg-negative-100 text-negative"
                  }`}
              >
                {supplier.status === "active" ? "Active" : "Inactive"}
              </span>
            </div>

            {/* Supplier details */}
            <div className="space-y-1 text-sm text-neutral-900 mb-3">
              <p className="text-neutral-900">{supplier.contact_person}</p>
              <p className="text-neutral-900">{supplier.email}</p>
              <p className="text-neutral-900">{supplier.phone}</p>
              {supplier.address && <p className="text-neutral-900">{supplier.address}</p>}
            </div>

            <div className="flex items-center justify-end gap-4 pt-3 border-t border-neutral-200">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openEditModal(supplier);
                }}
                className="flex items-center gap-1 text-sm text-primary hover:text-primary-900"
              >
                <LuPencil className="w-4 h-4" />
                Edit
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openDeleteConfirm(supplier);
                }}
                className="flex items-center gap-1 text-sm text-negative hover:text-negative-900"
              >
                <LuTrash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          </div>
        ))}

        {filteredSuppliers.length === 0 && (
          <div className="col-span-full text-center py-12 text-neutral-900">
            {searchQuery || Object.values(activeFilters).some((v) => v && v !== "all")
              ? "No suppliers match your search or filters."
              : 'No suppliers found. Click "Add New Supplier" to create one.'}
          </div>
        )}
      </div>

      {/* Add Supplier Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add New Supplier"
      >
        <form onSubmit={handleAddSupplier}>
          <ModalSection title="Supplier Information">
            <ModalInput
              type="text"
              value={addForm.supplier_name}
              onChange={(v) => setAddForm(prev => ({ ...prev, supplier_name: v }))}
              placeholder="Supplier Name"
              required
            />

            <ModalInput
              type="text"
              value={addForm.contact_person}
              onChange={(v) => setAddForm(prev => ({ ...prev, contact_person: v }))}
              placeholder="Contact Person"
              required
            />
          </ModalSection>

          <ModalSection title="Contact Details">
            <ModalInput
              type="email"
              value={addForm.email}
              onChange={(v) => setAddForm(prev => ({ ...prev, email: v }))}
              placeholder="Email Address"
              required
            />

            <ModalInput
              type="tel"
              value={addForm.phone}
              onChange={(v) => setAddForm(prev => ({ ...prev, phone: v }))}
              placeholder="Phone Number"
              required
              pattern="[0-9+\-()\s]{7,20}"
              title="Please enter a valid phone number (7-20 digits)"
            />

            <ModalInput
              type="text"
              value={addForm.address}
              onChange={(v) => setAddForm(prev => ({ ...prev, address: v }))}
              placeholder="Address"
              required
            />
          </ModalSection>

          <ModalSection title="Assignment">
            <ModalSelect
              value={addForm.branch_id}
              onChange={(v) => setAddForm(prev => ({ ...prev, branch_id: v }))}
              options={branches.map(b => ({ value: b.id, label: b.name }))}
              placeholder="Select Branch"
            />
          </ModalSection>

          <ModalSection title="Additional">
            <ModalInput
              type="text"
              value={addForm.notes}
              onChange={(v) => setAddForm(prev => ({ ...prev, notes: v }))}
              placeholder="Notes (optional)"
            />
          </ModalSection>

          <ModalError message={addError} />

          <ModalButtons
            onCancel={() => setShowAddModal(false)}
            submitText={addingSupplier ? "Creating..." : "Create Supplier"}
            loading={addingSupplier}
          />
        </form>
      </Modal>

      {/* Edit Supplier Modal */}
      <Modal
        isOpen={showEditModal && !!selectedSupplier}
        onClose={() => setShowEditModal(false)}
        title="Edit Supplier"
      >
        {selectedSupplier && (
          <form onSubmit={handleEditSupplier}>
            <ModalSection title="Supplier Information">
              <ModalInput
                type="text"
                value={editForm.supplier_name}
                onChange={(v) => setEditForm(prev => ({ ...prev, supplier_name: v }))}
                placeholder="Supplier Name"
                required
              />

              <ModalInput
                type="text"
                value={editForm.contact_person}
                onChange={(v) => setEditForm(prev => ({ ...prev, contact_person: v }))}
                placeholder="Contact Person"
                required
              />
            </ModalSection>

            <ModalSection title="Contact Details">
              <ModalInput
                type="email"
                value={editForm.email}
                onChange={(v) => setEditForm(prev => ({ ...prev, email: v }))}
                placeholder="Email Address"
                required
              />

              <ModalInput
                type="tel"
                value={editForm.phone}
                onChange={(v) => setEditForm(prev => ({ ...prev, phone: v }))}
                placeholder="Phone Number"
                required
                pattern="[0-9+\-()\s]{7,20}"
                title="Please enter a valid phone number (7-20 digits)"
              />

              <ModalInput
                type="text"
                value={editForm.address}
                onChange={(v) => setEditForm(prev => ({ ...prev, address: v }))}
                placeholder="Address"
                required
              />

              <div className="flex items-center gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setEditForm(prev => ({ ...prev, status: prev.status === "active" ? "inactive" : "active" }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editForm.status === "active" ? "bg-primary" : "bg-neutral-200"
                    }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editForm.status === "active" ? "translate-x-6" : "translate-x-1"
                      }`}
                  />
                </button>
                <span className="text-sm text-neutral-700">
                  {editForm.status === "active" ? "Active" : "Inactive"}
                </span>
              </div>
            </ModalSection>

            <ModalSection title="Additional">
              <ModalInput
                type="text"
                value={editForm.notes}
                onChange={(v) => setEditForm(prev => ({ ...prev, notes: v }))}
                placeholder="Notes (optional)"
              />
            </ModalSection>

            <ModalError message={editError} />

            <ModalButtons
              onCancel={() => setShowEditModal(false)}
              submitText={editingSupplier ? "Saving..." : "Save Changes"}
              loading={editingSupplier}
            />
          </form>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteConfirm && !!supplierToDelete}
        onClose={() => setShowDeleteConfirm(false)}
        title="Delete Supplier"
        maxWidth="sm"
      >
        {supplierToDelete && (
          <div>
            <div className="bg-neutral-100 rounded-xl p-4 my-4">
              <p className="text-neutral-900">
                Are you sure you want to delete <strong className="text-neutral-950">{supplierToDelete.supplier_name}</strong>?
              </p>
            </div>
            <p className="text-sm text-neutral-900 mb-2">
              If this supplier is referenced by purchase orders, it will be deactivated instead of deleted.
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
                onClick={handleDeleteSupplier}
                disabled={deletingSupplier}
                className="flex-1 px-4 py-3.5 bg-negative text-white rounded-xl font-semibold hover:bg-negative-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {deletingSupplier ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* View Supplier Modal */}
      <Modal
        isOpen={showViewModal && !!viewSupplier}
        onClose={() => setShowViewModal(false)}
        title="Supplier Details"
      >
        {viewSupplier && (
          <div>
            <ModalSection title="Supplier Information">
              <ModalInput
                type="text"
                value={viewSupplier.supplier_name}
                onChange={() => { }}
                placeholder="Supplier Name"
                disabled
              />
              <ModalInput
                type="text"
                value={viewSupplier.contact_person}
                onChange={() => { }}
                placeholder="Contact Person"
                disabled
              />
              <ModalInput
                type="text"
                value={viewSupplier.status === "active" ? "Active" : "Inactive"}
                onChange={() => { }}
                placeholder="Status"
                disabled
              />
            </ModalSection>

            <ModalSection title="Contact Details">
              <ModalInput
                type="text"
                value={viewSupplier.email}
                onChange={() => { }}
                placeholder="Email"
                disabled
              />
              <ModalInput
                type="text"
                value={viewSupplier.phone}
                onChange={() => { }}
                placeholder="Phone"
                disabled
              />
              <ModalInput
                type="text"
                value={viewSupplier.address}
                onChange={() => { }}
                placeholder="Address"
                disabled
              />
            </ModalSection>

            <ModalSection title="Assignment">
              <ModalInput
                type="text"
                value={viewSupplier.branches?.name || "-"}
                onChange={() => { }}
                placeholder="Branch"
                disabled
              />
            </ModalSection>

            {viewSupplier.notes && (
              <ModalSection title="Notes">
                <ModalInput
                  type="text"
                  value={viewSupplier.notes}
                  onChange={() => { }}
                  placeholder="Notes"
                  disabled
                />
              </ModalSection>
            )}

            <ModalSection title="Timestamps">
              <div className="grid grid-cols-2 gap-4">
                <ModalInput
                  type="text"
                  value={formatDate(viewSupplier.created_at)}
                  onChange={() => { }}
                  placeholder="Created"
                  disabled
                />
                <ModalInput
                  type="text"
                  value={formatDate(viewSupplier.updated_at)}
                  onChange={() => { }}
                  placeholder="Updated"
                  disabled
                />
              </div>
            </ModalSection>
          </div>
        )}
      </Modal>
    </div>
  );
}
