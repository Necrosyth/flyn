// Pure, unit-tested intent detection for the AI voice loop. Used to let the AI end a call:
// detect end-intent → confirm once → on a "yes" hang up. Keyword/regex fast-path (low latency, no
// extra LLM round-trip); the single confirmation step makes a rare false positive harmless (the AI
// just asks "end the call now?" and continues if the caller says no). English + Hindi/Hinglish.

/**
 * True when the caller is asking to END the call. Deliberately does NOT trigger on a bare "thanks"
 * (too ambiguous mid-call) — only on explicit end phrases or "thank you, bye"-style combos.
 */
export function detectEndIntent(text: string): boolean {
  const t = (text || '').toLowerCase().trim();
  if (!t) return false;
  // Explicit end phrases (English).
  const en = /\b(bye|bye bye|goodbye|good bye|hang up|hangup|end (the )?call|cut the call|disconnect|that('?s| is) all|that'?ll be all|i'?m done|we'?re done|we are done|nothing else|no(thing)? more|talk (to you )?later|see you)\b/i;
  // "thank you / thanks" ONLY when paired with a leave-taking word → end; bare thanks does NOT end.
  const thanksBye = /\b(thank you|thanks|thank u|shukriya|dhanyavaad)\b[\s,.!]*\b(bye|goodbye|that('?s| is) all|done|good night|have a (good|nice) day)\b/i;
  // Hindi / Hinglish end phrases (spaces between words optional where natural).
  const hi = /(band ?kar ?(o|do|dijiye)?|call ?kaat ?(o|do)|phone ?rakh(ta|ti|o|do|na)|rakhta hoon|rakhti hoon|baat baad mein|bas (itna|ho gaya)|theek hai bye|chalta hoon|chalti hoon|alvida)/i;
  return en.test(t) || thanksBye.test(t) || hi.test(t);
}

/** True when the caller AFFIRMS (used to resolve the end-call confirmation). */
export function isAffirmative(text: string): boolean {
  const t = (text || '').toLowerCase().trim();
  if (!t) return false;
  return /\b(yes|yeah|yep|yup|sure|ok|okay|okey|alright|all right|please|go ahead|do it|end it|hang up|correct|right|confirm|affirmative)\b/i.test(t)
    || /(haan|han|ji|ji haan|haan ji|theek hai|thik hai|kar do|kardo|karo|bilkul|sahi|ha)/i.test(t);
}

/** True when the caller DECLINES (continue the call). */
export function isNegative(text: string): boolean {
  const t = (text || '').toLowerCase().trim();
  if (!t) return false;
  return /\b(no|nope|nah|not yet|don'?t|do not|wait|hold on|continue|keep going|stay|one more|actually)\b/i.test(t)
    || /(nahi|nahin|mat|ruk(o|iye)?|abhi nahi|rehne do)/i.test(t);
}
