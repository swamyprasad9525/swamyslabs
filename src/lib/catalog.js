import { PREMIUM_STONES } from '../data/stones.js';

const toStringValue = (value) => value == null ? '' : String(value).trim();

const toArray = (value) => {
    if (Array.isArray(value)) return value;
    return value == null || value === '' ? [] : [value];
};

const uniqueStrings = (values) => {
    const seen = new Set();

    return values.reduce((items, value) => {
        const item = toStringValue(value);
        const key = item.toLocaleLowerCase();

        if (!item || seen.has(key)) return items;
        seen.add(key);
        items.push(item);
        return items;
    }, []);
};

const normalizedText = (value) => toStringValue(value)
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();

const normalizedPrice = (value) => {
    if (value == null || value === '') return null;
    const price = Number(value);
    return Number.isFinite(price) ? price : null;
};

/**
 * Creates URL-safe slugs for new catalog records. Catalog entries still store an
 * explicit slug so a later display-name change cannot silently change a public URL.
 */
export const createSlug = (value) => toStringValue(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[\u2018\u2019']/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Returns a normalized copy while retaining the legacy singular field names used
 * by existing invoice and selection screens.
 */
export const normalizeStone = (stone = {}) => {
    const name = toStringValue(stone.name);
    const materialFamily = toStringValue(stone.materialFamily || stone.materialType) || null;
    const finishes = uniqueStrings([
        ...toArray(stone.finishes),
        ...toArray(stone.finish),
    ]);
    const thicknesses = uniqueStrings([
        ...toArray(stone.thicknesses),
        ...toArray(stone.thickness),
    ]);
    const applications = uniqueStrings([
        ...toArray(stone.applications),
        ...toArray(stone.application),
    ]);
    const price = normalizedPrice(stone.price ?? stone.pricePerSqFt);
    const legacyPrice = normalizedPrice(stone.pricePerSqFt);

    return {
        ...stone,
        id: stone.id == null ? null : String(stone.id),
        slug: toStringValue(stone.slug) || createSlug(name),
        name,
        materialFamily,
        materialType: toStringValue(stone.materialType || materialFamily) || null,
        category: toStringValue(stone.category) || null,
        color: toStringValue(stone.color) || null,
        shortDescription: toStringValue(stone.shortDescription) || null,
        description: toStringValue(stone.description) || null,
        images: uniqueStrings(toArray(stone.images)),
        finishes,
        finish: toStringValue(stone.finish || finishes[0]) || null,
        thicknesses,
        thickness: toStringValue(stone.thickness || thicknesses[0]) || null,
        dimensions: Array.isArray(stone.dimensions)
            ? uniqueStrings(stone.dimensions)
            : (toStringValue(stone.dimensions) || null),
        applications,
        application: [...applications],
        features: uniqueStrings(toArray(stone.features)),
        technicalSpecifications: stone.technicalSpecifications
            && typeof stone.technicalSpecifications === 'object'
            && !Array.isArray(stone.technicalSpecifications)
            ? { ...stone.technicalSpecifications }
            : {},
        price,
        priceUnit: toStringValue(stone.priceUnit) || (legacyPrice == null ? null : 'sq ft'),
        pricePerSqFt: legacyPrice,
        minimumOrder: stone.minimumOrder ?? null,
        origin: toStringValue(stone.origin) || null,
        seo: stone.seo && typeof stone.seo === 'object' && !Array.isArray(stone.seo)
            ? { ...stone.seo }
            : {},
        featured: Boolean(stone.featured),
    };
};

const normalizeCatalog = (stones) => (Array.isArray(stones) ? stones : [])
    .map(normalizeStone);

export const getAllStones = () => normalizeCatalog(PREMIUM_STONES);

export const getStoneById = (id, stones = PREMIUM_STONES) => {
    const requestedId = toStringValue(id);
    if (!requestedId) return null;

    return normalizeCatalog(stones).find((stone) => stone.id === requestedId) || null;
};

export const getStoneBySlug = (slug, stones = PREMIUM_STONES) => {
    const requestedSlug = normalizedText(slug);
    if (!requestedSlug) return null;

    return normalizeCatalog(stones).find(
        (stone) => normalizedText(stone.slug) === requestedSlug,
    ) || null;
};

export const searchStones = (stones, query) => {
    const catalog = normalizeCatalog(stones);
    const terms = normalizedText(query).split(' ').filter(Boolean);
    if (terms.length === 0) return catalog;

    return catalog.filter((stone) => {
        const searchableText = normalizedText([
            stone.name,
            stone.materialFamily,
            stone.materialType,
            stone.category,
            stone.color,
            stone.shortDescription,
            stone.description,
            ...stone.finishes,
            ...stone.applications,
        ].filter(Boolean).join(' '));

        return terms.every((term) => searchableText.includes(term));
    });
};

const selectedFilterValues = (filters, aliases) => uniqueStrings(
    aliases.flatMap((alias) => toArray(filters?.[alias])),
).filter((value) => normalizedText(value) !== 'all');

const includesSelectedValue = (stoneValues, selectedValues) => {
    if (selectedValues.length === 0) return true;

    const available = new Set(toArray(stoneValues).map(normalizedText));
    return selectedValues.some((value) => available.has(normalizedText(value)));
};

/**
 * Filter groups combine with AND. Multiple selections within one group combine
 * with OR, which keeps multi-select controls predictable.
 */
export const filterStones = (stones, filters = {}) => {
    const groups = [
        {
            aliases: ['materialFamily', 'materialType', 'material'],
            values: (stone) => [stone.materialFamily, stone.materialType],
        },
        {
            aliases: ['finish', 'finishes'],
            values: (stone) => stone.finishes,
        },
        {
            aliases: ['application', 'applications'],
            values: (stone) => stone.applications,
        },
        { aliases: ['category'], values: (stone) => stone.category },
        { aliases: ['color'], values: (stone) => stone.color },
    ];

    return normalizeCatalog(stones).filter((stone) => groups.every((group) => (
        includesSelectedValue(
            group.values(stone),
            selectedFilterValues(filters, group.aliases),
        )
    )));
};

const compareNames = (left, right) => left.name.localeCompare(
    right.name,
    undefined,
    { sensitivity: 'base' },
);

const comparePrices = (left, right, direction) => {
    if (left.price == null && right.price == null) return 0;
    if (left.price == null) return 1;
    if (right.price == null) return -1;
    return (left.price - right.price) * direction;
};

export const sortStones = (stones, sort = 'featured') => {
    const catalog = normalizeCatalog(stones);
    const sortKey = normalizedText(sort).replace(/_/g, '-');
    const indexed = catalog.map((stone, index) => ({ stone, index }));

    const comparators = {
        'name-asc': (left, right) => compareNames(left, right),
        'name-a-z': (left, right) => compareNames(left, right),
        'a-z': (left, right) => compareNames(left, right),
        'name-desc': (left, right) => compareNames(right, left),
        'name-z-a': (left, right) => compareNames(right, left),
        'z-a': (left, right) => compareNames(right, left),
        'price-asc': (left, right) => comparePrices(left, right, 1),
        'price-low-high': (left, right) => comparePrices(left, right, 1),
        'price-desc': (left, right) => comparePrices(left, right, -1),
        'price-high-low': (left, right) => comparePrices(left, right, -1),
        featured: (left, right) => Number(right.featured) - Number(left.featured),
    };
    const compare = comparators[sortKey] || comparators.featured;

    return indexed
        .sort((left, right) => compare(left.stone, right.stone) || left.index - right.index)
        .map(({ stone }) => stone);
};

const resolveRelatedArguments = (limitOrStones, stonesOrLimit) => {
    if (Array.isArray(limitOrStones)) {
        return {
            stones: limitOrStones,
            limit: Number.isInteger(stonesOrLimit) ? stonesOrLimit : 4,
        };
    }

    if (limitOrStones && typeof limitOrStones === 'object') {
        return {
            stones: limitOrStones.stones || limitOrStones.catalog || PREMIUM_STONES,
            limit: Number.isInteger(limitOrStones.limit) ? limitOrStones.limit : 4,
        };
    }

    return {
        stones: Array.isArray(stonesOrLimit) ? stonesOrLimit : PREMIUM_STONES,
        limit: Number.isInteger(limitOrStones) ? limitOrStones : 4,
    };
};

/**
 * Related results are deterministic: material family, then color, then shared
 * applications, followed by original catalog order as the stable fallback.
 */
export const getRelatedStones = (stoneOrId, limitOrStones = 4, stonesOrLimit) => {
    const { stones, limit } = resolveRelatedArguments(limitOrStones, stonesOrLimit);
    const catalog = normalizeCatalog(stones);
    const current = typeof stoneOrId === 'object' && stoneOrId !== null
        ? normalizeStone(stoneOrId)
        : (getStoneById(stoneOrId, catalog) || getStoneBySlug(stoneOrId, catalog));

    if (!current || limit <= 0) return [];

    const currentApplications = new Set(current.applications.map(normalizedText));

    return catalog
        .map((stone, index) => ({
            stone,
            index,
            sameMaterial: Boolean(
                current.materialFamily
                && normalizedText(stone.materialFamily) === normalizedText(current.materialFamily),
            ),
            sameColor: Boolean(
                current.color
                && normalizedText(stone.color) === normalizedText(current.color),
            ),
            sharedApplications: stone.applications.filter(
                (application) => currentApplications.has(normalizedText(application)),
            ).length,
        }))
        .filter(({ stone }) => stone.id !== current.id && stone.slug !== current.slug)
        .sort((left, right) => (
            Number(right.sameMaterial) - Number(left.sameMaterial)
            || Number(right.sameColor) - Number(left.sameColor)
            || right.sharedApplications - left.sharedApplications
            || left.index - right.index
        ))
        .slice(0, limit)
        .map(({ stone }) => stone);
};
