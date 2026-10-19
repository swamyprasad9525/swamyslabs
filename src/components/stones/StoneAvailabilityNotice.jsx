import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { apiRequest } from '../../lib/api';

const DEFAULT_MESSAGE = 'Final finish, dimensions, quantity and availability are confirmed for each project during quotation.';

export default function StoneAvailabilityNotice({ stoneSlug }) {
  const [availability, setAvailability] = useState(null);

  useEffect(() => {
    let active = true;
    setAvailability(null);

    apiRequest(`/api/stones/${encodeURIComponent(stoneSlug)}/availability`)
      .then((data) => {
        if (active) setAvailability(data.availability || null);
      })
      .catch(() => {
        if (active) setAvailability(null);
      });

    return () => {
      active = false;
    };
  }, [stoneSlug]);

  const isAvailable = availability?.status === 'AVAILABLE_FOR_ENQUIRY';
  const message = availability?.message || DEFAULT_MESSAGE;

  return (
    <div className="mt-8 border-y border-[var(--color-border)] py-6" aria-live="polite">
      {isAvailable && (
        <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[.12em] text-emerald-800">
          <CheckCircle2 size={16} aria-hidden="true" /> Availability recorded
        </p>
      )}
      <p className="text-sm leading-6 text-stone-600">{message}</p>
    </div>
  );
}
