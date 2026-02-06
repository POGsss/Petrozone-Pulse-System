import { useState, useEffect } from "react";
import { LuPlus, LuX, LuCheck, LuCircleAlert, LuRefreshCw, LuBuilding } from "react-icons/lu";
import { rbacApi, branchesApi } from "../../lib/api";
import type { Branch, UserProfile, BranchAssignment, RoleInfo } from "../../types";

interface User extends UserProfile {
  roles: string[];
  branches: BranchAssignment[];
}

export function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Add user modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [addingUser, setAddingUser] = useState(false);
  const [addUserForm, setAddUserForm] = useState({
    email: "",
    password: "",
    full_name: "",
    phone: "",
    roles: [] as string[],
    branch_ids: [] as string[],
  });
  const [addUserError, setAddUserError] = useState<string | null>(null);

  // Assign branch modal state
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [assigningBranches, setAssigningBranches] = useState(false);
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [primaryBranchId, setPrimaryBranchId] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);

  // Fetch data on mount
  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);
      const [usersData, branchesData, rolesData] = await Promise.all([
        rbacApi.getUsers(),
        branchesApi.getAll(),
        rbacApi.getRoles(),
      ]);
      setUsers(usersData);
      setBranches(branchesData);
      setRoles(rolesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }

  // Add user handler
  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setAddUserError(null);
    
    if (addUserForm.roles.length === 0) {
      setAddUserError("Please select at least one role");
      return;
    }

    try {
      setAddingUser(true);
      await rbacApi.createUser({
        email: addUserForm.email,
        password: addUserForm.password,
        full_name: addUserForm.full_name,
        phone: addUserForm.phone || undefined,
        roles: addUserForm.roles,
        branch_ids: addUserForm.branch_ids.length > 0 ? addUserForm.branch_ids : undefined,
      });
      
      // Reset form and close modal
      setAddUserForm({
        email: "",
        password: "",
        full_name: "",
        phone: "",
        roles: [],
        branch_ids: [],
      });
      setShowAddModal(false);
      
      // Refresh users list
      fetchData();
    } catch (err) {
      setAddUserError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setAddingUser(false);
    }
  }

  // Open assign branch modal
  function openAssignModal(user: User) {
    setSelectedUser(user);
    setSelectedBranches(user.branches.map(b => b.branch_id));
    setPrimaryBranchId(user.branches.find(b => b.is_primary)?.branch_id || null);
    setAssignError(null);
    setShowAssignModal(true);
  }

  // Assign branches handler
  async function handleAssignBranches(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser) return;
    
    setAssignError(null);

    try {
      setAssigningBranches(true);
      await rbacApi.updateUserBranches(
        selectedUser.id,
        selectedBranches,
        primaryBranchId || undefined
      );
      
      setShowAssignModal(false);
      setSelectedUser(null);
      
      // Refresh users list
      fetchData();
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : "Failed to assign branches");
    } finally {
      setAssigningBranches(false);
    }
  }

  // Toggle role selection
  function toggleRole(role: string) {
    setAddUserForm(prev => ({
      ...prev,
      roles: prev.roles.includes(role)
        ? prev.roles.filter(r => r !== role)
        : [...prev.roles, role],
    }));
  }

  // Toggle branch selection in add user form
  function toggleBranchInForm(branchId: string) {
    setAddUserForm(prev => ({
      ...prev,
      branch_ids: prev.branch_ids.includes(branchId)
        ? prev.branch_ids.filter(id => id !== branchId)
        : [...prev.branch_ids, branchId],
    }));
  }

  // Toggle branch selection in assign modal
  function toggleBranchInAssign(branchId: string) {
    setSelectedBranches(prev => {
      const newBranches = prev.includes(branchId)
        ? prev.filter(id => id !== branchId)
        : [...prev, branchId];
      
      // Reset primary if removed
      if (!newBranches.includes(primaryBranchId || "")) {
        setPrimaryBranchId(newBranches[0] || null);
      }
      
      return newBranches;
    });
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
            onClick={fetchData}
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
          <h3 className="text-lg font-semibold text-neutral-900">Users</h3>
          <p className="text-sm text-neutral-500">{users.length} users total</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
        >
          <LuPlus className="w-4 h-4" />
          Add User
        </button>
      </div>

      {/* Users table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-primary-200/50">
              <th className="text-left py-3 px-4 text-sm font-medium text-neutral-500">Name</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-neutral-500">Email</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-neutral-500">Roles</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-neutral-500">Branches</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-neutral-500">Status</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-neutral-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-primary-100/50 hover:bg-primary-50/50">
                <td className="py-3 px-4">
                  <span className="font-medium text-neutral-900">{user.full_name}</span>
                </td>
                <td className="py-3 px-4 text-sm text-neutral-600">{user.email}</td>
                <td className="py-3 px-4">
                  <div className="flex flex-wrap gap-1">
                    {user.roles.map((role) => (
                      <span
                        key={role}
                        className="px-2 py-0.5 bg-primary-100 text-primary-700 rounded text-xs font-medium"
                      >
                        {role}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="py-3 px-4">
                  <div className="flex flex-wrap gap-1">
                    {user.branches.length === 0 ? (
                      <span className="text-sm text-neutral-400">No branch</span>
                    ) : (
                      user.branches.map((ba) => (
                        <span
                          key={ba.branch_id}
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            ba.is_primary
                              ? "bg-positive-100 text-positive-700"
                              : "bg-neutral-100 text-neutral-600"
                          }`}
                        >
                          {ba.branches?.code || ba.branch_id.slice(0, 8)}
                          {ba.is_primary && " ★"}
                        </span>
                      ))
                    )}
                  </div>
                </td>
                <td className="py-3 px-4">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      user.is_active
                        ? "bg-positive-100 text-positive-700"
                        : "bg-negative-100 text-negative-700"
                    }`}
                  >
                    {user.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <button
                    onClick={() => openAssignModal(user)}
                    className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
                  >
                    <LuBuilding className="w-4 h-4" />
                    Assign Branch
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {users.length === 0 && (
          <div className="text-center py-12 text-neutral-500">
            No users found. Click "Add User" to create one.
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-primary-200/50">
              <h3 className="text-lg font-semibold text-neutral-900">Add New User</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 text-neutral-400 hover:text-neutral-600"
              >
                <LuX className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleAddUser} className="p-4 space-y-4">
              {addUserError && (
                <div className="bg-negative-50 border border-negative-200 rounded-lg p-3 flex items-center gap-2">
                  <LuCircleAlert className="w-4 h-4 text-negative-500" />
                  <p className="text-sm text-negative-700">{addUserError}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={addUserForm.full_name}
                  onChange={(e) => setAddUserForm(prev => ({ ...prev, full_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-primary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  required
                  value={addUserForm.email}
                  onChange={(e) => setAddUserForm(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-primary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="john@petrozone.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Password *
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={addUserForm.password}
                  onChange={(e) => setAddUserForm(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full px-3 py-2 border border-primary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Min 8 characters"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  value={addUserForm.phone}
                  onChange={(e) => setAddUserForm(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full px-3 py-2 border border-primary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="+63 XXX XXX XXXX"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Roles *
                </label>
                <div className="flex flex-wrap gap-2">
                  {roles.map((role) => (
                    <button
                      key={role.code}
                      type="button"
                      onClick={() => toggleRole(role.code)}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        addUserForm.roles.includes(role.code)
                          ? "bg-primary-500 text-white"
                          : "bg-primary-100 text-primary-700 hover:bg-primary-200"
                      }`}
                    >
                      {addUserForm.roles.includes(role.code) && <LuCheck className="w-3 h-3" />}
                      {role.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Assign to Branches
                </label>
                <div className="flex flex-wrap gap-2">
                  {branches.filter(b => b.is_active).map((branch) => (
                    <button
                      key={branch.id}
                      type="button"
                      onClick={() => toggleBranchInForm(branch.id)}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        addUserForm.branch_ids.includes(branch.id)
                          ? "bg-positive-500 text-white"
                          : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                      }`}
                    >
                      {addUserForm.branch_ids.includes(branch.id) && <LuCheck className="w-3 h-3" />}
                      {branch.name} ({branch.code})
                    </button>
                  ))}
                </div>
                {addUserForm.branch_ids.length > 0 && (
                  <p className="text-xs text-neutral-500 mt-1">
                    First selected branch will be the primary branch.
                  </p>
                )}
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
                  disabled={addingUser}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {addingUser ? (
                    <>
                      <LuRefreshCw className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <LuPlus className="w-4 h-4" />
                      Create User
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Branch Modal */}
      {showAssignModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-primary-200/50">
              <div>
                <h3 className="text-lg font-semibold text-neutral-900">Assign Branches</h3>
                <p className="text-sm text-neutral-500">{selectedUser.full_name}</p>
              </div>
              <button
                onClick={() => setShowAssignModal(false)}
                className="p-1 text-neutral-400 hover:text-neutral-600"
              >
                <LuX className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleAssignBranches} className="p-4 space-y-4">
              {assignError && (
                <div className="bg-negative-50 border border-negative-200 rounded-lg p-3 flex items-center gap-2">
                  <LuCircleAlert className="w-4 h-4 text-negative-500" />
                  <p className="text-sm text-negative-700">{assignError}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Select Branches
                </label>
                <div className="space-y-2">
                  {branches.filter(b => b.is_active).map((branch) => (
                    <div
                      key={branch.id}
                      className={`flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer ${
                        selectedBranches.includes(branch.id)
                          ? "border-positive-500 bg-positive-50"
                          : "border-primary-200 hover:border-primary-300"
                      }`}
                      onClick={() => toggleBranchInAssign(branch.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded border flex items-center justify-center ${
                            selectedBranches.includes(branch.id)
                              ? "bg-positive-500 border-positive-500"
                              : "border-neutral-300"
                          }`}
                        >
                          {selectedBranches.includes(branch.id) && (
                            <LuCheck className="w-3 h-3 text-white" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-neutral-900">{branch.name}</p>
                          <p className="text-xs text-neutral-500">{branch.code}</p>
                        </div>
                      </div>
                      
                      {selectedBranches.includes(branch.id) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPrimaryBranchId(branch.id);
                          }}
                          className={`text-xs px-2 py-1 rounded ${
                            primaryBranchId === branch.id
                              ? "bg-positive-500 text-white"
                              : "bg-neutral-200 text-neutral-600 hover:bg-neutral-300"
                          }`}
                        >
                          {primaryBranchId === branch.id ? "Primary" : "Set Primary"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-primary-200/50">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="px-4 py-2 text-neutral-600 hover:text-neutral-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assigningBranches}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {assigningBranches ? (
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
    </div>
  );
}
