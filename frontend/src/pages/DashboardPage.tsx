import { useState } from "react";
import { useAuth } from "../auth";
import { DashboardLayout, NavIcons } from "../components";
import type { NavItem } from "../components";


// Subpage components (shared across roles based on permissions)
import { UserManagement } from "./subpages/UserManagement";
import { BranchManagement } from "./subpages/BranchManagement";
import { ProfileSettings } from "./subpages/ProfileSettings";
import { AuditLogs } from "./subpages/AuditLogs";

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
  profile: {
    title: "Profile Settings",
    description: "Manage your account information and change your password.",
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

  // User Management: HM, POC, JS (US10-13)
  if (hasAnyRole("HM", "POC", "JS")) {
    items.push({ id: "users", label: "User Management", icon: <NavIcons.Users /> });
  }

  // Branch Management: HM, POC, JS, R (US1-4)
  if (hasAnyRole("HM", "POC", "JS", "R")) {
    items.push({ id: "branches", label: "Branch Management", icon: <NavIcons.Branch /> });
  }

  // Inventory: HM, POC, JS (future)
  if (hasAnyRole("HM", "POC", "JS")) {
    items.push({ id: "inventory", label: "Inventory", icon: <NavIcons.Inventory /> });
  }

  // Pricing Config: HM, POC, JS (future)
  if (hasAnyRole("HM", "POC", "JS")) {
    items.push({ id: "pricing", label: "Pricing Config", icon: <NavIcons.Pricing /> });
  }

  // Orders: All roles
  items.push({ id: "orders", label: "Order & Sales", icon: <NavIcons.Sales /> });

  // Reports: All roles
  items.push({ id: "reports", label: "Reports", icon: <NavIcons.Reports /> });

  // Audit Logs: HM, POC (US18)
  if (hasAnyRole("HM", "POC")) {
    items.push({ id: "audit", label: "Audit Logs", icon: <NavIcons.Audit /> });
  }

  // Customers: All roles
  items.push({ id: "customers", label: "Customers", icon: <NavIcons.Customers /> });

  // Messages: All roles
  items.push({ id: "messages", label: "Messages", icon: <NavIcons.Messages />, badge: 0 });

  // Settings: HM only (system-wide settings)
  if (hasRole("HM")) {
    items.push({ id: "settings", label: "Settings", icon: <NavIcons.Settings /> });
  }

  return items;
}

export function DashboardPage() {
  const { user } = useAuth();
  const [activeNav, setActiveNav] = useState("dashboard");

  if (!user) return null;

  const userRoles = user.roles || [];
  const navItems = getNavItemsForRole(userRoles);
  
  // Permission helpers based on user stories
  const hasAnyRole = (...roles: string[]) => roles.some(r => userRoles.includes(r));
  const canManageUsers = hasAnyRole("HM", "POC", "JS");
  const canManageBranches = hasAnyRole("HM", "POC", "JS", "R");
  const canViewAuditLogs = hasAnyRole("HM", "POC");
  const canAccessSettings = hasAnyRole("HM");

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
        <div className="bg-white rounded-xl p-6 border border-neutral-100">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm text-neutral-950">Your roles:</span>
            {userRoles.map((role) => (
              <span
                key={role}
                className="px-3 py-1 bg-neutral-100 text-primary rounded-full text-xs font-medium"
              >
                {role === "HM" ? "Higher Management" : 
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

      {/* User Management - HM, POC, JS (US10-13) */}
      {activeNav === "users" && canManageUsers && (
          <UserManagement />
      )}

      {/* Branch Management - HM, POC, JS, R (US1-4) */}
      {activeNav === "branches" && canManageBranches && (
          <BranchManagement />
      )}

      {/* Profile Settings - all users (US7, US9) */}
      {activeNav === "profile" && (
          <ProfileSettings />
      )}

      {/* Audit Logs - HM, POC (US18) */}
      {activeNav === "audit" && canViewAuditLogs && (
          <AuditLogs />
      )}

      {/* Settings page placeholder - HM only */}
      {activeNav === "settings" && canAccessSettings && (
        <div className="bg-white rounded-xl p-6 border border-neutral-100">
          <p className="text-neutral-900">System settings and preferences will be available here.</p>
        </div>
      )}

      {/* Empty state for other pages (future modules) */}
      {activeNav !== "dashboard" && activeNav !== "settings" && activeNav !== "users" && activeNav !== "branches" && activeNav !== "profile" && activeNav !== "audit" && (
        <div className="bg-white rounded-xl p-6 border border-neutral-100">
          <p className="text-neutral-900">This feature is coming in the next phase.</p>
        </div>
      )}
    </DashboardLayout>
  );
}
