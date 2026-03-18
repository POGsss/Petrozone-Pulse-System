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

// Package types
export type PackageItemStatus = "active" | "inactive";

export interface PackageItem {
  id: string;
  name: string;
  description: string | null;
  status: PackageItemStatus;
  inventory_types: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// Package Inventory Link types
export interface PackageInventoryLink {
  id: string;
  package_item_id: string;
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

export interface PackageInventoryItem {
  id: string;
  package_id: string;
  inventory_item_id: string;
  quantity: number;
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

export interface PackageLaborItem {
  id: string;
  package_id: string;
  labor_id: string;
  quantity: number;
  created_at: string;
  labor_items?: {
    id: string;
    name: string;
    light_price: number;
    heavy_price: number;
    extra_heavy_price: number;
    status: string;
  };
}

// Vehicle class type for job orders
export type VehicleClass = "light" | "heavy" | "extra_heavy";

// Labor types
export type LaborItemStatus = "active" | "inactive";

export interface LaborItem {
  id: string;
  name: string;
  light_price: number;
  heavy_price: number;
  extra_heavy_price: number;
  status: LaborItemStatus;
  created_at: string;
}

// Job Order types
export type JobOrderStatus = "draft" | "pending_approval" | "approved" | "in_progress" | "ready_for_release" | "pending_payment" | "completed" | "rejected" | "cancelled" | "deactivated";

export interface JobOrderItem {
  id: string;
  job_order_id: string;
  labor_item_id?: string | null;
  package_item_id: string;
  package_item_name: string;
  package_item_type: string;
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
  category?: string;
  available_items?: Array<{ id: string; item_name: string; cost_price: number }>;
}

export type JobOrderLineType = "labor" | "package" | "inventory";

export interface JobOrderLineComponent {
  labor_item_id?: string;
  inventory_item_id?: string;
  name: string;
  quantity: number;
  unit_price: number;
}

export interface JobOrderLine {
  id: string;
  job_order_id: string;
  line_type: JobOrderLineType;
  reference_id: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
  metadata: {
    vehicle_class?: VehicleClass;
    base_components?: {
      labor?: JobOrderLineComponent[];
      inventory?: JobOrderLineComponent[];
    };
    vehicle_specific_components?: {
      labor?: JobOrderLineComponent[];
      inventory?: JobOrderLineComponent[];
    };
    [key: string]: unknown;
  };
  created_at: string;
  updated_at: string;
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
  assigned_technician?: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
  odometer_reading: number | null;
  vehicle_bay: string | null;
  cancellation_reason: string | null;
  rejection_reason: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  is_deleted: boolean;
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
  job_order_lines?: JobOrderLine[];
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
export type InventoryItemStatus = "draft" | "active" | "inactive";

export interface InventoryItem {
  id: string;
  item_name: string;
  sku_code: string;
  category: string;
  unit_of_measure: string;
  cost_price: number;
  reorder_threshold: number;
  status: InventoryItemStatus;
  approval_status: string | null;
  approval_requested_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  initial_stock_pending: number;
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
export type PurchaseOrderStatus = "draft" | "submitted" | "approved" | "received" | "cancelled" | "deactivated";

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
  receipt_attachment: string | null;
  receipt_uploaded_by: string | null;
  receipt_uploaded_at: string | null;
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
export type NotificationStatus = "draft" | "scheduled" | "active" | "inactive";

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
  scheduled_at: string | null;
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

// ─── Dashboard / Analytics types ───
export interface DashboardSummary {
  total_sales: number;
  completed_job_orders: number;
  active_job_orders: number;
  total_job_orders: number;
  customers: number;
  low_stock_count: number;
  total_inventory_items: number;
  active_inventory_items: number;
  out_of_stock_count: number;
}

export interface SalesOverTimePoint {
  date: string;
  amount: number;
}

export interface TopService {
  name: string;
  revenue: number;
  count: number;
}

export interface JobStatusDistribution {
  status: string;
  count: number;
}

export interface BranchRevenue {
  branch_id: string;
  name: string;
  revenue: number;
}

export interface RecentOrder {
  id: string;
  order_number: string;
  status: string;
  total_amount: number;
  created_at: string;
  customers?: { id: string; full_name: string } | null;
  vehicles?: { id: string; plate_number: string; model: string } | null;
  job_order_items?: { package_item_name: string; quantity: number; line_total: number }[];
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

// ─── Staff Performance types ───
export type StaffMetricType = "jobs_completed" | "avg_completion_time" | "revenue_generated" | "on_time_completion_rate";

export interface StaffPerformance {
  id: string;
  staff_id: string;
  metric_type: StaffMetricType;
  metric_value: number;
  period_start: string;
  period_end: string;
  branch_id: string;
  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
  user_profiles?: {
    id: string;
    full_name: string;
    email: string;
  };
  branches?: {
    id: string;
    name: string;
    code: string;
  };
}

// ─── Reports types ───
export type ReportType = "sales" | "inventory" | "job_order" | "staff_performance";

export interface Report {
  id: string;
  report_name: string;
  report_type: ReportType;
  filters: Record<string, string>;
  generated_by: string;
  generated_at: string;
  branch_id: string | null;
  is_template: boolean;
  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
  user_profiles?: {
    id: string;
    full_name: string;
    email: string;
  };
  branches?: {
    id: string;
    name: string;
    code: string;
  };
}

export interface ReportData {
  rows: Record<string, unknown>[];
  summary: Record<string, unknown>;
}