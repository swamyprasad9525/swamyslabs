import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ExternalLink,
  MapPin,
  RefreshCw,
  Save,
  UserRound,
} from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import {
  formatCrmDate,
  labelLeadSource,
  labelLeadStage,
  parseAdminJsonResponse,
} from '../../lib/crm';

const EMPTY_ADDRESS = Object.freeze({
  line1: '',
  line2: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
});

const EMPTY_FORM = Object.freeze({
  name: '',
  company: '',
  email: '',
  phone: '',
  gstin: '',
  notes: '',
  billingAddress: EMPTY_ADDRESS,
  deliveryAddress: EMPTY_ADDRESS,
});

function customerToForm(customer) {
  return {
    name: customer?.name || '',
    company: customer?.company || '',
    email: customer?.email || '',
    phone: customer?.phone || '',
    gstin: customer?.gstin || '',
    notes: customer?.notes || '',
    billingAddress: { ...EMPTY_ADDRESS, ...(customer?.billingAddress || {}) },
    deliveryAddress: { ...EMPTY_ADDRESS, ...(customer?.deliveryAddress || {}) },
  };
}

function Field({ id, label, required = false, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-bold text-stone-600">
        {label} {required && <span className="text-rose-600">*</span>}
      </label>
      {children}
    </div>
  );
}

function AddressFields({ prefix, title, value, onChange }) {
  const update = (field) => (event) => onChange({ ...value, [field]: event.target.value });
  const inputClass = 'w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200';
  return (
    <fieldset className="rounded-2xl border border-stone-200 bg-stone-50/60 p-4">
      <legend className="px-1 text-sm font-black text-stone-900">{title}</legend>
      <div className="mt-2 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field id={`${prefix}-line1`} label="Address line 1">
            <input id={`${prefix}-line1`} maxLength={240} value={value.line1} onChange={update('line1')} className={inputClass} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field id={`${prefix}-line2`} label="Address line 2">
            <input id={`${prefix}-line2`} maxLength={240} value={value.line2} onChange={update('line2')} className={inputClass} />
          </Field>
        </div>
        <Field id={`${prefix}-city`} label="City">
          <input id={`${prefix}-city`} maxLength={120} value={value.city} onChange={update('city')} className={inputClass} />
        </Field>
        <Field id={`${prefix}-state`} label="State">
          <input id={`${prefix}-state`} maxLength={120} value={value.state} onChange={update('state')} className={inputClass} />
        </Field>
        <Field id={`${prefix}-postal-code`} label="Postal code">
          <input id={`${prefix}-postal-code`} maxLength={20} value={value.postalCode} onChange={update('postalCode')} className={inputClass} />
        </Field>
        <Field id={`${prefix}-country`} label="Country">
          <input id={`${prefix}-country`} maxLength={120} value={value.country} onChange={update('country')} className={inputClass} />
        </Field>
      </div>
    </fieldset>
  );
}

export default function CustomerDetailPage() {
  const { id } = useParams();
  const { authFetch, logout } = useAdmin();
  const [customer, setCustomer] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchCustomer = useCallback(async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await authFetch(`/api/admin/customers/${encodeURIComponent(id)}`);
      if (response.status === 401) {
        logout();
        return;
      }
      const data = await parseAdminJsonResponse(response, 'Unable to load this customer.');
      setCustomer(data.customer);
      setForm(customerToForm(data.customer));
    } catch (requestError) {
      setError(requestError.message || 'Unable to load this customer.');
    } finally {
      setLoading(false);
    }
  }, [authFetch, id, logout]);

  useEffect(() => {
    fetchCustomer();
  }, [fetchCustomer]);

  const updateField = (field) => (event) => {
    const value = field === 'gstin' ? event.target.value.toUpperCase() : event.target.value;
    setForm((current) => ({ ...current, [field]: value }));
    setSuccess('');
  };

  async function saveCustomer(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const response = await authFetch(`/api/admin/customers/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name.trim(),
          company: form.company.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          gstin: form.gstin.trim(),
          notes: form.notes.trim(),
          billingAddress: form.billingAddress,
          deliveryAddress: form.deliveryAddress,
        }),
      });
      if (response.status === 401) {
        logout();
        return;
      }
      const data = await parseAdminJsonResponse(response, 'Unable to save this customer.');
      setCustomer((current) => ({
        ...data.customer,
        sourceLead: current?.sourceLead,
      }));
      setForm(customerToForm(data.customer));
      setSuccess('Customer details saved.');
    } catch (requestError) {
      setError(requestError.message || 'Unable to save this customer.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl rounded-2xl border border-stone-200 bg-white px-6 py-20 text-center shadow-sm" aria-busy="true">
        <RefreshCw className="mx-auto h-7 w-7 animate-spin text-amber-600" aria-hidden="true" />
        <p className="mt-3 text-sm font-bold text-stone-600">Loading customer details…</p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Link to="/admin/customers" className="inline-flex items-center gap-2 text-sm font-bold text-stone-600 hover:text-stone-950">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to customers
        </Link>
        <div className="rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error || 'Customer not found.'}</span>
          </div>
          <button type="button" onClick={fetchCustomer} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-stone-950 px-4 py-2.5 text-sm font-bold text-white hover:bg-stone-800">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Retry
          </button>
        </div>
      </div>
    );
  }

  const sourceLead = customer.sourceLead;
  const sourceLeadId = typeof sourceLead === 'object' ? sourceLead?._id : sourceLead;
  const inputClass = 'w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200';

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Link to="/admin/customers" className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-500 hover:text-stone-950">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Customers
        </Link>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-black tracking-tight text-stone-950 sm:text-3xl">{customer.name}</h1>
              <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-black text-stone-600">{customer.customerNumber}</span>
            </div>
            <p className="mt-1 text-sm text-stone-500">Customer since {formatCrmDate(customer.createdAt)}</p>
          </div>
          <button type="button" onClick={fetchCustomer} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-bold text-stone-700 shadow-sm hover:bg-stone-50 disabled:opacity-60">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Reset from server
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <form onSubmit={saveCustomer} className="space-y-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3 border-b border-stone-100 pb-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-700">
              <UserRound className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-black text-stone-950">Customer details</h2>
              <p className="mt-0.5 text-xs leading-5 text-stone-500">Maintain factual contact, tax, delivery, and billing information.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="customer-name" label="Name" required>
              <input id="customer-name" required maxLength={120} autoComplete="name" value={form.name} onChange={updateField('name')} className={inputClass} />
            </Field>
            <Field id="customer-company" label="Company">
              <input id="customer-company" maxLength={160} autoComplete="organization" value={form.company} onChange={updateField('company')} className={inputClass} />
            </Field>
            <Field id="customer-email" label="Email">
              <input id="customer-email" type="email" maxLength={254} autoComplete="email" value={form.email} onChange={updateField('email')} className={inputClass} />
            </Field>
            <Field id="customer-phone" label="Phone" required>
              <input id="customer-phone" type="tel" required maxLength={20} autoComplete="tel" value={form.phone} onChange={updateField('phone')} className={inputClass} />
            </Field>
            <div className="sm:col-span-2">
              <Field id="customer-gstin" label="GSTIN (optional)">
                <input id="customer-gstin" maxLength={30} autoCapitalize="characters" value={form.gstin} onChange={updateField('gstin')} className={`${inputClass} uppercase`} />
              </Field>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <AddressFields
              prefix="billing"
              title="Billing address"
              value={form.billingAddress}
              onChange={(billingAddress) => {
                setForm((current) => ({ ...current, billingAddress }));
                setSuccess('');
              }}
            />
            <AddressFields
              prefix="delivery"
              title="Delivery address"
              value={form.deliveryAddress}
              onChange={(deliveryAddress) => {
                setForm((current) => ({ ...current, deliveryAddress }));
                setSuccess('');
              }}
            />
          </div>

          <Field id="customer-notes" label="Internal customer notes">
            <textarea
              id="customer-notes"
              rows={5}
              maxLength={3000}
              value={form.notes}
              onChange={updateField('notes')}
              className={`${inputClass} resize-y`}
              placeholder="Record factual information useful for future commercial work."
            />
          </Field>

          <div className="flex justify-end border-t border-stone-100 pt-5">
            <button type="submit" disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-stone-950 px-5 py-3 text-sm font-black text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
              {saving ? 'Saving…' : 'Save customer'}
            </button>
          </div>
        </form>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-amber-700" aria-hidden="true" />
              <h2 className="font-black text-stone-950">Originating lead</h2>
            </div>
            {sourceLeadId ? (
              <div className="mt-4 space-y-3">
                {typeof sourceLead === 'object' && (
                  <>
                    <div>
                      <p className="text-lg font-black text-stone-950">{sourceLead.leadNumber}</p>
                      <p className="mt-1 text-xs text-stone-500">{labelLeadSource(sourceLead.source)} · {labelLeadStage(sourceLead.stage)}</p>
                    </div>
                    {sourceLead.materialContext?.stoneName && <p className="text-sm text-stone-600">Material: {sourceLead.materialContext.stoneName}</p>}
                    {sourceLead.project?.location && <p className="flex items-start gap-1.5 text-sm text-stone-600"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {sourceLead.project.location}</p>}
                  </>
                )}
                <Link to={`/admin/crm/${sourceLeadId}`} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-black text-amber-900 hover:bg-amber-100">
                  View lead <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            ) : (
              <p className="mt-4 text-sm leading-6 text-stone-500">No source lead is available for this record.</p>
            )}
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="font-black text-stone-950">Record information</h2>
            <dl className="mt-3 space-y-3 text-xs">
              <div>
                <dt className="font-bold uppercase tracking-wide text-stone-400">Created</dt>
                <dd className="mt-1 font-semibold text-stone-700">{formatCrmDate(customer.createdAt, { includeTime: true })}</dd>
              </div>
              <div>
                <dt className="font-bold uppercase tracking-wide text-stone-400">Last updated</dt>
                <dd className="mt-1 font-semibold text-stone-700">{formatCrmDate(customer.updatedAt, { includeTime: true })}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-stone-200 bg-stone-50 p-5 text-xs leading-5 text-stone-500">
            This customer record is not automatically linked to historical invoices, quotations, orders, inventory, payments, or dispatch records.
          </section>
        </aside>
      </div>
    </div>
  );
}
