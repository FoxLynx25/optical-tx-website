/**
 * Frame encoder - assembles complete transmission frames
 */

import { Protocol } from './protocol.js';

export class Encoder {
  /**
   * Encode a string payload into a complete frame bit sequence
   * @param {string} payload - String data to transmit
   * @returns {number[]} Complete frame as array of bits (0 or 1)
   */
  encodeString(payload) {
    const bytes = Protocol.stringToBytes(payload);
    return this.encodeBytes(bytes);
  }

  /**
   * Encode a byte array into a complete frame bit sequence
   * @param {number[]} payloadBytes - Array of bytes to transmit
   * @returns {number[]} Complete frame as array of bits (0 or 1)
   */
  encodeBytes(payloadBytes) {
    if (payloadBytes.length > Protocol.MAX_PAYLOAD_BYTES) {
      throw new Error(`Payload exceeds maximum size of ${Protocol.MAX_PAYLOAD_BYTES} bytes`);
    }

    const frame = [];

    // Start marker: single black bit (0) forces a white→black edge at the start
    // of every transmission, since idle state is always white (1). Without this,
    // the first preamble bit (1) is identical to idle and the receiver sees no
    // transition to align on — especially critical in loop mode.
    frame.push(0);

    // 1. Preamble (16 bits)
    frame.push(...Protocol.PREAMBLE);

    // 2. Sync marker (4 bits)
    frame.push(...Protocol.SYNC);

    // 3. Length byte (8 bits)
    const lengthByte = payloadBytes.length;
    frame.push(...Protocol.byteToBits(lengthByte));

    // 4. Payload (N × 8 bits)
    for (const byte of payloadBytes) {
      frame.push(...Protocol.byteToBits(byte));
    }

    // 5. CRC-8 (8 bits) - computed over length + payload
    const crcInput = [lengthByte, ...payloadBytes];
    const crc = Protocol.calculateCRC8(crcInput);
    frame.push(...Protocol.byteToBits(crc));

    // 6. Postamble (4 bits)
    frame.push(...Protocol.POSTAMBLE);

    return frame;
  }

  /**
   * Get frame metadata for diagnostics
   * @param {number[]} payloadBytes - Payload bytes
   * @returns {object} Frame structure info
   */
  getFrameInfo(payloadBytes) {
    const payloadBits = payloadBytes.length * 8;
    return {
      startBits: 1,
      preambleBits: Protocol.PREAMBLE.length,
      syncBits: Protocol.SYNC.length,
      lengthBits: 8,
      payloadBits: payloadBits,
      crcBits: 8,
      postambleBits: Protocol.POSTAMBLE.length,
      totalBits: 1 + Protocol.PREAMBLE.length + Protocol.SYNC.length + 8 + payloadBits + 8 + Protocol.POSTAMBLE.length
    };
  }
}
