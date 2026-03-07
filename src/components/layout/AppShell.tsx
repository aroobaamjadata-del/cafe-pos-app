import { useAppStore } from '../../store/appStore';
import Sidebar from './Sidebar';
import TitleBar from './TitleBar';
import Dashboard from '../../modules/dashboard/Dashboard';
import POSScreen from '../../modules/pos/POSScreen';
import MenuManagement from '../../modules/menu/MenuManagement';
import RecipesModule from '../../modules/recipes/RecipesModule';
import InventoryModule from '../../modules/inventory/InventoryModule';
import ReportsModule from '../../modules/reports/ReportsModule';
import StaffModule from '../../modules/staff/StaffModule';
import ExpensesModule from '../../modules/expenses/ExpensesModule';
import CustomersModule from '../../modules/customers/CustomersModule';
import SettingsModule from '../../modules/settings/SettingsModule';
import BackupModule from '../../modules/backup/BackupModule';

const moduleComponents: Record<string, React.ComponentType> = {
  dashboard: Dashboard,
  pos: POSScreen,
  menu: MenuManagement,
  recipes: RecipesModule,
  inventory: InventoryModule,
  reports: ReportsModule,
  staff: StaffModule,
  expenses: ExpensesModule,
  customers: CustomersModule,
  settings: SettingsModule,
  backup: BackupModule,
};

export default function AppShell() {
  const { activeModule, sidebarCollapsed, user } = useAppStore();
  const ActiveComponent = moduleComponents[activeModule] || Dashboard;

  const hasPermission = (module: string) => {
    if (!user) return false;
    if (user.permissions.includes('*')) return true;
    return user.permissions.includes(module);
  };

  const isPermitted = hasPermission(activeModule);

  return (
    <div className="h-screen flex flex-col bg-dark-900 overflow-hidden">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main
          className={`flex-1 overflow-auto transition-all duration-300 ${
            activeModule === 'pos' || activeModule === 'recipes' ? '' : 'p-6'
          }`}
        >
          <div className="animate-fade-in h-full">
            {isPermitted ? (
              <ActiveComponent />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
                  <span className="text-red-400 text-2xl">🔒</span>
                </div>
                <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
                <p className="text-dark-400">You do not have permission to view the {activeModule} module.</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
