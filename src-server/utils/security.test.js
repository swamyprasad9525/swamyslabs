import { describe, expect, it } from 'vitest';
import { detectFileType, escapeHtml, escapeRegex, validateAndNormalizeUpload } from './security.js';

describe('security helpers', () => {
  it('escapes HTML-sensitive characters', () => {
    expect(escapeHtml(`<a title="x">Tom & 'Sam'</a>`)).toBe('&lt;a title=&quot;x&quot;&gt;Tom &amp; &#39;Sam&#39;&lt;/a&gt;');
  });

  it('escapes regular-expression syntax', () => {
    expect(new RegExp(escapeRegex('invoice.*(1)')).test('invoice.*(1)')).toBe(true);
    expect(new RegExp(escapeRegex('invoice.*(1)')).test('invoiceZZ1')).toBe(false);
  });

  it('recognizes allowed magic bytes', () => {
    expect(detectFileType(Buffer.from([0xff, 0xd8, 0xff, 0x00]))?.mime).toBe('image/jpeg');
    expect(detectFileType(Buffer.from('%PDF-1.7'))?.mime).toBe('application/pdf');
  });

  it('rejects SVG and MIME/signature mismatches', () => {
    expect(validateAndNormalizeUpload({
      buffer: Buffer.from('<svg><script>alert(1)</script></svg>'),
      mimetype: 'image/svg+xml',
      originalname: '../bad.svg',
    }).error).toMatch(/Invalid file type/);

    expect(validateAndNormalizeUpload({
      buffer: Buffer.from('%PDF-1.7'),
      mimetype: 'image/png',
      originalname: 'fake.png',
    }).error).toMatch(/Invalid file type/);
  });

  it('normalizes an allowed attachment name', () => {
    const result = validateAndNormalizeUpload({
      buffer: Buffer.from('%PDF-1.7'),
      mimetype: 'application/pdf',
      originalname: '../../Project quote<script>.exe.pdf',
    });
    expect(result.file.originalname).toBe('Project-quote-script-exe.pdf');
  });
});
