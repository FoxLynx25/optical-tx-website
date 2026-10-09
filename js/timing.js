/**
 * Timing engine - handles precise symbol scheduling using requestAnimationFrame
 */

export class TimingEngine {
  constructor() {
    this.isRunning = false;
    this.rafId = null;
    this.symbols = [];
    this.currentIndex = 0;
    this.framesPerSymbol = 2;
    this.frameCount = 0;
    this.startTime = null;
    this.onSymbol = null;
    this.onComplete = null;
    this.onFrameDrop = null;
    this.lastFrameTime = null;
    this.estimatedFrameDuration = 16.67; // Will be calibrated
  }

  /**
   * Set the number of display frames per symbol
   * @param {number} frames - Frames per symbol (1, 2, or 4)
   */
  setFramesPerSymbol(frames) {
    this.framesPerSymbol = frames;
  }

  /**
   * Get expected symbol duration in milliseconds
   * @returns {number} Duration in ms
   */
  getSymbolDuration() {
    return this.framesPerSymbol * this.estimatedFrameDuration;
  }

  /**
   * Calibrate frame duration by measuring actual refresh rate
   * @returns {Promise<number>} Estimated frame duration in ms
   */
  async calibrate() {
    return new Promise((resolve) => {
      const samples = [];
      let lastTime = null;
      let count = 0;
      const maxSamples = 30;

      const measure = (timestamp) => {
        if (lastTime !== null) {
          samples.push(timestamp - lastTime);
        }
        lastTime = timestamp;
        count++;

        if (count < maxSamples) {
          requestAnimationFrame(measure);
        } else {
          // Remove outliers and average
          samples.sort((a, b) => a - b);
          const trimmed = samples.slice(5, -5);
          const avg = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
          this.estimatedFrameDuration = avg;
          resolve(avg);
        }
      };

      requestAnimationFrame(measure);
    });
  }

  /**
   * Start transmitting a symbol sequence
   * @param {number[]} symbols - Array of bits (0 or 1)
   * @param {object} callbacks - { onSymbol, onComplete, onFrameDrop }
   */
  start(symbols, callbacks) {
    if (this.isRunning) {
      this.stop();
    }

    this.symbols = symbols;
    this.currentIndex = 0;
    this.frameCount = 0;
    this.startTime = null;
    this.lastFrameTime = null;
    this.isRunning = true;

    this.onSymbol = callbacks.onSymbol || (() => {});
    this.onComplete = callbacks.onComplete || (() => {});
    this.onFrameDrop = callbacks.onFrameDrop || (() => {});

    this.rafId = requestAnimationFrame(this.tick.bind(this));
  }

  /**
   * Stop transmission
   */
  stop() {
    this.isRunning = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * Animation frame tick handler
   * @param {number} timestamp - High-resolution timestamp
   */
  tick(timestamp) {
    if (!this.isRunning) return;

    // Initialize on first frame
    if (this.startTime === null) {
      this.startTime = timestamp;
      this.lastFrameTime = timestamp;
    } else {
      // Advance by the number of display frames that actually elapsed, not by
      // the number of callbacks: two callbacks landing in the same display
      // frame must not consume a symbol, and a missed frame must not delay
      // every following symbol.
      const elapsedFrames = Math.round((timestamp - this.lastFrameTime) / this.estimatedFrameDuration);
      if (elapsedFrames >= 1) {
        for (let i = 1; i < elapsedFrames; i++) {
          this.onFrameDrop();
        }
        this.frameCount += elapsedFrames;
        // Re-anchor on the real timestamp so calibration error never accumulates
        this.lastFrameTime = timestamp;
      }
    }

    // Emit the symbol that is due on this frame. After a missed frame this may
    // skip a symbol: that costs at most one wrong bit, whereas emitting it late
    // would shift the rest of the frame.
    const dueIndex = Math.min(
      Math.floor(this.frameCount / this.framesPerSymbol),
      this.symbols.length - 1
    );
    if (dueIndex >= this.currentIndex) {
      const symbol = this.symbols[dueIndex];
      const expectedTime = this.startTime + (dueIndex * this.framesPerSymbol * this.estimatedFrameDuration);

      this.onSymbol(dueIndex, symbol, timestamp, expectedTime);
      this.currentIndex = dueIndex + 1;
    }

    // Check if complete
    if (this.currentIndex >= this.symbols.length) {
      this.isRunning = false;
      this.onComplete();
      return;
    }

    // Schedule next frame
    this.rafId = requestAnimationFrame(this.tick.bind(this));
  }

  /**
   * Get current progress
   * @returns {object} Progress info
   */
  getProgress() {
    return {
      current: this.currentIndex,
      total: this.symbols.length,
      percent: this.symbols.length > 0
        ? Math.round((this.currentIndex / this.symbols.length) * 100)
        : 0
    };
  }
}
