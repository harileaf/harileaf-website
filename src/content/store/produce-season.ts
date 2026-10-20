/**
 * Seasonal copy for /produce (v2: Kesar mangoes, Mumbai MMR). Plain strings so
 * the claims-policy test can check them (tests/unit/content-claims.test.ts).
 * "Naturally ripened" is deliberately not used here: it's a conditional FSSAI
 * term that only the mango product page may use, backed by its evidenced claim.
 */
export const PRODUCE_SEASON = {
  eyebrow: 'In season',
  heading: 'Kesar mangoes from our farm',
  intro:
    'Kesar mangoes picked when mature and ripened in hay at the farm — never with calcium carbide, which FSSAI prohibits for ripening fruit. We deliver them within Mumbai MMR by express courier, so they reach you a day or two after they leave the farm.',
  howToTellHeading: 'How to tell a mango was ripened without carbide',
  howToTell: [
    'The skin ripens unevenly: patches of green and yellow are normal. A uniform, bright yellow skin with greenish flesh inside is a warning sign.',
    'It smells sweet and fruity at the stem end. No smell, or a sharp chemical smell, is not a good sign.',
    'The flesh is soft and ripe right up to the stone, not hard near the centre.',
    'Ripe mangoes yield slightly when pressed gently near the stem.',
  ],
  storage: 'Keep them at room temperature until they smell sweet and give slightly, then refrigerate and eat within 2–3 days.',
  outOfSeason: 'Out of season? Leave your email on the mango page and we’ll tell you once, when they’re ready.',
} as const;
