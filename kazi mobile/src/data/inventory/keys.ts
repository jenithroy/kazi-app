export const inventoryKeys = {
  all: ['inventory'] as const,
  stock: () => [...inventoryKeys.all, 'stock'] as const,
  fabrics: () => [...inventoryKeys.all, 'fabrics'] as const,
  processes: () => [...inventoryKeys.all, 'processes'] as const,
  techPacks: () => [...inventoryKeys.all, 'tech-packs'] as const,
  itemCosts: () => [...inventoryKeys.all, 'item-costs'] as const,
  movements: () => [...inventoryKeys.all, 'movements'] as const,
};
