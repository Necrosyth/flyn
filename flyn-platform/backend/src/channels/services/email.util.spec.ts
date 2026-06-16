import {
  sanitizeEmailHtml,
  htmlToPreviewText,
  buildOwnMessageId,
  normalizeReferences,
  buildReplyReferences,
  normalizeSubject,
  deriveEmailThreadKey,
  ensureRePrefix,
  sanitizeAttachmentName,
  selectEmailAttachments,
  emailThreadConversationToken,
  extractEmailAddress,
  isValidEmailAddress,
  parseAddressList,
  addressObjectToEmails,
} from './email.util';

describe('sanitizeEmailHtml', () => {
  it('removes <script> and its contents', () => {
    const out = sanitizeEmailHtml('<p>hi</p><script>alert(1)</script>');
    expect(out).toContain('hi');
    expect(out).not.toContain('alert');
    expect(out).not.toContain('<script');
  });

  it('strips on*= event handlers', () => {
    const out = sanitizeEmailHtml('<img src="https://x/y.png" onerror="steal()" />');
    expect(out).not.toMatch(/onerror/i);
    expect(out).toContain('src="https://x/y.png"');
  });

  it('drops javascript: hrefs but keeps https links', () => {
    const out = sanitizeEmailHtml('<a href="javascript:evil()">x</a><a href="https://ok.com">ok</a>');
    expect(out).not.toMatch(/javascript:/i);
    expect(out).toContain('https://ok.com');
  });

  it('keeps formatting + adds safe rel/target on links', () => {
    const out = sanitizeEmailHtml('<b>bold</b> <a href="https://a.com">L</a>');
    expect(out).toContain('<b>bold</b>');
    expect(out).toMatch(/rel="noopener noreferrer nofollow"/);
    expect(out).toMatch(/target="_blank"/);
  });

  it('keeps inline data: images (common in real email) but not data: links', () => {
    const img = sanitizeEmailHtml('<img src="data:image/png;base64,AAAA" />');
    expect(img).toContain('data:image/png');
    const link = sanitizeEmailHtml('<a href="data:text/html,evil">x</a>');
    expect(link).not.toContain('data:text/html');
  });

  it('removes <iframe>/<form>/<object> entirely', () => {
    const out = sanitizeEmailHtml('<iframe src="https://x"></iframe><form action="x"><input></form><object></object>');
    expect(out).not.toMatch(/<iframe|<form|<object|<input/i);
  });

  it('is null-safe', () => {
    expect(sanitizeEmailHtml('')).toBe('');
    expect(sanitizeEmailHtml(undefined as any)).toBe('');
  });
});

describe('htmlToPreviewText', () => {
  it('flattens tags + decodes basic entities', () => {
    expect(htmlToPreviewText('<p>Hello&nbsp;<b>world</b>&amp;more</p>')).toBe('Hello world &more');
  });
  it('drops style/script blocks', () => {
    expect(htmlToPreviewText('<style>.a{}</style><p>keep</p>')).toBe('keep');
  });
  it('is null-safe', () => {
    expect(htmlToPreviewText(undefined as any)).toBe('');
  });
});

describe('buildOwnMessageId', () => {
  it('builds <flyn-token@domain> from the sender address', () => {
    expect(buildOwnMessageId('abc123', 'support@acme.com')).toBe('<flyn-abc123@acme.com>');
  });
  it('falls back to flyn.app when address has no domain', () => {
    expect(buildOwnMessageId('t', 'broken')).toBe('<flyn-t@flyn.app>');
  });
});

describe('normalizeReferences', () => {
  it('splits a space-separated string into ids', () => {
    expect(normalizeReferences('<a@x> <b@y>')).toEqual(['<a@x>', '<b@y>']);
  });
  it('passes an array through trimmed', () => {
    expect(normalizeReferences([' <a@x> ', '<b@y>'])).toEqual(['<a@x>', '<b@y>']);
  });
  it('returns [] for undefined', () => {
    expect(normalizeReferences(undefined)).toEqual([]);
  });
});

describe('buildReplyReferences', () => {
  it('appends the parent Message-ID to the chain, deduped, order preserved', () => {
    expect(buildReplyReferences(['<a@x>', '<b@y>'], '<c@z>')).toEqual(['<a@x>', '<b@y>', '<c@z>']);
  });
  it('does not duplicate an id already in the chain', () => {
    expect(buildReplyReferences(['<a@x>', '<c@z>'], '<c@z>')).toEqual(['<a@x>', '<c@z>']);
  });
  it('handles an empty parent chain', () => {
    expect(buildReplyReferences([], '<only@z>')).toEqual(['<only@z>']);
  });
});

describe('sanitizeAttachmentName', () => {
  it('strips path separators and leading dots (traversal-safe)', () => {
    const out = sanitizeAttachmentName('../../etc/my file.pdf');
    expect(out).not.toMatch(/[\\/]/);
    expect(out.startsWith('.')).toBe(false);
    expect(out.endsWith('my file.pdf')).toBe(true);
  });
  it('falls back to a name from the content type when filename is missing', () => {
    expect(sanitizeAttachmentName(undefined, 'image/png')).toBe('attachment.png');
  });
  it('falls back to .bin when nothing is known', () => {
    expect(sanitizeAttachmentName('', '')).toBe('attachment.bin');
  });
});

describe('selectEmailAttachments', () => {
  const buf = (n: number) => Buffer.alloc(n, 1);
  it('keeps real attachments with bytes', () => {
    const out = selectEmailAttachments([{ filename: 'a.pdf', contentType: 'application/pdf', size: 10, content: buf(10) }]);
    expect(out).toHaveLength(1);
  });
  it('drops zero-byte and oversized attachments', () => {
    const out = selectEmailAttachments([
      { filename: 'empty', size: 0, content: buf(0) },
      { filename: 'huge', size: 99 * 1024 * 1024, content: buf(1) },
    ]);
    expect(out).toHaveLength(0);
  });
  it('drops inline cid images with no filename', () => {
    const out = selectEmailAttachments([{ contentType: 'image/png', size: 10, content: buf(10), related: true }]);
    expect(out).toHaveLength(0);
  });
  it('is null-safe', () => {
    expect(selectEmailAttachments(undefined)).toEqual([]);
  });
});

describe('extractEmailAddress', () => {
  it('pulls the addr out of "Name <addr>"', () => {
    expect(extractEmailAddress('Jane Doe <jane@x.com>')).toBe('jane@x.com');
  });
  it('returns a bare address unchanged', () => {
    expect(extractEmailAddress('bob@y.com')).toBe('bob@y.com');
  });
});

describe('isValidEmailAddress', () => {
  it('accepts a bare address', () => { expect(isValidEmailAddress('a@b.com')).toBe(true); });
  it('accepts "Name <addr>"', () => { expect(isValidEmailAddress('A B <a@b.com>')).toBe(true); });
  it('rejects garbage', () => {
    expect(isValidEmailAddress('not-an-email')).toBe(false);
    expect(isValidEmailAddress('a@b')).toBe(false);
    expect(isValidEmailAddress('')).toBe(false);
  });
});

describe('parseAddressList', () => {
  it('splits a comma-separated string', () => {
    expect(parseAddressList('a@x.com, b@y.com')).toEqual(['a@x.com', 'b@y.com']);
  });
  it('splits a semicolon-separated string', () => {
    expect(parseAddressList('a@x.com; b@y.com')).toEqual(['a@x.com', 'b@y.com']);
  });
  it('accepts an array and preserves "Name <addr>" form', () => {
    expect(parseAddressList(['Jane <jane@x.com>', 'bob@y.com'])).toEqual(['Jane <jane@x.com>', 'bob@y.com']);
  });
  it('drops invalid entries instead of crashing', () => {
    expect(parseAddressList('good@x.com, garbage, , bad@')).toEqual(['good@x.com']);
  });
  it('de-dupes by bare email (case-insensitive)', () => {
    expect(parseAddressList('A@x.com, a@X.com')).toEqual(['A@x.com']);
  });
  it('returns [] for empty/undefined', () => {
    expect(parseAddressList(undefined)).toEqual([]);
    expect(parseAddressList('')).toEqual([]);
  });
});

describe('addressObjectToEmails', () => {
  it('maps a mailparser AddressObject to bare lowercase emails', () => {
    expect(addressObjectToEmails({ value: [{ address: 'A@X.com', name: 'A' }, { address: 'b@y.com' }] }))
      .toEqual(['a@x.com', 'b@y.com']);
  });
  it('is null-safe', () => {
    expect(addressObjectToEmails(undefined)).toEqual([]);
  });
});

describe('emailThreadConversationToken', () => {
  it('is colon-free (safe for the conversationId delimiter)', () => {
    expect(emailThreadConversationToken('ref:<a@x.com>')).not.toContain(':');
  });
  it('is deterministic for the same key', () => {
    expect(emailThreadConversationToken('ref:<a@x>')).toBe(emailThreadConversationToken('ref:<a@x>'));
  });
  it('differs for different keys', () => {
    expect(emailThreadConversationToken('ref:<a@x>')).not.toBe(emailThreadConversationToken('ref:<b@x>'));
  });
  it('is prefixed t_', () => {
    expect(emailThreadConversationToken('gm:123').startsWith('t_')).toBe(true);
  });
});

describe('ensureRePrefix', () => {
  it('adds Re: to a bare subject', () => {
    expect(ensureRePrefix('what is up my boy')).toBe('Re: what is up my boy');
  });
  it('does not stack on an existing Re:', () => {
    expect(ensureRePrefix('Re: what is up my boy')).toBe('Re: what is up my boy');
  });
  it('treats Fwd: as already-prefixed (no Re: stacking)', () => {
    expect(ensureRePrefix('Fwd: invoice')).toBe('Fwd: invoice');
  });
  it('falls back for an empty subject', () => {
    expect(ensureRePrefix('')).toBe('Re: Your message');
  });
});

describe('normalizeSubject', () => {
  it('strips stacked Re:/Fwd: prefixes', () => {
    expect(normalizeSubject('Re: Re: Fwd: Hello There')).toBe('hello there');
  });
  it('strips a bracketed count prefix', () => {
    expect(normalizeSubject('RE[2]: Invoice')).toBe('invoice');
  });
  it('leaves a clean subject (lowercased) alone', () => {
    expect(normalizeSubject('Order #42')).toBe('order #42');
  });
});

describe('deriveEmailThreadKey', () => {
  it('prefers the Gmail thread id', () => {
    expect(deriveEmailThreadKey({ gmThreadId: '177abc', references: ['<r@x>'], subject: 'Re: hi' })).toBe('gm:177abc');
  });
  it('falls back to the root of the References chain', () => {
    expect(deriveEmailThreadKey({ references: ['<root@x>', '<a@x>'], inReplyTo: '<a@x>', messageId: '<b@x>' })).toBe('ref:<root@x>');
  });
  it('uses In-Reply-To when there is no References chain', () => {
    expect(deriveEmailThreadKey({ inReplyTo: '<parent@x>', messageId: '<b@x>' })).toBe('ref:<parent@x>');
  });
  it('uses its own Message-ID when it is the chain root', () => {
    expect(deriveEmailThreadKey({ messageId: '<self@x>' })).toBe('ref:<self@x>');
  });
  it('falls back to normalized subject + sorted participants', () => {
    const k = deriveEmailThreadKey({ subject: 'Re: Support request', participants: ['B@x.com', 'a@x.com'] });
    expect(k).toBe('subj:support request|a@x.com,b@x.com');
  });
  it('is deterministic regardless of participant order', () => {
    const a = deriveEmailThreadKey({ subject: 'Hi', participants: ['x@a.com', 'y@b.com'] });
    const b = deriveEmailThreadKey({ subject: 'Hi', participants: ['y@b.com', 'x@a.com'] });
    expect(a).toBe(b);
  });
});
