import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { DatabaseService } from './database';
import { BackupService } from './backup';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';

// Setup logging for auto-updater
log.transports.file.level = 'info';
autoUpdater.logger = log;

let mainWindow: BrowserWindow | null = null;
const isDev = process.env.NODE_ENV === 'development';

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0f0e0a',
    icon: path.join(__dirname, '../../resources/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Initialize database
const db = new DatabaseService();
const backupService = new BackupService(db);

app.whenReady().then(() => {
  db.initialize();
  createWindow();
  backupService.scheduleAutoBackup();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Setup auto-updater listeners
  autoUpdater.on('checking-for-update', () => {
    log.info('checking-for-update');
    mainWindow?.webContents.send('updater:status', { status: 'checking', message: 'Checking for updates...' });
  });
  
  autoUpdater.on('update-available', (info) => {
    log.info('update-available', info);
    mainWindow?.webContents.send('updater:status', { status: 'available', message: 'New version of Cafe POS is available. Downloading update.' });
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('update-not-available', info);
    mainWindow?.webContents.send('updater:status', { status: 'not-available', message: 'POS is up to date.' });
  });

  autoUpdater.on('error', (err) => {
    log.error('update-error', err);
    mainWindow?.webContents.send('updater:status', { status: 'error', message: 'Error updating POS: ' + err.message });
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('update-downloaded', info);
    mainWindow?.webContents.send('updater:status', { status: 'downloaded', message: 'Update ready. Restart POS to install.' });
  });

  // Check for updates shortly after startup
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 3000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── Window Controls ─────────────────────────────────────────────────────────
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.handle('window:close', () => mainWindow?.close());

// ─── Database IPC Bridge ─────────────────────────────────────────────────────

// Auth
ipcMain.handle('auth:login', (_e, username: string, password: string) =>
  db.auth.login(username, password));
ipcMain.handle('auth:logout', () => db.auth.logout());

// Users
ipcMain.handle('users:getAll', () => db.users.getAll());
ipcMain.handle('users:create', (_e, data: any) => db.users.create(data));
ipcMain.handle('users:update', (_e, id: number, data: any) => db.users.update(id, data));
ipcMain.handle('users:delete', (_e, id: number) => db.users.delete(id));
ipcMain.handle('users:changePassword', (_e, id: number, newPassword: string) =>
  db.users.changePassword(id, newPassword));

// Categories
ipcMain.handle('categories:getAll', () => db.categories.getAll());
ipcMain.handle('categories:create', (_e, data: any) => db.categories.create(data));
ipcMain.handle('categories:update', (_e, id: number, data: any) => db.categories.update(id, data));
ipcMain.handle('categories:delete', (_e, id: number) => db.categories.delete(id));

// Products
ipcMain.handle('products:getAll', () => db.products.getAll());
ipcMain.handle('products:getByCategory', (_e, categoryId: number) =>
  db.products.getByCategory(categoryId));
ipcMain.handle('products:create', (_e, data: any) => db.products.create(data));
ipcMain.handle('products:update', (_e, id: number, data: any) => db.products.update(id, data));
ipcMain.handle('products:delete', (_e, id: number) => db.products.delete(id));
ipcMain.handle('products:search', (_e, query: string) => db.products.search(query));

// Orders
ipcMain.handle('orders:create', (_e, data: any) => db.orders.create(data));
ipcMain.handle('orders:getAll', () => db.orders.getAll());
ipcMain.handle('orders:getById', (_e, id: number) => db.orders.getById(id));
ipcMain.handle('orders:getByDateRange', (_e, start: string, end: string) =>
  db.orders.getByDateRange(start, end));
ipcMain.handle('orders:void', (_e, id: number, reason: string) => db.orders.void(id, reason));

// Inventory
ipcMain.handle('inventory:getAll', () => db.inventory.getAll());
ipcMain.handle('inventory:getLowStock', () => db.inventory.getLowStock());
ipcMain.handle('inventory:adjustStock', (_e, productId: number, qty: number, type: string, notes: string) =>
  db.inventory.adjustStock(productId, qty, type, notes));
ipcMain.handle('inventory:getMovements', (_e, productId?: number) =>
  db.inventory.getMovements(productId));

// Ingredients
ipcMain.handle('ingredients:getAll', () => db.ingredients.getAll());
ipcMain.handle('ingredients:getLowStock', () => db.ingredients.getLowStock());
ipcMain.handle('ingredients:create', (_e, data: any) => db.ingredients.create(data));
ipcMain.handle('ingredients:update', (_e, id: number, data: any) => db.ingredients.update(id, data));
ipcMain.handle('ingredients:delete', (_e, id: number) => db.ingredients.delete(id));
ipcMain.handle('ingredients:adjustStock', (_e, id: number, qty: number, type: string, notes: string, userId?: number) =>
  db.ingredients.adjustStock(id, qty, type, notes, userId));
ipcMain.handle('ingredients:getMovements', (_e, ingredientId?: number) =>
  db.ingredients.getMovements(ingredientId));

// Recipes
ipcMain.handle('recipes:getAll', () => db.recipes.getAll());
ipcMain.handle('recipes:getForProduct', (_e, productId: number) => db.recipes.getForProduct(productId));
ipcMain.handle('recipes:setRecipe', (_e, productId: number, items: any[]) => db.recipes.setRecipe(productId, items));
ipcMain.handle('recipes:upsert', (_e, productId: number, ingredientId: number, quantity: number, unit?: string) =>
  db.recipes.upsert(productId, ingredientId, quantity, unit));
ipcMain.handle('recipes:removeIngredient', (_e, productId: number, ingredientId: number) =>
  db.recipes.removeIngredient(productId, ingredientId));
ipcMain.handle('recipes:checkAvailability', (_e, productId: number, qty: number) =>
  db.recipes.checkAvailability(productId, qty));

// Modifiers
ipcMain.handle('modifiers:getAll', () => db.modifiers.getAll());
ipcMain.handle('modifiers:getForProduct', (_e, productId: number) => db.modifiers.getForProduct(productId));
ipcMain.handle('modifiers:createModifier', (_e, data: any) => db.modifiers.createModifier(data));
ipcMain.handle('modifiers:updateModifier', (_e, id: number, data: any) => db.modifiers.updateModifier(id, data));
ipcMain.handle('modifiers:deleteModifier', (_e, id: number) => db.modifiers.deleteModifier(id));
ipcMain.handle('modifiers:addOption', (_e, modifierId: number, data: any) => db.modifiers.addOption(modifierId, data));
ipcMain.handle('modifiers:updateOption', (_e, id: number, data: any) => db.modifiers.updateOption(id, data));
ipcMain.handle('modifiers:deleteOption', (_e, id: number) => db.modifiers.deleteOption(id));
ipcMain.handle('modifiers:linkToProduct', (_e, productId: number, modifierId: number) => db.modifiers.linkToProduct(productId, modifierId));
ipcMain.handle('modifiers:unlinkFromProduct', (_e, productId: number, modifierId: number) => db.modifiers.unlinkFromProduct(productId, modifierId));

// Suppliers
ipcMain.handle('suppliers:getAll', () => db.suppliers.getAll());
ipcMain.handle('suppliers:create', (_e, data: any) => db.suppliers.create(data));
ipcMain.handle('suppliers:update', (_e, id: number, data: any) => db.suppliers.update(id, data));
ipcMain.handle('suppliers:delete', (_e, id: number) => db.suppliers.delete(id));

// Customers
ipcMain.handle('customers:getAll', () => db.customers.getAll());
ipcMain.handle('customers:create', (_e, data: any) => db.customers.create(data));
ipcMain.handle('customers:update', (_e, id: number, data: any) => db.customers.update(id, data));

// Expenses
ipcMain.handle('expenses:getAll', () => db.expenses.getAll());
ipcMain.handle('expenses:create', (_e, data: any) => db.expenses.create(data));
ipcMain.handle('expenses:update', (_e, id: number, data: any) => db.expenses.update(id, data));
ipcMain.handle('expenses:delete', (_e, id: number) => db.expenses.delete(id));

// Reports
ipcMain.handle('reports:getDailySales', (_e, date: string) => db.reports.getDailySales(date));
ipcMain.handle('reports:getWeeklySales', (_e, startDate: string) =>
  db.reports.getWeeklySales(startDate));
ipcMain.handle('reports:getMonthlySales', (_e, year: number, month: number) =>
  db.reports.getMonthlySales(year, month));
ipcMain.handle('reports:getProductPerformance', (_e, start: string, end: string) =>
  db.reports.getProductPerformance(start, end));
ipcMain.handle('reports:getCategoryPerformance', (_e, start: string, end: string) =>
  db.reports.getCategoryPerformance(start, end));
ipcMain.handle('reports:getDashboard', () => db.reports.getDashboard());
ipcMain.handle('reports:getSalesTrend', (_e, days: number) => db.reports.getSalesTrend(days));
ipcMain.handle('reports:getIngredientConsumption', (_e, start: string, end: string) =>
  db.reports.getIngredientConsumption(start, end));
ipcMain.handle('reports:getProfitSummary', (_e, start: string, end: string) =>
  db.reports.getProfitSummary(start, end));

// Settings
ipcMain.handle('settings:get', () => db.settings.get());
ipcMain.handle('settings:update', (_e, data: any) => db.settings.update(data));

// License
ipcMain.handle('license:validate', (_e, key: string) => db.license.validate(key));
ipcMain.handle('license:getStatus', () => db.license.getStatus());

// Backup & Export
ipcMain.handle('backup:create', async () => {
  const result = await dialog.showSaveDialog({
    defaultPath: `cloud-n-cream-backup-${new Date().toISOString().split('T')[0]}.db`,
    filters: [{ name: 'SQLite Database', extensions: ['db'] }],
  });
  if (!result.canceled && result.filePath) {
    return backupService.createBackup(result.filePath);
  }
  return { success: false, message: 'Cancelled' };
});

ipcMain.handle('backup:restore', async () => {
  const result = await dialog.showOpenDialog({
    filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    properties: ['openFile'],
  });
  if (!result.canceled && result.filePaths[0]) {
    return backupService.restoreBackup(result.filePaths[0]);
  }
  return { success: false, message: 'Cancelled' };
});

ipcMain.handle('backup:list', () => backupService.listBackups());

// Export
ipcMain.handle('export:csv', async (_e, data: string, filename: string) => {
  const result = await dialog.showSaveDialog({
    defaultPath: filename,
    filters: [{ name: 'CSV File', extensions: ['csv'] }],
  });
  if (!result.canceled && result.filePath) {
    fs.writeFileSync(result.filePath, data, 'utf-8');
    return { success: true, path: result.filePath };
  }
  return { success: false };
});

ipcMain.handle('shell:openPath', (_e, filePath: string) => shell.openPath(filePath));

// Updater
ipcMain.handle('updater:check', () => autoUpdater.checkForUpdatesAndNotify());
ipcMain.handle('updater:quitAndInstall', () => autoUpdater.quitAndInstall(false, true));
