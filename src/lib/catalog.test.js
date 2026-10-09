import { describe, expect, it } from 'vitest';
import { PREMIUM_STONES } from '../data/stones.js';
import {
    createSlug,
    filterStones,
    getAllStones,
    getRelatedStones,
    getStoneById,
    getStoneBySlug,
    normalizeStone,
    searchStones,
    sortStones,
} from './catalog.js';

describe('catalog normalization and lookup', () => {
    it('creates readable slugs from punctuation, whitespace, and accents', () => {
        expect(createSlug("  T. Grey & Dholpur's Café Stone  ")).toBe('t-grey-and-dholpurs-cafe-stone');
    });

    it('uses the catalog-owned slug and keeps legacy fields compatible', () => {
        const normalized = normalizeStone({
            id: 7,
            slug: 'permanent-public-slug',
            name: 'A Renamed Stone',
            materialType: 'Limestone',
            finish: 'Honed',
            thickness: '20mm',
            application: ['Flooring'],
            pricePerSqFt: 50,
        });

        expect(normalized).toMatchObject({
            id: '7',
            slug: 'permanent-public-slug',
            materialFamily: 'Limestone',
            materialType: 'Limestone',
            finish: 'Honed',
            thickness: '20mm',
            price: 50,
            pricePerSqFt: 50,
            priceUnit: 'sq ft',
        });
        expect(normalized.finishes).toEqual(['Honed']);
        expect(normalized.thicknesses).toEqual(['20mm']);
        expect(normalized.applications).toEqual(['Flooring']);
        expect(normalized.application).toEqual(['Flooring']);
    });

    it('does not invent missing optional catalog facts', () => {
        const normalized = normalizeStone({ id: 'minimal', name: 'Minimal Stone' });

        expect(normalized).toMatchObject({
            category: null,
            color: null,
            origin: null,
            minimumOrder: null,
            price: null,
            pricePerSqFt: null,
            finish: null,
            thickness: null,
        });
        expect(normalized.finishes).toEqual([]);
        expect(normalized.applications).toEqual([]);
        expect(normalized.technicalSpecifications).toEqual({});
    });

    it('returns all stones with unique explicit slugs', () => {
        const stones = getAllStones();
        const slugs = stones.map((stone) => stone.slug);

        expect(stones).toHaveLength(PREMIUM_STONES.length);
        expect(new Set(slugs).size).toBe(stones.length);
        expect(slugs.every(Boolean)).toBe(true);
    });

    it('resolves canonical slugs and legacy IDs', () => {
        expect(getStoneBySlug('tandur-yellow-pool-coping')?.id).toBe('2');
        expect(getStoneBySlug('TANDUR-YELLOW-POOL-COPING')?.id).toBe('2');
        expect(getStoneById(2)?.slug).toBe('tandur-yellow-pool-coping');
    });

    it('returns null for invalid stone lookups', () => {
        expect(getStoneById('missing-id')).toBeNull();
        expect(getStoneBySlug('missing-stone')).toBeNull();
        expect(getStoneBySlug(null)).toBeNull();
    });
});

describe('catalog search, filters, and sorting', () => {
    const stones = getAllStones();

    it('searches across normalized fields case-insensitively', () => {
        const results = searchStones(stones, '  POOL   limestone ');

        expect(results.length).toBeGreaterThan(0);
        expect(results.every((stone) => (
            [stone.name, stone.description, ...stone.applications]
                .join(' ')
                .toLowerCase()
                .includes('pool')
        ))).toBe(true);
        expect(results.every((stone) => stone.materialFamily === 'Limestone')).toBe(true);
    });

    it('applies a single material filter', () => {
        const results = filterStones(stones, { materialFamily: 'Sandstone' });

        expect(results.map((stone) => stone.id)).toEqual(['6', '7']);
    });

    it('combines filter groups with AND', () => {
        const results = filterStones(stones, {
            materialFamily: 'Limestone',
            application: 'Pool Decks',
        });

        expect(results.map((stone) => stone.id)).toEqual(['2', '16']);
    });

    it('combines multiple selections inside a filter group with OR', () => {
        const results = filterStones(stones, {
            materialFamily: ['Sandstone', 'Natural Stone'],
        });

        expect(results).toHaveLength(6);
        expect(results.every((stone) => ['Sandstone', 'Natural Stone'].includes(stone.materialFamily))).toBe(true);
    });

    it('sorts names A-Z and Z-A without mutating input order', () => {
        const originalIds = stones.map((stone) => stone.id);
        const ascending = sortStones(stones, 'name-asc');
        const descending = sortStones(stones, 'name-desc');

        expect(ascending[0].name).toBe('Ash Grey Machine Cut');
        expect(descending[0].name).toBe('Tandur Yellow Pool Coping');
        expect(stones.map((stone) => stone.id)).toEqual(originalIds);
    });

    it('uses stable featured-first catalog ordering by default', () => {
        const results = sortStones(stones);

        expect(results.slice(0, 5).map((stone) => stone.id)).toEqual(['1', '4', '8', '11', '16']);
        expect(results.filter((stone) => stone.featured)).toHaveLength(5);
    });
});

describe('related stones', () => {
    it('uses deterministic material, color, application, then catalog ordering', () => {
        const stones = [
            { id: 'a', name: 'Current', materialType: 'Limestone', color: 'Yellow', application: ['Patio'] },
            { id: 'b', name: 'Same Material', materialType: 'Limestone', color: 'Grey', application: ['Patio'] },
            { id: 'c', name: 'Same Material and Color', materialType: 'Limestone', color: 'Yellow', application: ['Wall'] },
            { id: 'd', name: 'Same Color', materialType: 'Sandstone', color: 'Yellow', application: ['Patio'] },
            { id: 'e', name: 'Shared Use', materialType: 'Sandstone', color: 'Blue', application: ['Patio'] },
        ];

        expect(getRelatedStones(stones[0], stones, 4).map((stone) => stone.id)).toEqual([
            'c',
            'b',
            'd',
            'e',
        ]);
    });

    it('returns an empty list when the current stone cannot be resolved', () => {
        expect(getRelatedStones('unknown-stone')).toEqual([]);
    });
});
