import { map } from './util.js';
import { closeRoutes } from './routes.js';
import { currentStop, deselectStop, getNearestStop } from './stops.js';

const content = document.querySelector('#map-content');

const MIN_SCALE = 2000;
const MAX_SCALE = 200000;
const PAN_THRESHOLD = 10;

let scale = 10000;
let tx = innerWidth / 2 | 0;
let ty = innerHeight / 2 | 0;

function updateTransform() {
  map.style.backgroundSize = `${scale * 0.005}px`;
  map.style.backgroundPosition = `${tx}px ${ty}px`;
  content.setAttribute('transform', `matrix(${scale}, 0, 0, ${scale}, ${tx}, ${ty})`);
  content.style.setProperty('--stop-radius', `${4 / scale}px`);
  content.style.setProperty('--stop-radius-selected', `${8 / scale}px`);
  content.style.setProperty('--inverse-transform', `scale(${1 / scale})`);
}

updateTransform();

let gesture, p1, p1x, p1y, p2, p2x, p2y;

const idle = {
  down(p, x, y) {
    gesture = pan;
    p1 = p;
    p1x = x;
    p1y = y;
    pan.moved = false;
    closeRoutes();
    deselectStop();
  }
};

const pan = {
  down(p, x, y) {
    gesture = pinch;
    p2 = p;
    p2x = x;
    p2y = y;
    pinch.dist = Math.hypot(p2x - p1x, p2y - p1y);
  },
  move(p, x, y) {
    if (p !== p1 || (
      !this.moved &&
      Math.abs(x - p1x) < PAN_THRESHOLD &&
      Math.abs(y - p1y) < PAN_THRESHOLD
    )) return;
    this.moved = true;
    tx += x - p1x;
    ty += y - p1y;
    p1x = x;
    p1y = y;
    updateTransform();
  },
  up(p) {
    if (p !== p1)
      return;
    gesture = idle;
    if (this.moved)
      return;
    const stop = getNearestStop((p1x - tx) / scale, (p1y - ty) / scale);
    if (stop) {
      tx = innerWidth * 0.6 - stop.x * scale;
      ty = innerHeight * 0.6 - stop.y * scale;
      updateTransform();
      stop.select();
    }
  }
}

const pinch = {
  down() {
    gesture = idle;
  },
  move(p, x, y) {
    const o1x = p1x, o1y = p1y;
    const o2x = p2x, o2y = p2y;
    if (p === p1) {
      if (p1x === x && p1y === y)
        return;
      p1x = x;
      p1y = y;
    } else if (p === p2) {
      if (p2x === x && p2y === y)
        return;
      p2x = x;
      p2y = y;
    } else {
      return;
    }
    const oldDist = this.dist;
    const oldScale = scale;
    this.dist = Math.hypot(p2x - p1x, p2y - p1y);
    scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * this.dist / oldDist));
    tx = (tx - (o1x + o2x) / 2) * scale / oldScale + (p1x + p2x) / 2;
    ty = (ty - (o1y + o2y) / 2) * scale / oldScale + (p1y + p2y) / 2;
    updateTransform();
  },
  up(p) {
    if (p === p1) {
      gesture = pan;
      p1 = p2;
      p1x = p2x;
      p1y = p2y;
      pan.moved = true;
    } else if (p === p2) {
      gesture = pan;
      pan.moved = true;
    }
  }

}

gesture = idle;

function handlePointerDown(ev) {
  if (gesture.down)
    gesture.down(ev.pointerId, ev.offsetX, ev.offsetY);
}

function handlePointerMove(ev) {
  if (gesture.move)
    gesture.move(ev.pointerId, ev.offsetX, ev.offsetY);
}

function handlePointerUp(ev) {
  if (gesture.up)
    gesture.up(ev.pointerId, ev.offsetX, ev.offsetY);
}

function handleWheel(ev) {
  const oldScale = scale;
  scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * Math.pow(2, -ev.deltaY * 0.01)));
  if (scale === oldScale)
    return;
  tx = (tx - ev.offsetX) * scale / oldScale + ev.offsetX;
  ty = (ty - ev.offsetY) * scale / oldScale + ev.offsetY;
  updateTransform();
}

map.addEventListener('pointerdown', handlePointerDown);
map.addEventListener('pointermove', handlePointerMove);
map.addEventListener('pointerup', handlePointerUp);
map.addEventListener('pointerleave', handlePointerUp);
map.addEventListener('pointercancel', handlePointerUp);
map.addEventListener('wheel', handleWheel, { passive: true });
