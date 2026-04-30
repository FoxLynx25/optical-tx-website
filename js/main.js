/**
 * Main application - orchestrates the optical transmitter
 */

import { Encoder } from './encoder.js';
import { DisplayDriver } from './display.js';
import { TimingEngine } from './timing.js';
import { Diagnostics } from './diagnostics.js';
import { Protocol } from './protocol.js';
import { HeatingProfile, HeatingProfileProtocol } from './heating-profile.js';
import { ProfileEditor } from './profile-editor.js';

class OpticalTransmitter {
  constructor() {
    this.encoder = new Encoder();
    this.timing = new TimingEngine();
    this.diagnostics = new Diagnostics();
    this.display = null;
    this.isTransmitting = false;

    // Heating profile
    this.heatingProfile = new HeatingProfile();
    this.profileEditor = null;

    // Current mode
    this.mode = 'profile'; // 'text' or 'profile'

    // Loop mode
    this.loopEnabled = true;
    this.loopCount = 0;
    this.loopGapMs = 100; // 100ms gap between transmissions (brief white flash)

    // UI elements
    this.elements = {};

    // Speed presets (frames per symbol)
    this.speedPresets = {
      slow: { frames: 4, label: 'Slow (15 bps)' },
      medium: { frames: 2, label: 'Medium (30 bps)' },
      fast: { frames: 1, label: 'Fast (60 bps)' }
    };
  }

  /**
   * Initialize the application
   */
  async init() {
    this.cacheElements();
    this.bindEvents();
    this.display = new DisplayDriver(this.elements.transmitArea);
    this.display.setWhite();

    // Initialize profile editor
    this.profileEditor = new ProfileEditor(
      this.elements.profileCanvas,
      this.heatingProfile
    );

    // Load default profile
    this.heatingProfile.loadPreset('gentle');

    // Update profile info when it changes
    this.heatingProfile.onChange = (steps) => {
      this.updateProfileInfo();
      this.updateStepList();
      this.profileEditor.render();
    };

    // Calibrate timing
    this.setStatus('Calibrating display timing...');
    const frameDuration = await this.timing.calibrate();
    this.setStatus(`Ready. Display: ${(1000/frameDuration).toFixed(1)}Hz (${frameDuration.toFixed(2)}ms/frame)`);

    // Ensure loop checkbox is properly initialized
    if (this.elements.loopCheckbox) {
      this.elements.loopCheckbox.checked = true;
      this.loopEnabled = true;
    }

    this.updateSpeedInfo();
    this.updateProfileInfo();
    this.updateStepList();

    // Profile is default tab, so resize canvas now
    setTimeout(() => this.profileEditor.resize(), 50);
  }

  /**
   * Cache DOM element references
   */
  cacheElements() {
    this.elements = {
      // Tabs
      tabText: document.getElementById('tab-text'),
      tabProfile: document.getElementById('tab-profile'),
      panelText: document.getElementById('panel-text'),
      panelProfile: document.getElementById('panel-profile'),

      // Text mode
      payloadInput: document.getElementById('payload-input'),

      // Profile mode
      profileCanvas: document.getElementById('profile-canvas'),
      stepList: document.getElementById('step-list'),
      profileInfo: document.getElementById('profile-info'),
      presetSelect: document.getElementById('preset-select'),
      addStepBtn: document.getElementById('add-step-btn'),
      clearProfileBtn: document.getElementById('clear-profile-btn'),

      // Shared controls
      speedSelect: document.getElementById('speed-select'),
      customSpeedPanel: document.getElementById('custom-speed-panel'),
      loopCheckbox: document.getElementById('loop-checkbox'),
      loopStatus: document.getElementById('loop-status'),
      framesSlider: document.getElementById('frames-slider'),
      framesInput: document.getElementById('frames-input'),
      speedHz: document.getElementById('speed-hz'),
      speedBps: document.getElementById('speed-bps'),
      speedMs: document.getElementById('speed-ms'),
      transmitBtn: document.getElementById('transmit-btn'),
      stopBtn: document.getElementById('stop-btn'),
      fullscreenBtn: document.getElementById('fullscreen-btn'),
      transmitArea: document.getElementById('transmit-area'),
      statusText: document.getElementById('status-text'),
      progressBar: document.getElementById('progress-bar'),
      progressText: document.getElementById('progress-text'),
      diagnosticsOutput: document.getElementById('diagnostics-output'),
      exportBtn: document.getElementById('export-btn'),
      frameInfo: document.getElementById('frame-info'),
      controlPanel: document.getElementById('control-panel')
    };
  }

  /**
   * Bind event handlers
   */
  bindEvents() {
    // Tab switching
    this.elements.tabText.addEventListener('click', () => this.switchMode('text'));
    this.elements.tabProfile.addEventListener('click', () => this.switchMode('profile'));

    // Text mode
    this.elements.payloadInput.addEventListener('input', () => this.updateFrameInfo());

    // Profile mode
    this.elements.presetSelect.addEventListener('change', (e) => {
      if (e.target.value) {
        this.heatingProfile.loadPreset(e.target.value);
        e.target.value = '';
      }
    });
    this.elements.addStepBtn.addEventListener('click', () => this.addStep());
    this.elements.clearProfileBtn.addEventListener('click', () => this.heatingProfile.clear());

    // Shared controls
    this.elements.transmitBtn.addEventListener('click', () => this.startTransmission());
    this.elements.stopBtn.addEventListener('click', () => this.stopTransmission());
    this.elements.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
    this.elements.exportBtn.addEventListener('click', () => this.exportDiagnostics());
    this.elements.speedSelect.addEventListener('change', () => this.onSpeedSelectChange());

    // Custom speed controls
    this.elements.framesSlider.addEventListener('input', () => this.onFramesSliderChange());
    this.elements.framesInput.addEventListener('change', () => this.onFramesInputChange());

    // Loop mode
    this.elements.loopCheckbox.addEventListener('change', (e) => {
      this.loopEnabled = e.target.checked;
    });

    // Fullscreen events
    document.addEventListener('fullscreenchange', () => this.onFullscreenChange());
    document.addEventListener('webkitfullscreenchange', () => this.onFullscreenChange());

    // Initial frame info
    this.updateFrameInfo();
  }

  /**
   * Switch between text and profile modes
   */
  switchMode(mode) {
    this.mode = mode;

    this.elements.tabText.classList.toggle('active', mode === 'text');
    this.elements.tabProfile.classList.toggle('active', mode === 'profile');
    this.elements.panelText.classList.toggle('hidden', mode !== 'text');
    this.elements.panelProfile.classList.toggle('hidden', mode !== 'profile');

    this.updateFrameInfo();

    // Resize and render profile editor when switching to profile mode
    if (mode === 'profile') {
      // Use setTimeout to allow DOM to update before measuring
      setTimeout(() => this.profileEditor.resize(), 10);
    }
  }

  /**
   * Add a new step to the profile
   */
  addStep() {
    const lastStep = this.heatingProfile.steps[this.heatingProfile.steps.length - 1];
    const temp = lastStep ? lastStep.temp : 180;
    this.heatingProfile.addStep(temp, 60);
  }

  /**
   * Update step list UI
   */
  updateStepList() {
    const container = this.elements.stepList;
    container.innerHTML = '';

    this.heatingProfile.steps.forEach((step, index) => {
      const row = document.createElement('div');
      row.className = 'step-row';
      row.innerHTML = `
        <span class="step-num">${index + 1}</span>
        <input type="number" class="step-temp" value="${Math.round(step.temp)}"
               min="${HeatingProfileProtocol.TEMP_MIN}" max="${HeatingProfileProtocol.TEMP_MAX}">
        <span class="step-unit">°C</span>
        <input type="number" class="step-duration" value="${step.duration.toFixed(1)}"
               min="0.1" max="60" step="0.1">
        <span class="step-unit">s</span>
        <button class="step-delete" ${this.heatingProfile.steps.length <= 1 ? 'disabled' : ''}>×</button>
      `;

      // Bind events
      const tempInput = row.querySelector('.step-temp');
      const durationInput = row.querySelector('.step-duration');
      const deleteBtn = row.querySelector('.step-delete');

      tempInput.addEventListener('change', (e) => {
        this.heatingProfile.updateStep(index, { temp: parseFloat(e.target.value) });
      });

      durationInput.addEventListener('change', (e) => {
        this.heatingProfile.updateStep(index, { duration: parseFloat(e.target.value) });
      });

      deleteBtn.addEventListener('click', () => {
        this.heatingProfile.removeStep(index);
      });

      row.addEventListener('click', () => {
        this.profileEditor.selectStep(index);
      });

      container.appendChild(row);
    });
  }

  /**
   * Update profile info display
   */
  updateProfileInfo() {
    const steps = this.heatingProfile.steps;
    if (steps.length === 0) {
      this.elements.profileInfo.textContent = 'No steps defined';
      return;
    }

    const totalDuration = this.heatingProfile.getTotalDuration();
    const bytes = this.heatingProfile.encode();
    const info = this.encoder.getFrameInfo(bytes);
    const txDuration = (info.totalBits * this.timing.getSymbolDuration() / 1000).toFixed(2);

    this.elements.profileInfo.textContent =
      `${steps.length} steps | Profile: ${totalDuration.toFixed(1)}s | ` +
      `Payload: ${bytes.length} bytes | TX: ~${txDuration}s`;
  }

  /**
   * Handle speed select dropdown change
   */
  onSpeedSelectChange() {
    const speed = this.elements.speedSelect.value;

    if (speed === 'custom') {
      this.elements.customSpeedPanel.classList.remove('hidden');
      this.onFramesSliderChange(); // Apply current slider value
    } else {
      this.elements.customSpeedPanel.classList.add('hidden');
      const preset = this.speedPresets[speed];
      this.timing.setFramesPerSymbol(preset.frames);
      this.updateFrameInfo();
      this.updateProfileInfo();
    }
  }

  /**
   * Handle frames slider change
   */
  onFramesSliderChange() {
    const frames = parseInt(this.elements.framesSlider.value);
    this.elements.framesInput.value = frames;
    this.applyCustomSpeed(frames);
  }

  /**
   * Handle frames input change
   */
  onFramesInputChange() {
    let frames = parseInt(this.elements.framesInput.value);
    frames = Math.max(1, Math.min(10, frames || 1));
    this.elements.framesInput.value = frames;
    this.elements.framesSlider.value = frames;
    this.applyCustomSpeed(frames);
  }

  /**
   * Apply custom speed setting
   */
  applyCustomSpeed(frames) {
    this.timing.setFramesPerSymbol(frames);

    const symbolDuration = this.timing.getSymbolDuration();
    const hz = 1000 / symbolDuration;
    const bps = hz; // 1 bit per symbol

    this.elements.speedHz.textContent = `${hz.toFixed(1)} Hz`;
    this.elements.speedBps.textContent = `${bps.toFixed(1)} bps`;
    this.elements.speedMs.textContent = `${symbolDuration.toFixed(1)} ms/symbol`;

    this.updateFrameInfo();
    this.updateProfileInfo();
  }

  /**
   * Update speed info display (called on init)
   */
  updateSpeedInfo() {
    const speed = this.elements.speedSelect.value;
    if (speed === 'custom') {
      this.onFramesSliderChange();
    } else {
      const preset = this.speedPresets[speed];
      this.timing.setFramesPerSymbol(preset.frames);
    }
    this.updateFrameInfo();
    this.updateProfileInfo();
  }

  /**
   * Update frame info display
   */
  updateFrameInfo() {
    if (this.mode === 'profile') {
      const steps = this.heatingProfile.steps;
      if (steps.length === 0) {
        this.elements.frameInfo.textContent = 'Add steps to see frame info';
        return;
      }

      const bytes = this.heatingProfile.encode();
      const info = this.encoder.getFrameInfo(bytes);
      const duration = (info.totalBits * this.timing.getSymbolDuration() / 1000).toFixed(2);

      this.elements.frameInfo.textContent =
        `Frame: ${info.totalBits} bits (${bytes.length} byte payload) | Duration: ~${duration}s`;
    } else {
      const payload = this.elements.payloadInput.value;
      if (!payload) {
        this.elements.frameInfo.textContent = 'Enter a message to see frame info';
        return;
      }

      const bytes = Protocol.stringToBytes(payload);
      const info = this.encoder.getFrameInfo(bytes);
      const duration = (info.totalBits * this.timing.getSymbolDuration() / 1000).toFixed(2);

      this.elements.frameInfo.textContent =
        `Frame: ${info.totalBits} bits (${info.preambleBits} preamble + ${info.syncBits} sync + ` +
        `${info.lengthBits} len + ${info.payloadBits} payload + ${info.crcBits} CRC + ${info.postambleBits} post) | ` +
        `Duration: ~${duration}s`;
    }
  }

  /**
   * Get payload bytes based on current mode
   */
  getPayloadBytes() {
    if (this.mode === 'profile') {
      if (this.heatingProfile.steps.length === 0) {
        throw new Error('Add at least one step to the heating profile');
      }
      return this.heatingProfile.encode();
    } else {
      const payload = this.elements.payloadInput.value;
      if (!payload) {
        throw new Error('Enter a message to transmit');
      }
      return Protocol.stringToBytes(payload);
    }
  }

  /**
   * Start transmission
   */
  async startTransmission() {
    if (this.isTransmitting) {
      return;
    }

    // Sync loop state from checkbox
    this.loopEnabled = this.elements.loopCheckbox.checked;

    // Reset loop count on fresh start
    if (this.loopCount === 0) {
      this.updateLoopStatus();
    }

    // Get payload bytes
    let payloadBytes;
    try {
      payloadBytes = this.getPayloadBytes();
    } catch (e) {
      this.setStatus(`Error: ${e.message}`);
      return;
    }

    // Encode the frame
    let frame;
    try {
      frame = this.encoder.encodeBytes(payloadBytes);
    } catch (e) {
      this.setStatus(`Error: ${e.message}`);
      return;
    }

    this.isTransmitting = true;
    this.setTransmitUIState(true);

    // Initialize diagnostics
    this.diagnostics.startTransmission(this.timing.getSymbolDuration(), frame.length);

    const modeLabel = this.mode === 'profile' ? 'heating profile' : 'message';
    this.setStatus(`Transmitting ${modeLabel} (${frame.length} symbols)...`);
    this.updateProgress(0, frame.length);

    // Start transmission
    this.timing.start(frame, {
      onSymbol: (index, bit, actualTime, expectedTime) => {
        this.display.setState(bit);
        this.diagnostics.recordTransition(index, bit, actualTime, expectedTime);

        // Update progress every 10 symbols
        if (index % 10 === 0 || index === frame.length - 1) {
          this.updateProgress(index + 1, frame.length);
        }
      },
      onComplete: () => {
        this.onTransmissionComplete();
      },
      onFrameDrop: () => {
        this.diagnostics.recordFrameDrop();
      }
    });
  }

  /**
   * Set UI state during transmission
   */
  setTransmitUIState(transmitting) {
    this.elements.transmitBtn.disabled = transmitting;
    this.elements.stopBtn.disabled = !transmitting;
    this.elements.speedSelect.disabled = transmitting;
    this.elements.tabText.style.pointerEvents = transmitting ? 'none' : 'auto';
    this.elements.tabProfile.style.pointerEvents = transmitting ? 'none' : 'auto';

    if (this.mode === 'text') {
      this.elements.payloadInput.disabled = transmitting;
    }
  }

  /**
   * Stop transmission
   */
  stopTransmission() {
    // Disable loop to prevent restart
    this.loopEnabled = false;
    this.elements.loopCheckbox.checked = false;
    this.timing.stop();
    this.onTransmissionComplete(true);
  }

  /**
   * Handle transmission completion
   * @param {boolean} aborted - Whether transmission was aborted
   */
  onTransmissionComplete(aborted = false) {
    this.isTransmitting = false;
    this.diagnostics.endTransmission();

    // Ensure display ends white
    this.display.setWhite();

    if (aborted) {
      this.loopCount = 0;
      this.setTransmitUIState(false);
      this.updateLoopStatus();
      this.setStatus('Transmission aborted');
      this.elements.diagnosticsOutput.textContent = this.diagnostics.getSummaryText();
      this.elements.exportBtn.disabled = false;
      return;
    }

    // Check loop mode - use fresh element reference
    const loopCheckbox = document.getElementById('loop-checkbox');
    const shouldContinueLooping = loopCheckbox && loopCheckbox.checked;

    if (shouldContinueLooping) {
      // Loop mode: wait gap then retransmit
      this.loopCount++;
      this.updateLoopStatus();
      this.setStatus(`Looping... (${this.loopCount} sent)`);

      setTimeout(() => {
        // Re-check checkbox state after the gap
        const checkbox = document.getElementById('loop-checkbox');
        const stillLooping = checkbox && checkbox.checked;

        if (stillLooping && !this.isTransmitting) {
          this.startTransmission();
        } else {
          this.setTransmitUIState(false);
          this.loopCount = 0;
          this.updateLoopStatus();
          this.setStatus('Looping stopped');
        }
      }, this.loopGapMs);
    } else {
      this.setTransmitUIState(false);
      this.setStatus('Transmission complete');
      this.elements.diagnosticsOutput.textContent = this.diagnostics.getSummaryText();
      this.elements.exportBtn.disabled = false;
    }
  }

  /**
   * Update loop status display
   */
  updateLoopStatus() {
    if (this.elements.loopStatus) {
      if (this.loopEnabled && this.loopCount > 0) {
        this.elements.loopStatus.textContent = `(${this.loopCount} sent)`;
      } else {
        this.elements.loopStatus.textContent = '';
      }
    }
  }

  /**
   * Toggle fullscreen mode
   */
  async toggleFullscreen() {
    if (this.display.checkFullscreen()) {
      await this.display.exitFullscreen();
    } else {
      await this.display.enterFullscreen();
    }
  }

  /**
   * Handle fullscreen state change
   */
  onFullscreenChange() {
    const isFs = this.display.checkFullscreen();
    this.elements.controlPanel.style.display = isFs ? 'none' : 'block';
    this.elements.fullscreenBtn.textContent = isFs ? 'Exit Fullscreen' : 'Enter Fullscreen';
  }

  /**
   * Export diagnostics to file
   */
  exportDiagnostics() {
    const exportData = {
      ...JSON.parse(this.diagnostics.exportJSON()),
      mode: this.mode
    };

    if (this.mode === 'profile') {
      exportData.heatingProfile = {
        steps: this.heatingProfile.steps,
        encodedBytes: this.heatingProfile.encode()
      };
    }

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `optical-tx-${this.mode}-${Date.now()}.json`;
    a.click();

    URL.revokeObjectURL(url);
  }

  /**
   * Update status text
   * @param {string} text - Status message
   */
  setStatus(text) {
    this.elements.statusText.textContent = text;
  }

  /**
   * Update progress bar
   * @param {number} current - Current symbol index
   * @param {number} total - Total symbols
   */
  updateProgress(current, total) {
    const percent = total > 0 ? (current / total) * 100 : 0;
    this.elements.progressBar.style.width = `${percent}%`;
    this.elements.progressText.textContent = `${current}/${total}`;
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new OpticalTransmitter();
  app.init();
});
