/**
 * Heating Profile data structure and protocol encoding
 */

export const HeatingProfileProtocol = {
  MESSAGE_TYPE: 0x01,
  MAX_STEPS: 32,
  TEMP_OFFSET: 100,      // Stored temp + 100 = actual °C
  TEMP_MIN: 100,         // °C
  TEMP_MAX: 355,         // °C
  DURATION_UNIT: 100,    // ms per unit (0.1s resolution)
  MAX_DURATION: 65535,   // units = 6553.5 seconds

  /**
   * Encode a heating profile to bytes
   * @param {Array<{temp: number, duration: number}>} steps - Array of steps
   *        temp in °C, duration in seconds
   * @returns {number[]} Byte array
   */
  encode(steps) {
    if (steps.length === 0 || steps.length > this.MAX_STEPS) {
      throw new Error(`Steps must be between 1 and ${this.MAX_STEPS}`);
    }

    const bytes = [];

    // Message type
    bytes.push(this.MESSAGE_TYPE);

    // Number of steps
    bytes.push(steps.length);

    // Each step: 1 byte temp + 2 bytes duration
    for (const step of steps) {
      // Temperature (offset encoded)
      const tempValue = Math.round(step.temp) - this.TEMP_OFFSET;
      if (tempValue < 0 || tempValue > 255) {
        throw new Error(`Temperature must be between ${this.TEMP_MIN}°C and ${this.TEMP_MAX}°C`);
      }
      bytes.push(tempValue);

      // Duration in 100ms units (big-endian)
      const durationUnits = Math.round(step.duration * 1000 / this.DURATION_UNIT);
      if (durationUnits < 0 || durationUnits > this.MAX_DURATION) {
        throw new Error(`Duration must be between 0 and ${this.MAX_DURATION * this.DURATION_UNIT / 1000}s`);
      }
      bytes.push((durationUnits >> 8) & 0xFF);  // High byte
      bytes.push(durationUnits & 0xFF);          // Low byte
    }

    return bytes;
  },

  /**
   * Decode bytes back to heating profile (for verification)
   * @param {number[]} bytes - Encoded bytes
   * @returns {Array<{temp: number, duration: number}>} Steps
   */
  decode(bytes) {
    if (bytes[0] !== this.MESSAGE_TYPE) {
      throw new Error('Invalid message type');
    }

    const numSteps = bytes[1];
    const steps = [];

    for (let i = 0; i < numSteps; i++) {
      const offset = 2 + (i * 3);
      const temp = bytes[offset] + this.TEMP_OFFSET;
      const durationUnits = (bytes[offset + 1] << 8) | bytes[offset + 2];
      const duration = (durationUnits * this.DURATION_UNIT) / 1000;

      steps.push({ temp, duration });
    }

    return steps;
  },

  /**
   * Calculate total profile duration
   * @param {Array<{temp: number, duration: number}>} steps
   * @returns {number} Total duration in seconds
   */
  getTotalDuration(steps) {
    return steps.reduce((sum, step) => sum + step.duration, 0);
  }
};

/**
 * Heating Profile model with step management
 */
export class HeatingProfile {
  constructor() {
    this.steps = [];
    this.onChange = null;
  }

  /**
   * Add a step
   * @param {number} temp - Temperature in °C
   * @param {number} duration - Duration in seconds
   * @param {number} [index] - Insert position (default: end)
   */
  addStep(temp, duration, index = null) {
    const step = {
      temp: Math.max(HeatingProfileProtocol.TEMP_MIN,
            Math.min(HeatingProfileProtocol.TEMP_MAX, temp)),
      duration: Math.max(0.1, duration)
    };

    if (index !== null && index >= 0 && index <= this.steps.length) {
      this.steps.splice(index, 0, step);
    } else {
      this.steps.push(step);
    }

    this._notify();
    return this.steps.length - 1;
  }

  /**
   * Update a step
   * @param {number} index - Step index
   * @param {object} updates - { temp?, duration? }
   */
  updateStep(index, updates) {
    if (index < 0 || index >= this.steps.length) return;

    if (updates.temp !== undefined) {
      this.steps[index].temp = Math.max(HeatingProfileProtocol.TEMP_MIN,
        Math.min(HeatingProfileProtocol.TEMP_MAX, updates.temp));
    }
    if (updates.duration !== undefined) {
      this.steps[index].duration = Math.max(0.1, updates.duration);
    }

    this._notify();
  }

  /**
   * Remove a step
   * @param {number} index - Step index
   */
  removeStep(index) {
    if (index >= 0 && index < this.steps.length) {
      this.steps.splice(index, 1);
      this._notify();
    }
  }

  /**
   * Clear all steps
   */
  clear() {
    this.steps = [];
    this._notify();
  }

  /**
   * Load preset profile
   * @param {string} preset - Preset name
   */
  loadPreset(preset) {
    const presets = {
      'gentle': [
        { temp: 180, duration: 100 },
        { temp: 190, duration: 100 },
        { temp: 185, duration: 100 }
      ],  // Total: 300s
      'boost': [
        { temp: 200, duration: 100 },
        { temp: 220, duration: 100 },
        { temp: 210, duration: 100 }
      ],  // Total: 300s
      'session': [
        { temp: 175, duration: 60 },
        { temp: 185, duration: 60 },
        { temp: 195, duration: 60 },
        { temp: 205, duration: 60 },
        { temp: 210, duration: 60 }
      ]  // Total: 300s
    };

    if (presets[preset]) {
      this.steps = JSON.parse(JSON.stringify(presets[preset]));
      this._notify();
    }
  }

  /**
   * Encode profile for transmission
   * @returns {number[]} Byte array
   */
  encode() {
    return HeatingProfileProtocol.encode(this.steps);
  }

  /**
   * Get total duration
   * @returns {number} Seconds
   */
  getTotalDuration() {
    return HeatingProfileProtocol.getTotalDuration(this.steps);
  }

  _notify() {
    if (this.onChange) {
      this.onChange(this.steps);
    }
  }
}
