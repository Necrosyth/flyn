// ─────────────────────────────────────────────
// ComparisonPage.tsx
// Full deployment-ready comparison page for FLYN.
// Data is fetched from /api/admin/comparison and
// falls back to static defaults.
//
// Usage (inject into your router):
//   import ComparisonPage from '@/components/ComparisonPage';
//   <Route path="/compare" element={<ComparisonPage />} />
//
// Or with externally supplied data (e.g. SSR / SSG):
//   <ComparisonPage data={serverData} />
// ─────────────────────────────────────────────

import React, { memo } from 'react';
import type { FC } from 'react';
import type {
  ComparisonPageData,
  CellValue,
  Competitor,
  FeatureCategory,
} from '../../types/comparison.types';
import { useComparisonData } from '../../hooks/useComparisonData';
import { LandingHeader } from '../landing/LandingHeader';
import { LandingFooter } from '../landing/LandingFooter';
import styles from './ComparisonPage.module.css';

// ── Props ─────────────────────────────────────
interface ComparisonPageProps {
  /** Pass pre-fetched data (e.g. from SSR) to skip the API call. */
  data?: ComparisonPageData;
}

// ── Cell renderer ─────────────────────────────
const Cell: FC<{ value: CellValue }> = memo(({ value }) => {
  switch (value.type) {
    case 'yes':
      return <span className={styles.cellYes} title="Native FLYN feature">✦</span>;
    case 'check':
      return <span className={styles.cellCheck} title="Available">✓</span>;
    case 'no':
      return <span className={styles.cellNo} title="Not available">✗</span>;
    case 'partial':
      return <span className={styles.cellPartial} title={value.label}>{value.label}</span>;
    case 'price':
      return (
        <>
          <span className={styles.priceVal}>{value.value}</span>
          <span className={styles.priceSub}>{value.sub}</span>
        </>
      );
  }
});
Cell.displayName = 'Cell';

// ── Table ─────────────────────────────────────
interface ComparisonTableProps {
  competitors: Competitor[];
  categories: FeatureCategory[];
}

const ComparisonTable: FC<ComparisonTableProps> = memo(({ competitors, categories }) => (
  <div className={styles.tableWrap}>
    <table className={styles.compTable}>
      <thead>
        <tr>
          <th className={styles.thEmpty} />
          {/* FLYN column */}
          <th className={styles.thFlyn}>
            🚀 FLYN
            <span className={styles.thFlynSub}>from $49.99/mo</span>
          </th>
          {/* Competitor columns */}
          {competitors.map(c => (
            <th key={c.id} className={styles.thComp}>
              {c.name}
              <span className={styles.thCompSub}>{c.startingPrice} {c.pricingNote}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {categories.map(cat => (
          <React.Fragment key={cat.id}>
            {/* Category header row */}
            <tr className={styles.trCat}>
              <td>{cat.emoji} {cat.label}</td>
              <td className={styles.tdFlyn} />
              {competitors.map(c => <td key={c.id} />)}
            </tr>
            {/* Feature rows */}
            {cat.rows.map(row => (
              <tr key={row.id} className={styles.trFeat}>
                <td className={styles.tdFeature}>{row.label}</td>
                <td className={styles.tdFlyn}>
                  <Cell value={row.values['flyn'] ?? { type: 'no' }} />
                </td>
                {competitors.map(c => (
                  <td key={c.id} className={styles.tdComp}>
                    <Cell value={row.values[c.id] ?? { type: 'no' }} />
                  </td>
                ))}
              </tr>
            ))}
          </React.Fragment>
        ))}

        {/* Entry price summary row */}
        <tr className={styles.trPrice}>
          <td className={styles.tdFeature}>Entry price / billing model</td>
          <td className={`${styles.tdFlyn} ${styles.trPrice}`}>
            <span className={`${styles.priceVal} ${styles.priceValFlyn}`}>$49.99</span>
            <span className={`${styles.priceSub} ${styles.priceSubFlyn}`}>per workspace / flat</span>
          </td>
          {competitors.map(c => (
            <td key={c.id} className={styles.tdComp}>
              <span className={`${styles.priceVal} ${styles.priceValComp}`}>{c.startingPrice}</span>
              <span className={styles.priceSub}>{c.pricingNote}</span>
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  </div>
));
ComparisonTable.displayName = 'ComparisonTable';

// ── Main page component ───────────────────────
const ComparisonPage: FC<ComparisonPageProps> = ({ data: propData }) => {
  const { data: fetchedData, isLoading } = useComparisonData();
  const d = propData ?? fetchedData;

  if (isLoading && !propData) {
    return (
      <>
        <LandingHeader />
        <div className={styles.page}>
          <div className={styles.loadingWrap}>Loading comparison data…</div>
        </div>
        <LandingFooter />
      </>
    );
  }

  const {
    hero, winCards, competitors, categories,
    pricingCards, uniqueFeatures, cta, footerNote,
  } = d;

  return (
    <>
    <LandingHeader />
    <main className={styles.page}>

      {/* ── HERO ── */}
      <section className={styles.hero} aria-label="Hero">
        <div className={styles.heroInner}>
          <p className={styles.heroEyebrow}>{hero.eyebrow}</p>
          <h1 className={styles.heroH1}>
            {hero.heading}{' '}
            <span className={styles.heroAccent}>{hero.headingAccent}</span>
          </h1>
          <p className={styles.heroSub}>{hero.subheading}</p>
          <div className={styles.heroChips} role="list" aria-label="Competitors compared">
            {hero.chips.map((chip, i) => (
              <span
                key={i}
                role="listitem"
                className={[
                  styles.chip,
                  chip.isFlyn      ? styles.chipFlyn : '',
                  chip.isSeparator ? styles.chipSep  : '',
                ].filter(Boolean).join(' ')}
              >
                {chip.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHY FLYN WINS ── */}
      <section className={styles.section} aria-label="Why FLYN wins">
        <p className={styles.sectionLabel}>Why FLYN wins</p>
        <div className={styles.winGrid}>
          {winCards.map(card => (
            <div key={card.id} className={styles.winCard}>
              <div className={styles.winIcon} style={{ background: card.iconBg }}>
                {card.emoji}
              </div>
              <h3>{card.title}</h3>
              <p>{card.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── COMPARISON TABLE ── */}
      <section className={styles.section} aria-label="Feature comparison table">
        <p className={styles.sectionLabel}>Feature-by-feature comparison</p>
        <ComparisonTable competitors={competitors} categories={categories} />
      </section>

      {/* ── PRICING CALLOUT ── */}
      <section className={styles.section} aria-label="10-user team cost comparison">
        <p className={styles.sectionLabel}>10-user team cost comparison (monthly)</p>
        <div className={styles.pricingGrid}>
          {pricingCards.map(card => (
            <div
              key={card.id}
              className={[
                styles.pricingCard,
                card.highlight ? styles.pricingCardHighlight : '',
              ].filter(Boolean).join(' ')}
            >
              <p className={[styles.pBrand, card.highlight ? styles.pBrandLight : ''].join(' ')}>
                {card.brand}
              </p>
              <p className={[styles.pPrice, card.highlight ? styles.pPriceLight : ''].join(' ')}>
                {card.price}
              </p>
              <p className={[styles.pNote, card.highlight ? styles.pNoteLight : ''].join(' ')}>
                {card.note}
              </p>
              <span className={[
                styles.pTag,
                card.highlight ? styles.pTagGreenDark : styles.pTagGray,
              ].join(' ')}>
                {card.tag}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── ONLY ON FLYN ── */}
      <section className={styles.section} aria-label="Features only available on FLYN">
        <p className={styles.sectionLabel}>Only available on FLYN</p>
        <div className={styles.uniqueGrid}>
          {uniqueFeatures.map(feat => (
            <div key={feat.id} className={styles.uniqueCard}>
              <div className={styles.uniqueDot} aria-hidden="true" />
              <div>
                <h4>{feat.title}</h4>
                <p>{feat.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <div className={styles.ctaSection} aria-label="Call to action">
        <div className={styles.ctaLeft}>
          <h2>{cta.heading}</h2>
          <p>{cta.subheading}</p>
        </div>
        <div className={styles.ctaBtns}>
          <a href={cta.primaryHref} className={styles.btnPrimary}>
            {cta.primaryLabel}
          </a>
          <a href={cta.secondaryHref} className={styles.btnSecondary}>
            {cta.secondaryLabel}
          </a>
        </div>
      </div>

      {/* ── FOOTER NOTE ── */}
      <p className={styles.footerNote}>{footerNote}</p>

    </main>
    <LandingFooter />
    </>
  );
};

export default ComparisonPage;
