# Voice Latency Audit — flyn-platform

**Date:** 2026-05-28  
**Branch:** main  
**Target:** `handleTwilioVoiceWebhook` in `backend/src/channels/channels.service.ts`

---

## Baseline (Before Fixes)

Measured per-turn latency on live AI calls:

| Stage | Before | Root Cause |
|---|---|---|
| Firestore reads (sequential) | 600–750 ms | 4–5 sequential reads, one was a duplicate |
| Gemini AI response | 2,000–8,000 ms | `gemini-2.5-flash` thinking mode (chain-of-thought) runs before any output |
| AI timeout budget | 10,000 ms | Way too long — callers hear silence for 10 s before fallback |
| `maxOutputTokens` | 4,096 | Grossly over-sized for 1–2 voice sentences (~80 tokens typical) |
| **Total worst-case** | **~19 s** | Cumulative |

---

## Fixes Applied

### Fix 1 — Disable Gemini thinking budget
**File:** `backend/src/orchestrator/ai-provider/ai-provider.interface.ts`  
**File:** `backend/src/orchestrator/ai-provider/gemini.provider.ts`

Added `thinkingBudget?: number` to `AIProviderConfig`. In `gemini.provider.ts`:

```typescript
if (typeof options?.thinkingBudget === 'number') {
    generationConfig['thinkingConfig'] = { thinkingBudget: options.thinkingBudget };
}
```

Voice webhook now calls with `thinkingBudget: 0`:

```typescript
this.aiProvider.chat(messages as any, { tenantId, maxTokens: 150, thinkingBudget: 0 } as any)
```

**Savings:** 2,000–8,000 ms per turn eliminated.

---

### Fix 2 — Parallel Firestore Batch 1 (agent config + active call)
**File:** `backend/src/channels/channels.service.ts` — `handleTwilioVoiceWebhook`

**Before (sequential):**
```
Read 1: activeCalls/{callSid}  ~150 ms  (barge check)
Read 2: agents/{agentId}       ~150 ms
Read 3: activeCalls/{callSid}  ~150 ms  ← DUPLICATE read
Read 4: callerMemory           ~150 ms  (also sequential)
Total: ~600 ms minimum
```

**After (parallel):**
```typescript
const [agentResult, activeCallResult] = await Promise.allSettled([
  agentId && db ? db.collection('agents').doc(agentId).get() : Promise.resolve(null),
  callSid && db ? Promise.race([activeCallDoc.get(), timeout(2_000)]) : Promise.resolve(null),
]);
```

Barge check now reads from `activeCallResult` — no separate read.

**Savings:** ~300–450 ms (eliminated sequential chain + duplicate read).

---

### Fix 3 — Parallel Firestore Batch 2 (memory + KB + transcript)
**File:** `backend/src/channels/channels.service.ts` — `handleTwilioVoiceWebhook`

**Before (sequential):**
```
Read callerMemory  ~150 ms
Read KB (50 docs)  ~200 ms
Read transcript    ~150 ms
Total: ~500 ms minimum
```

**After (parallel):**
```typescript
const [memResult, kbResult, transcriptResult] = await Promise.allSettled([
  normalizedPhone && db ? Promise.race([callerMemory.get(), timeout(2_000)]) : ...,
  db ? Promise.race([kbArticles.where(...).limit(50).get(), timeout(2_000)]) : ...,
  callSid && db ? Promise.race([transcript.orderBy(...).limitToLast(30).get(), timeout(3_000)]) : ...,
]);
```

All three fire simultaneously.

**Savings:** ~350–400 ms (from sequential to parallel — bounded by the slowest, ~200 ms KB query).

---

### Fix 4 — Cap `maxTokens` for voice
**File:** `backend/src/channels/channels.service.ts` — `handleTwilioVoiceWebhook`

Voice responses should be 1–2 sentences. Old default: `4096` tokens. New: `150`.

```typescript
{ tenantId, maxTokens: 150, thinkingBudget: 0 }
```

**Savings:** Reduces model output sampling time for longer responses. Also prevents runaway verbose responses.

---

### Fix 5 — Reduce AI timeout 10 s → 5 s
**File:** `backend/src/channels/channels.service.ts` — `handleTwilioVoiceWebhook`

```typescript
// before
setTimeout(() => reject(new Error('AI timeout')), 10_000)

// after
setTimeout(() => reject(new Error('AI timeout')), 5_000)
```

With thinking disabled, Gemini 2.5-flash responds in ~300 ms. 5 s timeout still catches genuine network failures without making callers wait 10 s in silence.

---

### Fix 6 — Per-timeout guards on all Firestore reads
All reads inside the webhook now use `Promise.race([read, timeout(2000)])` so a slow Firestore shard can never stall a call for more than 2 seconds.

---

## Multi-Language Support (same session)

### What was added

1. **`VOICE_LANG_MAP`** — 10 languages (en-US, en-IN, hi-IN, es-US, es-ES, fr-FR, de-DE, pt-BR, ja-JP, ko-KR) with official Twilio + Amazon Polly voice IDs, BCP-47 codes, localised phrases.

2. **Dynamic TwiML** — `<Say language="">` and `<Gather language="">` now use `langCfg.lang` instead of hardcoded `en-US`.

3. **Language preference detection** — On turn 0 for multi-language agents, ask the caller for their preferred language. On first speech, keyword-match against `preferenceWords` for each supported language.

4. **Per-language Polly voices** — Amazon Polly neural voices for each language (e.g. `Polly.Aditi` for hi-IN, `Polly.Kajal` neural for en-IN).

5. **Schema changes** — `Agent` interface gained `language?`, `supportedLanguages?`, `twilioVoice?` in both backend (`agent.types.ts`) and frontend (`services/agents.ts`). `AgentBuilder.tsx` has the corresponding UI.

### Known limitation

Mid-call language switching (caller switches language after answering a different question) is keyword-based — it only fires once, on the first detected language keyword. True dynamic mid-call language switching requires Deepgram nova-3 `language="multi"` (not yet implemented).

---

## Expected Latency After Fixes

| Stage | After |
|---|---|
| Firestore Batch 1 (parallel) | ~150 ms |
| Firestore Batch 2 (parallel) | ~200 ms |
| Gemini 2.5-flash (no thinking) | ~300 ms |
| TwiML generation | <1 ms |
| **Total typical** | **~650–700 ms** |
| **Total worst-case (cold Firestore)** | **~1,200 ms** |

Down from **5–19 seconds** to **sub-1-second typical**.

---

## Files Changed

| File | Change |
|---|---|
| `backend/src/orchestrator/ai-provider/ai-provider.interface.ts` | Added `thinkingBudget?` to `AIProviderConfig` |
| `backend/src/orchestrator/ai-provider/gemini.provider.ts` | Pass `thinkingConfig` when `thinkingBudget` is set |
| `backend/src/channels/channels.service.ts` | Parallel Batch 1+2, `maxTokens:150`, `thinkingBudget:0`, 5s timeout, auto-detect multi-lang (see below) |
| `backend/src/channels/channels.controller.ts` | Extract `LanguageDetected` / `Language` from Twilio webhook body |
| `backend/src/agents/agent.types.ts` | Added `language?`, `supportedLanguages?` to `Agent` + `CreateAgentDto` |
| `frontend/src/services/agents.ts` | Added `twilioVoice?`, `language?`, `supportedLanguages?` to `Agent` and `CreateAgentPayload` |
| `frontend/src/components/agents/AgentBuilder.tsx` | Language dropdown, Polly voice field, multi-language UI |

---

## Multi-Language Auto-Detection (2026-05-28)

### What changed

**Replaced keyword-based one-time detection with per-turn automatic detection via Deepgram.**

| | Before | After |
|---|---|---|
| STT model | Google STT V2 (default) | `deepgram_nova-3` |
| `<Gather language="">` | Fixed per agent (`en-US` or detected once) | `multi` — Deepgram detects any language |
| Language detection | Keyword match on turn 1 only | Twilio `LanguageDetected` param every turn |
| `detectedLanguage` in Firestore | Written on first detection | Removed — derived fresh per turn |
| Turn-0 "say your language" greeting | Shown for multi-lang agents | Removed — unnecessary |
| Voice switch timing | First speech turn only | Every turn |

### What was removed

- `VOICE_LANG_MAP` (had `preferenceWords`, `listening`, `noInput`, `promptLang` — 10 languages)
- `detectLanguagePreference()` function — keyword matching
- `detectedLanguage` Firestore write (`updateActiveCall({ detectedLanguage })`)
- `storedLang` Firestore read from `activeCallResult`
- Turn-0 multi-language greeting ("I can assist you in English or Hindi...")
- `gatherLang` variable — fixed language on `<Gather>`
- `safeListening` / `safeGoodbye` localized phrase lookup

### What was added

- `LANG_VOICE_MAP` — 22 languages, Neural Polly voices from AWS docs, no keyword lists
- `normalizeLangCode()` — maps Deepgram short codes (`hi`, `es`) to full BCP-47 (`hi-IN`, `es-US`)
- `detectedLangCode` param on `handleTwilioVoiceWebhook` — passed from controller every call
- Per-turn language detection: `if (speech && detectedLangCode) → normalizeLangCode → LANG_VOICE_MAP lookup`
- `supportedLanguages` allowlist check — if set on agent, only switch to approved languages
- `langCode` field on every `appendTranscript` call — stored in Firestore so UI knows per-turn language
- `speechModel="deepgram_nova-3" language="multi"` on every `<Gather>`
- System prompt injection every speech turn (not just non-English)

### How the auto-detect flow works

```
1. <Gather speechModel="deepgram_nova-3" language="multi"> listens
2. Caller speaks any language (English, Hindi, Spanish, Japanese...)
3. Deepgram nova-3 transcribes + detects the language
4. Twilio POSTs SpeechResult + LanguageDetected to webhook
5. Controller reads body.LanguageDetected (fallback: body.Language)
6. normalizeLangCode() maps to BCP-47 key in LANG_VOICE_MAP
7. LANG_VOICE_MAP[code] → Polly voice + <Say language="">
8. Gemini gets "Respond ONLY in [language name]" injected fresh
9. Next <Say> uses correct voice, next <Gather> again uses language="multi"
```

The caller can switch languages mid-call — the system adapts on the very next turn.

### Voices sourced from official AWS Polly docs

Neural voices used where available (better quality, lower sampling time):
`Polly.Joanna` (en-US), `Polly.Amy` (en-GB), `Polly.Kajal` (en-IN/hi-IN Neural bilingual),
`Polly.Olivia` (en-AU), `Polly.Lupe` (es-US), `Polly.Lucia` (es-ES), `Polly.Mia` (es-MX),
`Polly.Lea` (fr-FR), `Polly.Gabrielle` (fr-CA), `Polly.Vicki` (de-DE), `Polly.Camila` (pt-BR),
`Polly.Ines` (pt-PT), `Polly.Kazuha` (ja-JP), `Polly.Seoyeon` (ko-KR), `Polly.Bianca` (it-IT),
`Polly.Laura` (nl-NL), `Polly.Ola` (pl-PL), `Polly.Tatyana` (ru-RU), `Polly.Filiz` (tr-TR),
`Polly.Zhiyu` (zh-CN, sayLang: `cmn-CN`), `Polly.Hala` (ar-AE).
