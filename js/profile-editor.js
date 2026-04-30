/**
 * Visual profile editor with interactive step curve
 */

import { HeatingProfileProtocol } from './heating-profile.js';

export class ProfileEditor {
  constructor(canvas, profile) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.profile = profile;

    // Dimensions
    this.padding = { top: 30, right: 30, bottom: 50, left: 60 };

    // Interaction state
    this.dragIndex = -1;
    this.dragType = null; // 'temp' or 'duration'
    this.hoverIndex = -1;
    this.selectedIndex = -1;

    // Visual settings
    this.colors = {
      background: '#0f0f23',
      grid: '#1a1a3e',
      axis: '#444',
      axisLabel: '#888',
      line: '#4a9eff',
      lineFill: 'rgba(74, 158, 255, 0.15)',
      point: '#4a9eff',
      pointHover: '#6ab0ff',
      pointSelected: '#ff6b6b',
      stepFill: 'rgba(74, 158, 255, 0.3)',
      text: '#fff'
    };

    this._bindEvents();

    // Don't setup canvas here - it may be hidden
    // Call resize() after the canvas becomes visible
  }

  /**
   * Resize and reinitialize the canvas (call when tab becomes visible)
   */
  resize() {
    // Handle high DPI displays
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();

    // Skip if canvas is not visible (zero dimensions)
    if (rect.width === 0 || rect.height === 0) {
      return;
    }

    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
    this.ctx.scale(dpr, dpr);

    this.width = rect.width;
    this.height = rect.height;

    // Plot area
    this.plotArea = {
      x: this.padding.left,
      y: this.padding.top,
      width: this.width - this.padding.left - this.padding.right,
      height: this.height - this.padding.top - this.padding.bottom
    };

    this.render();
  }

  _bindEvents() {
    this.canvas.addEventListener('mousedown', this._onMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this._onMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this._onMouseUp.bind(this));
    this.canvas.addEventListener('mouseleave', this._onMouseLeave.bind(this));
    this.canvas.addEventListener('dblclick', this._onDoubleClick.bind(this));

    // Touch support
    this.canvas.addEventListener('touchstart', this._onTouchStart.bind(this), { passive: false });
    this.canvas.addEventListener('touchmove', this._onTouchMove.bind(this), { passive: false });
    this.canvas.addEventListener('touchend', this._onTouchEnd.bind(this));

    // Resize handling
    window.addEventListener('resize', () => {
      this.resize();
    });
  }

  /**
   * Convert time (seconds) to canvas X coordinate
   */
  timeToX(time) {
    const totalDuration = Math.max(1, this.profile.getTotalDuration());
    return this.plotArea.x + (time / totalDuration) * this.plotArea.width;
  }

  /**
   * Convert canvas X to time (seconds)
   */
  xToTime(x) {
    const totalDuration = Math.max(1, this.profile.getTotalDuration());
    return ((x - this.plotArea.x) / this.plotArea.width) * totalDuration;
  }

  /**
   * Convert temperature to canvas Y coordinate
   */
  tempToY(temp) {
    const minTemp = HeatingProfileProtocol.TEMP_MIN;
    const maxTemp = HeatingProfileProtocol.TEMP_MAX;
    const normalized = (temp - minTemp) / (maxTemp - minTemp);
    return this.plotArea.y + this.plotArea.height * (1 - normalized);
  }

  /**
   * Convert canvas Y to temperature
   */
  yToTemp(y) {
    const minTemp = HeatingProfileProtocol.TEMP_MIN;
    const maxTemp = HeatingProfileProtocol.TEMP_MAX;
    const normalized = 1 - (y - this.plotArea.y) / this.plotArea.height;
    return minTemp + normalized * (maxTemp - minTemp);
  }

  /**
   * Get step control points for interaction
   */
  getStepPoints() {
    const points = [];
    let time = 0;

    for (let i = 0; i < this.profile.steps.length; i++) {
      const step = this.profile.steps[i];
      const x = this.timeToX(time + step.duration / 2);
      const y = this.tempToY(step.temp);
      const xEnd = this.timeToX(time + step.duration);

      points.push({
        index: i,
        x, y,
        xStart: this.timeToX(time),
        xEnd,
        time,
        temp: step.temp,
        duration: step.duration
      });

      time += step.duration;
    }

    return points;
  }

  /**
   * Find point near coordinates
   */
  findPointAt(mouseX, mouseY, threshold = 15) {
    const points = this.getStepPoints();

    for (const point of points) {
      const dist = Math.sqrt(Math.pow(mouseX - point.x, 2) + Math.pow(mouseY - point.y, 2));
      if (dist < threshold) {
        return { ...point, type: 'temp' };
      }

      // Check duration handle (right edge)
      const edgeDist = Math.sqrt(Math.pow(mouseX - point.xEnd, 2) + Math.pow(mouseY - point.y, 2));
      if (edgeDist < threshold) {
        return { ...point, type: 'duration' };
      }
    }

    return null;
  }

  _onMouseDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const point = this.findPointAt(x, y);
    if (point) {
      this.dragIndex = point.index;
      this.dragType = point.type;
      this.selectedIndex = point.index;
      this.canvas.style.cursor = 'grabbing';
      this.render();
    }
  }

  _onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (this.dragIndex >= 0) {
      if (this.dragType === 'temp') {
        const newTemp = this.yToTemp(y);
        this.profile.updateStep(this.dragIndex, { temp: newTemp });
      } else if (this.dragType === 'duration') {
        const points = this.getStepPoints();
        const point = points[this.dragIndex];
        const newEndTime = this.xToTime(x);
        const newDuration = Math.max(0.1, newEndTime - point.time);
        this.profile.updateStep(this.dragIndex, { duration: newDuration });
      }
    } else {
      const point = this.findPointAt(x, y);
      const newHover = point ? point.index : -1;

      if (newHover !== this.hoverIndex) {
        this.hoverIndex = newHover;
        this.canvas.style.cursor = point ? 'grab' : 'default';
        this.render();
      }
    }
  }

  _onMouseUp() {
    this.dragIndex = -1;
    this.dragType = null;
    this.canvas.style.cursor = 'default';
  }

  _onMouseLeave() {
    this.hoverIndex = -1;
    this.dragIndex = -1;
    this.dragType = null;
    this.render();
  }

  _onDoubleClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if clicking on existing point to delete
    const point = this.findPointAt(x, y);
    if (point && this.profile.steps.length > 1) {
      this.profile.removeStep(point.index);
      this.selectedIndex = -1;
      return;
    }

    // Add new step at clicked position
    if (x >= this.plotArea.x && x <= this.plotArea.x + this.plotArea.width &&
        y >= this.plotArea.y && y <= this.plotArea.y + this.plotArea.height) {
      const temp = this.yToTemp(y);
      const duration = 60; // Default 60 seconds per new step
      this.profile.addStep(temp, duration);
    }
  }

  _onTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    this._onMouseDown({ clientX: touch.clientX, clientY: touch.clientY });
  }

  _onTouchMove(e) {
    e.preventDefault();
    const touch = e.touches[0];
    this._onMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
  }

  _onTouchEnd() {
    this._onMouseUp();
  }

  /**
   * Render the profile editor
   */
  render() {
    const ctx = this.ctx;
    const { x, y, width, height } = this.plotArea;

    // Clear
    ctx.fillStyle = this.colors.background;
    ctx.fillRect(0, 0, this.width, this.height);

    // Draw grid
    this._drawGrid();

    // Draw axes
    this._drawAxes();

    // Draw steps
    this._drawSteps();

    // Draw control points
    this._drawControlPoints();

    // Draw info
    this._drawInfo();
  }

  _drawGrid() {
    const ctx = this.ctx;
    const { x, y, width, height } = this.plotArea;

    ctx.strokeStyle = this.colors.grid;
    ctx.lineWidth = 1;

    // Horizontal grid lines (temperature)
    const tempStep = 25;
    for (let temp = HeatingProfileProtocol.TEMP_MIN; temp <= HeatingProfileProtocol.TEMP_MAX; temp += tempStep) {
      const py = this.tempToY(temp);
      ctx.beginPath();
      ctx.moveTo(x, py);
      ctx.lineTo(x + width, py);
      ctx.stroke();
    }

    // Vertical grid lines (time) - dynamic based on duration
    const totalDuration = Math.max(1, this.profile.getTotalDuration());
    let timeStep;
    if (totalDuration <= 30) timeStep = 5;
    else if (totalDuration <= 60) timeStep = 10;
    else if (totalDuration <= 180) timeStep = 30;
    else if (totalDuration <= 600) timeStep = 60;
    else if (totalDuration <= 1800) timeStep = 300;
    else timeStep = 600;

    for (let t = 0; t <= totalDuration; t += timeStep) {
      const px = this.timeToX(t);
      ctx.beginPath();
      ctx.moveTo(px, y);
      ctx.lineTo(px, y + height);
      ctx.stroke();
    }
  }

  _drawAxes() {
    const ctx = this.ctx;
    const { x, y, width, height } = this.plotArea;

    ctx.strokeStyle = this.colors.axis;
    ctx.fillStyle = this.colors.axisLabel;
    ctx.font = '12px -apple-system, sans-serif';
    ctx.lineWidth = 2;

    // Y axis
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + height);
    ctx.stroke();

    // X axis
    ctx.beginPath();
    ctx.moveTo(x, y + height);
    ctx.lineTo(x + width, y + height);
    ctx.stroke();

    // Y axis labels (temperature)
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let temp = HeatingProfileProtocol.TEMP_MIN; temp <= HeatingProfileProtocol.TEMP_MAX; temp += 50) {
      const py = this.tempToY(temp);
      ctx.fillText(`${temp}°C`, x - 8, py);
    }

    // X axis labels (time)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const totalDuration = Math.max(1, this.profile.getTotalDuration());

    // Calculate step to show ~5-6 labels max
    let timeStep;
    if (totalDuration <= 30) timeStep = 5;
    else if (totalDuration <= 60) timeStep = 10;
    else if (totalDuration <= 180) timeStep = 30;
    else if (totalDuration <= 600) timeStep = 60;
    else if (totalDuration <= 1800) timeStep = 300;
    else timeStep = 600;

    for (let t = 0; t <= totalDuration; t += timeStep) {
      const px = this.timeToX(t);
      // Format time: show minutes for longer durations
      const label = totalDuration > 120 ? `${Math.floor(t / 60)}m` : `${t}s`;
      ctx.fillText(label, px, y + height + 8);
    }

    // X axis title only (Y axis labels already show °C, so title is redundant)
    ctx.fillStyle = this.colors.text;
    ctx.font = '13px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Time', x + width / 2, y + height + 35);
  }

  _drawSteps() {
    const ctx = this.ctx;
    const steps = this.profile.steps;

    if (steps.length === 0) return;

    let time = 0;

    // Fill area under curve
    ctx.beginPath();
    ctx.moveTo(this.timeToX(0), this.plotArea.y + this.plotArea.height);

    for (const step of steps) {
      const x1 = this.timeToX(time);
      const x2 = this.timeToX(time + step.duration);
      const y = this.tempToY(step.temp);

      ctx.lineTo(x1, y);
      ctx.lineTo(x2, y);

      time += step.duration;
    }

    ctx.lineTo(this.timeToX(time), this.plotArea.y + this.plotArea.height);
    ctx.closePath();
    ctx.fillStyle = this.colors.stepFill;
    ctx.fill();

    // Draw step lines
    time = 0;
    ctx.beginPath();
    ctx.strokeStyle = this.colors.line;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';

    const firstStep = steps[0];
    ctx.moveTo(this.timeToX(0), this.tempToY(firstStep.temp));

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const x1 = this.timeToX(time);
      const x2 = this.timeToX(time + step.duration);
      const y = this.tempToY(step.temp);

      ctx.lineTo(x1, y);
      ctx.lineTo(x2, y);

      // Draw vertical transition to next step
      if (i < steps.length - 1) {
        const nextY = this.tempToY(steps[i + 1].temp);
        ctx.lineTo(x2, nextY);
      }

      time += step.duration;
    }

    ctx.stroke();
  }

  _drawControlPoints() {
    const ctx = this.ctx;
    const points = this.getStepPoints();

    for (const point of points) {
      const isHovered = point.index === this.hoverIndex;
      const isSelected = point.index === this.selectedIndex;

      // Main control point (center of step)
      ctx.beginPath();
      ctx.arc(point.x, point.y, isHovered || isSelected ? 10 : 8, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? this.colors.pointSelected :
                      isHovered ? this.colors.pointHover : this.colors.point;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Duration handle (right edge)
      ctx.beginPath();
      ctx.arc(point.xEnd, point.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = this.colors.point;
      ctx.fill();
      ctx.stroke();

      // Step number label
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(point.index + 1), point.x, point.y);
    }
  }

  _drawInfo() {
    const ctx = this.ctx;

    // Instructions
    ctx.fillStyle = '#666';
    ctx.font = '11px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Drag points to adjust • Double-click to add/remove steps', this.plotArea.x, 15);
  }

  /**
   * Select a step
   */
  selectStep(index) {
    this.selectedIndex = index;
    this.render();
  }
}
