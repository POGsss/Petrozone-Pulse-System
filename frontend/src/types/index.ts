// Role types matching backend
// Note: ADMIN role has been merged into HM (Higher Management)
export type UserRole = "HM" | "POC" | "JS" | "R" | "T";

// Branch type
export interface Branch {
  id: string;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  email?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// User profile type
export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Branch assignment with branch details
export interface BranchAssignment {
  branch_id: string;
  is_primary: boolean;
  branches: Branch;
}

// Authenticated user type
export interface AuthUser {
  id: string;
  email: string;
  profile: UserProfile | null;
  roles: UserRole[];
  branches: BranchAssignment[];
}

// Session type
export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

// Login response from API
export interface LoginResponse {
  user: AuthUser;
  session: AuthSession;
}

// API error response
export interface ApiError {
  error: string;
  required?: UserRole[];
  current?: UserRole[];
}

// Role metadata for display
export interface RoleInfo {
  code: UserRole;
  name: string;
  description: string;
}

// Audit log type
export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  branch_id: string | null;
  created_at: string;
  user_profiles?: UserProfile;
  branches?: Branch;
}

// Paginated response
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

// Customer types
export type CustomerType = "individual" | "company";
export type CustomerStatus = "active" | "inactive";

export interface Customer {
  id: string;
  full_name: string;
  contact_number: string | null;
  email: string | null;
  customer_type: CustomerType;
  branch_id: string;
  status: CustomerStatus;
  address: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  branches?: Branch;
}

// Vehicle types
export type VehicleType = "sedan" | "suv" | "truck" | "van" | "motorcycle" | "hatchback" | "coupe" | "wagon" | "bus" | "other";
export type VehicleStatus = "active" | "inactive";

export interface Vehicle {
  id: string;
  plate_number: string;
  vehicle_type: VehicleType;
  orcr: string;
  model: string;
  customer_id: string;
  branch_id: string;
  status: VehicleStatus;
  color: string | null;
  year: number | null;
  engine_number: string | null;
  chassis_number: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  branches?: Branch;
  customers?: {
    id: string;
    full_name: string;
    contact_number: string | null;
    email: string | null;
  };
}