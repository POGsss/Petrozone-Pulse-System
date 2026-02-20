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
  failed_login_attempts?: number;
  locked_until?: string | null;
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
  must_change_password?: boolean;
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
  status: string | null;
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

// Catalog types
export type CatalogItemType = "service" | "product" | "package";
export type CatalogItemStatus = "active" | "inactive";

export interface CatalogItem {
  id: string;
  name: string;
  type: CatalogItemType;
  description: string | null;
  base_price: number;
  status: CatalogItemStatus;
  branch_id: string | null;
  is_global: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  branches?: Branch;
}

// Pricing Matrix types
export type PricingType = "labor" | "packaging";
export type PricingMatrixStatus = "active" | "inactive";

export interface PricingMatrix {
  id: string;
  catalog_item_id: string;
  pricing_type: PricingType;
  price: number;
  status: PricingMatrixStatus;
  branch_id: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  catalog_items?: {
    id: string;
    name: string;
    type: CatalogItemType;
    base_price: number;
  };
  branches?: Branch;
}

export interface ResolvedPricing {
  catalog_item: {
    id: string;
    name: string;
    type: CatalogItemType;
    base_price: number;
  };
  pricing_rules: PricingMatrix[];
  resolved_prices: {
    base_price: number;
    labor: number | null;
    packaging: number | null;
  };
}

// Job Order types
export type JobOrderStatus = "created" | "pending_approval" | "approved" | "rejected";

export interface JobOrderItem {
  id: string;
  job_order_id: string;
  catalog_item_id: string;
  catalog_item_name: string;
  catalog_item_type: string;
  quantity: number;
  base_price: number;
  labor_price: number | null;
  packaging_price: number | null;
  line_total: number;
  created_at: string;
}

export interface JobOrder {
  id: string;
  order_number: string;
  customer_id: string;
  vehicle_id: string;
  branch_id: string;
  status: JobOrderStatus;
  total_amount: number;
  notes: string | null;
  created_by: string | null;
  approved_at: string | null;
  approved_by: string | null;
  approval_notes: string | null;
  created_at: string;
  updated_at: string;
  customers?: {
    id: string;
    full_name: string;
    contact_number: string | null;
    email: string | null;
  };
  vehicles?: {
    id: string;
    plate_number: string;
    model: string;
    vehicle_type: string;
  };
  branches?: Branch;
  job_order_items?: JobOrderItem[];
}

// Third-Party Repair types
export interface ThirdPartyRepair {
  id: string;
  job_order_id: string;
  provider_name: string;
  description: string;
  cost: number;
  repair_date: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  job_orders?: {
    id: string;
    order_number: string;
    branch_id: string;
    customers?: {
      id: string;
      full_name: string;
    };
    vehicles?: {
      id: string;
      plate_number: string;
      model: string;
    };
  };
}