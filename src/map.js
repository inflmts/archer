import { html, svg } from './util.js';
import { loadRoutes, updateRouteTransforms } from './routes.js';
import { updateStopTransforms } from './stops.js';

export const map = document.querySelector('#map');
const contentContainer = document.querySelector('#map-content');
const routeContainer = document.querySelector('#route-layer');

export let scale = 10000;
export const offset = {
  x: 82.347 * 1.15 * scale,
  y: 29.64513 * scale
};

//function setOffset(x, y) {
//  offset.x = x;
//  offset.y = y;
//  routeContainer.setAttribute('transform', `translate(${x}, ${y})`);
//}

//function updateTransform() {
//  routeContainer.setAttribute('transform', `matrix(${scale}, 0, 0, ${scale}, ${offset.x}, ${offset.y})`);
//  routeContainer.setAttribute('stroke-width', `${4 / scale}`);
//}

function updateTransform() {
  updateRouteTransforms();
  updateStopTransforms();
}

let gesture = null;

class Pan {

  constructor(p, x, y) {
    this.p = p;
    this.x = x;
    this.y = y;
  }

  down(p, x, y) {
    return new Pinch(this.p, this.x, this.y, p, x, y);
  }

  move(p, x, y) {
    if (p === this.p) {
      offset.x += x - this.x;
      offset.y += y - this.y;
      this.x = x;
      this.y = y;
      updateTransform();
    }
    return this;
  }

  up(p) {
    if (p === this.p)
      return null;
    else
      return this;
  }

}

class Pinch {

  constructor(p1, x1, y1, p2, x2, y2) {
    this.p1 = p1;
    this.x1 = x1;
    this.y1 = y1;
    this.p2 = p2;
    this.x2 = x2;
    this.y2 = y2;
    this.dist = Math.hypot(this.x2 - this.x1, this.y2 - this.y1);
  }

  _update(x1, y1, x2, y2) {
    const dist = Math.hypot(x2 - x1, y2 - y1);
    scale *= dist / this.dist;
    offset.x = (offset.x - (this.x1 + this.x2) / 2) * dist / this.dist + (x1 + x2) / 2;
    offset.y = (offset.y - (this.y1 + this.y2) / 2) * dist / this.dist + (y1 + y2) / 2;
    this.x1 = x1;
    this.y1 = y1;
    this.x2 = x2;
    this.y2 = y2;
    this.dist = dist;
    updateTransform();
  }

  down() {
    return null;
  }

  move(p, x, y) {
    if (p === this.p1)
      this._update(x, y, this.x2, this.y2);
    else if (p === this.p2)
      this._update(this.x1, this.y1, x, y);
    return this;
  }

  up(p) {
    if (p === this.p1)
      return new Pan(this.p2, this.x2, this.y2);
    else if (p === this.p2)
      return new Pan(this.p1, this.x1, this.y1);
    else
      return this;
  }

}

function handlePointerDown(ev) {
  ev.preventDefault();
  if (gesture)
    gesture = gesture.down(ev.pointerId, ev.clientX, ev.clientY);
  else
    gesture = new Pan(ev.pointerId, ev.clientX, ev.clientY);
}

function handlePointerMove(ev) {
  ev.preventDefault();
  if (gesture)
    gesture = gesture.move(ev.pointerId, ev.clientX, ev.clientY);
}

function handlePointerUp(ev) {
  ev.preventDefault();
  if (gesture)
    gesture = gesture.up(ev.pointerId, ev.clientX, ev.clientY);
}

map.addEventListener('pointerdown', handlePointerDown);
map.addEventListener('pointermove', handlePointerMove);
map.addEventListener('pointerup', handlePointerUp);
map.addEventListener('pointerleave', handlePointerUp);

map.addEventListener('wheel', (ev) => {
  const oldScale = scale;
  scale *= Math.pow(2, -ev.deltaY * 0.01);
  offset.x = (offset.x - ev.clientX) * scale / oldScale + ev.clientX;
  offset.y = (offset.y - ev.clientY) * scale / oldScale + ev.clientY;
  updateRouteTransforms();
  updateStopTransforms();
}, { passive: true });

loadRoutes(routeContainer);
