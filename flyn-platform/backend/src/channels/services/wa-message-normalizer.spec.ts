import { normalizeWaMessage, waTimestampMs } from './wa-message-normalizer';

describe('waTimestampMs', () => {
  it('converts Unix seconds (number) to ms', () => {
    expect(waTimestampMs(1_700_000_000)).toBe(1_700_000_000_000);
  });
  it('converts a string seconds value to ms', () => {
    expect(waTimestampMs('1700000000')).toBe(1_700_000_000_000);
  });
  it('converts a protobuf Long ({low}) seconds value to ms', () => {
    expect(waTimestampMs({ low: 1_700_000_000, high: 0, unsigned: false })).toBe(1_700_000_000_000);
  });
  it('passes through values already in ms', () => {
    expect(waTimestampMs(1_700_000_000_000)).toBe(1_700_000_000_000);
  });
  it('falls back to now() when absent', () => {
    const before = Date.now();
    const v = waTimestampMs(undefined);
    expect(v).toBeGreaterThanOrEqual(before);
  });
});

describe('normalizeWaMessage', () => {
  it('keeps an inbound text message (fromMe=false)', () => {
    const n = normalizeWaMessage({
      key: { remoteJid: '919876543210@s.whatsapp.net', id: 'ABC', fromMe: false },
      message: { conversation: 'hello' },
      messageTimestamp: 1_700_000_000,
      pushName: 'Hardik',
    });
    expect(n).toMatchObject({ fromMe: false, fromPhone: '919876543210', text: 'hello', msgId: 'ABC', timestampMs: 1_700_000_000_000, pushName: 'Hardik' });
  });

  it('preserves fromMe (our own message synced from the phone) — NEVER drops it', () => {
    const n = normalizeWaMessage({
      key: { remoteJid: '919876543210@s.whatsapp.net', id: 'ME1', fromMe: true },
      message: { extendedTextMessage: { text: 'my reply' } },
      messageTimestamp: 1_700_000_500,
    });
    expect(n?.fromMe).toBe(true);
    expect(n?.text).toBe('my reply');
    expect(n?.fromPhone).toBe('919876543210');
  });

  it('resolves a LID via remoteJidAlt to the real phone', () => {
    const n = normalizeWaMessage({
      key: { remoteJid: '201348201095214@lid', remoteJidAlt: '919876543210@s.whatsapp.net', id: 'L1', fromMe: false },
      message: { conversation: 'hi from lid' },
      messageTimestamp: 1_700_000_000,
    });
    expect(n?.fromPhone).toBe('919876543210'); // NOT the LID 201348201095214
  });

  it('uses caller-resolved JID when provided', () => {
    const n = normalizeWaMessage(
      { key: { remoteJid: '201348201095214@lid', id: 'L2', fromMe: false }, message: { conversation: 'x' }, messageTimestamp: 1 },
      '919876543210@s.whatsapp.net',
    );
    expect(n?.fromPhone).toBe('919876543210');
  });

  it('renders a media message with a caption placeholder', () => {
    const n = normalizeWaMessage({
      key: { remoteJid: '919876543210@s.whatsapp.net', id: 'IMG', fromMe: false },
      message: { imageMessage: { caption: 'look' } },
      messageTimestamp: 1_700_000_000,
    });
    expect(n?.hasMedia).toBe(true);
    expect(n?.mediaType).toBe('image');
    expect(n?.text).toBe('[Image] look');
  });

  it('renders media without a caption as a type placeholder', () => {
    const n = normalizeWaMessage({
      key: { remoteJid: '919876543210@s.whatsapp.net', id: 'IMG2', fromMe: false },
      message: { imageMessage: {} },
      messageTimestamp: 1,
    });
    expect(n?.text).toBe('[Image]');
  });

  it('skips group messages (returns null)', () => {
    expect(normalizeWaMessage({ key: { remoteJid: '12345-678@g.us', id: 'G', fromMe: false }, message: { conversation: 'hi' } })).toBeNull();
  });

  it('skips status broadcasts', () => {
    expect(normalizeWaMessage({ key: { remoteJid: 'status@broadcast', id: 'S', fromMe: true }, message: { conversation: 'x' } })).toBeNull();
  });

  it('skips a message with no renderable content', () => {
    expect(normalizeWaMessage({ key: { remoteJid: '919876543210@s.whatsapp.net', id: 'E', fromMe: false }, message: {} })).toBeNull();
  });
});
