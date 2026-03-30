// ─── XP / Level formula ───────────────────────────────────
// Level thresholds use a quadratic curve so early levels are
// quick to reach and higher levels require significantly more XP.
//
// Formula: XP needed to reach level N = 100 * N^2 + 50 * N
//
// Examples:
//   Level 1  →    150 XP
//   Level 5  →  2,750 XP
//   Level 10 → 10,500 XP
//   Level 20 → 41,000 XP
//   Level 50 → 252,500 XP

/**
 * Total XP required to reach a given level from level 0.
 * @param {number} level
 * @returns {number}
 */
function xpForLevel(level) {
  if (level <= 0) return 0;
  return 100 * level * level + 50 * level;
}

/**
 * Calculate what level a given total XP corresponds to.
 * Iterates upward until the next level threshold is not met.
 * @param {number} xp
 * @returns {number}
 */
function calculateLevel(xp) {
  let level = 0;
  while (xp >= xpForLevel(level + 1)) {
    level++;
  }
  return level;
}

/**
 * Calculate XP progress toward the next level.
 * Returns current XP within the current level band and total
 * XP needed for that band — useful for progress bars.
 *
 * @param {number} totalXp
 * @returns {{ level: number, current: number, needed: number, percent: number }}
 */
function xpProgress(totalXp) {
  const level       = calculateLevel(totalXp);
  const currentFloor = xpForLevel(level);
  const nextCeiling  = xpForLevel(level + 1);

  const current = totalXp - currentFloor;
  const needed  = nextCeiling - currentFloor;
  const percent = Math.floor((current / needed) * 100);

  return { level, current, needed, percent };
}

/**
 * Build a simple text-based progress bar.
 * @param {number} percent  0–100
 * @param {number} length   number of characters wide
 * @returns {string}  e.g. "████████░░░░░░░░░░░░ 40%"
 */
function progressBar(percent, length = 20) {
  const filled = Math.round((percent / 100) * length);
  const empty  = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty) + ` ${percent}%`;
}

/**
 * Format a large XP number for display.
 * @param {number} xp
 * @returns {string}  e.g. 12500 → "12,500"
 */
function formatXp(xp) {
  return xp.toLocaleString('en-GB');
}

module.exports = {
  xpForLevel,
  calculateLevel,
  xpProgress,
  progressBar,
  formatXp,
};