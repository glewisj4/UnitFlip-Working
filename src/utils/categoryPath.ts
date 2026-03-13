import { Category } from '../core/models/types';

export function buildCategoryPath(category: Category, allCategories: Category[]): string {
  const parts: string[] = [category.name];
  let current = category;
  const visited = new Set<string>([category.id]);

  while (current.parentId) {
    const parent = allCategories.find(c => c.id === current.parentId);
    if (!parent) break; // Parent not found, stop here
    if (visited.has(parent.id)) break; // Cycle detected
    
    parts.unshift(parent.name);
    visited.add(parent.id);
    current = parent;
  }

  return parts.join(' / ');
}

export function getDescendants(categoryId: string, allCategories: Category[]): Category[] {
  const descendants: Category[] = [];
  const queue = [categoryId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const children = allCategories.filter(c => c.parentId === currentId);
    for (const child of children) {
      descendants.push(child);
      queue.push(child.id);
    }
  }

  return descendants;
}
