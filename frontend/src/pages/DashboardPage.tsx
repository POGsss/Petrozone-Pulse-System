import { useState } from "react";
import { useAuth } from "../auth";
import { DashboardLayout, NavIcons } from "../components";
import type { NavItem } from "../components";


// Admin components (lazy loaded for HM role)
import { UserManagement } from "./admin/UserManagement";
import { BranchManagement } from "./admin/BranchManagement";

// Page content data
const pageData: Record<string, { title: string; description: string }> = {
  dashboard: {
    title: "Dashboard",
    description: "Welcome to Petrozone Pulse System. View your overview and quick stats here.",
  },
  users: {
    title: "User Management",
    description: "Manage system users, assign roles, and configure permissions.",
  },
  branches: {
    title: "Branch Management",
    description: "View and manage all branches in the system.",
  },
  inventory: {
    title: "Inventory",
    description: "Manage parts, supplies, and stock levels across branches.",
  },
  pricing: {
    title: "Pricing Config",
    description: "Configure pricing rules, discounts, and service rates.",
  },
  orders: {
    title: "Order & Sales",
    description: "Manage orders, track sales, and process transactions.",
  },
  reports: {
    title: "Reports",
    description: "Generate and view system reports and analytics.",
  },
  audit: {
    title: "Audit Logs",
    description: "Track and review all system activities and changes.",
  },
  messages: {
    title: "Messages",
    description: "View and send messages within the system.",
  },
  settings: {
    title: "Settings",
    description: "Configure system settings and preferences.",
  },
  customers: {
    title: "Customers",
    description: "View and manage customer information and history.",
  },
};

// Get navigation items based on user role
function getNavItemsForRole(roles: string[]): NavItem[] {
  const hasRole = (role: string) => roles.includes(role);
  
  // Higher Management (HM) - full access
  if (hasRole("HM")) {
    return [
      { id: "dashboard", label: "Dashboard", icon: <NavIcons.Dashboard /> },
      { id: "users", label: "User Management", icon: <NavIcons.Users /> },
      { id: "branches", label: "Branch Management", icon: <NavIcons.Branch /> },
      { id: "inventory", label: "Inventory", icon: <NavIcons.Inventory /> },
      { id: "pricing", label: "Pricing Config", icon: <NavIcons.Pricing /> },
      { id: "orders", label: "Order & Sales", icon: <NavIcons.Sales /> },
      { id: "reports", label: "Reports", icon: <NavIcons.Reports /> },
      { id: "audit", label: "Audit Logs", icon: <NavIcons.Audit /> },
      { id: "messages", label: "Messages", icon: <NavIcons.Messages />, badge: 0 },
      { id: "settings", label: "Settings", icon: <NavIcons.Settings /> },
    ];
  }

  // POC Supervisor
  if (hasRole("POC")) {
    return [
      { id: "dashboard", label: "Dashboard", icon: <NavIcons.Dashboard /> },
      { id: "inventory", label: "Inventory", icon: <NavIcons.Inventory /> },
      { id: "pricing", label: "Pricing Config", icon: <NavIcons.Pricing /> },
      { id: "orders", label: "Orders", icon: <NavIcons.Orders /> },
      { id: "reports", label: "Reports", icon: <NavIcons.Reports /> },
      { id: "customers", label: "Customers", icon: <NavIcons.Customers /> },
      { id: "messages", label: "Messages", icon: <NavIcons.Messages />, badge: 0 },
    ];
  }

  // Junior Supervisor (JS)
  if (hasRole("JS")) {
    return [
      { id: "dashboard", label: "Dashboard", icon: <NavIcons.Dashboard /> },
      { id: "inventory", label: "Inventory", icon: <NavIcons.Inventory /> },
      { id: "pricing", label: "Pricing Config", icon: <NavIcons.Pricing /> },
      { id: "orders", label: "Orders", icon: <NavIcons.Orders /> },
      { id: "reports", label: "Reports", icon: <NavIcons.Reports /> },
      { id: "customers", label: "Customers", icon: <NavIcons.Customers /> },
      { id: "messages", label: "Messages", icon: <NavIcons.Messages />, badge: 0 },
    ];
  }

  // Receptionist (R)
  if (hasRole("R")) {
    return [
      { id: "dashboard", label: "Dashboard", icon: <NavIcons.Dashboard /> },
      { id: "orders", label: "Orders", icon: <NavIcons.Orders /> },
      { id: "reports", label: "Reports", icon: <NavIcons.Reports /> },
      { id: "customers", label: "Customers", icon: <NavIcons.Customers /> },
      { id: "messages", label: "Messages", icon: <NavIcons.Messages />, badge: 0 },
    ];
  }

  // Technician (T)
  if (hasRole("T")) {
    return [
      { id: "dashboard", label: "Dashboard", icon: <NavIcons.Dashboard /> },
      { id: "orders", label: "Orders", icon: <NavIcons.Orders /> },
      { id: "reports", label: "Reports", icon: <NavIcons.Reports /> },
      { id: "customers", label: "Customers", icon: <NavIcons.Customers /> },
      { id: "messages", label: "Messages", icon: <NavIcons.Messages />, badge: 0 },
    ];
  }

  // Default (fallback)
  return [
    { id: "dashboard", label: "Dashboard", icon: <NavIcons.Dashboard /> },
  ];
}

export function DashboardPage() {
  const { user } = useAuth();
  const [activeNav, setActiveNav] = useState("dashboard");

  if (!user) return null;

  const userRoles = user.roles || [];
  const navItems = getNavItemsForRole(userRoles);
  const isHM = userRoles.includes("HM");

  // Get page data
  const currentPage = pageData[activeNav] || { title: "Page", description: "" };

  return (
    <DashboardLayout
      navItems={navItems}
      activeNavId={activeNav}
      onNavChange={setActiveNav}
      title={currentPage.title}
      description={currentPage.description}
    >
      {/* Dashboard content */}
      {activeNav === "dashboard" && (
        <div className="bg-white rounded-xl p-6 border border-primary-200/50">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm text-neutral-950">Your roles:</span>
            {userRoles.map((role) => (
              <span
                key={role}
                className="px-3 py-1 bg-neutral-100 text-primary rounded-full text-xs font-medium"
              >
                {role === "HM" ? "Head Manager" : 
                 role === "POC" ? "POC Supervisor" :
                 role === "JS" ? "Junior Supervisor" :
                 role === "R" ? "Receptionist" :
                 role === "T" ? "Technician" : role}
              </span>
            ))}
          </div>
          <p className="text-neutral-900">Welcome to Petrozone Pulse System. Select a menu item to get started.</p>
        </div>
      )}

      {/* User Management - HM only */}
      {activeNav === "users" && isHM && (
        <div className="bg-white rounded-xl border border-primary-200/50 p-6">
          <UserManagement />
        </div>
      )}

      {/* Branch Management - HM only */}
      {activeNav === "branches" && isHM && (
        <div className="bg-white rounded-xl border border-primary-200/50 p-6">
          <BranchManagement />
        </div>
      )}

      {/* Settings page placeholder */}
      {activeNav === "settings" && (
        <div className="bg-white rounded-xl p-6 border border-primary-200/50">
          <p className="text-neutral-900">System settings and preferences will be available here.</p>
        </div>
      )}

      {/* Empty state for other pages */}
      {activeNav !== "dashboard" && activeNav !== "settings" && activeNav !== "users" && activeNav !== "branches" && (
        <div className="bg-white rounded-xl p-6 border border-primary-200/50">
          <p className="text-neutral-900">This feature is coming in the next phase.</p>
        </div>
      )}
    </DashboardLayout>
  );
}
