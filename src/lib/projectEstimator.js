export const SQUARE_METERS_TO_SQUARE_FEET = 10.763910416709722;
export const PLANNER_STATE_VERSION = 1;
export const DEFAULT_PLANNING_ALLOWANCE_PERCENT = 10;
export const MAX_PLANNING_ALLOWANCE_PERCENT = 30;
export const PLANNER_PREVIEW_MODES = Object.freeze([
    'floor',
    'wall',
    'outdoor',
    'landscape',
]);

// Deliberately generous for large commercial work, while still catching pasted
// phone numbers, exponent typos, and other accidental inputs.
export const MAX_PROJECT_AREA_SQ_FT = 100_000_000;

const MAX_REQUIRED_AREA_SQ_FT = MAX_PROJECT_AREA_SQ_FT
    * (1 + MAX_PLANNING_ALLOWANCE_PERCENT / 100);
const MAX_DIMENSION_FEET = 100_000;
const MAX_PRICE_PER_SQ_FT = 10_000_000;
const MAX_SELECTION_LENGTH = 120;

const LENGTH_TO_FEET = Object.freeze({
    ft: 1,
    m: SQUARE_METERS_TO_SQUARE_FEET ** 0.5,
    mm: (SQUARE_METERS_TO_SQUARE_FEET ** 0.5) / 1000,
    in: 1 / 12,
});

const AREA_TO_SQUARE_FEET = Object.freeze({
    sqft: 1,
    sqm: SQUARE_METERS_TO_SQUARE_FEET,
});

const LENGTH_UNIT_ALIASES = Object.freeze({
    ft: 'ft',
    foot: 'ft',
    feet: 'ft',
    m: 'm',
    meter: 'm',
    meters: 'm',
    metre: 'm',
    metres: 'm',
    mm: 'mm',
    millimeter: 'mm',
    millimeters: 'mm',
    millimetre: 'mm',
    millimetres: 'mm',
    in: 'in',
    inch: 'in',
    inches: 'in',
});

const AREA_UNIT_ALIASES = Object.freeze({
    sqft: 'sqft',
    squarefoot: 'sqft',
    squarefeet: 'sqft',
    ft2: 'sqft',
    sqm: 'sqm',
    squaremeter: 'sqm',
    squaremeters: 'sqm',
    squaremetre: 'sqm',
    squaremetres: 'sqm',
    m2: 'sqm',
});

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const toFiniteNumber = (value) => {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }

    if (typeof value !== 'string' || value.trim() === '') {
        return null;
    }

    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
};

const normalizeUnitToken = (value) => (
    typeof value === 'string'
        ? value
            .toLowerCase()
            .trim()
            .replace(/\u00b2/g, '2')
            .replace(/[.\s_\-^]/g, '')
        : ''
);

export const normalizeLengthUnit = (unit) => (
    LENGTH_UNIT_ALIASES[normalizeUnitToken(unit)] ?? null
);

export const normalizeAreaUnit = (unit) => (
    AREA_UNIT_ALIASES[normalizeUnitToken(unit)] ?? null
);

const getPositiveNumber = (value, maximum) => {
    const parsed = toFiniteNumber(value);

    if (parsed === null || parsed <= 0 || parsed > maximum) {
        return null;
    }

    return parsed;
};

const getPlanningAllowance = (value) => {
    const parsed = toFiniteNumber(value);

    if (
        parsed === null
        || parsed < 0
        || parsed > MAX_PLANNING_ALLOWANCE_PERCENT
    ) {
        return null;
    }

    return parsed;
};

/**
 * Converts a positive length between the planner's supported units.
 * Returns null for missing, invalid, zero, negative, or implausibly large input.
 */
export const convertLength = (value, fromUnit, toUnit = 'ft') => {
    const normalizedFromUnit = normalizeLengthUnit(fromUnit);
    const normalizedToUnit = normalizeLengthUnit(toUnit);
    const parsed = toFiniteNumber(value);

    if (parsed === null || parsed <= 0 || !normalizedFromUnit || !normalizedToUnit) {
        return null;
    }

    const valueInFeet = parsed * LENGTH_TO_FEET[normalizedFromUnit];

    if (!Number.isFinite(valueInFeet) || valueInFeet > MAX_DIMENSION_FEET) {
        return null;
    }

    const result = valueInFeet / LENGTH_TO_FEET[normalizedToUnit];
    return Number.isFinite(result) && result > 0 ? result : null;
};

/**
 * Converts a positive area between square feet and square meters.
 */
export const convertArea = (value, fromUnit, toUnit = 'sqft') => {
    const normalizedFromUnit = normalizeAreaUnit(fromUnit);
    const normalizedToUnit = normalizeAreaUnit(toUnit);
    const parsed = toFiniteNumber(value);

    if (parsed === null || parsed <= 0 || !normalizedFromUnit || !normalizedToUnit) {
        return null;
    }

    const valueInSquareFeet = parsed * AREA_TO_SQUARE_FEET[normalizedFromUnit];

    if (
        !Number.isFinite(valueInSquareFeet)
        || valueInSquareFeet > MAX_PROJECT_AREA_SQ_FT
    ) {
        return null;
    }

    const result = valueInSquareFeet / AREA_TO_SQUARE_FEET[normalizedToUnit];
    return Number.isFinite(result) && result > 0 ? result : null;
};

/**
 * Calculates rectangular area and normalizes it to square feet.
 */
export const calculateAreaFromDimensions = (length, width, unit = 'ft') => {
    const lengthInFeet = convertLength(length, unit, 'ft');
    const widthInFeet = convertLength(width, unit, 'ft');

    if (lengthInFeet === null || widthInFeet === null) {
        return null;
    }

    const area = lengthInFeet * widthInFeet;

    if (!Number.isFinite(area) || area <= 0 || area > MAX_PROJECT_AREA_SQ_FT) {
        return null;
    }

    return area;
};

/**
 * Applies a 0-30% planning allowance without rounding the calculation value.
 */
export const calculateRequiredArea = (projectAreaSqFt, wastePercent = 0) => {
    const projectArea = getPositiveNumber(projectAreaSqFt, MAX_PROJECT_AREA_SQ_FT);
    const planningAllowance = getPlanningAllowance(wastePercent);

    if (projectArea === null || planningAllowance === null) {
        return null;
    }

    const requiredArea = projectArea * (1 + planningAllowance / 100);

    if (
        !Number.isFinite(requiredArea)
        || requiredArea <= 0
        || requiredArea > MAX_REQUIRED_AREA_SQ_FT
    ) {
        return null;
    }

    return requiredArea;
};

export const calculatePlanningAllowance = (projectAreaSqFt, wastePercent = 0) => {
    const projectArea = getPositiveNumber(projectAreaSqFt, MAX_PROJECT_AREA_SQ_FT);
    const requiredArea = calculateRequiredArea(projectAreaSqFt, wastePercent);

    if (projectArea === null || requiredArea === null) {
        return null;
    }

    return requiredArea - projectArea;
};

/**
 * Calculates a supplied slab's area in square feet. No slab size is assumed.
 */
export const calculateSlabArea = (length, width, unit = 'mm') => (
    calculateAreaFromDimensions(length, width, unit)
);

/**
 * Uses a supplied usable slab area; callers may pass a measured slab area now
 * and a batch-provided usable area in a future inventory phase.
 */
export const calculateEstimatedSlabCount = (requiredAreaSqFt, usableSlabAreaSqFt) => {
    const requiredArea = getPositiveNumber(requiredAreaSqFt, MAX_REQUIRED_AREA_SQ_FT);
    const usableSlabArea = getPositiveNumber(usableSlabAreaSqFt, MAX_PROJECT_AREA_SQ_FT);

    if (requiredArea === null || usableSlabArea === null) {
        return null;
    }

    const slabCount = Math.ceil(requiredArea / usableSlabArea);
    return Number.isSafeInteger(slabCount) && slabCount > 0 ? slabCount : null;
};

/**
 * Calculates material-only pricing when a valid per-square-foot price exists.
 */
export const calculateMaterialEstimate = (requiredAreaSqFt, pricePerSqFt) => {
    const requiredArea = getPositiveNumber(requiredAreaSqFt, MAX_REQUIRED_AREA_SQ_FT);
    const price = getPositiveNumber(pricePerSqFt, MAX_PRICE_PER_SQ_FT);

    if (requiredArea === null || price === null) {
        return null;
    }

    const estimate = requiredArea * price;
    return Number.isFinite(estimate) && estimate <= Number.MAX_SAFE_INTEGER ? estimate : null;
};

/**
 * Rounds for presentation only. Calculation helpers retain full precision.
 */
export const roundForDisplay = (value, maximumFractionDigits = 2) => {
    const parsed = toFiniteNumber(value);

    if (
        parsed === null
        || parsed < 0
        || !Number.isInteger(maximumFractionDigits)
        || maximumFractionDigits < 0
        || maximumFractionDigits > 4
    ) {
        return null;
    }

    const factor = 10 ** maximumFractionDigits;
    const rounded = Math.round((parsed + Number.EPSILON) * factor) / factor;
    return Number.isFinite(rounded) ? rounded : null;
};

const normalizeSelection = (value) => {
    if (typeof value !== 'string') {
        return null;
    }

    const normalized = Array.from(value)
        .filter((character) => {
            const codePoint = character.codePointAt(0);
            return codePoint > 31 && codePoint !== 127;
        })
        .join('')
        .trim();

    if (normalized === '' || normalized.length > MAX_SELECTION_LENGTH) {
        return null;
    }

    return normalized;
};

const normalizeStoneSlug = (value) => {
    const normalized = normalizeSelection(value)?.toLowerCase();
    return normalized && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)
        ? normalized
        : null;
};

const normalizePreviewMode = (value) => (
    typeof value === 'string' && PLANNER_PREVIEW_MODES.includes(value.toLowerCase().trim())
        ? value.toLowerCase().trim()
        : 'floor'
);

const normalizeOptionalPositiveNumber = (value, maximum) => {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    return getPositiveNumber(value, maximum);
};

const normalizeOptionalLength = (value, unit) => {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    return convertLength(value, unit, 'ft') === null
        ? null
        : toFiniteNumber(value);
};

/**
 * Returns a versioned, PII-free whitelist suitable for localStorage.
 * Unknown/legacy properties (including customer contact details) are dropped.
 */
export const normalizePlannerState = (value) => {
    const input = isRecord(value) ? value : {};
    const areaMode = input.areaMode === 'dimensions' ? 'dimensions' : 'total';
    const areaUnit = normalizeAreaUnit(input.areaUnit) ?? 'sqft';
    const dimensionUnit = normalizeLengthUnit(input.dimensionUnit) ?? 'ft';
    const rawWastePercent = input.wastePercent === undefined
        ? DEFAULT_PLANNING_ALLOWANCE_PERCENT
        : input.wastePercent;
    const wastePercent = getPlanningAllowance(rawWastePercent)
        ?? DEFAULT_PLANNING_ALLOWANCE_PERCENT;
    const rawProjectArea = input.projectArea ?? input.totalArea;

    return {
        version: PLANNER_STATE_VERSION,
        stoneSlug: normalizeStoneSlug(input.stoneSlug),
        finish: normalizeSelection(input.finish),
        thickness: normalizeSelection(input.thickness),
        application: normalizeSelection(input.application),
        previewMode: normalizePreviewMode(input.previewMode),
        areaMode,
        projectArea: normalizeOptionalPositiveNumber(
            rawProjectArea,
            areaUnit === 'sqm'
                ? MAX_PROJECT_AREA_SQ_FT / SQUARE_METERS_TO_SQUARE_FEET
                : MAX_PROJECT_AREA_SQ_FT,
        ),
        areaUnit,
        length: normalizeOptionalLength(input.length, dimensionUnit),
        width: normalizeOptionalLength(input.width, dimensionUnit),
        dimensionUnit,
        wastePercent,
    };
};

export const normalizeProjectInput = normalizePlannerState;

/**
 * Validates the minimum calculation input and returns normalized square feet.
 */
export const validateEstimatorInput = (value) => {
    const input = isRecord(value) ? value : {};
    const areaMode = input.areaMode === 'dimensions' ? 'dimensions' : 'total';
    const areaUnit = normalizeAreaUnit(input.areaUnit) ?? 'sqft';
    const dimensionUnit = normalizeLengthUnit(input.dimensionUnit) ?? 'ft';
    const errors = {};
    let projectAreaSqFt = null;

    if (areaMode === 'dimensions') {
        projectAreaSqFt = calculateAreaFromDimensions(
            input.length,
            input.width,
            dimensionUnit,
        );

        if (convertLength(input.length, dimensionUnit, 'ft') === null) {
            errors.length = 'Enter a valid length greater than zero.';
        }

        if (convertLength(input.width, dimensionUnit, 'ft') === null) {
            errors.width = 'Enter a valid width greater than zero.';
        }
    } else {
        projectAreaSqFt = convertArea(input.projectArea ?? input.totalArea, areaUnit, 'sqft');

        if (projectAreaSqFt === null) {
            errors.projectArea = 'Enter a valid project area greater than zero.';
        }
    }

    const rawWastePercent = input.wastePercent === undefined
        ? DEFAULT_PLANNING_ALLOWANCE_PERCENT
        : input.wastePercent;
    const wastePercent = getPlanningAllowance(rawWastePercent);

    if (wastePercent === null) {
        errors.wastePercent = `Planning allowance must be between 0% and ${MAX_PLANNING_ALLOWANCE_PERCENT}%.`;
    }

    if (input.requireStone === true && normalizeStoneSlug(input.stoneSlug) === null) {
        errors.stoneSlug = 'Select a stone to prepare a full project estimate.';
    }

    return {
        isValid: Object.keys(errors).length === 0,
        errors,
        projectAreaSqFt,
        wastePercent,
    };
};
