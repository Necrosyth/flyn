import { detectEndIntent, isAffirmative, isNegative } from './call-intent.util';

describe('detectEndIntent', () => {
  it('detects explicit English end phrases', () => {
    for (const s of ['bye', 'bye bye', 'goodbye', 'please end the call', 'hang up', "that's all", "I'm done", 'we are done', 'nothing else', 'talk to you later']) {
      expect(detectEndIntent(s)).toBe(true);
    }
  });
  it('detects "thank you, bye" but NOT a bare thanks', () => {
    expect(detectEndIntent('thank you, bye')).toBe(true);
    expect(detectEndIntent('thanks that is all')).toBe(true);
    expect(detectEndIntent('thanks')).toBe(false);
    expect(detectEndIntent('thank you so much')).toBe(false);
  });
  it('detects Hindi/Hinglish end phrases', () => {
    for (const s of ['band karo', 'call kaat do', 'phone rakhta hoon', 'theek hai bye', 'alvida']) {
      expect(detectEndIntent(s)).toBe(true);
    }
  });
  it('does NOT end on normal conversation', () => {
    for (const s of ['tell me more', 'what is the price', 'I want to book', 'hello', 'can you help me']) {
      expect(detectEndIntent(s)).toBe(false);
    }
  });
  it('is empty-safe', () => {
    expect(detectEndIntent('')).toBe(false);
    expect(detectEndIntent(undefined as any)).toBe(false);
  });
});

describe('isAffirmative', () => {
  it('accepts English + Hindi yes', () => {
    for (const s of ['yes', 'yeah', 'sure', 'ok', 'okay', 'please', 'go ahead', 'haan', 'ji', 'theek hai', 'kar do']) {
      expect(isAffirmative(s)).toBe(true);
    }
  });
  it('rejects a no', () => {
    expect(isAffirmative('no')).toBe(false);
    expect(isAffirmative('nahi')).toBe(false);
  });
});

describe('isNegative', () => {
  it('accepts English + Hindi no/continue', () => {
    for (const s of ['no', 'nope', 'wait', 'continue', 'not yet', 'nahi', 'ruko', 'abhi nahi']) {
      expect(isNegative(s)).toBe(true);
    }
  });
  it('rejects a yes', () => {
    expect(isNegative('yes')).toBe(false);
    expect(isNegative('haan')).toBe(false);
  });
});
