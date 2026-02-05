import { useState } from "react";
import { useAuth } from "../auth";
import { DashboardLayout, NavIcons } from "../components";
import type { NavItem } from "../components";

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
  reports: {
    title: "Reports",
    description: "Generate and view system reports and analytics.",
  },
  audit: {
    title: "Audit Logs",
    description: "Track and review all system activities and changes.",
  },
  settings: {
    title: "Settings",
    description: "Configure system settings and preferences.",
  },
  jobs: {
    title: "Job Orders",
    description: "Manage job orders, track progress, and assign technicians.",
  },
  inventory: {
    title: "Inventory",
    description: "Manage parts, supplies, and stock levels.",
  },
  customers: {
    title: "Customers",
    description: "View and manage customer information and history.",
  },
  myjobs: {
    title: "My Jobs",
    description: "View your assigned jobs and update progress.",
  },
  intake: {
    title: "Customer Intake",
    description: "Register new customers and create service requests.",
  },
  quotations: {
    title: "Quotations",
    description: "Create and manage service quotations for customers.",
  },
  technicians: {
    title: "Technicians",
    description: "View technician assignments and availability.",
  },
  messages: {
    title: "Messages",
    description: "View and send messages within the system.",
  },
};

// Get navigation items based on user role
function getNavItemsForRole(roles: string[]): NavItem[] {
  const hasRole = (role: string) => roles.includes(role);
  
  // Base items for all roles
  const items: NavItem[] = [
    { id: "dashboard", label: "Dashboard", icon: <NavIcons.Dashboard /> },
  ];

  // HM (Head Manager) - full access
  if (hasRole("HM")) {
    items.push(
      { id: "users", label: "User Management", icon: <NavIcons.Users /> },
      { id: "branches", label: "Branches", icon: <NavIcons.Branch /> },
      { id: "reports", label: "Reports", icon: <NavIcons.Reports /> },
      { id: "audit", label: "Audit Logs", icon: <NavIcons.Audit /> },
      { id: "settings", label: "Settings", icon: <NavIcons.Settings /> },
    );
  }

  // POC (Supervisor)
  if (hasRole("POC")) {
    if (!hasRole("HM")) {
      items.push(
        { id: "jobs", label: "Job Orders", icon: <NavIcons.Jobs />, badge: 0 },
        { id: "inventory", label: "Inventory", icon: <NavIcons.Inventory /> },
        { id: "customers", label: "Customers", icon: <NavIcons.Customers /> },
        { id: "reports", label: "Branch Reports", icon: <NavIcons.Reports /> },
      );
    }
  }

  // JS (Junior Supervisor)
  if (hasRole("JS") && !hasRole("POC") && !hasRole("HM")) {
    items.push(
      { id: "jobs", label: "Job Orders", icon: <NavIcons.Jobs />, badge: 0 },
      { id: "technicians", label: "Technicians", icon: <NavIcons.Users /> },
    );
  }

  // R (Receptionist)
  if (hasRole("R") && !hasRole("JS") && !hasRole("POC") && !hasRole("HM")) {
    items.push(
      { id: "intake", label: "Customer Intake", icon: <NavIcons.Customers /> },
      { id: "quotations", label: "Quotations", icon: <NavIcons.Orders /> },
      { id: "messages", label: "Messages", icon: <NavIcons.Messages />, badge: 0 },
    );
  }

  // T (Technician)
  if (hasRole("T") && roles.length === 1) {
    items.push(
      { id: "myjobs", label: "My Jobs", icon: <NavIcons.Jobs />, badge: 0 },
    );
  }

  return items;
}

export function DashboardPage() {
  const { user } = useAuth();
  const [activeNav, setActiveNav] = useState("dashboard");

  if (!user) return null;

  const userRoles = user.roles || [];
  const navItems = getNavItemsForRole(userRoles);

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
      {/* Content area - shows role badges on dashboard */}
      {activeNav === "dashboard" && (
        <div className="bg-white rounded-xl p-6 border border-primary-200/50">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm text-neutral-500">Your roles:</span>
            {userRoles.map((role) => (
              <span
                key={role}
                className="px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-xs font-medium"
              >
                {role === "HM" ? "Head Manager" : 
                 role === "POC" ? "POC Supervisor" :
                 role === "JS" ? "Junior Supervisor" :
                 role === "R" ? "Receptionist" :
                 role === "T" ? "Technician" : role}
              </span>
            ))}
          </div>
          <p className="text-neutral-500">Phase 1 is complete. More features coming in Phase 2.</p>
        </div>
      )}

      {/* Empty state for other pages */}
      {activeNav !== "dashboard" && (
        <div className="bg-white rounded-xl p-6 border border-primary-200/50">
          <p className="text-neutral-500">This feature is coming in Phase 2.</p>
        </div>
      )}
    </DashboardLayout>
  );
}
