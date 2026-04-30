/**
 * Display driver - controls the screen for optical transmission
 */

export class DisplayDriver {
  constructor(element) {
    this.element = element;
    this.currentState = null; // null = unknown, 0 = black, 1 = white
    this.isFullscreen = false;
  }

  /**
   * Set the display to a specific bit state
   * @param {number} bit - 0 for black, 1 for white
   */
  setState(bit) {
    if (bit === this.currentState) return;

    this.currentState = bit;
    this.element.style.backgroundColor = bit === 1 ? '#FFFFFF' : '#000000';
  }

  /**
   * Set to white (idle/ready state)
   */
  setWhite() {
    this.setState(1);
  }

  /**
   * Set to black
   */
  setBlack() {
    this.setState(0);
  }

  /**
   * Get current state
   * @returns {number|null} Current bit state
   */
  getState() {
    return this.currentState;
  }

  /**
   * Request fullscreen mode
   * @returns {Promise<boolean>} Success status
   */
  async enterFullscreen() {
    try {
      if (this.element.requestFullscreen) {
        await this.element.requestFullscreen();
      } else if (this.element.webkitRequestFullscreen) {
        await this.element.webkitRequestFullscreen();
      }
      this.isFullscreen = true;

      // Request wake lock to prevent screen dimming
      if ('wakeLock' in navigator) {
        try {
          await navigator.wakeLock.request('screen');
        } catch (e) {
          console.warn('Wake lock not available:', e);
        }
      }

      return true;
    } catch (e) {
      console.error('Fullscreen request failed:', e);
      return false;
    }
  }

  /**
   * Exit fullscreen mode
   */
  async exitFullscreen() {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        await document.webkitExitFullscreen();
      }
      this.isFullscreen = false;
    } catch (e) {
      console.error('Exit fullscreen failed:', e);
    }
  }

  /**
   * Check if currently fullscreen
   * @returns {boolean}
   */
  checkFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }
}
