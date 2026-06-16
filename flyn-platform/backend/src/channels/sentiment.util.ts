export type SentimentResult = {
  sentiment: 'positive' | 'neutral' | 'negative';
  sentimentScore: number; // -1.0 to +1.0
  keywords: string[];
};

const POSITIVE = new Set([
  'yes','yeah','great','perfect','excellent','wonderful','fantastic','amazing',
  'love','interested','absolutely','definitely','sure','happy','good','helpful',
  'thank','thanks','appreciate','awesome','brilliant','agree','exactly','right',
  'deal','sounds','understood','clear','excited','forward',
  'opportunity','benefit','value','solution','support','resolve','fixed','done',
]);

const NEGATIVE = new Set([
  'no','not','never','cancel','refund','angry','frustrated','expensive','costly',
  'problem','issue','complaint','terrible','awful','horrible','disgusting','hate',
  'wrong','broken','failed','error','bad','worst','useless','waste','disappoint',
  'unacceptable','ridiculous','impossible','confused','lost','stuck','waiting',
  'slow','delay','urgent','escalate','manager','lawsuit','scam','fraud','cheat',
]);

const TRACKED_KEYWORDS = [
  'issue','support','problem','service','billing','refund','cancel','payment',
  'account','urgent','error','broken','pricing','upgrade','downgrade','demo',
  'interested','schedule','callback','complaint','escalate','resolve',
];

export function analyzeSentiment(text: string): SentimentResult {
  const words = text.toLowerCase().replace(/[^a-z\s']/g, '').split(/\s+/);
  let pos = 0, neg = 0;
  const keywords: string[] = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const negated = i > 0 && (words[i-1] === 'not' || words[i-1] === "don't" ||
                               words[i-1] === "doesn't" || words[i-1] === 'never');
    if (POSITIVE.has(w)) negated ? neg++ : pos++;
    if (NEGATIVE.has(w)) negated ? pos++ : neg++;
    if (TRACKED_KEYWORDS.includes(w) && !keywords.includes(w)) keywords.push(w);
  }

  const total = pos + neg || 1;
  const score = (pos - neg) / total;
  const sentiment = score > 0.1 ? 'positive' : score < -0.1 ? 'negative' : 'neutral';
  return { sentiment, sentimentScore: parseFloat(score.toFixed(3)), keywords };
}
