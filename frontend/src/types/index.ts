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
  vehicle_class: VehicleClass;
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
export type CatalogItemStatus = "active" | "inactive";

export interface CatalogItem {
  id: string;
  name: string;
  description: string | null;
  status: CatalogItemStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// Catalog Inventory Link types
export interface CatalogInventoryLink {
  id: string;
  catalog_item_id: string;
  inventory_item_id: string;
  created_at: string;
  inventory_items?: {
    id: string;
    item_name: string;
    sku_code: string;
    cost_price: number;
    unit_of_measure: string;
    branch_id: string;
  };
}

// Vehicle class type for job orders
export type VehicleClass = "light" | "heavy" | "extra_heavy";

// Pricing Matrix types
export type PricingMatrixStatus = "active" | "inactive";

export interface PricingMatrix {
  id: string;
  catalog_item_id: string;
  light_price: number;
  heavy_price: number;
  extra_heavy_price: number;
  status: PricingMatrixStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  catalog_items?: {
    id: string;
    name: string;
  };
}

export interface ResolvedPricing {
  catalog_item: {
    id: string;
    name: string;
  };
  pricing: {
    id: string;
    light_price: number;
    heavy_price: number;
    extra_heavy_price: number;
  } | null;
}

// Job Order types
export type JobOrderStatus = "draft" | "pending_approval" | "approved" | "in_progress" | "ready_for_release" | "completed" | "rejected" | "cancelled";

export interface JobOrderItem {
  id: string;
  job_order_id: string;
  catalog_item_id: string;
  catalog_item_name: string;
  catalog_item_type: string;
  quantity: number;
  labor_price: number | null;
  inventory_cost: number;
  line_total: number;
  created_at: string;
  job_order_item_inventories?: JobOrderItemInventory[];
}

export interface JobOrderItemInventory {
  id: string;
  job_order_item_id: string;
  inventory_item_id: string;
  inventory_item_name: string;
  quantity: number;
  unit_cost: number;
  line_total: number;
  created_at: string;
}

export interface JobOrderHistory {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
  user_profiles?: { full_name: string; email: string } | null;
}

export interface JobOrder {
  id: string;
  order_number: string;
  customer_id: string;
  vehicle_id: string;
  branch_id: string;
  vehicle_class: VehicleClass;
  status: JobOrderStatus;
  total_amount: number;
  notes: string | null;
  created_by: string | null;
  approved_at: string | null;
  approved_by: string | null;
  start_time: string | null;
  completion_time: string | null;
  approval_requested_at: string | null;
  assigned_technician_id: string | null;
  cancellation_reason: string | null;
  rejection_reason: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  approval_status: string | null;
  approval_method: string | null;
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
    vehicle_class?: string;
  };
  branches?: Branch;
  job_order_items?: JobOrderItem[];
  third_party_repairs?: { cost: number }[];
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

// Inventory types
export type InventoryItemStatus = "active" | "inactive";

export interface InventoryItem {
  id: string;
  item_name: string;
  sku_code: string;
  category: string;
  unit_of_measure: string;
  cost_price: number;
  reorder_threshold: number;
  status: InventoryItemStatus;
  branch_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  branches?: Branch;
  current_quantity: number;
  is_low_stock: boolean;
}

export type StockMovementType = "stock_in" | "stock_out" | "adjustment";
export type StockReferenceType = "purchase_order" | "job_order" | "adjustment";

export interface StockMovement {
  id: string;
  inventory_item_id: string;
  movement_type: StockMovementType;
  quantity: number;
  reference_type: StockReferenceType;
  reference_id: string | null;
  reason: string | null;
  branch_id: string;
  created_by: string | null;
  created_at: string;
}

// Purchase Order types
export type PurchaseOrderStatus = "draft" | "submitted" | "approved" | "received" | "cancelled";

// Supplier types
export type SupplierStatus = "active" | "inactive";

export interface Supplier {
  id: string;
  supplier_name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  status: SupplierStatus;
  branch_id: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  branches?: Branch;
}

// Supplier Product types
export type SupplierProductStatus = "active" | "inactive";

export interface SupplierProduct {
  id: string;
  supplier_id: string;
  inventory_item_id: string | null;
  product_name: string;
  unit_cost: number;
  lead_time_days: number | null;
  status: SupplierProductStatus;
  branch_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  suppliers?: {
    id: string;
    supplier_name: string;
  };
  inventory_items?: {
    id: string;
    item_name: string;
    sku_code: string;
    unit_of_measure: string;
  } | null;
  branches?: Branch;
}

export interface PurchaseOrderItem {
  id: string;
  purchase_order_id: string;
  inventory_item_id: string;
  quantity_ordered: number;
  unit_cost: number;
  quantity_received: number;
  created_at: string;
  updated_at: string;
  inventory_items?: {
    id: string;
    item_name: string;
    sku_code: string;
    unit_of_measure: string;
    cost_price?: number;
  };
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: string | null;
  supplier_name: string | null;
  status: PurchaseOrderStatus;
  order_date: string;
  expected_delivery_date: string | null;
  branch_id: string;
  notes: string | null;
  total_amount: number;
  created_by: string | null;
  received_at: string | null;
  received_by: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  suppliers?: {
    id: string;
    supplier_name: string;
  } | null;
  branches?: Branch;
  purchase_order_items?: PurchaseOrderItem[];
}

// ─── Notification types ───
export type NotificationTargetType = "role" | "user" | "branch";
export type NotificationType = "manual" | "system";
export type NotificationStatus = "active" | "inactive";

export interface Notification {
  id: string;
  title: string;
  message: string;
  target_type: NotificationTargetType;
  target_value: string;
  status: NotificationStatus;
  notification_type: NotificationType;
  reference_type: string | null;
  reference_id: string | null;
  branch_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  branches?: Branch;
}

export interface NotificationReceipt {
  id: string;
  notification_id: string;
  user_id: string;
  is_read: boolean;
  read_at: string | null;
  delivered_at: string;
  notifications?: Notification;
}

// ─── Service Reminder types ───
export type ReminderStatus = "draft" | "scheduled" | "sent" | "failed" | "cancelled";
export type DeliveryMethod = "email" | "sms";

export interface ServiceReminder {
  id: string;
  customer_id: string;
  vehicle_id: string;
  service_type: string;
  scheduled_at: string;
  delivery_method: DeliveryMethod;
  message_template: string;
  status: ReminderStatus;
  sent_at: string | null;
  failure_reason: string | null;
  branch_id: string;
  created_by: string;
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
}