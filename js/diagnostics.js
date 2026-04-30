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
