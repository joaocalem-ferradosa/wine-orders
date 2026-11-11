// Promo rules shared by the page (classic <script>) and the checkout Worker (side-effect import).
(function (root) {
  const PROMOS = {
    TECA: {
      code: 'TECA',
      expiresAt: Date.UTC(2027, 0, 1), // exclusive; Lisbon is UTC+0 in winter
      tiers: [2, 6], // min boxes in the whole order
      percentOff: {
        'ferro-branco': [5, 10],
        'ferro-tinto': [5, 10],
        rose: [10, 20],
        branco: [20, 30],
        quinta: [10, 20],
        tinto: [20, 30],
      },
    },
  };

  function findPromo(code, now = Date.now()) {
    if (typeof code !== 'string') return null;
    const promo = PROMOS[code.trim().toUpperCase()];
    return promo && now < promo.expiresAt ? promo : null;
  }

  function promoTier(promo, totalBoxes) {
    if (!promo) return -1;
    let tier = -1;
    promo.tiers.forEach((min, i) => { if (totalBoxes >= min) tier = i; });
    return tier;
  }

  const boxCents = (perBottleEur) => Math.round(perBottleEur * 600);
  const perBoxDiscount = (cents, pct) => Math.round((cents * pct) / 100);
  const discountedBottleCents = (cents, pct) => Math.round((cents - perBoxDiscount(cents, pct)) / 6);
  // Same as the order desk's applyDiscount: round the amount retained on the whole line.
  const lineDiscount = (lineCents, pct) => lineCents - Math.round((lineCents * (10000 - pct * 100)) / 10000);
  const pctFor = (promo, id, tier) =>
    promo && tier >= 0 ? ((promo.percentOff[id] || [])[tier] || 0) : 0;

  function priceLines(promo, lines, tier) {
    return lines.map((l) => {
      const pct = pctFor(promo, l.id, tier);
      const perBoxDiscountCents = perBoxDiscount(l.boxCents, pct);
      return { ...l, pct, perBoxDiscountCents, lineDiscountCents: lineDiscount(l.boxCents * l.qty, pct) };
    });
  }

  function quotePromo(promo, lines) {
    const totalBoxes = lines.reduce((n, l) => n + l.qty, 0);
    const subtotalCents = lines.reduce((s, l) => s + l.boxCents * l.qty, 0);
    const tier = promoTier(promo, totalBoxes);
    const priced = priceLines(promo, lines, tier);
    const discountCents = priced.reduce((s, l) => s + l.lineDiscountCents, 0);

    let next = null;
    if (promo && tier < promo.tiers.length - 1) {
      const minBoxes = promo.tiers[tier + 1];
      next = {
        minBoxes,
        boxesNeeded: minBoxes - totalBoxes,
        discountCents: priceLines(promo, lines, tier + 1).reduce((s, l) => s + l.lineDiscountCents, 0),
      };
    }
    return { totalBoxes, tier, subtotalCents, discountCents, totalCents: subtotalCents - discountCents, lines: priced, next };
  }

  Object.assign(root, { PROMOS, findPromo, promoTier, boxCents, discountedBottleCents, quotePromo });
})(globalThis);
