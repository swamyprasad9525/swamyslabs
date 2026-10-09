import { describe, expect, it } from 'vitest';
import {
    DEFAULT_PLANNING_ALLOWANCE_PERCENT,
    MAX_PROJECT_AREA_SQ_FT,
    PLANNER_STATE_VERSION,
    SQUARE_METERS_TO_SQUARE_FEET,
    calculateAreaFromDimensions,
    calculateEstimatedSlabCount,
    calculateMaterialEstimate,
    calculatePlanningAllowance,
    calculateRequiredArea,
    calculateSlabArea,
    convertArea,
    convertLength,
    normalizeAreaUnit,
    normalizeLengthUnit,
    normalizePlannerState,
    roundForDisplay,
    validateEstimatorInput,
} from './projectEstimator.js';

describe('project estimator unit conversion and area', () => {
    it('calculates area from feet dimensions', () => {
        expect(calculateAreaFromDimensions('20', '30', 'feet')).toBe(600);
    });

    it('calculates area from meter dimensions and normalizes to square feet', () => {
        expect(calculateAreaFromDimensions(3, 4, 'meters')).toBeCloseTo(
            12 * SQUARE_METERS_TO_SQUARE_FEET,
            10,
        );
    });

    it('converts square meters to square feet with the correct constant', () => {
        expect(convertArea(1, 'sqm', 'sqft')).toBeCloseTo(10.7639104167, 10);
    });

    it('supports practical aliases and reversible length conversion', () => {
        expect(normalizeLengthUnit('metres')).toBe('m');
        expect(normalizeAreaUnit('sq. ft')).toBe('sqft');
        expect(normalizeAreaUnit('m²')).toBe('sqm');
        expect(convertLength(convertLength(8, 'ft', 'mm'), 'mm', 'ft')).toBeCloseTo(8, 10);
    });
});

describe('project estimator planning allowance', () => {
    it('supports zero planning allowance', () => {
        expect(calculateRequiredArea(1200, 0)).toBe(1200);
        expect(calculatePlanningAllowance(1200, 0)).toBe(0);
    });

    it('applies a 10% planning allowance', () => {
        expect(calculateRequiredArea(1200, 10)).toBeCloseTo(1320, 10);
        expect(calculatePlanningAllowance(1200, 10)).toBeCloseTo(120, 10);
    });

    it('supports a decimal planning allowance without premature rounding', () => {
        expect(calculateRequiredArea(987.65, 12.5)).toBeCloseTo(1111.10625, 10);
    });

    it('rejects a negative or above-range planning allowance', () => {
        expect(calculateRequiredArea(1200, -1)).toBeNull();
        expect(calculateRequiredArea(1200, 30.01)).toBeNull();
    });

    it('rejects zero, negative, non-finite, and non-numeric project areas', () => {
        expect(calculateRequiredArea(0, 10)).toBeNull();
        expect(calculateRequiredArea(-100, 10)).toBeNull();
        expect(calculateRequiredArea(Number.NaN, 10)).toBeNull();
        expect(calculateRequiredArea(Number.POSITIVE_INFINITY, 10)).toBeNull();
        expect(calculateRequiredArea('not-a-number', 10)).toBeNull();
    });

    it('accepts legitimate large commercial areas but rejects absurd values', () => {
        expect(calculateRequiredArea(50_000_000, 10)).toBeCloseTo(55_000_000, 6);
        expect(calculateRequiredArea(MAX_PROJECT_AREA_SQ_FT + 1, 10)).toBeNull();
    });
});

describe('slab requirement and indicative material pricing', () => {
    it('calculates known millimeter slab area and rounds slab count upward', () => {
        const slabAreaSqFt = calculateSlabArea(2400, 1200, 'mm');

        expect(slabAreaSqFt).toBeCloseTo(31.000062, 6);
        expect(calculateEstimatedSlabCount(1320, slabAreaSqFt)).toBe(43);
    });

    it('does not calculate slab requirements when dimensions are missing', () => {
        expect(calculateSlabArea(null, 1200, 'mm')).toBeNull();
        expect(calculateSlabArea(2400, undefined, 'mm')).toBeNull();
        expect(calculateEstimatedSlabCount(1320, null)).toBeNull();
    });

    it('calculates a material-only estimate from a valid per-square-foot price', () => {
        expect(calculateMaterialEstimate(1320, 80)).toBe(105_600);
    });

    it('does not invent an estimate when price is absent or invalid', () => {
        expect(calculateMaterialEstimate(1320, null)).toBeNull();
        expect(calculateMaterialEstimate(1320, 0)).toBeNull();
        expect(calculateMaterialEstimate(1320, -5)).toBeNull();
    });

    it('retains decimal price precision in the calculation', () => {
        expect(calculateMaterialEstimate(123.45, 82.75)).toBeCloseTo(10_215.4875, 8);
    });
});

describe('display and persisted planner state safeguards', () => {
    it('rounds display values while rejecting invalid display input', () => {
        expect(roundForDisplay(1320.4567)).toBe(1320.46);
        expect(roundForDisplay(1320.4567, 1)).toBe(1320.5);
        expect(roundForDisplay(Number.POSITIVE_INFINITY)).toBeNull();
        expect(roundForDisplay(-1)).toBeNull();
    });

    it('normalizes valid planner state into a current versioned whitelist', () => {
        const normalized = normalizePlannerState({
            version: 0,
            stoneSlug: 'Tandur-Blue-Limestone',
            finish: '  Honed  ',
            thickness: '20 mm',
            application: 'Outdoor Flooring',
            previewMode: 'landscape',
            areaMode: 'dimensions',
            length: '20.5',
            width: 30,
            dimensionUnit: 'feet',
            wastePercent: '12.5',
            customerEmail: 'must-not-persist@example.com',
            phone: 'must-not-persist',
            unexpected: 'drop-me',
        });

        expect(normalized).toEqual({
            version: PLANNER_STATE_VERSION,
            stoneSlug: 'tandur-blue-limestone',
            finish: 'Honed',
            thickness: '20 mm',
            application: 'Outdoor Flooring',
            previewMode: 'landscape',
            areaMode: 'dimensions',
            projectArea: null,
            areaUnit: 'sqft',
            length: 20.5,
            width: 30,
            dimensionUnit: 'ft',
            wastePercent: 12.5,
        });
        expect(normalized).not.toHaveProperty('customerEmail');
        expect(normalized).not.toHaveProperty('phone');
        expect(normalized).not.toHaveProperty('unexpected');
    });

    it('safely resets invalid or old persisted values', () => {
        const normalized = normalizePlannerState({
            stoneSlug: '../bad-value',
            projectArea: Number.POSITIVE_INFINITY,
            areaUnit: 'unknown',
            length: -5,
            wastePercent: 99,
        });

        expect(normalized.stoneSlug).toBeNull();
        expect(normalized.projectArea).toBeNull();
        expect(normalized.length).toBeNull();
        expect(normalized.areaUnit).toBe('sqft');
        expect(normalized.wastePercent).toBe(DEFAULT_PLANNING_ALLOWANCE_PERCENT);
        expect(normalized.previewMode).toBe('floor');
    });

    it('accepts only the preview modes supported by the visualizer', () => {
        expect(normalizePlannerState({ previewMode: ' WALL ' }).previewMode).toBe('wall');
        expect(normalizePlannerState({ previewMode: 'room' }).previewMode).toBe('floor');
        expect(normalizePlannerState({ previewMode: null }).previewMode).toBe('floor');
    });
});

describe('estimator input validation', () => {
    it('validates a total-area calculation and returns normalized square feet', () => {
        const result = validateEstimatorInput({
            areaMode: 'total',
            projectArea: 100,
            areaUnit: 'sqm',
            wastePercent: 10,
        });

        expect(result.isValid).toBe(true);
        expect(result.errors).toEqual({});
        expect(result.projectAreaSqFt).toBeCloseTo(100 * SQUARE_METERS_TO_SQUARE_FEET, 8);
    });

    it('returns contextual errors for invalid dimensions and allowance', () => {
        const result = validateEstimatorInput({
            areaMode: 'dimensions',
            length: 20,
            width: 0,
            dimensionUnit: 'ft',
            wastePercent: -1,
        });

        expect(result.isValid).toBe(false);
        expect(result.projectAreaSqFt).toBeNull();
        expect(result.errors).toHaveProperty('width');
        expect(result.errors).toHaveProperty('wastePercent');
    });

    it('can require a selected stone for a full estimate', () => {
        const result = validateEstimatorInput({
            projectArea: 1200,
            areaUnit: 'sqft',
            wastePercent: 10,
            requireStone: true,
        });

        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveProperty('stoneSlug');
    });
});
