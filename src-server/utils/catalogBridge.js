import { getStoneById, getStoneBySlug } from '../../src/lib/catalog.js';

/**
 * Resolves the current static catalog into the small, immutable snapshot stored
 * on an inventory batch. Prices and presentation fields intentionally stay out
 * of the inventory identity bridge.
 */
export function resolveCatalogStoneReference({ stoneSlug, stoneId } = {}) {
  const slug = typeof stoneSlug === 'string' ? stoneSlug.trim() : '';
  const id = stoneId == null ? '' : String(stoneId).trim();
  const bySlug = slug ? getStoneBySlug(slug) : null;
  const byId = id ? getStoneById(id) : null;

  if ((slug && !bySlug) || (id && !byId)) return null;
  if (bySlug && byId && bySlug.id !== byId.id) return null;

  const stone = bySlug || byId;
  if (!stone) return null;

  return {
    stoneId: stone.id,
    slug: stone.slug,
    name: stone.name,
    materialFamily: stone.materialFamily || stone.materialType || undefined,
  };
}
