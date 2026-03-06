import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
  },

  // Auth
  auth: {
    login: (username: string, password: string) => ipcRenderer.invoke('auth:login', username, password),
    logout: () => ipcRenderer.invoke('auth:logout'),
  },

  // Users
  users: {
    getAll: () => ipcRenderer.invoke('users:getAll'),
    create: (data: any) => ipcRenderer.invoke('users:create', data),
    update: (id: number, data: any) => ipcRenderer.invoke('users:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('users:delete', id),
    changePassword: (id: number, newPassword: string) => ipcRenderer.invoke('users:changePassword', id, newPassword),
  },

  // Categories
  categories: {
    getAll: () => ipcRenderer.invoke('categories:getAll'),
    create: (data: any) => ipcRenderer.invoke('categories:create', data),
    update: (id: number, data: any) => ipcRenderer.invoke('categories:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('categories:delete', id),
  },

  // Products
  products: {
    getAll: () => ipcRenderer.invoke('products:getAll'),
    getByCategory: (categoryId: number) => ipcRenderer.invoke('products:getByCategory', categoryId),
    create: (data: any) => ipcRenderer.invoke('products:create', data),
    update: (id: number, data: any) => ipcRenderer.invoke('products:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('products:delete', id),
    search: (query: string) => ipcRenderer.invoke('products:search', query),
  },

  // Orders
  orders: {
    create: (data: any) => ipcRenderer.invoke('orders:create', data),
    getAll: () => ipcRenderer.invoke('orders:getAll'),
    getById: (id: number) => ipcRenderer.invoke('orders:getById', id),
    getByDateRange: (start: string, end: string) => ipcRenderer.invoke('orders:getByDateRange', start, end),
    void: (id: number, reason: string) => ipcRenderer.invoke('orders:void', id, reason),
  },

  // Inventory (finished product stock)
  inventory: {
    getAll: () => ipcRenderer.invoke('inventory:getAll'),
    getLowStock: () => ipcRenderer.invoke('inventory:getLowStock'),
    adjustStock: (productId: number, qty: number, type: string, notes: string) =>
      ipcRenderer.invoke('inventory:adjustStock', productId, qty, type, notes),
    getMovements: (productId?: number) => ipcRenderer.invoke('inventory:getMovements', productId),
  },

  // Ingredients (raw materials)
  ingredients: {
    getAll: () => ipcRenderer.invoke('ingredients:getAll'),
    getLowStock: () => ipcRenderer.invoke('ingredients:getLowStock'),
    create: (data: any) => ipcRenderer.invoke('ingredients:create', data),
    update: (id: number, data: any) => ipcRenderer.invoke('ingredients:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('ingredients:delete', id),
    adjustStock: (id: number, qty: number, type: string, notes: string, userId?: number) =>
      ipcRenderer.invoke('ingredients:adjustStock', id, qty, type, notes, userId),
    getMovements: (ingredientId?: number) => ipcRenderer.invoke('ingredients:getMovements', ingredientId),
  },

  // Recipes
  recipes: {
    getAll: () => ipcRenderer.invoke('recipes:getAll'),
    getForProduct: (productId: number) => ipcRenderer.invoke('recipes:getForProduct', productId),
    setRecipe: (productId: number, items: any[]) => ipcRenderer.invoke('recipes:setRecipe', productId, items),
    upsert: (productId: number, ingredientId: number, quantity: number, unit?: string) =>
      ipcRenderer.invoke('recipes:upsert', productId, ingredientId, quantity, unit),
    removeIngredient: (productId: number, ingredientId: number) =>
      ipcRenderer.invoke('recipes:removeIngredient', productId, ingredientId),
    checkAvailability: (productId: number, qty: number) =>
      ipcRenderer.invoke('recipes:checkAvailability', productId, qty),
  },

  // Modifiers
  modifiers: {
    getAll: () => ipcRenderer.invoke('modifiers:getAll'),
    getForProduct: (productId: number) => ipcRenderer.invoke('modifiers:getForProduct', productId),
    createModifier: (data: any) => ipcRenderer.invoke('modifiers:createModifier', data),
    updateModifier: (id: number, data: any) => ipcRenderer.invoke('modifiers:updateModifier', id, data),
    deleteModifier: (id: number) => ipcRenderer.invoke('modifiers:deleteModifier', id),
    addOption: (modifierId: number, data: any) => ipcRenderer.invoke('modifiers:addOption', modifierId, data),
    updateOption: (id: number, data: any) => ipcRenderer.invoke('modifiers:updateOption', id, data),
    deleteOption: (id: number) => ipcRenderer.invoke('modifiers:deleteOption', id),
    linkToProduct: (productId: number, modifierId: number) => ipcRenderer.invoke('modifiers:linkToProduct', productId, modifierId),
    unlinkFromProduct: (productId: number, modifierId: number) => ipcRenderer.invoke('modifiers:unlinkFromProduct', productId, modifierId),
  },

  // Suppliers
  suppliers: {
    getAll: () => ipcRenderer.invoke('suppliers:getAll'),
    create: (data: any) => ipcRenderer.invoke('suppliers:create', data),
    update: (id: number, data: any) => ipcRenderer.invoke('suppliers:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('suppliers:delete', id),
  },

  // Customers
  customers: {
    getAll: () => ipcRenderer.invoke('customers:getAll'),
    create: (data: any) => ipcRenderer.invoke('customers:create', data),
    update: (id: number, data: any) => ipcRenderer.invoke('customers:update', id, data),
  },

  // Expenses
  expenses: {
    getAll: () => ipcRenderer.invoke('expenses:getAll'),
    create: (data: any) => ipcRenderer.invoke('expenses:create', data),
    update: (id: number, data: any) => ipcRenderer.invoke('expenses:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('expenses:delete', id),
  },

  // Reports
  reports: {
    getDailySales: (date: string) => ipcRenderer.invoke('reports:getDailySales', date),
    getWeeklySales: (startDate: string) => ipcRenderer.invoke('reports:getWeeklySales', startDate),
    getMonthlySales: (year: number, month: number) => ipcRenderer.invoke('reports:getMonthlySales', year, month),
    getProductPerformance: (start: string, end: string) => ipcRenderer.invoke('reports:getProductPerformance', start, end),
    getCategoryPerformance: (start: string, end: string) => ipcRenderer.invoke('reports:getCategoryPerformance', start, end),
    getDashboard: () => ipcRenderer.invoke('reports:getDashboard'),
    getSalesTrend: (days: number) => ipcRenderer.invoke('reports:getSalesTrend', days),
    getIngredientConsumption: (start: string, end: string) => ipcRenderer.invoke('reports:getIngredientConsumption', start, end),
    getProfitSummary: (start: string, end: string) => ipcRenderer.invoke('reports:getProfitSummary', start, end),
  },
  license: {
    validate: (key: string) => ipcRenderer.invoke('license:validate', key),
    getStatus: () => ipcRenderer.invoke('license:getStatus'),
  },
  // Settings
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (data: any) => ipcRenderer.invoke('settings:update', data),
  },

  // Backup
  backup: {
    create: () => ipcRenderer.invoke('backup:create'),
    restore: () => ipcRenderer.invoke('backup:restore'),
    list: () => ipcRenderer.invoke('backup:list'),
  },

  // Export
  export: {
    csv: (data: string, filename: string) => ipcRenderer.invoke('export:csv', data, filename),
  },

  shell: {
    openPath: (filePath: string) => ipcRenderer.invoke('shell:openPath', filePath),
  },

  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    quitAndInstall: () => ipcRenderer.invoke('updater:quitAndInstall'),
    onStatus: (callback: (data: any) => void) => {
      ipcRenderer.on('updater:status', (_event, value) => callback(value));
    },
    removeStatusListener: () => {
      ipcRenderer.removeAllListeners('updater:status');
    }
  }
});
