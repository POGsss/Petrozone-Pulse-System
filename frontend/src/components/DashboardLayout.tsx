import type { ReactNode } from "react";
import { useState } from "react";
import { useAuth } from "../auth";
import {
  LuLayoutDashboard,
  LuBell,
  LuChevronDown,
  LuLogOut,
  LuMenu,
  LuPackage,
  LuUsers,
  LuBox,
  LuMessageSquare,
  LuSettings,
  LuBuilding,
  LuFileText,
  LuChartBar,
  LuClipboardList,
  LuUserCog,
  LuDollarSign,
  LuShoppingCart,
} from "react-icons/lu";

// Navigation item type
export interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
  badge?: number;
  onClick?: () => void;
}

interface DashboardLayoutProps {
  children: ReactNode;
  navItems: NavItem[];
  activeNavId: string;
  onNavChange: (id: string) => void;
  title?: string;
  description?: string;
}

export function DashboardLayout({ 
  children, 
  navItems, 
  activeNavId, 
  onNavChange,
  title = "Dashboard",
  description
}: DashboardLayoutProps) {
  const { user, logout } = useAuth();
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  const primaryBranch = user?.branches?.find(b => b.is_primary) || user?.branches?.[0];
  const branchName = primaryBranch?.branches?.name || "All Branches";
  const userName = user?.profile?.full_name || user?.email?.split("@")[0] || "User";

  const SidebarContent = ({ collapsed = false, mobile = false }: { collapsed?: boolean; mobile?: boolean }) => (
    <div className="flex flex-col h-full">
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = activeNavId === item.id;
            return (
              <li key={item.id}>
                <button
                  onClick={() => {
                    onNavChange(item.id);
                    item.onClick?.();
                    if (mobile) setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                    isActive ? "bg-primary text-white" : "text-neutral-900 hover:text-neutral-950 hover:bg-neutral-200"
                  } ${collapsed ? "justify-center" : ""}`}
                  title={collapsed ? item.label : undefined}
                >
                  {item.icon}
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.badge !== undefined && (
                        <span className={`px-2 py-0.5 text-xs rounded-full ${
                          isActive ? "bg-white/20 text-white" : "bg-positive-100 text-positive"
                        }`}>
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-3 space-y-2 border-t border-neutral-200">
        
        <button
          onClick={logout}
          className={`w-full bg-neutral-100 flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-negative hover:bg-neutral-200 transition-colors ${collapsed ? "justify-center" : ""}`}
          title={collapsed ? "Logout" : undefined}
        >
          <LuLogOut className="w-5 h-5" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-neutral-100">
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`fixed inset-y-0 left-0 w-64 bg-white border-r border-neutral-200 z-50 transform transition-transform duration-300 lg:hidden ${
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      }`}>
        <SidebarContent mobile />
      </aside>

      <aside className={`hidden lg:flex flex-col h-screen sticky top-0 bg-white border-r border-neutral-200 transition-all duration-300 ${
        sidebarCollapsed ? "w-20" : "w-64"
      }`}>
        <SidebarContent collapsed={sidebarCollapsed} />
      </aside>

      <div className="flex-1 flex flex-col min-h-screen">
        <header className="bg-white border-b border-neutral-200 px-4 lg:px-6 py-4 sticky top-0 z-30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 text-neutral-900 hover:text-neutral-950 lg:hidden"
              >
                <LuMenu className="w-6 h-6" />
              </button>
              
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="hidden lg:block p-2 text-neutral-900 hover:text-neutral-950"
                title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                <LuMenu className="w-6 h-6" />
              </button>

              <div>
                <h1 className="hidden sm:block text-xl font-semibold text-neutral-950">{title}</h1>
                {description && (
                  <p className="hidden sm:block text-sm text-neutral-900 mt-0.5">{description}</p>
                )}
              </div>
            </div>

            <div className="w-auto sm:w-80 flex items-center justify-end gap-2 lg:gap-4">
              <div className="relative">
                <button
                  onClick={() => setBranchDropdownOpen(!branchDropdownOpen)}
                  className="flex items-center gap-2 px-3 lg:px-4 py-2 bg-neutral-100 rounded-lg text-sm font-medium text-neutral-900 hover:text-neutral-950 hover:bg-neutral-200 transition-colors"
                >
                  <span className="hidden sm:inline">{branchName}</span>
                  <span className="sm:hidden">Branch</span>
                  <LuChevronDown className="w-4 h-4" />
                </button>
                {branchDropdownOpen && user?.branches && user.branches.length > 0 && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg border border-neutral-200 py-1 z-10">
                    {user.branches.map((assignment) => (
                      <button
                        key={assignment.branch_id}
                        onClick={() => setBranchDropdownOpen(false)}
                        className="w-full text-left px-4 py-2 text-sm text-neutral-900 hover:text-neutral-950 hover:bg-neutral-200"
                      >
                        {assignment.branches.name}
                        {assignment.is_primary && (
                          <span className="ml-2 text-xs text-primary">(Primary)</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button className="relative p-2 text-neutral-900 hover:text-neutral transition-colors">
                <LuBell className="w-5 h-5" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full"></span>
              </button>

              <div className="relative">
                <button
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                  className="w-10 h-10 bg-gradient-to-br from-primary-900 to-primary rounded-full flex items-center justify-center text-white font-medium hover:ring-2 hover:ring-primary-200 transition-all"
                >
                  {user?.profile?.full_name?.charAt(0) || user?.email?.charAt(0) || "U"}
                </button>
                {profileDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg border border-neutral-200 py-3 z-10">
                    <div className="px-4 gap-2 flex items-start flex-col">
                      <div>
                        <p className="font-medium text-neutral-950">{userName}</p>
                        <p className="text-sm text-neutral-900">{user?.email}</p>
                      </div>
                      <button
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          onNavChange("profile");
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-negative bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
                      >
                        <LuUserCog className="w-4 h-4" />
                        Profile Settings
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

export const NavIcons = {
  Dashboard: () => <LuLayoutDashboard className="w-5 h-5" />,
  Orders: () => <LuShoppingCart className="w-5 h-5" />,
  Customers: () => <LuUsers className="w-5 h-5" />,
  Inventory: () => <LuBox className="w-5 h-5" />,
  Messages: () => <LuMessageSquare className="w-5 h-5" />,
  Settings: () => <LuSettings className="w-5 h-5" />,
  Users: () => <LuUsers className="w-5 h-5" />,
  Branch: () => <LuBuilding className="w-5 h-5" />,
  Audit: () => <LuFileText className="w-5 h-5" />,
  Reports: () => <LuChartBar className="w-5 h-5" />,
  Jobs: () => <LuClipboardList className="w-5 h-5" />,
  Pricing: () => <LuDollarSign className="w-5 h-5" />,
  Sales: () => <LuPackage className="w-5 h-5" />,
};
