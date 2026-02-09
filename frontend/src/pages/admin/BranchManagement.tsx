import { useState, useEffect } from "react";
import { LuPlus, LuCircleAlert, LuRefreshCw, LuPencil, LuTrash2 } from "react-icons/lu";
import { branchesApi } from "../../lib/api";
import { Modal, ModalSection, ModalInput, ModalToggle, ModalButtons, ModalError } from "../../components";
import type { Branch } from "../../types";

export function BranchManagement() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Add branch modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [addingBranch, setAddingBranch] = useState(false);
  const [addBranchForm, setAddBranchForm] = useState({
    name: "",
    code: "",
    address: "",
    phone: "",
    email: "",
  });
  const [addBranchError, setAddBranchError] = useState<string | null>(null);

  // Edit branch modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [editBranchForm, setEditBranchForm] = useState({
    name: "",
    code: "",
    address: "",
    phone: "",
    email: "",
    is_active: true,
  });
  const [editBranchError, setEditBranchError] = useState<string | null>(null);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingBranch, setDeletingBranch] = useState(false);
  const [branchToDelete, setBranchToDelete] = useState<Branch | null>(null);

  // Fetch data on mount
  useEffect(() => {
    fetchBranches();
  }, []);

  async function fetchBranches() {
    try {
      setLoading(true);
      setError(null);
      const data = await branchesApi.getAll();
      setBranches(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch branches");
    } finally {
      setLoading(false);
    }
  }

  // Add branch handler
  async function handleAddBranch(e: React.FormEvent) {
    e.preventDefault();
    setAddBranchError(null);

    if (!addBranchForm.name || !addBranchForm.code) {
      setAddBranchError("Name and code are required");
      return;
    }

    try {
      setAddingBranch(true);
      await branchesApi.create({
        name: addBranchForm.name,
        code: addBranchForm.code.toUpperCase(),
        address: addBranchForm.address || undefined,
        phone: addBranchForm.phone || undefined,
        email: addBranchForm.email || undefined,
      });
      
      // Reset form and close modal
      setAddBranchForm({
        name: "",
        code: "",
        address: "",
        phone: "",
        email: "",
      });
      setShowAddModal(false);
      
      // Refresh branches list
      fetchBranches();
    } catch (err) {
      setAddBranchError(err instanceof Error ? err.message : "Failed to create branch");
    } finally {
      setAddingBranch(false);
    }
  }

  // Open edit modal
  function openEditModal(branch: Branch) {
    setSelectedBranch(branch);
    setEditBranchForm({
      name: branch.name,
      code: branch.code,
      address: branch.address || "",
      phone: branch.phone || "",
      email: branch.email || "",
      is_active: branch.is_active,
    });
    setEditBranchError(null);
    setShowEditModal(true);
  }

  // Edit branch handler
  async function handleEditBranch(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBranch) return;
    
    setEditBranchError(null);

    if (!editBranchForm.name || !editBranchForm.code) {
      setEditBranchError("Name and code are required");
      return;
    }

    try {
      setEditingBranch(true);
      await branchesApi.update(selectedBranch.id, {
        name: editBranchForm.name,
        code: editBranchForm.code.toUpperCase(),
        address: editBranchForm.address || undefined,
        phone: editBranchForm.phone || undefined,
        email: editBranchForm.email || undefined,
        is_active: editBranchForm.is_active,
      });
      
      setShowEditModal(false);
      setSelectedBranch(null);
      
      // Refresh branches list
      fetchBranches();
    } catch (err) {
      setEditBranchError(err instanceof Error ? err.message : "Failed to update branch");
    } finally {
      setEditingBranch(false);
    }
  }

  // Open delete confirmation
  function openDeleteConfirm(branch: Branch) {
    setBranchToDelete(branch);
    setShowDeleteConfirm(true);
  }

  // Delete branch handler
  async function handleDeleteBranch() {
    if (!branchToDelete) return;

    try {
      setDeletingBranch(true);
      await branchesApi.delete(branchToDelete.id);
      
      setShowDeleteConfirm(false);
      setBranchToDelete(null);
      
      // Refresh branches list
      fetchBranches();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete branch");
    } finally {
      setDeletingBranch(false);
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
      <div className="bg-negative-50 border border-negative-200 rounded-lg p-4 flex items-center gap-3">
        <LuCircleAlert className="w-5 h-5 text-negative flex-shrink-0" />
        <div>
          <p className="text-sm text-negative-700">{error}</p>
          <button
            onClick={fetchBranches}
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
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-neutral-950">Branches</h3>
          <p className="text-sm text-neutral-900">{branches.length} branches total</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-950 transition-colors"
        >
          <LuPlus className="w-4 h-4" />
          Add Branch
        </button>
      </div>

      {/* Branches grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {branches.map((branch) => (
          <div
            key={branch.id}
            className={`bg-white rounded-xl border p-4 ${
              branch.is_active
                ? "border-primary-200/50"
                : "border-negative-200/50 bg-negative-50/30"
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className="font-semibold text-neutral-950">{branch.name}</h4>
                <span className="text-xs font-mono bg-neutral-100 text-primary px-2 py-0.5 rounded">
                  {branch.code}
                </span>
              </div>
              <span
                className={`px-2 py-1 rounded text-xs font-medium ${
                  branch.is_active
                    ? "bg-positive-100 text-positive"
                    : "bg-negative-100 text-negative"
                }`}
              >
                {branch.is_active ? "Active" : "Inactive"}
              </span>
            </div>

            {branch.address && (
              <p className="text-sm text-neutral-900 mb-2">{branch.address}</p>
            )}

            <div className="space-y-1 text-sm text-neutral-900 mb-4">
              {branch.phone && <p>{branch.phone}</p>}
              {branch.email && <p>{branch.email}</p>}
            </div>

            <div className="flex items-center justify-end gap-4 pt-3 border-t border-primary-100">
              <button
                onClick={() => openEditModal(branch)}
                className="flex items-center gap-1 text-sm text-primary hover:text-primary-900"
              >
                <LuPencil className="w-4 h-4" />
                Edit
              </button>
              <button
                onClick={() => openDeleteConfirm(branch)}
                className="flex items-center gap-1 text-sm text-negative hover:text-negative-900"
              >
                <LuTrash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          </div>
        ))}

        {branches.length === 0 && (
          <div className="col-span-full text-center py-12 text-neutral-900">
            No branches found. Click "Add Branch" to create one.
          </div>
        )}
      </div>

      {/* Add Branch Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add a New Branch"
      >
        <form onSubmit={handleAddBranch}>
          <ModalError message={addBranchError} />
          
          <ModalSection title="Branch Information">
            <ModalInput
              type="text"
              value={addBranchForm.name}
              onChange={(v) => setAddBranchForm(prev => ({ ...prev, name: v }))}
              placeholder="Branch Name"
              required
            />
            
            <div>
              <ModalInput
                type="text"
                value={addBranchForm.code}
                onChange={(v) => setAddBranchForm(prev => ({ ...prev, code: v.toUpperCase() }))}
                placeholder="Branch Code (e.g., MAIN)"
                required
                maxLength={10}
                className="font-mono uppercase"
              />
              <p className="text-xs text-neutral-900 mt-1.5 ml-1">Unique identifier for this branch</p>
            </div>
          </ModalSection>

          <ModalSection title="Contact Details">
            <ModalInput
              type="text"
              value={addBranchForm.address}
              onChange={(v) => setAddBranchForm(prev => ({ ...prev, address: v }))}
              placeholder="Building No., Street Address"
            />
            
            <ModalInput
              type="tel"
              value={addBranchForm.phone}
              onChange={(v) => setAddBranchForm(prev => ({ ...prev, phone: v }))}
              placeholder="Phone Number"
            />
            
            <ModalInput
              type="email"
              value={addBranchForm.email}
              onChange={(v) => setAddBranchForm(prev => ({ ...prev, email: v }))}
              placeholder="Email Address"
            />
          </ModalSection>

          <ModalButtons
            onCancel={() => setShowAddModal(false)}
            submitText={addingBranch ? "Creating..." : "Create Branch"}
            loading={addingBranch}
          />
        </form>
      </Modal>

      {/* Edit Branch Modal */}
      <Modal
        isOpen={showEditModal && !!selectedBranch}
        onClose={() => setShowEditModal(false)}
        title="Edit Branch"
      >
        {selectedBranch && (
          <form onSubmit={handleEditBranch}>
            <ModalError message={editBranchError} />
            
            <ModalSection title="Branch Information">
              <ModalInput
                type="text"
                value={editBranchForm.name}
                onChange={(v) => setEditBranchForm(prev => ({ ...prev, name: v }))}
                placeholder="Branch Name"
                required
              />
              
              <ModalInput
                type="text"
                value={editBranchForm.code}
                onChange={(v) => setEditBranchForm(prev => ({ ...prev, code: v.toUpperCase() }))}
                placeholder="Branch Code"
                required
                maxLength={10}
                className="font-mono uppercase"
              />
            </ModalSection>

            <ModalSection title="Contact Details">
              <ModalInput
                type="text"
                value={editBranchForm.address}
                onChange={(v) => setEditBranchForm(prev => ({ ...prev, address: v }))}
                placeholder="Building No., Street Address"
              />
              
              <ModalInput
                type="tel"
                value={editBranchForm.phone}
                onChange={(v) => setEditBranchForm(prev => ({ ...prev, phone: v }))}
                placeholder="Phone Number"
              />
              
              <ModalInput
                type="email"
                value={editBranchForm.email}
                onChange={(v) => setEditBranchForm(prev => ({ ...prev, email: v }))}
                placeholder="Email Address"
              />
            </ModalSection>

            <ModalSection title="Branch Status">
              <ModalToggle
                label="Branch Active"
                description={editBranchForm.is_active ? "Active" : "Inactive"}
                checked={editBranchForm.is_active}
                onChange={(v) => setEditBranchForm(prev => ({ ...prev, is_active: v }))}
              />
            </ModalSection>

            <ModalButtons
              onCancel={() => setShowEditModal(false)}
              submitText={editingBranch ? "Saving..." : "Save Changes"}
              loading={editingBranch}
            />
          </form>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteConfirm && !!branchToDelete}
        onClose={() => setShowDeleteConfirm(false)}
        title="Delete Branch"
        maxWidth="sm"
      >
        {branchToDelete && (
          <div>
            <div className="bg-neutral-100 rounded-xl p-4 my-4">
              <p className="text-neutral-900">
                Are you sure you want to delete <strong className="text-neutral-950">{branchToDelete.name}</strong>?
              </p>
            </div>
            <p className="text-sm text-neutral-900 mb-2">
              If users are assigned to this branch, it will be deactivated instead of deleted.
            </p>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-3.5 border-2 border-negative text-negative rounded-xl font-semibold hover:bg-negative-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteBranch}
                disabled={deletingBranch}
                className="flex-1 px-4 py-3.5 bg-negative text-white rounded-xl font-semibold hover:bg-negative-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {deletingBranch ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
