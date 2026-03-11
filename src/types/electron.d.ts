// Type definition for the Electron API exposed via preload
export interface ElectronAPI {
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
  };
  auth: {
    login: (username: string, password: string) => Promise<any>;
    setupPassword: (email: string, password: string) => Promise<any>;
    checkUser: (email: string) => Promise<{ success: boolean; data?: any; error?: string }>;
    validateReset: (licenseKey: string, tenantCode: string) => Promise<{ success: boolean; error?: string }>;
    performReset: (tenantCode: string, newPass: string) => Promise<{ success: boolean; error?: string }>;
    logout: () => Promise<any>;
  };
  users: {
    getAll: () => Promise<any[]>;
    create: (data: any) => Promise<any>;
    update: (id: number, data: any) => Promise<any>;
    delete: (id: number) => Promise<any>;
    changePassword: (id: number, newPassword: string) => Promise<any>;
  };
  categories: {
    getAll: () => Promise<any[]>;
    create: (data: any) => Promise<any>;
    update: (id: number, data: any) => Promise<any>;
    delete: (id: number) => Promise<any>;
  };
  products: {
    getAll: () => Promise<any[]>;
    getByCategory: (categoryId: number) => Promise<any[]>;
    create: (data: any) => Promise<any>;
    update: (id: number, data: any) => Promise<any>;
    delete: (id: number) => Promise<any>;
    search: (query: string) => Promise<any[]>;
  };
  orders: {
    create: (data: any) => Promise<any>;
    getAll: () => Promise<any[]>;
    getById: (id: number) => Promise<any>;
    getByDateRange: (start: string, end: string) => Promise<any[]>;
    void: (id: number, reason: string) => Promise<any>;
  };
  inventory: {
    getAll: () => Promise<any[]>;
    getLowStock: () => Promise<any[]>;
    adjustStock: (productId: number, qty: number, type: string, notes: string) => Promise<any>;
    getMovements: (productId?: number) => Promise<any[]>;
  };
  ingredients: {
    getAll: () => Promise<any[]>;
    getLowStock: () => Promise<any[]>;
    create: (data: any) => Promise<any>;
    update: (id: number, data: any) => Promise<any>;
    delete: (id: number) => Promise<any>;
    adjustStock: (id: number, qty: number, type: string, notes: string, userId?: number) => Promise<any>;
    getMovements: (ingredientId?: number) => Promise<any[]>;
  };
  recipes: {
    getAll: () => Promise<any[]>;
    getForProduct: (productId: number) => Promise<any[]>;
    setRecipe: (productId: number, items: any[]) => Promise<any>;
    upsert: (productId: number, ingredientId: number, quantity: number, unit?: string) => Promise<any>;
    removeIngredient: (productId: number, ingredientId: number) => Promise<any>;
    checkAvailability: (productId: number, qty: number) => Promise<any>;
  };
  modifiers: {
    getAll: () => Promise<any[]>;
    getForProduct: (productId: number) => Promise<any[]>;
    createModifier: (data: any) => Promise<any>;
    updateModifier: (id: number, data: any) => Promise<any>;
    deleteModifier: (id: number) => Promise<any>;
    addOption: (modifierId: number, data: any) => Promise<any>;
    updateOption: (id: number, data: any) => Promise<any>;
    deleteOption: (id: number) => Promise<any>;
    linkToProduct: (productId: number, modifierId: number) => Promise<any>;
    unlinkFromProduct: (productId: number, modifierId: number) => Promise<any>;
  };
  suppliers: {
    getAll: () => Promise<any[]>;
    create: (data: any) => Promise<any>;
    update: (id: number, data: any) => Promise<any>;
    delete: (id: number) => Promise<any>;
  };
  customers: {
    getAll: () => Promise<any[]>;
    create: (data: any) => Promise<any>;
    update: (id: number, data: any) => Promise<any>;
    delete: (id: number) => Promise<any>;
  };
  loyalty: {
    getCardByCode: (code: string) => Promise<any>;
    createCard: (customerId: number, code: string) => Promise<any>;
    getCardByCustomerId: (customerId: number) => Promise<any>;
    addStamps: (customerId: number, stamps: number, orderId?: number) => Promise<any>;
    redeemReward: (customerId: number, orderId?: number) => Promise<any>;
    getTransactions: (customerId: number) => Promise<any[]>;
  };
  expenses: {
    getAll: () => Promise<any[]>;
    create: (data: any) => Promise<any>;
    update: (id: number, data: any) => Promise<any>;
    delete: (id: number) => Promise<any>;
  };
  reports: {
    getDailySales: (date: string) => Promise<any>;
    getWeeklySales: (startDate: string) => Promise<any[]>;
    getMonthlySales: (year: number, month: number) => Promise<any[]>;
    getProductPerformance: (start: string, end: string) => Promise<any[]>;
    getCategoryPerformance: (start: string, end: string) => Promise<any[]>;
    getDashboard: () => Promise<any>;
    getSalesTrend: (days: number) => Promise<any[]>;
    getIngredientConsumption: (start: string, end: string) => Promise<any[]>;
    getProfitSummary: (start: string, end: string) => Promise<any>;
  };
  license: {
    validate: (key: string) => Promise<{ success: boolean; tenant_id?: string; cafe_name?: string; error?: string }>;
    getStatus: () => Promise<{ active: boolean; tenantId?: string; cafeName?: string; reason?: string }>;
  };
  system: {
    activate: (tenantCode: string) => Promise<any>;
    boot: () => Promise<any>;
  };
  settings: {
    get: () => Promise<any>;
    update: (data: any) => Promise<any>;
  };
  backup: {
    create: () => Promise<any>;
    restore: () => Promise<any>;
    list: () => Promise<any[]>;
  };
  export: {
    csv: (data: string, filename: string) => Promise<any>;
  };
  shell: {
    openPath: (filePath: string) => Promise<any>;
  };
  updater: {
    check: () => Promise<void>;
    quitAndInstall: () => Promise<void>;
    onStatus: (callback: (data: { status: string; message: string }) => void) => void;
    removeStatusListener: () => void;
  };
  sync: {
    forceNow: () => Promise<{ pushed: number; pulled: boolean; errors: number }>;
    getStatus: () => Promise<{ pending: number; failed: number; synced: number }>;
    onRemoteUpdate: (callback: (table: string, eventType: string, data: any) => void) => void;
    removeRemoteUpdateListener: () => void;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
