const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

// Get stored tokens
function getAccessToken(): string | null {
  return localStorage.getItem("access_token");
}

// Set tokens
export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem("access_token", accessToken);
  localStorage.setItem("refresh_token", refreshToken);
}

// Clear tokens
export function clearTokens(): void {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}

// Force logout: clear tokens and redirect to login page
function forceLogout(): void {
  clearTokens();
  // Only redirect if not already on login/reset-password page
  if (!window.location.pathname.startsWith("/login") && !window.location.pathname.startsWith("/reset-password")) {
    window.location.href = "/login";
  }
}

// Generic fetch wrapper with auth
async function fetchWithAuth<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const accessToken = getAccessToken();
  const isFormDataBody = options.body instanceof FormData;
  
  const headers: HeadersInit = {
    ...(options.headers || {}),
  };

  if (!isFormDataBody) {
    (headers as Record<string, string>)["Content-Type"] = "application/json";
  }

  if (accessToken) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));

    // Auto-logout on auth failures (skip for login/refresh/change-password endpoints)
    const isAuthEndpoint = endpoint === "/api/auth/login" || endpoint === "/api/auth/refresh" || endpoint === "/api/auth/change-password";
    if (!isAuthEndpoint) {
      // 401 = expired/invalid token, 423 = locked account → always logout
      if (response.status === 401 || response.status === 423) {
        forceLogout();
        return new Promise(() => {}); // Never resolves — page is redirecting
      }
      // 403 = only logout for account-level issues (deactivated), not permission errors
      if (response.status === 403) {
        const errorMsg = (error.error || "").toLowerCase();
        if (errorMsg.includes("deactivated") || errorMsg.includes("inactive")) {
          forceLogout();
          return new Promise(() => {}); // Never resolves — page is redirecting
        }
      }
    }

    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// Auth API
export const authApi = {
  login: async (email: string, password: string) => {
    return fetchWithAuth<{
      user: import("../types").AuthUser;
      session: import("../types").AuthSession;
    }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  logout: async () => {
    return fetchWithAuth<{ message: string }>("/api/auth/logout", {
      method: "POST",
    });
  },

  getMe: async () => {
    return fetchWithAuth<import("../types").AuthUser>("/api/auth/me");
  },

  refreshToken: async (refreshToken: string) => {
    return fetchWithAuth<{ session: import("../types").AuthSession }>(
      "/api/auth/refresh",
      {
        method: "POST",
        body: JSON.stringify({ refresh_token: refreshToken }),
      }
    );
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    return fetchWithAuth<{ message: string }>("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  forgotPassword: async (email: string) => {
    return fetchWithAuth<{ message: string }>("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },

  resetPassword: async (accessToken: string, newPassword: string) => {
    return fetchWithAuth<{ message: string }>("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ access_token: accessToken, new_password: newPassword }),
    });
  },

  updateProfile: async (data: { full_name: string; phone?: string; email?: string }) => {
    return fetchWithAuth<{ message: string; profile: import("../types").UserProfile }>("/api/auth/profile", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  getProfile: async () => {
    return fetchWithAuth<{ profile: import("../types").UserProfile }>("/api/auth/profile");
  },

  unlockAccount: async (userId: string) => {
    return fetchWithAuth<{ message: string }>("/api/auth/unlock-account", {
      method: "POST",
      body: JSON.stringify({ user_id: userId }),
    });
  },
};

// Branches API
export const branchesApi = {
  getAll: async () => {
    return fetchWithAuth<import("../types").Branch[]>("/api/branches");
  },

  getById: async (id: string) => {
    return fetchWithAuth<import("../types").Branch>(`/api/branches/${id}`);
  },

  create: async (data: Partial<import("../types").Branch>) => {
    return fetchWithAuth<import("../types").Branch>("/api/branches", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update: async (id: string, data: Partial<import("../types").Branch>) => {
    return fetchWithAuth<import("../types").Branch>(`/api/branches/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string) => {
    return fetchWithAuth<{ message: string }>(`/api/branches/${id}`, {
      method: "DELETE",
    });
  },

  getUsers: async (branchId: string) => {
    return fetchWithAuth<Array<import("../types").UserProfile & { roles: string[]; is_primary: boolean }>>(
      `/api/branches/${branchId}/users`
    );
  },
};

// RBAC API
export const rbacApi = {
  getRoles: async () => {
    return fetchWithAuth<import("../types").RoleInfo[]>("/api/rbac/roles");
  },

  getUsers: async () => {
    return fetchWithAuth<Array<import("../types").UserProfile & { 
      roles: string[]; 
      branches: import("../types").BranchAssignment[];
    }>>("/api/rbac/users");
  },

  createUser: async (data: {
    email: string;
    password: string;
    full_name: string;
    phone?: string;
    roles: string[];
    branch_ids?: string[];
  }) => {
    return fetchWithAuth<import("../types").UserProfile>("/api/rbac/users", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  updateUser: async (userId: string, data: {
    full_name?: string;
    phone?: string;
    is_active?: boolean;
  }) => {
    return fetchWithAuth<import("../types").UserProfile>(
      `/api/rbac/users/${userId}`,
      {
        method: "PUT",
        body: JSON.stringify(data),
      }
    );
  },

  deleteUser: async (userId: string) => {
    return fetchWithAuth<{ message: string }>(
      `/api/rbac/users/${userId}`,
      {
        method: "DELETE",
      }
    );
  },

  updateUserRoles: async (userId: string, roles: string[]) => {
    return fetchWithAuth<{ message: string; roles: string[] }>(
      `/api/rbac/users/${userId}/roles`,
      {
        method: "PUT",
        body: JSON.stringify({ roles }),
      }
    );
  },

  updateUserBranches: async (userId: string, branchIds: string[], primaryBranchId?: string) => {
    return fetchWithAuth<{ message: string; branch_ids: string[] }>(
      `/api/rbac/users/${userId}/branches`,
      {
        method: "PUT",
        body: JSON.stringify({ branch_ids: branchIds, primary_branch_id: primaryBranchId }),
      }
    );
  },

  updateUserStatus: async (userId: string, isActive: boolean) => {
    return fetchWithAuth<{ message: string }>(`/api/rbac/users/${userId}/status`, {
      method: "PUT",
      body: JSON.stringify({ is_active: isActive }),
    });
  },

  resetUserPassword: async (userId: string, tempPassword: string) => {
    return fetchWithAuth<{ message: string }>(`/api/rbac/users/${userId}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ temp_password: tempPassword }),
    });
  },
};

// Audit API
export const auditApi = {
  getLogs: async (params?: {
    action?: string;
    entity_type?: string;
    entity_id?: string;
    user_id?: string;
    branch_id?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
    offset?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
    }
    const query = searchParams.toString();
    return fetchWithAuth<import("../types").PaginatedResponse<import("../types").AuditLog>>(
      `/api/audit${query ? `?${query}` : ""}`
    );
  },

  getEntityLogs: async (entityType: string, entityId: string) => {
    return fetchWithAuth<import("../types").AuditLog[]>(
      `/api/audit/entity/${entityType}/${entityId}`
    );
  },

  getUserLogs: async (userId: string, limit?: number) => {
    const query = limit ? `?limit=${limit}` : "";
    return fetchWithAuth<import("../types").AuditLog[]>(`/api/audit/user/${userId}${query}`);
  },

  getStats: async (days?: number) => {
    const query = days ? `?days=${days}` : "";
    return fetchWithAuth<{
      period_days: number;
      total_events: number;
      actions: Record<string, number>;
      logins: number;
      successful: number;
      failed: number;
    }>(`/api/audit/stats${query}`);
  },
};

// Customers API
export const customersApi = {
  getAll: async (params?: {
    branch_id?: string;
    status?: string;
    customer_type?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
    }
    const query = searchParams.toString();
    return fetchWithAuth<import("../types").PaginatedResponse<import("../types").Customer>>(
      `/api/customers${query ? `?${query}` : ""}`
    );
  },

  getById: async (id: string) => {
    return fetchWithAuth<import("../types").Customer>(`/api/customers/${id}`);
  },

  create: async (data: {
    full_name: string;
    contact_number?: string;
    email?: string;
    customer_type: string;
    branch_id: string;
    status?: string;
    address?: string;
    notes?: string;
  }) => {
    return fetchWithAuth<import("../types").Customer>("/api/customers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update: async (
    id: string,
    data: {
      full_name?: string;
      contact_number?: string | null;
      email?: string | null;
      customer_type?: string;
      status?: string;
      address?: string | null;
      notes?: string | null;
    }
  ) => {
    return fetchWithAuth<import("../types").Customer>(`/api/customers/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string) => {
    return fetchWithAuth<{ message: string }>(`/api/customers/${id}`, {
      method: "DELETE",
    });
  },
};

export const vehiclesApi = {
  getAll: async (params?: {
    branch_id?: string;
    status?: string;
    vehicle_type?: string;
    customer_id?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
    }
    const query = searchParams.toString();
    return fetchWithAuth<import("../types").PaginatedResponse<import("../types").Vehicle>>(
      `/api/vehicles${query ? `?${query}` : ""}`
    );
  },

  getById: async (id: string) => {
    return fetchWithAuth<import("../types").Vehicle>(`/api/vehicles/${id}`);
  },

  create: async (data: {
    plate_number: string;
    vehicle_type: string;
    vehicle_class?: string;
    make?: string;
    orcr: string;
    model: string;
    customer_id: string;
    branch_id: string;
    status?: string;
    color?: string;
    year?: number;
    conduction_sticker?: string;
    chassis_number?: string;
    notes?: string;
  }) => {
    return fetchWithAuth<import("../types").Vehicle>("/api/vehicles", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update: async (
    id: string,
    data: {
      plate_number?: string;
      vehicle_type?: string;
      vehicle_class?: string;
      make?: string;
      orcr?: string;
      model?: string;
      customer_id?: string;
      branch_id?: string;
      status?: string;
      color?: string | null;
      year?: number | null;
      conduction_sticker?: string | null;
      chassis_number?: string | null;
      notes?: string | null;
    }
  ) => {
    return fetchWithAuth<import("../types").Vehicle>(`/api/vehicles/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string) => {
    return fetchWithAuth<{ message: string }>(`/api/vehicles/${id}`, {
      method: "DELETE",
    });
  },

  checkReferences: async (id: string) => {
    return fetchWithAuth<{ hasReferences: boolean; count: number }>(
      `/api/vehicles/${id}/references`
    );
  },

  getExternalRepairs: async (id: string) => {
    return fetchWithAuth<import("../types").VehicleExternalRepair[]>(
      `/api/vehicles/${id}/external-repairs`
    );
  },

  createExternalRepair: async (
    id: string,
    data: {
      repair_name: string;
      provider_name: string;
      description: string;
      service_date: string;
      notes?: string;
    }
  ) => {
    return fetchWithAuth<import("../types").VehicleExternalRepair>(
      `/api/vehicles/${id}/external-repairs`,
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    );
  },

  updateExternalRepair: async (
    vehicleId: string,
    repairId: string,
    data: {
      repair_name: string;
      provider_name: string;
      description: string;
      service_date: string;
      notes?: string | null;
    }
  ) => {
    return fetchWithAuth<import("../types").VehicleExternalRepair>(
      `/api/vehicles/${vehicleId}/external-repairs/${repairId}`,
      {
        method: "PUT",
        body: JSON.stringify(data),
      }
    );
  },

  deleteExternalRepair: async (vehicleId: string, repairId: string) => {
    return fetchWithAuth<{ message: string }>(
      `/api/vehicles/${vehicleId}/external-repairs/${repairId}`,
      {
        method: "DELETE",
      }
    );
  },

  getRepairHistory: async (id: string) => {
    return fetchWithAuth<import("../types").VehicleRepairHistory[]>(
      `/api/vehicles/${id}/repair-history`
    );
  },
};

// Packages API
export const packagesApi = {
  getAll: async (params?: {
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
    }
    const query = searchParams.toString();
    return fetchWithAuth<import("../types").PaginatedResponse<import("../types").PackageItem>>(
      `/api/packages${query ? `?${query}` : ""}`
    );
  },

  getById: async (id: string) => {
    return fetchWithAuth<import("../types").PackageItem>(`/api/packages/${id}`);
  },

  create: async (data: {
    name: string;
    price: number;
    description?: string;
    status?: string;
  }) => {
    return fetchWithAuth<import("../types").PackageItem>("/api/packages", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update: async (
    id: string,
    data: {
      name?: string;
      price?: number;
      description?: string | null;
      status?: string;
    }
  ) => {
    return fetchWithAuth<import("../types").PackageItem>(`/api/packages/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string) => {
    return fetchWithAuth<{ message: string; deactivated?: boolean }>(`/api/packages/${id}`, {
      method: "DELETE",
    });
  },

  // Labor Links
  getLaborLinks: async (itemId: string) => {
    return fetchWithAuth<import("../types").PackageLaborItem[]>(
      `/api/packages/${itemId}/labor-items`
    );
  },

  addLaborLink: async (itemId: string, data: { labor_item_id: string; quantity: number }) => {
    return fetchWithAuth<import("../types").PackageLaborItem>(
      `/api/packages/${itemId}/labor-items`,
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    );
  },

  updateLaborLink: async (itemId: string, linkId: string, data: { quantity: number }) => {
    return fetchWithAuth<import("../types").PackageLaborItem>(
      `/api/packages/${itemId}/labor-items/${linkId}`,
      {
        method: "PUT",
        body: JSON.stringify(data),
      }
    );
  },

  removeLaborLink: async (itemId: string, linkId: string) => {
    return fetchWithAuth<{ message: string }>(
      `/api/packages/${itemId}/labor-items/${linkId}`,
      {
        method: "DELETE",
      }
    );
  },

  getDeleteMode: async (itemId: string) => {
    return fetchWithAuth<{ deletable: boolean; mode: "delete" | "deactivate"; reference_count: number }>(
      `/api/packages/${itemId}/delete-mode`
    );
  },
};

// Labor API
export const laborItemsApi = {
  getAll: async (params?: {
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
    }
    const query = searchParams.toString();
    return fetchWithAuth<import("../types").PaginatedResponse<import("../types").LaborItem>>(
      `/api/labor-items${query ? `?${query}` : ""}`
    );
  },

  getById: async (id: string) => {
    return fetchWithAuth<import("../types").LaborItem>(`/api/labor-items/${id}`);
  },

  getDeleteMode: async (id: string) => {
    return fetchWithAuth<{ deletable: boolean; mode: "delete" | "deactivate"; reference_count: number }>(
      `/api/labor-items/${id}/delete-mode`
    );
  },

  create: async (data: {
    name: string;
    light_price: number;
    heavy_price: number;
    extra_heavy_price: number;
    status?: string;
  }) => {
    return fetchWithAuth<import("../types").LaborItem>("/api/labor-items", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update: async (
    id: string,
    data: {
      name?: string;
      light_price?: number;
      heavy_price?: number;
      extra_heavy_price?: number;
      status?: string;
    }
  ) => {
    return fetchWithAuth<import("../types").LaborItem>(`/api/labor-items/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string) => {
    return fetchWithAuth<{ message: string }>(`/api/labor-items/${id}`, {
      method: "DELETE",
    });
  },
};

// Job Orders API
export const jobOrdersApi = {
  getAll: async (params?: {
    branch_id?: string;
    customer_id?: string;
    vehicle_id?: string;
    status?: string;
    search?: string;
    include_deleted?: boolean;
    limit?: number;
    offset?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
    }
    const query = searchParams.toString();
    return fetchWithAuth<import("../types").PaginatedResponse<import("../types").JobOrder>>(
      `/api/job-orders${query ? `?${query}` : ""}`
    );
  },

  getById: async (id: string) => {
    return fetchWithAuth<import("../types").JobOrder>(`/api/job-orders/${id}`);
  },

  create: async (data: {
    customer_id: string;
    vehicle_id: string;
    branch_id: string;
    vehicle_class: import("../types").VehicleClass;
    delivered_by: string;
    same_as_customer?: boolean;
    notes?: string;
    odometer_reading?: number;
    vehicle_bay?: string;
    items?: Array<{
      package_item_id: string;
      labor_item_id: string;
      quantity: number;
      inventory_quantities?: Array<{
        inventory_item_id: string;
        quantity: number;
      }>;
    }>;
    lines?: Array<{
      line_type: import("../types").JobOrderLineType;
      reference_id?: string | null;
      quantity: number;
      vehicle_specific_components?: {
        labor?: Array<{ labor_item_id: string; quantity?: number }>;
        inventory?: Array<{ inventory_item_id: string; quantity?: number }>;
      };
    }>;
  }) => {
    return fetchWithAuth<import("../types").JobOrder>("/api/job-orders", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  createRework: async (data: {
    reference_job_order_id: string;
    rework_reason: string;
    is_free_rework?: boolean;
    vehicle_bay?: string;
  }) => {
    return fetchWithAuth<import("../types").JobOrder>("/api/job-orders/rework", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update: async (id: string, data: { notes?: string | null }) => {
    return fetchWithAuth<import("../types").JobOrder>(`/api/job-orders/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  patch: async (id: string, data: {
    notes?: string | null;
    lines?: Array<{
      line_type: import("../types").JobOrderLineType;
      reference_id?: string | null;
      quantity: number;
      vehicle_specific_components?: {
        labor?: Array<{ labor_item_id: string; quantity?: number }>;
        inventory?: Array<{ inventory_item_id: string; quantity?: number }>;
      };
    }>;
  }) => {
    return fetchWithAuth<import("../types").JobOrder>(`/api/job-orders/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string) => {
    return fetchWithAuth<{ message: string }>(`/api/job-orders/${id}`, {
      method: "DELETE",
    });
  },

  restore: async (id: string) => {
    return fetchWithAuth<{ message: string }>(`/api/job-orders/${id}/restore`, {
      method: "PATCH",
    });
  },

  requestApproval: async (id: string) => {
    return fetchWithAuth<import("../types").JobOrder>(`/api/job-orders/${id}/request-approval`, {
      method: "PATCH",
    });
  },

  recordApproval: async (id: string, data: { decision: "approved" | "rejected"; rejection_reason?: string; approval_method?: string }) => {
    return fetchWithAuth<import("../types").JobOrder>(`/api/job-orders/${id}/record-approval`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  approveRework: async (
    id: string,
    data: { decision: "approved" | "rejected"; rejection_reason?: string; approval_method?: string }
  ) => {
    return fetchWithAuth<import("../types").JobOrder>(`/api/job-orders/${id}/approve-rework`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  cancel: async (id: string, data: { cancellation_reason: string }) => {
    return fetchWithAuth<import("../types").JobOrder>(`/api/job-orders/${id}/cancel`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  startWork: async (id: string) => {
    return fetchWithAuth<import("../types").JobOrder>(`/api/job-orders/${id}/start-work`, {
      method: "PATCH",
    });
  },

  markReady: async (id: string) => {
    return fetchWithAuth<import("../types").JobOrder>(`/api/job-orders/${id}/mark-ready`, {
      method: "PATCH",
    });
  },

  updatePaymentDetails: async (
    id: string,
    data: { invoice_number: string; payment_reference: string; payment_mode: "cash" | "gcash" | "other" }
  ) => {
    return fetchWithAuth<import("../types").JobOrder>(`/api/job-orders/${id}/payment-details`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  recordPayment: async (id: string) => {
    return fetchWithAuth<import("../types").JobOrder>(`/api/job-orders/${id}/record-payment`, {
      method: "PATCH",
    });
  },

  complete: async (id: string, data: { picked_up_by: string }) => {
    return fetchWithAuth<import("../types").JobOrder>(`/api/job-orders/${id}/complete`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  getHistory: async (id: string) => {
    return fetchWithAuth<import("../types").JobOrderHistory[]>(`/api/job-orders/${id}/history`);
  },
};

// Third-Party Repairs API
export const thirdPartyRepairsApi = {
  getAll: async (params?: {
    job_order_id?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
    }
    const query = searchParams.toString();
    return fetchWithAuth<import("../types").PaginatedResponse<import("../types").ThirdPartyRepair>>(
      `/api/third-party-repairs${query ? `?${query}` : ""}`
    );
  },

  getById: async (id: string) => {
    return fetchWithAuth<import("../types").ThirdPartyRepair>(`/api/third-party-repairs/${id}`);
  },

  create: async (data: {
    job_order_id: string;
    provider_name: string;
    description: string;
    cost: number;
    repair_date: string;
    notes?: string;
  }) => {
    return fetchWithAuth<import("../types").ThirdPartyRepair>("/api/third-party-repairs", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update: async (
    id: string,
    data: {
      provider_name?: string;
      description?: string;
      cost?: number;
      repair_date?: string;
      notes?: string | null;
    }
  ) => {
    return fetchWithAuth<import("../types").ThirdPartyRepair>(`/api/third-party-repairs/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string) => {
    return fetchWithAuth<{ message: string }>(`/api/third-party-repairs/${id}`, {
      method: "DELETE",
    });
  },
};

// Settings API
export const settingsApi = {
  get: async () => {
    return fetchWithAuth<{
      id: string;
      dark_mode: boolean;
      primary_color: string;
      sidebar_collapsed: boolean;
      font_size: string;
      table_density: string;
      login_lockout_enabled?: boolean;
      updated_at: string;
      updated_by: string | null;
    }>("/api/settings");
  },

  update: async (data: {
    dark_mode?: boolean;
    primary_color?: string;
    sidebar_collapsed?: boolean;
    font_size?: string;
    table_density?: string;
    login_lockout_enabled?: boolean;
  }) => {
    return fetchWithAuth<{
      id: string;
      dark_mode: boolean;
      primary_color: string;
      sidebar_collapsed: boolean;
      font_size: string;
      table_density: string;
      login_lockout_enabled?: boolean;
      updated_at: string;
      updated_by: string | null;
    }>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
};

// Inventory API
export const inventoryApi = {
  getAll: async (params?: {
    branch_id?: string;
    status?: string;
    category?: string;
    search?: string;
    low_stock?: string;
    limit?: number;
    offset?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
    }
    const query = searchParams.toString();
    return fetchWithAuth<import("../types").PaginatedResponse<import("../types").InventoryItem>>(
      `/api/inventory${query ? `?${query}` : ""}`
    );
  },

  getById: async (id: string) => {
    return fetchWithAuth<import("../types").InventoryItem>(`/api/inventory/${id}`);
  },

  getLowStock: async () => {
    return fetchWithAuth<{ data: import("../types").InventoryItem[]; count: number }>(
      "/api/inventory/low-stock"
    );
  },

  create: async (data: {
    item_name: string;
    sku_code: string;
    brand: string;
    category: string;
    unit_of_measure: string;
    cost_price: number;
    reorder_threshold?: number;
    branch_id: string;
    initial_stock?: number;
    supplier_id?: string;
  }) => {
    return fetchWithAuth<import("../types").InventoryItem>("/api/inventory", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update: async (
    id: string,
    data: {
      item_name?: string;
      sku_code?: string;
      brand?: string;
      category?: string;
      unit_of_measure?: string;
      cost_price?: number;
      reorder_threshold?: number;
      status?: string;
    }
  ) => {
    return fetchWithAuth<import("../types").InventoryItem>(`/api/inventory/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string) => {
    return fetchWithAuth<{ message: string }>(`/api/inventory/${id}`, {
      method: "DELETE",
    });
  },

  checkReferences: async (id: string) => {
    return fetchWithAuth<{
      hasReferences: boolean;
      mode: "delete" | "deactivate";
      nonMovementReferences: number;
      stockMovementReferences: number;
      references: {
        job_order_item_inventories: number;
        purchase_order_items: number;
        stock_movements: number;
      };
    }>(`/api/inventory/${id}/references`);
  },

  adjust: async (
    id: string,
    data: {
      adjustment_type: "increase" | "decrease";
      quantity: number;
      reason: string;
    }
  ) => {
    return fetchWithAuth<{
      message: string;
      current_quantity: number;
      is_low_stock: boolean;
    }>(`/api/inventory/${id}/adjust`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  stockIn: async (
    id: string,
    data: { quantity: number; reason?: string }
  ) => {
    return fetchWithAuth<{
      message: string;
      current_quantity: number;
      is_low_stock: boolean;
    }>(`/api/inventory/${id}/stock-in`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  requestApproval: async (id: string) => {
    return fetchWithAuth<import("../types").InventoryItem>(`/api/inventory/${id}/request-approval`, {
      method: "PATCH",
    });
  },

  recordApproval: async (
    id: string,
    data: { decision: "approved" }
  ) => {
    return fetchWithAuth<import("../types").InventoryItem>(`/api/inventory/${id}/record-approval`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  getMovements: async (
    id: string,
    params?: { limit?: number; offset?: number }
  ) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
    }
    const query = searchParams.toString();
    return fetchWithAuth<import("../types").PaginatedResponse<import("../types").StockMovement>>(
      `/api/inventory/${id}/movements${query ? `?${query}` : ""}`
    );
  },
};

// Purchase Orders API
export const purchaseOrdersApi = {
  getAll: async (params?: {
    branch_id?: string;
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
    }
    const query = searchParams.toString();
    return fetchWithAuth<import("../types").PaginatedResponse<import("../types").PurchaseOrder>>(
      `/api/purchase-orders${query ? `?${query}` : ""}`
    );
  },

  getById: async (id: string) => {
    return fetchWithAuth<import("../types").PurchaseOrder>(`/api/purchase-orders/${id}`);
  },

  create: async (data: {
    po_number?: string;
    supplier_id?: string;
    supplier_name?: string;
    order_date: string;
    expected_delivery_date?: string;
    branch_id: string;
    notes?: string;
    items: Array<{
      inventory_item_id: string;
      quantity_ordered: number;
      unit_cost: number;
    }>;
  }) => {
    return fetchWithAuth<import("../types").PurchaseOrder>("/api/purchase-orders", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update: async (
    id: string,
    data: {
      supplier_id?: string;
      supplier_name?: string;
      order_date?: string;
      expected_delivery_date?: string;
      notes?: string;
      items?: Array<{
        inventory_item_id: string;
        quantity_ordered: number;
        unit_cost: number;
      }>;
    }
  ) => {
    return fetchWithAuth<import("../types").PurchaseOrder>(`/api/purchase-orders/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string) => {
    return fetchWithAuth<{ message: string }>(`/api/purchase-orders/${id}`, {
      method: "DELETE",
    });
  },

  restore: async (id: string) => {
    return fetchWithAuth<{ message: string }>(`/api/purchase-orders/${id}/restore`, {
      method: "PATCH",
    });
  },

  submit: async (id: string) => {
    return fetchWithAuth<import("../types").PurchaseOrder>(`/api/purchase-orders/${id}/submit`, {
      method: "PATCH",
    });
  },

  approve: async (id: string) => {
    return fetchWithAuth<import("../types").PurchaseOrder>(`/api/purchase-orders/${id}/approve`, {
      method: "PATCH",
    });
  },

  receive: async (
    id: string,
    data?: {
      receipt_reference_number?: string;
      quantity_received?: number;
    }
  ) => {
    return fetchWithAuth<import("../types").PurchaseOrder>(`/api/purchase-orders/${id}/receive`, {
      method: "PATCH",
      body: data ? JSON.stringify(data) : undefined,
    });
  },

  cancel: async (id: string) => {
    return fetchWithAuth<{ message: string }>(`/api/purchase-orders/${id}/cancel`, {
      method: "PATCH",
    });
  },

  uploadPurchaseOrderReceipt: async (
    id: string,
    payload:
      | File
      | {
          file?: File;
          receipt_reference_number?: string | null;
          total_amount?: number;
        }
  ) => {
    const formData = new FormData();

    if (payload instanceof File) {
      formData.append("receipt", payload);
    } else {
      if (payload.file) {
        formData.append("receipt", payload.file);
      }
      if (payload.receipt_reference_number !== undefined) {
        formData.append("receipt_reference_number", payload.receipt_reference_number ?? "");
      }
      if (payload.total_amount !== undefined) {
        formData.append("total_amount", String(payload.total_amount));
      }
    }

    return fetchWithAuth<import("../types").PurchaseOrder>(`/api/purchase-orders/${id}/upload-receipt`, {
      method: "POST",
      body: formData,
    });
  },
};

// Suppliers API
export const suppliersApi = {
  getAll: async (params?: {
    branch_id?: string;
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
    }
    const query = searchParams.toString();
    return fetchWithAuth<import("../types").PaginatedResponse<import("../types").Supplier>>(
      `/api/suppliers${query ? `?${query}` : ""}`
    );
  },

  getById: async (id: string) => {
    return fetchWithAuth<import("../types").Supplier>(`/api/suppliers/${id}`);
  },

  create: async (data: {
    supplier_name: string;
    contact_person: string;
    email: string;
    phone: string;
    address: string;
    status?: string;
    branch_id: string;
    branch_ids?: string[];
    notes?: string;
  }) => {
    return fetchWithAuth<import("../types").Supplier>("/api/suppliers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update: async (
    id: string,
    data: {
      supplier_name?: string;
      contact_person?: string;
      email?: string;
      phone?: string;
      address?: string;
      status?: string;
      notes?: string | null;
    }
  ) => {
    return fetchWithAuth<import("../types").Supplier>(`/api/suppliers/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  updateBranches: async (id: string, branchIds: string[], primaryBranchId?: string | null) => {
    return fetchWithAuth<{ message: string; branch_ids: string[]; primary_branch_id: string }>(
      `/api/suppliers/${id}/branches`,
      {
        method: "PUT",
        body: JSON.stringify({ branch_ids: branchIds, primary_branch_id: primaryBranchId || null }),
      }
    );
  },

  delete: async (id: string) => {
    return fetchWithAuth<{ message: string }>(`/api/suppliers/${id}`, {
      method: "DELETE",
    });
  },
};

// Supplier Products API
export const supplierProductsApi = {
  getAll: async (params?: {
    branch_id?: string;
    supplier_id?: string;
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
    }
    const query = searchParams.toString();
    return fetchWithAuth<import("../types").PaginatedResponse<import("../types").SupplierProduct>>(
      `/api/supplier-products${query ? `?${query}` : ""}`
    );
  },

  getById: async (id: string) => {
    return fetchWithAuth<import("../types").SupplierProduct>(`/api/supplier-products/${id}`);
  },

  create: async (data: {
    supplier_id: string;
    inventory_item_id?: string | null;
    product_name: string;
    unit_cost: number;
    lead_time_days?: number | null;
    branch_id: string;
  }) => {
    return fetchWithAuth<import("../types").SupplierProduct>("/api/supplier-products", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update: async (
    id: string,
    data: {
      supplier_id?: string;
      inventory_item_id?: string | null;
      product_name?: string;
      unit_cost?: number;
      lead_time_days?: number | null;
      status?: string;
    }
  ) => {
    return fetchWithAuth<import("../types").SupplierProduct>(`/api/supplier-products/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string) => {
    return fetchWithAuth<{ message: string }>(`/api/supplier-products/${id}`, {
      method: "DELETE",
    });
  },
};

// ─── Notifications API ───
export const notificationsApi = {
  getAll: async (params?: {
    branch_id?: string;
    status?: string;
    target_type?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) searchParams.append(key, String(value));
      });
    }
    const query = searchParams.toString();
    return fetchWithAuth<import("../types").PaginatedResponse<import("../types").Notification>>(
      `/api/notifications${query ? `?${query}` : ""}`
    );
  },

  getMy: async (params?: {
    is_read?: string;
    limit?: number;
    offset?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) searchParams.append(key, String(value));
      });
    }
    const query = searchParams.toString();
    return fetchWithAuth<import("../types").PaginatedResponse<import("../types").NotificationReceipt>>(
      `/api/notifications/my${query ? `?${query}` : ""}`
    );
  },

  getUnreadCount: async () => {
    return fetchWithAuth<{ unread_count: number }>("/api/notifications/unread-count");
  },

  getById: async (id: string) => {
    return fetchWithAuth<import("../types").Notification>(`/api/notifications/${id}`);
  },

  create: async (data: {
    title: string;
    message: string;
    target_type: string;
    target_value: string;
    branch_id: string;
    status?: string;
    scheduled_at?: string | null;
  }) => {
    return fetchWithAuth<import("../types").Notification>("/api/notifications", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update: async (
    id: string,
    data: {
      title?: string;
      message?: string;
      target_type?: string;
      target_value?: string;
      status?: string;
      scheduled_at?: string | null;
    }
  ) => {
    return fetchWithAuth<import("../types").Notification>(`/api/notifications/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string) => {
    return fetchWithAuth<{ message: string }>(
      `/api/notifications/${id}`,
      { method: "DELETE" }
    );
  },

  send: async (id: string) => {
    return fetchWithAuth<{ message: string }>(
      `/api/notifications/${id}/send`,
      { method: "POST" }
    );
  },

  markAsRead: async (id: string) => {
    return fetchWithAuth<import("../types").NotificationReceipt>(
      `/api/notifications/${id}/mark-read`,
      { method: "POST" }
    );
  },

  markAllAsRead: async () => {
    return fetchWithAuth<{ message: string }>("/api/notifications/mark-all-read", {
      method: "POST",
    });
  },
};

// ─── Service Reminders API ───
export const serviceRemindersApi = {
  getAll: async (params?: {
    branch_id?: string;
    customer_id?: string;
    vehicle_id?: string;
    status?: string;
    delivery_method?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) searchParams.append(key, String(value));
      });
    }
    const query = searchParams.toString();
    return fetchWithAuth<import("../types").PaginatedResponse<import("../types").ServiceReminder>>(
      `/api/service-reminders${query ? `?${query}` : ""}`
    );
  },

  getById: async (id: string) => {
    return fetchWithAuth<import("../types").ServiceReminder>(`/api/service-reminders/${id}`);
  },

  create: async (data: {
    customer_id: string;
    vehicle_id: string;
    service_type: string;
    scheduled_at?: string;
    scheduled_date?: string;
    scheduled_time?: string;
    delivery_method?: string;
    message_template: string;
    branch_id: string;
    status?: string;
  }) => {
    return fetchWithAuth<import("../types").ServiceReminder>("/api/service-reminders", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update: async (
    id: string,
    data: {
      customer_id?: string;
      vehicle_id?: string;
      service_type?: string;
      scheduled_at?: string;
      scheduled_date?: string;
      scheduled_time?: string;
      delivery_method?: string;
      message_template?: string;
      status?: string;
    }
  ) => {
    return fetchWithAuth<import("../types").ServiceReminder>(`/api/service-reminders/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string) => {
    return fetchWithAuth<{ message: string }>(`/api/service-reminders/${id}`, {
      method: "DELETE",
    });
  },

  send: async (id: string) => {
    return fetchWithAuth<{ message: string; data: import("../types").ServiceReminder }>(
      `/api/service-reminders/${id}/send`,
      { method: "POST" }
    );
  },

  cancel: async (id: string) => {
    return fetchWithAuth<{ message: string; data: import("../types").ServiceReminder }>(
      `/api/service-reminders/${id}/cancel`,
      { method: "POST" }
    );
  },

  processScheduled: async () => {
    return fetchWithAuth<{ message: string; processed: number; sent: number; failed: number }>(
      "/api/service-reminders/process-scheduled",
      { method: "POST" }
    );
  },
};

// ─── Dashboard / Analytics API ───
export const dashboardApi = {
  getSummary: async (params?: { branch_id?: string; date_from?: string; date_to?: string }) => {
    const qs = new URLSearchParams();
    if (params?.branch_id) qs.set("branch_id", params.branch_id);
    if (params?.date_from) qs.set("date_from", params.date_from);
    if (params?.date_to) qs.set("date_to", params.date_to);
    const q = qs.toString();
    return fetchWithAuth<import("../types").DashboardSummary>(
      `/api/dashboard/summary${q ? `?${q}` : ""}`
    );
  },

  getSalesOverTime: async (params?: { branch_id?: string; date_from?: string; date_to?: string; period?: string }) => {
    const qs = new URLSearchParams();
    if (params?.branch_id) qs.set("branch_id", params.branch_id);
    if (params?.date_from) qs.set("date_from", params.date_from);
    if (params?.date_to) qs.set("date_to", params.date_to);
    if (params?.period) qs.set("period", params.period);
    const q = qs.toString();
    return fetchWithAuth<import("../types").SalesOverTimePoint[]>(
      `/api/dashboard/sales-over-time${q ? `?${q}` : ""}`
    );
  },

  getTopLabor: async (params?: { branch_id?: string; date_from?: string; date_to?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.branch_id) qs.set("branch_id", params.branch_id);
    if (params?.date_from) qs.set("date_from", params.date_from);
    if (params?.date_to) qs.set("date_to", params.date_to);
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return fetchWithAuth<import("../types").TopService[]>(
      `/api/dashboard/top-labor${q ? `?${q}` : ""}`
    );
  },

  // Backward compatibility alias
  getTopServices: async (params?: { branch_id?: string; date_from?: string; date_to?: string; limit?: number }) => {
    return dashboardApi.getTopLabor(params);
  },

  getJobStatusDistribution: async (params?: { branch_id?: string; date_from?: string; date_to?: string }) => {
    const qs = new URLSearchParams();
    if (params?.branch_id) qs.set("branch_id", params.branch_id);
    if (params?.date_from) qs.set("date_from", params.date_from);
    if (params?.date_to) qs.set("date_to", params.date_to);
    const q = qs.toString();
    return fetchWithAuth<import("../types").JobStatusDistribution[]>(
      `/api/dashboard/job-status-distribution${q ? `?${q}` : ""}`
    );
  },

  getRevenuePerBranch: async (params?: { date_from?: string; date_to?: string }) => {
    const qs = new URLSearchParams();
    if (params?.date_from) qs.set("date_from", params.date_from);
    if (params?.date_to) qs.set("date_to", params.date_to);
    const q = qs.toString();
    return fetchWithAuth<import("../types").BranchRevenue[]>(
      `/api/dashboard/revenue-per-branch${q ? `?${q}` : ""}`
    );
  },

  getRecentOrders: async (params?: { branch_id?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.branch_id) qs.set("branch_id", params.branch_id);
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return fetchWithAuth<import("../types").RecentOrder[]>(
      `/api/dashboard/recent-orders${q ? `?${q}` : ""}`
    );
  },

  chat: async (message: string, context: Record<string, unknown>): Promise<{ reply: string }> => {
    return fetchWithAuth<{ reply: string }>("/api/dashboard/chat", {
      method: "POST",
      body: JSON.stringify({ message, context }),
    });
  },
};

// Staff Performance API
export const staffPerformanceApi = {
  getAll: async (params?: {
    staff_id?: string;
    branch_id?: string;
    metric_type?: string;
    period_start?: string;
    period_end?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
    }
    const query = searchParams.toString();
    return fetchWithAuth<import("../types").PaginatedResponse<import("../types").StaffPerformance>>(
      `/api/staff-performance${query ? `?${query}` : ""}`
    );
  },

  getById: async (id: string) => {
    return fetchWithAuth<import("../types").StaffPerformance>(`/api/staff-performance/${id}`);
  },

  recompute: async (data?: { branch_id?: string; period_start?: string; period_end?: string }) => {
    return fetchWithAuth<{ message: string; inserted: number; period_start: string; period_end: string }>(
      "/api/staff-performance/recompute",
      {
        method: "POST",
        body: JSON.stringify(data || {}),
      }
    );
  },

  getFreshness: async (params?: { branch_id?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.branch_id) {
      searchParams.append("branch_id", params.branch_id);
    }
    const query = searchParams.toString();

    return fetchWithAuth<{
      latest_completed_job_at: string | null;
      latest_snapshot_at: string | null;
      needs_recompute: boolean;
    }>(`/api/staff-performance/freshness${query ? `?${query}` : ""}`);
  },
};

// Reports API
export const reportsApi = {
  getAll: async (params?: {
    report_type?: string;
    branch_id?: string;
    is_template?: string;
    status?: "active" | "deactivated";
    search?: string;
    limit?: number;
    offset?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
    }
    const query = searchParams.toString();
    return fetchWithAuth<import("../types").PaginatedResponse<import("../types").Report>>(
      `/api/reports${query ? `?${query}` : ""}`
    );
  },

  getById: async (id: string) => {
    return fetchWithAuth<{ data: import("../types").Report }>(`/api/reports/${id}`);
  },
  getDeleteMode: async (id: string) => {
    return fetchWithAuth<{ deletable: boolean; mode: "delete" | "deactivate"; reference_count: number }>(
      `/api/reports/${id}/delete-mode`
    );
  },

  create: async (data: {
    report_name: string;
    report_type: import("../types").ReportType;
    filters?: Record<string, string>;
    branch_id?: string;
    is_template?: boolean;
  }) => {
    return fetchWithAuth<{ data: import("../types").Report }>("/api/reports", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string) => {
    return fetchWithAuth<{ message: string }>(`/api/reports/${id}`, {
      method: "DELETE",
    });
  },

  update: async (
    id: string,
    data: {
      report_name?: string;
      report_type?: import("../types").ReportType;
      filters?: Record<string, string>;
      branch_id?: string;
      is_template?: boolean;
    }
  ) => {
    return fetchWithAuth<{ data: import("../types").Report }>(`/api/reports/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  generate: async (id: string) => {
    return fetchWithAuth<{ data: import("../types").ReportData }>(`/api/reports/${id}/generate`, {
      method: "POST",
    });
  },

  generatePreview: async (data: {
    report_type: import("../types").ReportType;
    filters?: Record<string, string>;
    branch_id?: string;
  }) => {
    return fetchWithAuth<{ data: import("../types").ReportData }>("/api/reports/generate-preview", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  exportReport: async (id: string, format: "csv" | "pdf") => {
    const accessToken = getAccessToken();
    const headers: Record<string, string> = {};
    if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

    const response = await fetch(`${API_BASE_URL}/api/reports/${id}/export/${format}`, { headers });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Export failed" }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const filenameMatch = disposition.match(/filename="?(.+?)"?$/);
    const filename = filenameMatch ? filenameMatch[1] : `report.${format === "pdf" ? "txt" : format}`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};