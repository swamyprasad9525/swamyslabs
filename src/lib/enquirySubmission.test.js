import { describe, expect, it } from 'vitest';
import { buildEnquirySubmissionData } from './enquirySubmission.js';

describe('buildEnquirySubmissionData', () => {
  it('preserves the public project-planner and customer context sent to /api/leads', () => {
    const data = buildEnquirySubmissionData({
      submissionId: 'phase55-submission-0001',
      formValues: {
        customerName: 'Synthetic Phase 55 Buyer',
        company: 'Example Test Company',
        email: 'phase55@example.invalid',
        phoneNumber: '+91 90000 00000',
        projectLocation: 'Test project location',
        quantity: '1320 sq.ft',
        message: '  Offline integration verification only.  ',
      },
      product: {
        id: 'SS-001',
        slug: 'tandur-blue',
        name: 'Tandur Blue',
        materialFamily: 'Limestone',
        selectedFinish: 'Honed',
        thickness: '20 mm',
        crmSource: 'PROJECT_PLANNER',
        leadContext: {
          application: 'Flooring',
          enteredArea: '1200 sq.ft',
          projectAreaSqFt: 1200,
          planningAllowancePercent: 10,
          requiredAreaSqFt: 1320,
          estimatedSlabs: 14,
        },
      },
    });

    expect(Object.fromEntries(data.entries())).toEqual(expect.objectContaining({
      submissionId: 'phase55-submission-0001',
      source: 'PROJECT_PLANNER',
      productName: 'Tandur Blue',
      productId: 'SS-001',
      productSlug: 'tandur-blue',
      productUrl: '/stones/tandur-blue',
      customerName: 'Synthetic Phase 55 Buyer',
      email: 'phase55@example.invalid',
      phoneNumber: '+91 90000 00000',
      projectAreaSqFt: '1200',
      planningAllowancePercent: '10',
      requiredAreaSqFt: '1320',
      message: 'Offline integration verification only.',
    }));
  });

  it('does not serialize missing optional values as undefined', () => {
    const data = buildEnquirySubmissionData({
      submissionId: 'phase55-submission-0002',
      formValues: {},
      product: {},
    });

    expect(data.get('customerName')).toBe('');
    expect(data.get('productId')).toBe('');
    expect(data.get('thickness')).toBe('');
    expect([...data.values()]).not.toContain('undefined');
  });
});
