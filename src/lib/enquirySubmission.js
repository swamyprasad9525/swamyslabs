const PLANNER_CONTEXT_FIELDS = Object.freeze([
  'application',
  'enteredArea',
  'projectAreaSqFt',
  'planningAllowancePercent',
  'requiredAreaSqFt',
  'estimatedSlabs',
  'indicativeMaterialEstimate',
]);

function appendText(formData, key, value) {
  formData.append(key, value == null ? '' : String(value));
}

export function buildEnquirySubmissionData({ formValues = {}, product = {}, submissionId }) {
  const data = new FormData();
  const canonicalPath = product.canonicalPath || (product.slug ? `/stones/${product.slug}` : '/stones');
  const materialType = product.materialFamily || product.materialType || '';
  const selectedFinish = product.selectedFinish || product.finish || '';

  appendText(data, 'submissionId', submissionId);
  appendText(data, 'source', product.crmSource || 'STONE_ENQUIRY');
  appendText(data, 'productName', product.name || 'Project enquiry');
  appendText(data, 'productId', product.stoneId || product.id || '');
  appendText(data, 'productSlug', product.slug || '');
  appendText(data, 'productUrl', canonicalPath);
  appendText(data, 'customerName', formValues.customerName);
  appendText(data, 'company', formValues.company);
  appendText(data, 'email', formValues.email);
  appendText(data, 'phoneNumber', formValues.phoneNumber);
  appendText(data, 'projectLocation', formValues.projectLocation);
  appendText(data, 'materialType', materialType);
  appendText(data, 'selectedFinish', selectedFinish);
  appendText(data, 'thickness', product.thickness);
  appendText(data, 'quantity', formValues.quantity);
  appendText(data, 'message', String(formValues.message || '').trim());

  const leadContext = product.leadContext || {};
  PLANNER_CONTEXT_FIELDS.forEach((field) => {
    const value = leadContext[field];
    if (value !== null && value !== undefined && value !== '') appendText(data, field, value);
  });

  if (Array.isArray(product.materialSelections) && product.materialSelections.length) {
    appendText(data, 'materialSelections', JSON.stringify(product.materialSelections));
  }
  if (formValues.file) data.append('file', formValues.file);

  return data;
}
