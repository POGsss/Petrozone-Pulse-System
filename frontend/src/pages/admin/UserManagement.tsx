import { useState, useEffect } from "react";
import { LuPlus, LuCheck, LuCircleAlert, LuRefreshCw, LuBuilding } from "react-icons/lu";
import { rbacApi, branchesApi } from "../../lib/api";
import { Modal, ModalSection, ModalInput, ModalButtons, ModalError } from "../../components";
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
          <h3 className="text-lg font-semibold text-neutral-950">Users</h3>
          <p className="text-sm text-neutral-900">{users.length} users total</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-950 transition-colors"
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
              <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950">Name</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950">Email</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950">Roles</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950">Branches</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950">Status</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-neutral-200/50 hover:bg-neutral-100">
                <td className="py-3 px-4">
                  <span className="font-medium text-neutral-900">{user.full_name}</span>
                </td>
                <td className="py-3 px-4 text-sm text-neutral-900">{user.email}</td>
                <td className="py-3 px-4">
                  <div className="flex flex-wrap gap-1">
                    {user.roles.map((role) => (
                      <span
                        key={role}
                        className="px-2 py-0.5 bg-neutral-100 text-primary rounded text-xs font-medium"
                      >
                        {role}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="py-3 px-4">
                  <div className="flex flex-wrap gap-1">
                    {user.branches.length === 0 ? (
                      <span className="text-sm text-neutral-900">No branch</span>
                    ) : (
                      user.branches.map((ba) => (
                        <span
                          key={ba.branch_id}
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            ba.is_primary
                              ? "bg-positive-100 text-positive"
                              : "bg-neutral-100 text-neutral"
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
                        ? "bg-positive-100 text-positive"
                        : "bg-negative-100 text-negative"
                    }`}
                  >
                    {user.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <button
                    onClick={() => openAssignModal(user)}
                    className="flex items-center gap-1 text-sm text-primary-950 hover:text-primary-900"
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
          <div className="text-center py-12 text-neutral-900">
            No users found. Click "Add User" to create one.
          </div>
        )}
      </div>

      {/* Add User Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add a New User"
        maxWidth="lg"
      >
        <form onSubmit={handleAddUser}>
          <ModalError message={addUserError} />
          
          <ModalSection title="User Information">
            <ModalInput
              type="text"
              value={addUserForm.full_name}
              onChange={(v) => setAddUserForm(prev => ({ ...prev, full_name: v }))}
              placeholder="Full Name"
              required
            />
            
            <ModalInput
              type="email"
              value={addUserForm.email}
              onChange={(v) => setAddUserForm(prev => ({ ...prev, email: v }))}
              placeholder="Email Address"
              required
            />
            
            <ModalInput
              type="password"
              value={addUserForm.password}
              onChange={(v) => setAddUserForm(prev => ({ ...prev, password: v }))}
              placeholder="Password (min 8 characters)"
              required
              minLength={8}
            />
            
            <ModalInput
              type="tel"
              value={addUserForm.phone}
              onChange={(v) => setAddUserForm(prev => ({ ...prev, phone: v }))}
              placeholder="Phone Number"
            />
          </ModalSection>

          <ModalSection title="Assign Roles">
            <div className="flex flex-wrap gap-2">
              {roles.map((role) => (
                <button
                  key={role.code}
                  type="button"
                  onClick={() => toggleRole(role.code)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    addUserForm.roles.includes(role.code)
                      ? "bg-primary text-white shadow-md"
                      : "bg-neutral-100 text-neutral hover:bg-neutral-200"
                  }`}
                >
                  {addUserForm.roles.includes(role.code) && <LuCheck className="w-4 h-4" />}
                  {role.name}
                </button>
              ))}
            </div>
          </ModalSection>

          <ModalSection title="Assign to Branches">
            <div className="flex flex-wrap gap-2">
              {branches.filter(b => b.is_active).map((branch) => (
                <button
                  key={branch.id}
                  type="button"
                  onClick={() => toggleBranchInForm(branch.id)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    addUserForm.branch_ids.includes(branch.id)
                      ? "bg-positive text-white shadow-md"
                      : "bg-neutral-100 text-neutral hover:bg-neutral-200"
                  }`}
                >
                  {addUserForm.branch_ids.includes(branch.id) && <LuCheck className="w-4 h-4" />}
                  {branch.name} ({branch.code})
                </button>
              ))}
            </div>
            {addUserForm.branch_ids.length > 0 && (
              <p className="text-xs text-neutral-900 mt-2">
                First selected branch will be the primary branch.
              </p>
            )}
          </ModalSection>

          <ModalButtons
            onCancel={() => setShowAddModal(false)}
            submitText={addingUser ? "Creating..." : "Create User"}
            loading={addingUser}
          />
        </form>
      </Modal>

      {/* Assign Branch Modal */}
      <Modal
        isOpen={showAssignModal && !!selectedUser}
        onClose={() => setShowAssignModal(false)}
        title="Assign Branches"
      >
        {selectedUser && (
          <form onSubmit={handleAssignBranches}>
            <p className="text-sm text-neutral-900 -mt-2 mb-4">{selectedUser.full_name}</p>
            
            <ModalError message={assignError} />
            
            <ModalSection title="Select Branches">
              <div className="space-y-3">
                {branches.filter(b => b.is_active).map((branch) => (
                  <div
                    key={branch.id}
                    className={`flex items-center justify-between p-4 rounded-xl transition-all cursor-pointer ${
                      selectedBranches.includes(branch.id)
                        ? "bg-positive-50 ring-2 ring-positive"
                        : "bg-neutral-100 hover:bg-neutral-150"
                    }`}
                    onClick={() => toggleBranchInAssign(branch.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                          selectedBranches.includes(branch.id)
                            ? "bg-positive border-positive"
                            : "border-neutral-300 bg-white"
                        }`}
                      >
                        {selectedBranches.includes(branch.id) && (
                          <LuCheck className="w-4 h-4 text-white" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-neutral-900">{branch.name}</p>
                        <p className="text-xs text-neutral-900">{branch.code}</p>
                      </div>
                    </div>
                    
                    {selectedBranches.includes(branch.id) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPrimaryBranchId(branch.id);
                        }}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                          primaryBranchId === branch.id
                            ? "bg-positive text-white"
                            : "bg-white text-neutral hover:bg-neutral-50 border border-neutral-200"
                        }`}
                      >
                        {primaryBranchId === branch.id ? "Primary" : "Set Primary"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </ModalSection>

            <ModalButtons
              onCancel={() => setShowAssignModal(false)}
              submitText={assigningBranches ? "Saving..." : "Save Changes"}
              loading={assigningBranches}
            />
          </form>
        )}
      </Modal>
    </div>
  );
}
