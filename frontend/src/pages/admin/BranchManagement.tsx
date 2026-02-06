import { useState, useEffect } from "react";
import { LuPlus, LuX, LuCheck, LuCircleAlert, LuRefreshCw, LuPencil, LuTrash2 } from "react-icons/lu";
import { branchesApi } from "../../lib/api";
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
        <LuRefreshCw className="w-6 h-6 animate-spin text-primary-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-negative-50 border border-negative-200 rounded-lg p-4 flex items-center gap-3">
        <LuCircleAlert className="w-5 h-5 text-negative-500 flex-shrink-0" />
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
          <h3 className="text-lg font-semibold text-neutral-900">Branches</h3>
          <p className="text-sm text-neutral-500">{branches.length} branches total</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
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
                <h4 className="font-semibold text-neutral-900">{branch.name}</h4>
                <span className="text-xs font-mono bg-primary-100 text-primary-700 px-2 py-0.5 rounded">
                  {branch.code}
                </span>
              </div>
              <span
                className={`px-2 py-1 rounded text-xs font-medium ${
                  branch.is_active
                    ? "bg-positive-100 text-positive-700"
                    : "bg-negative-100 text-negative-700"
                }`}
              >
                {branch.is_active ? "Active" : "Inactive"}
              </span>
            </div>

            {branch.address && (
              <p className="text-sm text-neutral-600 mb-2">{branch.address}</p>
            )}

            <div className="space-y-1 text-sm text-neutral-500 mb-4">
              {branch.phone && <p>📞 {branch.phone}</p>}
              {branch.email && <p>✉️ {branch.email}</p>}
            </div>

            <div className="flex items-center gap-2 pt-3 border-t border-primary-100">
              <button
                onClick={() => openEditModal(branch)}
                className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
              >
                <LuPencil className="w-4 h-4" />
                Edit
              </button>
              <button
                onClick={() => openDeleteConfirm(branch)}
                className="flex items-center gap-1 text-sm text-negative-600 hover:text-negative-700"
              >
                <LuTrash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          </div>
        ))}

        {branches.length === 0 && (
          <div className="col-span-full text-center py-12 text-neutral-500">
            No branches found. Click "Add Branch" to create one.
          </div>
        )}
      </div>

      {/* Add Branch Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-primary-200/50">
              <h3 className="text-lg font-semibold text-neutral-900">Add New Branch</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 text-neutral-400 hover:text-neutral-600"
              >
                <LuX className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleAddBranch} className="p-4 space-y-4">
              {addBranchError && (
                <div className="bg-negative-50 border border-negative-200 rounded-lg p-3 flex items-center gap-2">
                  <LuCircleAlert className="w-4 h-4 text-negative-500" />
                  <p className="text-sm text-negative-700">{addBranchError}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Branch Name *
                </label>
                <input
                  type="text"
                  required
                  value={addBranchForm.name}
                  onChange={(e) => setAddBranchForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-primary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Main Branch"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Branch Code *
                </label>
                <input
                  type="text"
                  required
                  maxLength={10}
                  value={addBranchForm.code}
                  onChange={(e) => setAddBranchForm(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                  className="w-full px-3 py-2 border border-primary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono uppercase"
                  placeholder="MAIN"
                />
                <p className="text-xs text-neutral-500 mt-1">Unique identifier for this branch</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Address
                </label>
                <input
                  type="text"
                  value={addBranchForm.address}
                  onChange={(e) => setAddBranchForm(prev => ({ ...prev, address: e.target.value }))}
                  className="w-full px-3 py-2 border border-primary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="123 Main Street, City"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  value={addBranchForm.phone}
                  onChange={(e) => setAddBranchForm(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full px-3 py-2 border border-primary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="+63 XXX XXX XXXX"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={addBranchForm.email}
                  onChange={(e) => setAddBranchForm(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-primary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="branch@petrozone.com"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-primary-200/50">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-neutral-600 hover:text-neutral-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingBranch}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {addingBranch ? (
                    <>
                      <LuRefreshCw className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <LuPlus className="w-4 h-4" />
                      Create Branch
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Branch Modal */}
      {showEditModal && selectedBranch && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-primary-200/50">
              <h3 className="text-lg font-semibold text-neutral-900">Edit Branch</h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-1 text-neutral-400 hover:text-neutral-600"
              >
                <LuX className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleEditBranch} className="p-4 space-y-4">
              {editBranchError && (
                <div className="bg-negative-50 border border-negative-200 rounded-lg p-3 flex items-center gap-2">
                  <LuCircleAlert className="w-4 h-4 text-negative-500" />
                  <p className="text-sm text-negative-700">{editBranchError}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Branch Name *
                </label>
                <input
                  type="text"
                  required
                  value={editBranchForm.name}
                  onChange={(e) => setEditBranchForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-primary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Branch Code *
                </label>
                <input
                  type="text"
                  required
                  maxLength={10}
                  value={editBranchForm.code}
                  onChange={(e) => setEditBranchForm(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                  className="w-full px-3 py-2 border border-primary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono uppercase"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Address
                </label>
                <input
                  type="text"
                  value={editBranchForm.address}
                  onChange={(e) => setEditBranchForm(prev => ({ ...prev, address: e.target.value }))}
                  className="w-full px-3 py-2 border border-primary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  value={editBranchForm.phone}
                  onChange={(e) => setEditBranchForm(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full px-3 py-2 border border-primary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={editBranchForm.email}
                  onChange={(e) => setEditBranchForm(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-primary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditBranchForm(prev => ({ ...prev, is_active: !prev.is_active }))}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    editBranchForm.is_active ? "bg-positive-500" : "bg-neutral-300"
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      editBranchForm.is_active ? "translate-x-7" : "translate-x-1"
                    }`}
                  />
                </button>
                <span className="text-sm text-neutral-700">
                  {editBranchForm.is_active ? "Active" : "Inactive"}
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-primary-200/50">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 text-neutral-600 hover:text-neutral-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editingBranch}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingBranch ? (
                    <>
                      <LuRefreshCw className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <LuCheck className="w-4 h-4" />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && branchToDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm">
            <div className="p-4 border-b border-primary-200/50">
              <h3 className="text-lg font-semibold text-neutral-900">Delete Branch</h3>
            </div>
            
            <div className="p-4">
              <p className="text-neutral-600 mb-4">
                Are you sure you want to delete <strong>{branchToDelete.name}</strong>?
              </p>
              <p className="text-sm text-neutral-500">
                If users are assigned to this branch, it will be deactivated instead of deleted.
              </p>
            </div>

            <div className="flex justify-end gap-2 p-4 border-t border-primary-200/50">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-neutral-600 hover:text-neutral-800"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteBranch}
                disabled={deletingBranch}
                className="flex items-center gap-2 px-4 py-2 bg-negative-500 text-white rounded-lg hover:bg-negative-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deletingBranch ? (
                  <>
                    <LuRefreshCw className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <LuTrash2 className="w-4 h-4" />
                    Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
