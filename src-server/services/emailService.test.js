import { describe, expect, it } from 'vitest';
import { isEmailNotificationConfigured } from './emailService.js';

describe('email notification configuration', () => {
  it('requires both SMTP identity values before notification delivery is enabled', () => {
    expect(isEmailNotificationConfigured({})).toBe(false);
    expect(isEmailNotificationConfigured({ EMAIL_USER: 'admin@example.com' })).toBe(false);
    expect(isEmailNotificationConfigured({ EMAIL_PASS: 'app-password' })).toBe(false);
    expect(isEmailNotificationConfigured({
      EMAIL_USER: 'admin@example.com',
      EMAIL_PASS: 'app-password',
    })).toBe(true);
  });

  it('treats whitespace-only values as unconfigured', () => {
    expect(isEmailNotificationConfigured({ EMAIL_USER: '  ', EMAIL_PASS: '  ' })).toBe(false);
  });
});
