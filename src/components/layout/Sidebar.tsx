import {
  LayoutDashboard, ShoppingCart, UtensilsCrossed, Package,
  BarChart3, Users, DollarSign, UserCheck, Settings, Database,
  ChevronLeft, LogOut, FlaskConical
} from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { AppModule } from '../../types';
import toast from 'react-hot-toast';

interface NavItem {
  id: AppModule;
  label: string;
  icon: React.ElementType;
  permission?: string;
  badge?: string;
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'pos', label: 'Punch Order', icon: ShoppingCart },
  { id: 'menu', label: 'Menu', icon: UtensilsCrossed },
  { id: 'recipes', label: 'Recipes', icon: FlaskConical },
  { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'expenses', label: 'Expenses', icon: DollarSign },
  { id: 'staff', label: 'Staff', icon: UserCheck },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'backup', label: 'Backup', icon: Database },
];

export default function Sidebar() {
  const { activeModule, setActiveModule, sidebarCollapsed, toggleSidebar, user, logout } = useAppStore();

  const hasPermission = (item: NavItem) => {
    if (!user) return false;
    if (user.permissions.includes('*')) return true;
    if (!item.permission) return true;
    return user.permissions.includes(item.permission);
  };

  const handleLogout = async () => {
    await window.electronAPI.auth.logout();
    logout();
    toast.success('Logged out successfully');
  };

  return (
    <aside
      className={`flex flex-col bg-dark-800 border-r border-dark-700/50 transition-all duration-300 flex-shrink-0 ${
        sidebarCollapsed ? 'w-16' : 'w-56'
      }`}
    >
      {/* Nav Items */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {navItems.filter(hasPermission).map(item => {
          const Icon = item.icon;
          const isActive = activeModule === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveModule(item.id)}
              className={`sidebar-item w-full ${isActive ? 'active' : ''} ${sidebarCollapsed ? 'justify-center px-0' : ''}`}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <Icon size={18} className={isActive ? 'text-brand-400' : 'text-dark-300'} />
              {!sidebarCollapsed && (
                <span className="truncate">{item.label}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom actions */}
      <div className="px-2 py-3 border-t border-dark-700/50 space-y-0.5">
        <button
          onClick={handleLogout}
          className={`sidebar-item w-full text-red-400 hover:text-red-300 hover:bg-red-500/10 ${sidebarCollapsed ? 'justify-center px-0' : ''}`}
          title={sidebarCollapsed ? 'Logout' : undefined}
        >
          <LogOut size={18} />
          {!sidebarCollapsed && <span>Logout</span>}
        </button>
        <button
          onClick={toggleSidebar}
          className={`sidebar-item w-full ${sidebarCollapsed ? 'justify-center px-0' : ''}`}
          title={sidebarCollapsed ? 'Expand' : 'Collapse'}
        >
          <ChevronLeft size={18} className={`transition-transform duration-300 ${sidebarCollapsed ? 'rotate-180' : ''}`} />
          {!sidebarCollapsed && <span className="text-xs">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
