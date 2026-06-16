// ─────────────────────────────────────────────
// comparison.types.ts
// All types for the FLYN Comparison page.
// Data is fetched from /api/admin/comparison and
// falls back to comparison.data.ts defaults.
// ─────────────────────────────────────────────

export type CellValue =
  | { type: 'yes' }            // Native FLYN feature
  | { type: 'check' }          // Competitor has it
  | { type: 'no' }             // Not available
  | { type: 'partial'; label: string }  // Add-on / limited
  | { type: 'price'; value: string; sub: string };

export interface Competitor {
  id: string;
  name: string;
  startingPrice: string;
  pricingNote: string;
}

export interface FeatureRow {
  id: string;
  label: string;
  /** keyed by competitor id, plus 'flyn' */
  values: Record<string, CellValue>;
}

export interface FeatureCategory {
  id: string;
  emoji: string;
  label: string;
  rows: FeatureRow[];
}

export interface WinCard {
  id: string;
  emoji: string;
  iconBg: string;
  title: string;
  description: string;
}

export interface PricingCard {
  id: string;
  brand: string;
  price: string;
  note: string;
  tag: string;
  highlight?: boolean;
}

export interface UniqueFeature {
  id: string;
  title: string;
  description: string;
}

export interface HeroChip {
  label: string;
  isFlyn?: boolean;
  isSeparator?: boolean;
}

export interface CTAConfig {
  heading: string;
  subheading: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
}

export interface ComparisonPageData {
  hero: {
    eyebrow: string;
    heading: string;
    headingAccent: string;
    subheading: string;
    chips: HeroChip[];
  };
  winCards: WinCard[];
  competitors: Competitor[];
  categories: FeatureCategory[];
  pricingCards: PricingCard[];
  uniqueFeatures: UniqueFeature[];
  cta: CTAConfig;
  footerNote: string;
  lastUpdated?: string;
}
