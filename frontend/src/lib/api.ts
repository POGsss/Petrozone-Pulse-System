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

// Generic fetch wrapper with auth
async function fetchWithAuth<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const accessToken = getAccessToken();
  
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (accessToken) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
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
    }>(`/api/audit/stats${query}`);
  },
};
