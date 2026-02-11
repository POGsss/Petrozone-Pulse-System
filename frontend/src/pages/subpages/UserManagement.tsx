import { useState, useEffect, useMemo } from "react";
import { LuPlus, LuCircleAlert, LuRefreshCw, LuSearch, LuPencil, LuTrash2, LuUsers, LuUserCheck, LuUserX, LuChevronLeft, LuChevronRight, LuEye } from "react-icons/lu";
import { rbacApi, branchesApi } from "../../lib/api";
import { Modal, ModalSection, ModalInput, ModalButtons, ModalError } from "../../components";
import { useAuth } from "../../auth";
import type { Branch, UserProfile, BranchAssignment, RoleInfo } from "../../types";

// Role hierarchy levels (higher number = higher permission)
const ROLE_LEVELS: Record<string, number> = {
  HM: 5,
  POC: 4,
  JS: 3,
  R: 2,
  T: 1,
};

// Get the highest role level for a user
function getHighestRoleLevel(roles: string[]): number {
  return Math.max(...roles.map(r => ROLE_LEVELS[r] || 0), 0);
}

interface User extends UserProfile {
  roles: string[];
  branches: BranchAssignment[];
}

const ITEMS_PER_PAGE = 10;

export function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Search and pagination state
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  
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

  // Edit user modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState(false);
  const [editUserForm, setEditUserForm] = useState({
    id: "",
    full_name: "",
    phone: "",
    is_active: true,
    roles: [] as string[],
    branch_ids: [] as string[],
    primary_branch_id: null as string | null,
  });
  const [editUserError, setEditUserError] = useState<string | null>(null);

  // Delete confirmation state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingUser, setDeletingUser] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  // Current user's role level for permission filtering
  const currentUserRoleLevel = useMemo(() => {
    return getHighestRoleLevel(currentUser?.roles || []);
  }, [currentUser?.roles]);

  // Filter available roles based on current user's role level
  // Users can only assign roles at or below their own level
  const availableRoles = useMemo(() => {
    return roles.filter(role => (ROLE_LEVELS[role.code] || 0) <= currentUserRoleLevel);
  }, [roles, currentUserRoleLevel]);

  // Check if current user can edit a target user
  const canEditUser = (targetUser: User): boolean => {
    const targetLevel = getHighestRoleLevel(targetUser.roles);
    return targetLevel <= currentUserRoleLevel;
  };

  // Computed stats
  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter(u => u.is_active).length;
    const inactive = total - active;
    return { total, active, inactive };
  }, [users]);

  // Filtered and paginated users
  const { filteredUsers, paginatedUsers, totalPages } = useMemo(() => {
    const filtered = users.filter(user =>
      user.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.phone?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    const total = Math.ceil(filtered.length / ITEMS_PER_PAGE);
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginated = filtered.slice(start, start + ITEMS_PER_PAGE);
    return { filteredUsers: filtered, paginatedUsers: paginated, totalPages: total };
  }, [users, searchQuery, currentPage]);

  // Fetch data on mount
  useEffect(() => {
    fetchData();
  }, []);

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

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

    if (!addUserForm.phone) {
      setAddUserError("Phone number is required");
      return;
    }

    // Validate phone number format (at least 7 digits)
    const phoneDigits = addUserForm.phone.replace(/[^0-9]/g, "");
    if (phoneDigits.length < 7 || phoneDigits.length > 20) {
      setAddUserError("Phone number must be between 7 and 20 digits");
      return;
    }

    if (addUserForm.branch_ids.length === 0) {
      setAddUserError("Please assign at least one branch");
      return;
    }

    try {
      setAddingUser(true);
      await rbacApi.createUser({
        email: addUserForm.email,
        password: addUserForm.password,
        full_name: addUserForm.full_name,
        phone: addUserForm.phone,
        roles: addUserForm.roles,
        branch_ids: addUserForm.branch_ids,
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

  // Open edit user modal
  function openEditModal(user: User) {
    const isEditable = canEditUser(user);
    setEditUserForm({
      id: user.id,
      full_name: user.full_name,
      phone: user.phone || "",
      is_active: user.is_active,
      roles: user.roles,
      branch_ids: user.branches.map(b => b.branch_id),
      primary_branch_id: user.branches.find(b => b.is_primary)?.branch_id || null,
    });
    setEditUserError(isEditable ? null : "You can only view this user (they have a higher role)");
    setShowEditModal(true);
  }

  // Check if the user being edited is editable (based on form state)
  const isEditingEditable = useMemo(() => {
    const targetUser = users.find(u => u.id === editUserForm.id);
    return targetUser ? canEditUser(targetUser) : false;
  }, [editUserForm.id, users, currentUserRoleLevel]);

  // Edit user handler
  async function handleEditUser(e: React.FormEvent) {
    e.preventDefault();
    setEditUserError(null);

    if (editUserForm.roles.length === 0) {
      setEditUserError("Please select at least one role");
      return;
    }

    if (!editUserForm.phone) {
      setEditUserError("Phone number is required");
      return;
    }

    // Validate phone number format (at least 7 digits)
    const phoneDigits = editUserForm.phone.replace(/[^0-9]/g, "");
    if (phoneDigits.length < 7 || phoneDigits.length > 20) {
      setEditUserError("Phone number must be between 7 and 20 digits");
      return;
    }

    if (editUserForm.branch_ids.length === 0) {
      setEditUserError("Please assign at least one branch");
      return;
    }

    try {
      setEditingUser(true);
      
      // Update user profile
      await rbacApi.updateUser(editUserForm.id, {
        full_name: editUserForm.full_name,
        phone: editUserForm.phone,
        is_active: editUserForm.is_active,
      });

      // Update roles
      await rbacApi.updateUserRoles(editUserForm.id, editUserForm.roles);

      // Update branches
      await rbacApi.updateUserBranches(
        editUserForm.id,
        editUserForm.branch_ids,
        editUserForm.primary_branch_id || undefined
      );
      
      setShowEditModal(false);
      fetchData();
    } catch (err) {
      setEditUserError(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setEditingUser(false);
    }
  }

  // Open delete confirmation
  function openDeleteModal(user: User) {
    setUserToDelete(user);
    setShowDeleteModal(true);
  }

  // Delete user handler
  async function handleDeleteUser() {
    if (!userToDelete) return;

    try {
      setDeletingUser(true);
      await rbacApi.deleteUser(userToDelete.id);
      setShowDeleteModal(false);
      setUserToDelete(null);
      fetchData();
    } catch (err) {
      console.error("Failed to delete user:", err);
    } finally {
      setDeletingUser(false);
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

  // Toggle role selection in edit form
  function toggleEditRole(role: string) {
    setEditUserForm(prev => ({
      ...prev,
      roles: prev.roles.includes(role)
        ? prev.roles.filter(r => r !== role)
        : [...prev.roles, role],
    }));
  }

  // Toggle branch selection in edit form
  function toggleEditBranch(branchId: string) {
    setEditUserForm(prev => {
      const newBranches = prev.branch_ids.includes(branchId)
        ? prev.branch_ids.filter(id => id !== branchId)
        : [...prev.branch_ids, branchId];
      
      // First selected branch is always primary
      const newPrimary = newBranches[0] || null;
      
      return { ...prev, branch_ids: newBranches, primary_branch_id: newPrimary };
    });
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
          <button
            onClick={fetchData}
            className="text-sm text-negative-900 hover:underline mt-1"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with title and add button */}
      <div className="flex items-center justify-between bg-white rounded-xl p-4 border border-neutral-200">
        <div>
          <h3 className="text-lg font-semibold text-neutral-950">Users</h3>
          <p className="text-sm text-neutral-900">Summary of users</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-950 transition-colors"
        >
          <LuPlus className="w-4 h-4" />
          Add a New User
        </button>
      </div>

      {/* Summary Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 rounded-lg">
              <LuUsers className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-neutral-900">All Users</p>
              <p className="text-2xl font-bold text-neutral-950">{stats.total}</p>
            </div>
          </div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 rounded-lg">
              <LuUserCheck className="w-5 h-5 text-positive" />
            </div>
            <div>
              <p className="text-sm text-neutral-900">Active</p>
              <p className="text-2xl font-bold text-neutral-950">{stats.active}</p>
            </div>
          </div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-negative-100 rounded-lg">
              <LuUserX className="w-5 h-5 text-negative" />
            </div>
            <div>
              <p className="text-sm text-neutral-900">Inactive</p>
              <p className="text-2xl font-bold text-neutral-950">{stats.inactive}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white border border-neutral-200 rounded-xl">
        {/* Table Header with Search */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 border-b border-neutral-200">
          <div className="relative">
            <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:border-primary w-full"
            />
          </div>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden p-4 space-y-4">
          {paginatedUsers.map((user) => (
            <div
              key={user.id}
              className="border border-neutral-200 rounded-xl p-4 space-y-3"
            >
              {/* User Header */}
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-neutral-900 truncate">{user.full_name}</h4>
                  <p className="text-sm text-neutral-900 truncate">{user.email}</p>
                  {user.phone && (
                    <p className="text-sm text-neutral-900">{user.phone}</p>
                  )}
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0 ${
                    user.is_active
                      ? "bg-primary-100 text-positive-950"
                      : "bg-neutral-100 text-neutral-950"
                  }`}
                >
                  {user.is_active ? "Active" : "Inactive"}
                </span>
              </div>

              {/* Roles */}
              <div>
                <p className="text-xs text-neutral-900 mb-1">Roles</p>
                <div className="flex flex-wrap gap-1">
                  {user.roles.map((role) => (
                    <span
                      key={role}
                      className="px-2 py-0.5 bg-neutral-100 text-neutral-900 rounded text-xs font-medium"
                    >
                      {role}
                    </span>
                  ))}
                </div>
              </div>

              {/* Branches */}
              {user.branches.length > 0 && (
                <div>
                  <p className="text-xs text-neutral-900 mb-1">Branches</p>
                  <div className="flex flex-wrap gap-1">
                    {user.branches.map((ba) => (
                      <span
                        key={ba.branch_id}
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          ba.is_primary
                            ? "bg-primary-100 text-positive-950"
                            : "bg-neutral-100 text-neutral-950"
                        }`}
                      >
                        {ba.branches?.code || ba.branch_id.slice(0, 8)}
                        {ba.is_primary && " ★"}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2 border-t border-neutral-200">
                <button
                  onClick={() => openEditModal(user)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-primary-950 rounded-lg transition-colors"
                >
                  <LuPencil className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={() => openDeleteModal(user)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-negative-950 rounded-lg transition-colors"
                >
                  <LuTrash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            </div>
          ))}

          {paginatedUsers.length === 0 && (
            <div className="text-center py-8 text-neutral-900">
              {searchQuery ? "No users match your search." : "No users found. Click \"Add a New User\" to create one."}
            </div>
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50">
                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950 whitespace-nowrap">Name</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950 whitespace-nowrap">Email</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950 whitespace-nowrap">Phone</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950 whitespace-nowrap">Roles</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950 whitespace-nowrap">Branches</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950 whitespace-nowrap">Status</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedUsers.map((user) => (
                <tr key={user.id} className="border-b border-neutral-200 hover:bg-neutral-100 transition-colors">
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className="font-medium text-neutral-900">{user.full_name}</span>
                  </td>
                  <td className="py-3 px-4 text-sm text-neutral-900 whitespace-nowrap">{user.email}</td>
                  <td className="py-3 px-4 text-sm text-neutral-900 whitespace-nowrap">{user.phone || "-"}</td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1">
                      {user.roles.map((role) => (
                        <span
                          key={role}
                          className="px-2 py-0.5 bg-neutral-100 text-neutral-900 rounded text-xs font-medium"
                        >
                          {role}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1">
                      {user.branches.length === 0 ? (
                        <span className="text-sm text-neutral-400">-</span>
                      ) : (
                        user.branches.map((ba) => (
                          <span
                            key={ba.branch_id}
                            className={`px-2 py-0.5 rounded text-xs font-medium ${
                              ba.is_primary
                                ? "bg-primary-100 text-positive-950"
                                : "bg-neutral-100 text-neutral-950"
                            }`}
                          >
                            {ba.branches?.code || ba.branch_id.slice(0, 8)}
                            {ba.is_primary && " ★"}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        user.is_active
                          ? "bg-primary-100 text-positive-950"
                          : "bg-neutral-100 text-neutral-950"
                      }`}
                    >
                      {user.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <div className="flex items-center justify-center gap-2">
                      {canEditUser(user) ? (
                        <>
                          <button
                            onClick={() => openEditModal(user)}
                            className="p-2 text-primary-950 hover:text-primary-900 hover:bg-primary-50 rounded-lg transition-colors"
                            title="Edit user"
                          >
                            <LuPencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openDeleteModal(user)}
                            className="p-2 text-negative-950 hover:text-negative-900 hover:bg-negative-50 rounded-lg transition-colors"
                            title="Delete user"
                          >
                            <LuTrash2 className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => openEditModal(user)}
                          className="p-2 text-positive-950 hover:text-positive-900 rounded-lg transition-colors"
                          title="View user (read-only)"
                        >
                          <LuEye className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {paginatedUsers.length === 0 && (
            <div className="text-center py-12 text-neutral-900">
              {searchQuery ? "No users match your search." : "No users found. Click \"Add a New User\" to create one."}
            </div>
          )}
        </div>

        {/* Pagination */}
        {filteredUsers.length > ITEMS_PER_PAGE && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4">
            <p className="text-sm text-neutral-900">
              {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredUsers.length)} of {filteredUsers.length} users
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 border border-neutral-200 rounded-lg text-neutral-900 hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <LuChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-neutral-900 px-2">
                {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 border border-neutral-200 rounded-lg text-neutral-900 hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <LuChevronRight className="w-4 h-4" />
              </button>
            </div>
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
              required
              pattern="[0-9+\-()\s]{7,20}"
              title="Please enter a valid phone number (7-20 digits)"
            />
          </ModalSection>

          <ModalSection title="Assign Roles">
            <div className="flex flex-wrap gap-2">
              {availableRoles.map((role) => (
                <button
                  key={role.code}
                  type="button"
                  onClick={() => toggleRole(role.code)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    addUserForm.roles.includes(role.code)
                      ? "bg-primary text-white"
                      : "bg-neutral-100 text-neutral hover:bg-neutral-200"
                  }`}
                >
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
                      ? "bg-primary text-white"
                      : "bg-neutral-100 text-neutral hover:bg-neutral-200"
                  }`}
                >
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

      {/* Edit User Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title={isEditingEditable ? "Edit User" : "View User"}
        maxWidth="lg"
      >
        <form onSubmit={handleEditUser}>
          <ModalError message={editUserError} />
          
          <ModalSection title="User Information">
            <ModalInput
              type="text"
              value={editUserForm.full_name}
              onChange={(v) => setEditUserForm(prev => ({ ...prev, full_name: v }))}
              placeholder="Full Name"
              required
              disabled={!isEditingEditable}
            />
            
            <ModalInput
              type="tel"
              value={editUserForm.phone}
              onChange={(v) => setEditUserForm(prev => ({ ...prev, phone: v }))}
              placeholder="Phone Number"
              required
              pattern="[0-9+\-()\s]{7,20}"
              title="Please enter a valid phone number (7-20 digits)"
              disabled={!isEditingEditable}
            />

            <div className="flex items-center gap-3 mt-4">
              <button
                type="button"
                onClick={() => isEditingEditable && setEditUserForm(prev => ({ ...prev, is_active: !prev.is_active }))}
                disabled={!isEditingEditable}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  editUserForm.is_active ? "bg-primary" : "bg-neutral-200"
                } ${!isEditingEditable ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    editUserForm.is_active ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
              <span className="text-sm text-neutral-900">
                {editUserForm.is_active ? "Active" : "Inactive"}
              </span>
            </div>
          </ModalSection>

          <ModalSection title={isEditingEditable ? "Assign Roles" : "Current Roles"}>
            <div className="flex flex-wrap gap-2">
              {/* Show all roles but only allow selecting available ones */}
              {roles.map((role) => {
                const isSelected = editUserForm.roles.includes(role.code);
                const canToggle = isEditingEditable && (ROLE_LEVELS[role.code] || 0) <= currentUserRoleLevel;
                return (
                  <button
                    key={role.code}
                    type="button"
                    onClick={() => canToggle && toggleEditRole(role.code)}
                    disabled={!canToggle}
                    className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      isSelected
                        ? "bg-primary text-white"
                        : "bg-neutral-100 text-neutral"
                    } ${!canToggle ? "opacity-50 cursor-not-allowed" : "hover:bg-neutral-200"}`}
                  >
                    {role.name}
                    {isSelected && !canToggle && " (locked)"}
                  </button>
                );
              })}
            </div>
            {isEditingEditable && currentUserRoleLevel < 5 && (
              <p className="text-xs text-neutral-900 mt-2">
                You can only assign roles at or below your permission level.
              </p>
            )}
          </ModalSection>

          <ModalSection title={isEditingEditable ? "Assign to Branches" : "Current Branches"}>
            <div className="flex flex-wrap gap-2">
              {branches.filter(b => b.is_active).map((branch) => (
                <button
                  key={branch.id}
                  type="button"
                  onClick={() => isEditingEditable && toggleEditBranch(branch.id)}
                  disabled={!isEditingEditable}
                  className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    editUserForm.branch_ids.includes(branch.id)
                      ? "bg-primary text-white"
                      : "bg-neutral-100 text-neutral"
                  } ${!isEditingEditable ? "opacity-50 cursor-not-allowed" : "hover:bg-neutral-200"}`}
                >
                  {branch.name} ({branch.code})
                </button>
              ))}
            </div>
            {isEditingEditable && editUserForm.branch_ids.length > 0 && (
              <p className="text-xs text-neutral-900 mt-2">
                First selected branch will be the primary branch.
              </p>
            )}
          </ModalSection>

          {isEditingEditable ? (
            <ModalButtons
              onCancel={() => setShowEditModal(false)}
              submitText={editingUser ? "Saving..." : "Save Changes"}
              loading={editingUser}
            />
          ) : (
            <ModalButtons
              onCancel={() => setShowEditModal(false)}
              submitText={editingUser ? "Saving..." : "Save Changes"}
              loading={editingUser}
            />
          )}
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal && !!userToDelete}
        onClose={() => setShowDeleteModal(false)}
        title="Delete User"
        maxWidth="sm"
      >
        {userToDelete && (
          <div>
            <div className="bg-neutral-100 rounded-xl p-4 my-4">
              <p className="text-neutral-900">
                Are you sure you want to delete <strong className="text-neutral-950">{userToDelete.full_name}</strong>?
              </p>
            </div>
            <p className="text-sm text-neutral-900 mb-2">
              This action cannot be undone. All user data will be permanently removed.
            </p>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-4 py-3.5 border-2 border-negative text-negative rounded-xl font-semibold hover:bg-negative-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                disabled={deletingUser}
                className="flex-1 px-4 py-3.5 bg-negative text-white rounded-xl font-semibold hover:bg-negative-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {deletingUser ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
