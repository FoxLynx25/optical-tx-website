/**
 * Diagnostics collector - measures and records timing data
 */

export class Diagnostics {
  constructor() {
    this.reset();
  }

  /**
   * Reset all collected data
   */
  reset() {
    this.transitions = [];
    this.frameDrops = 0;
    this.startTime = null;
    this.endTime = null;
    this.expectedSymbolDuration = null;
    this.totalSymbols = 0;
  }

  /**
   * Start a new transmission recording
   * @param {number} expectedSymbolDuration - Expected ms per symbol
   * @param {number} totalSymbols - Total symbols to transmit
   */
  startTransmission(expectedSymbolDuration, totalSymbols) {
    this.reset();
    this.expectedSymbolDuration = expectedSymbolDuration;
    this.totalSymbols = totalSymbols;
    this.startTime = performance.now();
  }

  /**
   * Record a symbol transition
   * @param {number} symbolIndex - Index of the symbol
   * @param {number} bitValue - The bit value (0 or 1)
   * @param {number} actualTime - Actual timestamp from performance.now()
   * @param {number} expectedTime - Expected timestamp
   */
  recordTransition(symbolIndex, bitValue, actualTime, expectedTime) {
    const drift = actualTime - expectedTime;
    this.transitions.push({
      index: symbolIndex,
      bit: bitValue,
      actual: actualTime,
      expected: expectedTime,
      drift: drift
    });
  }

  /**
   * Record a detected frame drop
   */
  recordFrameDrop() {
    this.frameDrops++;
  }

  /**
   * End transmission recording
   */
  endTransmission() {
    this.endTime = performance.now();
  }

  /**
   * Calculate timing statistics
   * @returns {object} Statistics summary
   */
  getStatistics() {
    if (this.transitions.length === 0) {
      return null;
    }

    const drifts = this.transitions.map(t => t.drift);
    const absDrifts = drifts.map(d => Math.abs(d));

    const sum = drifts.reduce((a, b) => a + b, 0);
    const mean = sum / drifts.length;

    const maxDrift = Math.max(...absDrifts);
    const minDrift = Math.min(...drifts);
    const maxDriftPositive = Math.max(...drifts);

    // Standard deviation
    const squaredDiffs = drifts.map(d => Math.pow(d - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / drifts.length;
    const stdDev = Math.sqrt(variance);

    const totalDuration = this.endTime - this.startTime;
    const actualBitRate = (this.totalSymbols / totalDuration) * 1000;

    return {
      totalSymbols: this.totalSymbols,
      totalDurationMs: totalDuration.toFixed(2),
      expectedDurationMs: (this.totalSymbols * this.expectedSymbolDuration).toFixed(2),
      actualBitRate: actualBitRate.toFixed(2),
      expectedBitRate: (1000 / this.expectedSymbolDuration).toFixed(2),
      frameDrops: this.frameDrops,
      timing: {
        meanDriftMs: mean.toFixed(3),
        maxAbsDriftMs: maxDrift.toFixed(3),
        stdDevMs: stdDev.toFixed(3),
        minDriftMs: minDrift.toFixed(3),
        maxDriftMs: maxDriftPositive.toFixed(3)
      }
    };
  }

  /**
   * Export full diagnostics data as JSON
   * @returns {string} JSON string
   */
  exportJSON() {
    return JSON.stringify({
      summary: this.getStatistics(),
      transitions: this.transitions,
      metadata: {
        startTime: this.startTime,
        endTime: this.endTime,
        expectedSymbolDuration: this.expectedSymbolDuration
      }
    }, null, 2);
  }

  /**
   * Analyze whether the preamble was transmitted with reliable timing.
   * Uses inter-symbol intervals to detect frame drops and jitter that would
   * prevent the receiver from locking on.
   * @param {number} symbolDuration - Expected ms per symbol
   * @returns {object} Analysis result
   */
  analyzePreambleQuality(symbolDuration) {
    // Preamble occupies symbols 1..16 (symbol 0 is the start bit)
    const PREAMBLE_OFFSET = 1;
    const PREAMBLE_LENGTH = 16;
    const preambleEnd = PREAMBLE_OFFSET + PREAMBLE_LENGTH;

    if (this.transitions.length < preambleEnd) {
      return { ok: null, verdict: 'Not enough symbols to analyze preamble', maxDeviationPct: 0, faults: 0 };
    }

    let maxDeviationMs = 0;
    let faultCount = 0;
    const faultDetails = [];

    for (let i = PREAMBLE_OFFSET + 1; i < preambleEnd; i++) {
      const interval = this.transitions[i].actual - this.transitions[i - 1].actual;
      const deviationMs = Math.abs(interval - symbolDuration);
      const deviationPct = (deviationMs / symbolDuration) * 100;

      if (deviationMs > maxDeviationMs) maxDeviationMs = deviationMs;

      if (deviationPct > 40) {
        faultCount++;
        faultDetails.push(`bit ${i}: ${interval.toFixed(1)}ms instead of ${symbolDuration.toFixed(1)}ms (+${deviationPct.toFixed(0)}%)`);
      }
    }

    const maxDeviationPct = (maxDeviationMs / symbolDuration) * 100;
    const ok = faultCount === 0 && this.frameDrops === 0;
    const warn = !ok && faultCount === 0 && this.frameDrops <= 1 && maxDeviationPct < 40;

    let verdict;
    if (ok) {
      verdict = `TIMING OK — max deviation ${maxDeviationPct.toFixed(1)}% of symbol period`;
    } else if (warn) {
      verdict = `TIMING MARGINAL — ${this.frameDrops} frame drop(s), max deviation ${maxDeviationPct.toFixed(1)}%`;
    } else {
      verdict = `TIMING FAULT — ${faultCount} preamble bit(s) out of range, ${this.frameDrops} frame drop(s), max deviation ${maxDeviationPct.toFixed(1)}%`;
    }

    return { ok, warn, verdict, maxDeviationPct: maxDeviationPct.toFixed(1), maxDeviationMs: maxDeviationMs.toFixed(2), faults: faultCount, faultDetails, frameDrops: this.frameDrops };
  }

  /**
   * Get a compact summary for display
   * @returns {string} Human-readable summary
   */
  getSummaryText() {
    const stats = this.getStatistics();
    if (!stats) return 'No data';

    return [
      `Symbols: ${stats.totalSymbols}`,
      `Duration: ${stats.totalDurationMs}ms (expected: ${stats.expectedDurationMs}ms)`,
      `Bit rate: ${stats.actualBitRate} bps (target: ${stats.expectedBitRate} bps)`,
      `Frame drops: ${stats.frameDrops}`,
      `Timing jitter: mean=${stats.timing.meanDriftMs}ms, max=${stats.timing.maxAbsDriftMs}ms, σ=${stats.timing.stdDevMs}ms`
    ].join('\n');
  }
}
