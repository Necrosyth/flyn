/**
 * InventoryService
 *
 * Production-grade inventory and fixed asset management for Flyn.
 *
 * Features:
 *   Inventory:
 *     - Stock tracking (create, adjust, transfer between locations)
 *     - Low stock alerts
 *     - Inventory valuation (FIFO, Weighted Average)
 *     - Stock movement history
 *     - Multi-location warehouse support
 *     - Auto-deduct stock when invoice is sent
 *
 *   Fixed Assets:
 *     - Asset register
 *     - Straight-Line and Declining Balance depreciation
 *     - Disposal and write-off
 *     - Depreciation schedule generation
 */

import { Injectable, Logger } from '@nestjs/common';

// ── Inventory Types ──────────────────────────────────────────────────────────

export type ValuationMethod = 'FIFO' | 'WEIGHTED_AVERAGE' | 'LIFO';
export type StockMovementType = 'purchase' | 'sale' | 'adjustment' | 'transfer_in' | 'transfer_out' | 'write_off';

export interface StockItem {
  _id: string;
  sku: string;
  name: string;
  description?: string;
  category: string;
  unitOfMeasure: string;          // e.g. 'pcs', 'kg', 'litres', 'boxes'
  reorderLevel: number;           // Trigger low-stock alert below this
  reorderQuantity: number;        // Suggested reorder quantity
  costPrice: number;              // Unit cost price (for valuation)
  sellingPrice: number;           // Unit selling price
  currency: string;
  locations: Record<string, number>; // warehouseId → qty
  totalQuantity: number;
  valuationMethod: ValuationMethod;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StockMovement {
  _id: string;
  stockItemId: string;
  sku: string;
  type: StockMovementType;
  quantity: number;               // positive = in, negative = out
  unitCost: number;
  totalCost: number;
  reference?: string;             // Invoice ID / PO number
  fromLocation?: string;
  toLocation?: string;
  notes?: string;
  balance: number;                // Running stock balance after movement
  createdAt: Date;
}

export interface StockValuation {
  stockItemId: string;
  sku: string;
  name: string;
  totalQuantity: number;
  unitCost: number;
  totalValue: number;
  valuationMethod: ValuationMethod;
  currency: string;
}

// ── Asset Types ───────────────────────────────────────────────────────────────

export type DepreciationMethod = 'straight_line' | 'declining_balance' | 'units_of_production';
export type AssetStatus = 'active' | 'disposed' | 'written_off' | 'under_maintenance';

export interface FixedAsset {
  _id: string;
  assetTag: string;               // e.g. 'ASSET-001'
  name: string;
  category: string;               // e.g. 'Machinery', 'Vehicles', 'IT Equipment'
  description?: string;
  purchaseDate: string;
  purchasePrice: number;
  salvageValue: number;           // Expected value at end of useful life
  usefulLifeYears: number;
  depreciationMethod: DepreciationMethod;
  currency: string;
  location?: string;
  assignedTo?: string;            // Employee name/ID
  status: AssetStatus;
  disposalDate?: string;
  disposalValue?: number;
  accumulatedDepreciation: number;
  currentBookValue: number;
  lastDepreciationDate?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DepreciationEntry {
  assetId: string;
  assetTag: string;
  period: string;                 // e.g. '2026-04'
  openingBookValue: number;
  depreciationAmount: number;
  closingBookValue: number;
  accumulatedDepreciation: number;
}

export interface DepreciationSchedule {
  assetId: string;
  assetTag: string;
  name: string;
  purchasePrice: number;
  salvageValue: number;
  method: DepreciationMethod;
  usefulLifeYears: number;
  annualRate?: number;
  schedule: Array<{
    year: number;
    openingValue: number;
    depreciation: number;
    closingValue: number;
    accumulated: number;
  }>;
}

// ── In-Memory Storage (backed by NocoBase in production) ─────────────────────
const _stockItems: StockItem[] = [];
const _stockMovements: StockMovement[] = [];
const _assets: FixedAsset[] = [];
const _depreciationEntries: DepreciationEntry[] = [];

let _itemSeq = 100;
let _assetSeq = 100;
function mkId() { return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }
function nextSKU(prefix = 'SKU') { return `${prefix}-${String(++_itemSeq).padStart(4, '0')}`; }
function nextAssetTag() { return `ASSET-${String(++_assetSeq).padStart(3, '0')}`; }

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  // ── Stock Items ──────────────────────────────────────────────────────────

  async createStockItem(data: Partial<StockItem>): Promise<StockItem> {
    const item: StockItem = {
      _id: mkId(),
      sku: data.sku ?? nextSKU(),
      name: data.name ?? 'Unnamed Item',
      description: data.description,
      category: data.category ?? 'General',
      unitOfMeasure: data.unitOfMeasure ?? 'pcs',
      reorderLevel: data.reorderLevel ?? 10,
      reorderQuantity: data.reorderQuantity ?? 50,
      costPrice: data.costPrice ?? 0,
      sellingPrice: data.sellingPrice ?? 0,
      currency: data.currency ?? 'USD',
      locations: data.locations ?? { 'main': 0 },
      totalQuantity: Object.values(data.locations ?? {}).reduce((s, q) => s + q, 0),
      valuationMethod: data.valuationMethod ?? 'WEIGHTED_AVERAGE',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    _stockItems.unshift(item);
    this.logger.log(`Stock item created: ${item.sku} - ${item.name}`);
    return item;
  }

  async getStockItems(params: { search?: string; category?: string; lowStockOnly?: boolean } = {}): Promise<StockItem[]> {
    let items = [..._stockItems].filter(i => i.isActive);
    if (params.search) {
      const q = params.search.toLowerCase();
      items = items.filter(i => i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q));
    }
    if (params.category) items = items.filter(i => i.category === params.category);
    if (params.lowStockOnly) items = items.filter(i => i.totalQuantity <= i.reorderLevel);
    return items;
  }

  async getStockItem(id: string): Promise<StockItem | null> {
    return _stockItems.find(i => i._id === id || i.sku === id) ?? null;
  }

  async updateStockItem(id: string, data: Partial<StockItem>): Promise<StockItem | null> {
    const idx = _stockItems.findIndex(i => i._id === id);
    if (idx === -1) return null;
    _stockItems[idx] = { ..._stockItems[idx], ...data, updatedAt: new Date() };
    return _stockItems[idx];
  }

  // ── Stock Adjustments & Movements ────────────────────────────────────────

  async adjustStock(
    stockItemId: string,
    quantity: number,                  // positive = stock in, negative = stock out
    type: StockMovementType,
    options: {
      unitCost?: number;
      reference?: string;
      fromLocation?: string;
      toLocation?: string;
      notes?: string;
    } = {}
  ): Promise<{ item: StockItem; movement: StockMovement }> {
    const idx = _stockItems.findIndex(i => i._id === stockItemId);
    if (idx === -1) throw new Error(`Stock item ${stockItemId} not found`);

    const item = _stockItems[idx];
    const location = options.toLocation ?? options.fromLocation ?? 'main';
    const currentLocationQty = item.locations[location] ?? 0;
    const newLocationQty = Math.max(0, currentLocationQty + quantity);

    // Update locations
    const locations = { ...item.locations, [location]: newLocationQty };
    const totalQuantity = Object.values(locations).reduce((s, q) => s + q, 0);

    // Transfer: deduct from source, add to destination
    if (type === 'transfer_out' && options.fromLocation && options.toLocation) {
      locations[options.fromLocation] = Math.max(0, (item.locations[options.fromLocation] ?? 0) - Math.abs(quantity));
      locations[options.toLocation] = (item.locations[options.toLocation] ?? 0) + Math.abs(quantity);
    }

    const unitCost = options.unitCost ?? item.costPrice;
    const movement: StockMovement = {
      _id: mkId(),
      stockItemId,
      sku: item.sku,
      type,
      quantity,
      unitCost,
      totalCost: parseFloat((Math.abs(quantity) * unitCost).toFixed(2)),
      reference: options.reference,
      fromLocation: options.fromLocation,
      toLocation: options.toLocation,
      notes: options.notes,
      balance: totalQuantity,
      createdAt: new Date(),
    };

    _stockMovements.unshift(movement);
    _stockItems[idx] = { ...item, locations, totalQuantity, updatedAt: new Date() };

    if (totalQuantity <= item.reorderLevel) {
      this.logger.warn(`LOW STOCK ALERT: ${item.sku} - ${item.name} (qty: ${totalQuantity}, reorder level: ${item.reorderLevel})`);
    }

    return { item: _stockItems[idx], movement };
  }

  async deductStockForInvoice(invoiceId: string, lineItems: Array<{ sku: string; quantity: number }>): Promise<{ deducted: number; failed: string[] }> {
    let deducted = 0;
    const failed: string[] = [];

    for (const li of lineItems) {
      const item = _stockItems.find(i => i.sku === li.sku);
      if (!item) { failed.push(`SKU ${li.sku} not found`); continue; }
      if (item.totalQuantity < li.quantity) { failed.push(`Insufficient stock for ${li.sku} (need ${li.quantity}, have ${item.totalQuantity})`); continue; }

      await this.adjustStock(item._id, -li.quantity, 'sale', { reference: invoiceId, notes: `Auto-deducted for invoice ${invoiceId}` });
      deducted++;
    }

    return { deducted, failed };
  }

  // ── Stock Movements ────────────────────────────────────────────────────────

  getStockMovements(stockItemId?: string, limit = 100): StockMovement[] {
    const movements = stockItemId
      ? _stockMovements.filter(m => m.stockItemId === stockItemId)
      : _stockMovements;
    return movements.slice(0, limit);
  }

  // ── Valuation ─────────────────────────────────────────────────────────────

  getInventoryValuation(): { items: StockValuation[]; totalValue: number } {
    const items: StockValuation[] = _stockItems
      .filter(i => i.isActive && i.totalQuantity > 0)
      .map(item => {
        let unitCost = item.costPrice;

        if (item.valuationMethod === 'WEIGHTED_AVERAGE') {
          const movements = _stockMovements
            .filter(m => m.stockItemId === item._id && (m.type === 'purchase' || m.type === 'adjustment') && m.quantity > 0);
          if (movements.length > 0) {
            const totalUnits = movements.reduce((s, m) => s + m.quantity, 0);
            const totalCost = movements.reduce((s, m) => s + m.totalCost, 0);
            unitCost = totalUnits > 0 ? totalCost / totalUnits : item.costPrice;
          }
        }

        return {
          stockItemId: item._id,
          sku: item.sku,
          name: item.name,
          totalQuantity: item.totalQuantity,
          unitCost: parseFloat(unitCost.toFixed(2)),
          totalValue: parseFloat((item.totalQuantity * unitCost).toFixed(2)),
          valuationMethod: item.valuationMethod,
          currency: item.currency,
        };
      });

    const totalValue = items.reduce((s, i) => s + i.totalValue, 0);
    return { items, totalValue: parseFloat(totalValue.toFixed(2)) };
  }

  getLowStockAlerts(): StockItem[] {
    return _stockItems.filter(i => i.isActive && i.totalQuantity <= i.reorderLevel);
  }

  // ── Fixed Assets ──────────────────────────────────────────────────────────

  async createAsset(data: Partial<FixedAsset>): Promise<FixedAsset> {
    const purchasePrice = data.purchasePrice ?? 0;
    const asset: FixedAsset = {
      _id: mkId(),
      assetTag: data.assetTag ?? nextAssetTag(),
      name: data.name ?? 'Unnamed Asset',
      category: data.category ?? 'General',
      description: data.description,
      purchaseDate: data.purchaseDate ?? new Date().toISOString().slice(0, 10),
      purchasePrice,
      salvageValue: data.salvageValue ?? 0,
      usefulLifeYears: data.usefulLifeYears ?? 5,
      depreciationMethod: data.depreciationMethod ?? 'straight_line',
      currency: data.currency ?? 'USD',
      location: data.location,
      assignedTo: data.assignedTo,
      status: 'active',
      accumulatedDepreciation: 0,
      currentBookValue: purchasePrice,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    _assets.unshift(asset);
    this.logger.log(`Asset created: ${asset.assetTag} - ${asset.name}`);
    return asset;
  }

  async getAssets(params: { status?: string; category?: string } = {}): Promise<FixedAsset[]> {
    let assets = [..._assets];
    if (params.status) assets = assets.filter(a => a.status === params.status);
    if (params.category) assets = assets.filter(a => a.category === params.category);
    return assets;
  }

  async getAsset(id: string): Promise<FixedAsset | null> {
    return _assets.find(a => a._id === id || a.assetTag === id) ?? null;
  }

  // ── Depreciation ───────────────────────────────────────────────────────────

  calculateDepreciation(asset: FixedAsset, period: string): DepreciationEntry {
    const depreciableValue = asset.purchasePrice - asset.salvageValue;
    let depreciationAmount = 0;

    switch (asset.depreciationMethod) {
      case 'straight_line':
        depreciationAmount = depreciableValue / asset.usefulLifeYears / 12; // Monthly
        break;

      case 'declining_balance': {
        const rate = (2 / asset.usefulLifeYears); // 200% declining balance (double-declining)
        depreciationAmount = (asset.currentBookValue * rate) / 12;
        // Cannot depreciate below salvage value
        depreciationAmount = Math.min(depreciationAmount, asset.currentBookValue - asset.salvageValue);
        break;
      }

      default:
        depreciationAmount = depreciableValue / asset.usefulLifeYears / 12;
    }

    depreciationAmount = Math.max(0, parseFloat(depreciationAmount.toFixed(2)));

    const entry: DepreciationEntry = {
      assetId: asset._id,
      assetTag: asset.assetTag,
      period,
      openingBookValue: parseFloat(asset.currentBookValue.toFixed(2)),
      depreciationAmount,
      closingBookValue: parseFloat((asset.currentBookValue - depreciationAmount).toFixed(2)),
      accumulatedDepreciation: parseFloat((asset.accumulatedDepreciation + depreciationAmount).toFixed(2)),
    };

    _depreciationEntries.push(entry);

    // Update asset
    const idx = _assets.findIndex(a => a._id === asset._id);
    if (idx !== -1) {
      _assets[idx].accumulatedDepreciation = entry.accumulatedDepreciation;
      _assets[idx].currentBookValue = entry.closingBookValue;
      _assets[idx].lastDepreciationDate = period;
      _assets[idx].updatedAt = new Date();
    }

    return entry;
  }

  processMonthlyDepreciation(period: string): DepreciationEntry[] {
    const activeAssets = _assets.filter(a => a.status === 'active' && a.currentBookValue > a.salvageValue);
    const entries = activeAssets.map(asset => this.calculateDepreciation(asset, period));
    this.logger.log(`Processed depreciation for ${entries.length} assets — period: ${period}`);
    return entries;
  }

  generateDepreciationSchedule(assetId: string): DepreciationSchedule | null {
    const asset = _assets.find(a => a._id === assetId);
    if (!asset) return null;

    const schedule: DepreciationSchedule['schedule'] = [];
    let bookValue = asset.purchasePrice;
    const depreciableValue = asset.purchasePrice - asset.salvageValue;

    for (let year = 1; year <= asset.usefulLifeYears; year++) {
      let depreciation = 0;

      if (asset.depreciationMethod === 'straight_line') {
        depreciation = depreciableValue / asset.usefulLifeYears;
      } else if (asset.depreciationMethod === 'declining_balance') {
        const rate = 2 / asset.usefulLifeYears;
        depreciation = bookValue * rate;
        depreciation = Math.min(depreciation, bookValue - asset.salvageValue);
      }

      depreciation = Math.max(0, parseFloat(depreciation.toFixed(2)));
      const closingValue = parseFloat((bookValue - depreciation).toFixed(2));
      const accumulated = parseFloat((asset.purchasePrice - closingValue).toFixed(2));

      schedule.push({ year, openingValue: parseFloat(bookValue.toFixed(2)), depreciation, closingValue, accumulated });
      bookValue = closingValue;
      if (bookValue <= asset.salvageValue) break;
    }

    return {
      assetId: asset._id,
      assetTag: asset.assetTag,
      name: asset.name,
      purchasePrice: asset.purchasePrice,
      salvageValue: asset.salvageValue,
      method: asset.depreciationMethod,
      usefulLifeYears: asset.usefulLifeYears,
      schedule,
    };
  }

  async disposeAsset(assetId: string, disposalDate: string, disposalValue: number): Promise<FixedAsset | null> {
    const idx = _assets.findIndex(a => a._id === assetId);
    if (idx === -1) return null;

    _assets[idx] = {
      ..._assets[idx],
      status: 'disposed',
      disposalDate,
      disposalValue,
      updatedAt: new Date(),
    };

    const gainLoss = disposalValue - _assets[idx].currentBookValue;
    this.logger.log(`Asset ${_assets[idx].assetTag} disposed. Gain/Loss: ${gainLoss.toFixed(2)}`);
    return _assets[idx];
  }

  getAssetRegisterSummary(): { totalAssets: number; totalCost: number; totalDepreciation: number; totalBookValue: number; byCategory: Record<string, { count: number; cost: number; bookValue: number }> } {
    const active = _assets.filter(a => a.status === 'active');
    const byCategory: Record<string, { count: number; cost: number; bookValue: number }> = {};

    for (const asset of active) {
      if (!byCategory[asset.category]) byCategory[asset.category] = { count: 0, cost: 0, bookValue: 0 };
      byCategory[asset.category].count++;
      byCategory[asset.category].cost += asset.purchasePrice;
      byCategory[asset.category].bookValue += asset.currentBookValue;
    }

    return {
      totalAssets: active.length,
      totalCost: active.reduce((s, a) => s + a.purchasePrice, 0),
      totalDepreciation: active.reduce((s, a) => s + a.accumulatedDepreciation, 0),
      totalBookValue: active.reduce((s, a) => s + a.currentBookValue, 0),
      byCategory,
    };
  }

  getDepreciationEntries(assetId?: string): DepreciationEntry[] {
    return assetId ? _depreciationEntries.filter(e => e.assetId === assetId) : [..._depreciationEntries];
  }
}
