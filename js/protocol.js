/**
 * Protocol constants and CRC-8 implementation
 * Frame format: [Preamble 16b][Sync 4b][Length 8b][Payload Nb][CRC-8 8b][Postamble 4b]
 */

export const Protocol = {
  // Frame markers
  PREAMBLE: [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],  // 16 bits for clock recovery
  SYNC: [1,1,0,0],                               // Start-of-frame delimiter
  POSTAMBLE: [1,1,1,1],                          // Clean end state (white)

  // Limits
  MAX_PAYLOAD_BYTES: 255,

  // CRC-8 polynomial (x^8 + x^2 + x + 1)
  CRC_POLYNOMIAL: 0x07,

  /**
   * Calculate CRC-8 for a byte array
   * @param {number[]} bytes - Array of bytes (0-255)
   * @returns {number} CRC-8 value
   */
  calculateCRC8(bytes) {
    let crc = 0x00;
    for (const byte of bytes) {
      crc ^= byte;
      for (let i = 0; i < 8; i++) {
        if (crc & 0x80) {
          crc = ((crc << 1) ^ this.CRC_POLYNOMIAL) & 0xFF;
        } else {
          crc = (crc << 1) & 0xFF;
        }
      }
    }
    return crc;
  },

  /**
   * Convert a byte to an array of 8 bits (MSB first)
   * @param {number} byte - Byte value (0-255)
   * @returns {number[]} Array of 8 bits
   */
  byteToBits(byte) {
    const bits = [];
    for (let i = 7; i >= 0; i--) {
      bits.push((byte >> i) & 1);
    }
    return bits;
  },

  /**
   * Convert a string to an array of bytes (UTF-8)
   * @param {string} str - Input string
   * @returns {number[]} Array of bytes
   */
  stringToBytes(str) {
    const encoder = new TextEncoder();
    return Array.from(encoder.encode(str));
  }
};
