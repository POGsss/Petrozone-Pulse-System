import { useState, useEffect } from "react";
import { useAuth } from "../auth";
import { DashboardLayout, NavIcons, Modal } from "../components";
import type { NavItem } from "../components";


// Subpage components (shared across roles based on permissions)
import { UserManagement } from "./subpages/UserManagement";
import { BranchManagement } from "./subpages/BranchManagement";
import { ProfileSettings } from "./subpages/ProfileSettings";
import { AuditLogs } from "./subpages/AuditLogs";
import { CustomerManagement } from "./subpages/CustomerManagement";
import { VehicleManagement } from "./subpages/VehicleManagement";
import { CatalogManagement } from "./subpages/CatalogManagement";
import { PricingManagement } from "./subpages/PricingManagement";
import { JobOrderManagement } from "./subpages/JobOrderManagement";
import { InventoryManagement } from "./subpages/InventoryManagement";
import { PurchaseOrderManagement } from "./subpages/PurchaseOrderManagement";
import { SupplierManagement } from "./subpages/SupplierManagement";
import { SystemSettings } from "./subpages/SystemSettings";
import { NotificationManagement } from "./subpages/NotificationManagement";
import { ServiceReminderManagement } from "./subpages/ServiceReminderManagement";
import { AnalyticsDashboard } from "./subpages/AnalyticsDashboard";
import { StaffPerformanceAnalytics } from "./subpages/StaffPerformanceAnalytics";

// Page content data
const pageData: Record<string, { title: string; description: string }> = {
  dashboard: {
    title: "Dashboard",
    description: "View your overview and quick stats here.",
  },
  users: {
    title: "User Management",
    description: "Manage users, roles, and configure permissions.",
  },
  branches: {
    title: "Branch Management",
    description: "View and manage all branches in the system.",
  },
  customers: {
    title: "Customers",
    description: "View and manage customer information.",
  },
  vehicles: {
    title: "Vehicles",
    description: "Manage vehicle records and service history.",
  },
  catalog: {
    title: "Catalog",
    description: "Manage services, products, and packages.",
  },
  "job-orders": {
    title: "Job Orders",
    description: "Create and manage job orders for customers.",
  },
  pricing: {
    title: "Pricing Matrices",
    description: "Define and manage pricing rules for catalog items.",
  },
  inventory: {
    title: "Inventory",
    description: "Manage inventory items and stock levels.",
  },
  "purchase-orders": {
    title: "Purchase Orders",
    description: "Manage inventory procurement and purchase orders.",
  },
  suppliers: {
    title: "Supplier Management",
    description: "Manage supplier profiles and contact information.",
  },
  audit: {
    title: "Audit Logs",
    description: "Track and review all system activities.",
  },
  settings: {
    title: "Settings",
    description: "Configure system settings and preferences.",
  },
  profile: {
    title: "Profile Settings",
    description: "Manage your account and change your password.",
  },
  notifications: {
    title: "Notifications",
    description: "Manage system notifications and alerts.",
  },
  "service-reminders": {
    title: "Service Reminders",
    description: "Manage and send service reminders to customers.",
  },
  "staff-performance": {
    title: "Staff Performance",
    description: "View and analyze staff performance metrics.",
  },
};

// Get navigation items based on user role
// Based on user stories:
// - US1-4: Branch Management: HM, POC, JS, R
// - US5-9: Login/Logout/Profile: All (HM, POC, JS, R, T)
// - US10-13: User Management: HM, POC, JS
// - US18: Audit Logs: HM, POC
function getNavItemsForRole(roles: string[]): NavItem[] {
  const hasRole = (role: string) => roles.includes(role);
  const hasAnyRole = (...checkRoles: string[]) => checkRoles.some(r => roles.includes(r));
  
  const items: NavItem[] = [
    { id: "dashboard", label: "Dashboard", icon: <NavIcons.Dashboard /> },
  ];

  // Staff Performance: HM, POC, JS, R, T (view)
  if (hasAnyRole("HM", "POC", "JS", "R", "T")) {
    items.push({ id: "staff-performance", label: "Staff Performance", icon: <NavIcons.Performance /> });
  }

  // User Management: HM, POC, JS (US10-13)
  if (hasAnyRole("HM", "POC", "JS")) {
    items.push({ id: "users", label: "User Management", icon: <NavIcons.Users /> });
  }

  // Branch Management: HM, POC, JS, R (US1-4)
  if (hasAnyRole("HM", "POC", "JS", "R")) {
    items.push({ id: "branches", label: "Branch Management", icon: <NavIcons.Branch /> });
  }

  // Customers: HM, POC, JS, R, T (all roles can view, permissions differ per action)
  items.push({ id: "customers", label: "Customers", icon: <NavIcons.Customers /> });

  // Vehicles: HM, POC, JS, R
  if (hasAnyRole("HM", "POC", "JS", "R")) {
    items.push({ id: "vehicles", label: "Vehicles", icon: <NavIcons.Vehicle /> });
  }

  // Pricing Matrices: All roles can view; HM, POC, JS, R can manage
  items.push({ id: "pricing", label: "Pricing Matrices", icon: <NavIcons.Pricing /> });

  // Catalog: HM, POC, JS, R (view); HM/POC/JS can manage
  if (hasAnyRole("HM", "POC", "JS", "R")) {
    items.push({ id: "catalog", label: "Catalog", icon: <NavIcons.Catalog /> });
  }

  // Inventory: HM, POC, JS
  if (hasAnyRole("HM", "POC", "JS")) {
    items.push({ id: "inventory", label: "Inventory", icon: <NavIcons.Inventory /> });
  }

  // Job Orders: All roles can view; HM, POC, JS, R can create
  items.push({ id: "job-orders", label: "Job Orders", icon: <NavIcons.Jobs /> });

  // Purchase Orders: HM, POC, JS, R (UC49-UC52)
  if (hasAnyRole("HM", "POC", "JS", "R")) {
    items.push({ id: "purchase-orders", label: "Purchase Orders", icon: <NavIcons.Orders /> });
  }

  // Suppliers: HM, POC, JS (UC53-UC56)
  if (hasAnyRole("HM", "POC", "JS")) {
    items.push({ id: "suppliers", label: "Suppliers", icon: <NavIcons.Supplier /> });
  }

  // Service Reminders: POC, JS, R (UC65-UC69)
  if (hasAnyRole("POC", "JS", "R")) {
    items.push({ id: "service-reminders", label: "Service Reminders", icon: <NavIcons.Reminder /> });
  }

  // Audit Logs: HM, POC (US18)
  if (hasAnyRole("HM", "POC")) {
    items.push({ id: "audit", label: "Audit Logs", icon: <NavIcons.Audit /> });
  }

  // Settings: HM only (system-wide settings)
  if (hasRole("HM")) {
    items.push({ id: "settings", label: "Settings", icon: <NavIcons.Settings /> });
  }

  return items;
}

export function DashboardPage() {
  const { user, mustChangePassword } = useAuth();
  const [activeNav, setActiveNav] = useState("dashboard");
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  // Show the change password modal when the user must change their password
  // Re-show when navigating away from profile settings
  useEffect(() => {
    if (mustChangePassword && activeNav !== "profile") {
      setShowPasswordModal(true);
    }
  }, [mustChangePassword, activeNav]);

  if (!user) return null;

  const userRoles = user.roles || [];
  const navItems = getNavItemsForRole(userRoles);
  
  // Permission helpers based on user stories
  const hasAnyRole = (...roles: string[]) => roles.some(r => userRoles.includes(r as typeof userRoles[number]));
  const canManageUsers = hasAnyRole("HM", "POC", "JS");
  const canManageBranches = hasAnyRole("HM", "POC", "JS", "R");
  const canViewAuditLogs = hasAnyRole("HM", "POC");
  const canViewCustomers = hasAnyRole("HM", "POC", "JS", "R", "T");
  const canViewVehicles = hasAnyRole("HM", "POC", "JS", "R");
  const canViewCatalog = hasAnyRole("HM", "POC", "JS", "R");
  const canViewInventory = hasAnyRole("HM", "POC", "JS");
  const canViewPurchaseOrders = hasAnyRole("HM", "POC", "JS", "R");
  const canViewSuppliers = hasAnyRole("HM", "POC", "JS");
  const canViewNotifications = hasAnyRole("HM", "POC", "JS", "R", "T");
  const canViewServiceReminders = hasAnyRole("POC", "JS", "R");
  const canViewStaffPerformance = hasAnyRole("HM", "POC", "JS", "R", "T");
  const canAccessSettings = userRoles.includes("HM");

  // Get page data
  const currentPage = pageData[activeNav] || { title: "Page", description: "" };

  return (
    <DashboardLayout
      navItems={navItems}
      activeNavId={activeNav}
      onNavChange={setActiveNav}
      onNotificationsClick={() => setActiveNav("notifications")}
      title={currentPage.title}
      description={currentPage.description}
    >
      {/* Dashboard content — Real-Time Analytics */}
      {activeNav === "dashboard" && (
        <AnalyticsDashboard />
      )}

      {/* User Management - HM, POC, JS (US10-13) */}
      {activeNav === "users" && canManageUsers && (
          <UserManagement />
      )}

      {/* Branch Management - HM, POC, JS, R (US1-4) */}
      {activeNav === "branches" && canManageBranches && (
          <BranchManagement />
      )}

      {/* Customer Management - All roles */}
      {activeNav === "customers" && canViewCustomers && (
          <CustomerManagement />
      )}

      {/* Vehicle Management - HM, POC, JS, R */}
      {activeNav === "vehicles" && canViewVehicles && (
          <VehicleManagement />
      )}

      {/* Catalog Management - HM, POC, JS, R */}
      {activeNav === "catalog" && canViewCatalog && (
          <CatalogManagement />
      )}

      {/* Inventory Management - HM, POC, JS */}
      {activeNav === "inventory" && canViewInventory && (
          <InventoryManagement />
      )}

      {/* Purchase Orders - HM, POC, JS, R (UC49-UC52) */}
      {activeNav === "purchase-orders" && canViewPurchaseOrders && (
          <PurchaseOrderManagement />
      )}

      {/* Suppliers - HM, POC, JS (UC53-UC56) */}
      {activeNav === "suppliers" && canViewSuppliers && (
          <SupplierManagement />
      )}

      {/* Job Orders - All roles */}
      {activeNav === "job-orders" && (
          <JobOrderManagement />
      )}

      {/* Pricing Matrices - All roles can view */}
      {activeNav === "pricing" && (
          <PricingManagement />
      )}

      {/* Notifications - All roles (UC61-UC64) */}
      {activeNav === "notifications" && canViewNotifications && (
          <NotificationManagement />
      )}

      {/* Service Reminders - POC, JS, R (UC65-UC69) */}
      {activeNav === "service-reminders" && canViewServiceReminders && (
          <ServiceReminderManagement />
      )}

      {/* Staff Performance - All roles can view */}
      {activeNav === "staff-performance" && canViewStaffPerformance && (
          <StaffPerformanceAnalytics />
      )}

      {/* Empty state for upcoming pages (Settings) */}
      {activeNav !== "dashboard" && activeNav !== "settings" && activeNav !== "users" && activeNav !== "branches" && activeNav !== "profile" && activeNav !== "audit" && activeNav !== "customers" && activeNav !== "vehicles" && activeNav !== "catalog" && activeNav !== "inventory" && activeNav !== "purchase-orders" && activeNav !== "suppliers" && activeNav !== "job-orders" && activeNav !== "pricing" && activeNav !== "notifications" && activeNav !== "service-reminders" && activeNav !== "staff-performance" && (
        <div className="bg-white rounded-xl p-6 border border-neutral-100">
          <p className="text-neutral-900">This feature is coming in the next phase.</p>
        </div>
      )}
      
      {/* Audit Logs - HM, POC (US18) */}
      {activeNav === "audit" && canViewAuditLogs && (
          <AuditLogs />
      )}
      
      {/* Profile Settings - all users (US7, US9) */}
      {activeNav === "profile" && (
          <ProfileSettings />
      )}
      
      {/* Settings - HM only */}
      {activeNav === "settings" && canAccessSettings && (
        <SystemSettings />
      )}

      {/* Change Password Modal - shown for first-time login users */}
      {showPasswordModal && mustChangePassword && (
        <Modal
          isOpen={true}
          onClose={() => setShowPasswordModal(false)}
          title="Change Your Password"
          maxWidth="sm"
        >
          <div>
            <div className="bg-neutral-100 rounded-xl p-4 my-4">
              <p className="text-neutral-900">
                For security purposes, you are required to <strong className="text-neutral-950">change your temporary password.</strong>
              </p>
            </div>
            <p className="text-sm text-neutral-900 mb-2">
              You can dismiss this reminder, but it will appear again until your password is changed.
            </p>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                className="flex-1 px-4 py-3.5 border-2 border-negative text-negative rounded-xl font-semibold hover:bg-negative-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPasswordModal(false);
                  setActiveNav("profile");
                }}
                className="flex-1 px-4 py-3.5 bg-negative text-white rounded-xl font-semibold hover:bg-negative-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Change
              </button>
            </div>
          </div>
        </Modal>
      )}
    </DashboardLayout>
  );
}
