import { map } from './util.js';
import { closeRoutes, updateTransform as updateRouteTransform, deselectStop, getNearestStop } from './routes.js';

const minScale = 2000;
const maxScale = 200000;
const panDragCoefficient = 0.001;//0.004;
const panFriction = 0.002;//0.001;
const zoomIncrement = 0.005;

let mode, modeAnimateId;
let p1, p1x, p1y, p2, p2x, p2y;
let panTime, panDeltaTime, panDeltaX, panDeltaY;
let panSpeed, panFactorX, panFactorY;
let pinchDist;

let mapX = innerWidth * 0.5;
let mapY = innerHeight * 0.5;
let mapZ = 10000;

function updateTransform() {
  updateRouteTransform(mapX, mapY, mapZ);
}

function handle(ret) {
  if (!ret || ret === mode)
    return;
  if (mode.animate)
    cancelAnimationFrame(modeAnimateId);
  mode = ret;
  if (mode.enter)
    mode.enter();
  if (mode.animate)
    modeAnimateId = requestAnimationFrame(handleAnimate);
}

const idle = {

  down(p, x, y) {
    p1 = p;
    p1x = x;
    p1y = y;
    panTime = performance.now();
    panDeltaTime = 0;
    closeRoutes();
    deselectStop();
    return pan;
  }

};

const pan = {

  down(p, x, y) {
    p2 = p;
    p2x = x;
    p2y = y;
    pinchDist = Math.hypot(p2x - p1x, p2y - p1y);
    return pinch;
  },

  move(p, x, y) {
    if (p !== p1 || (x === p1x && y === p1y))
      return;
    const now = performance.now();
    panDeltaTime = now - panTime;
    panDeltaX = x - p1x;
    panDeltaY = y - p1y;
    panTime = now;
    p1x = x;
    p1y = y;
    mapX += panDeltaX;
    mapY += panDeltaY;
    updateTransform();
  },

  up(p) {
    if (p !== p1)
      return;
    if (!panDeltaTime) {
      const stop = getNearestStop((p1x - mapX) / mapZ, (p1y - mapY) / mapZ);
      if (!stop)
        return idle;
//    mapX = innerWidth * 1.6 - stop.x * mapZ;
//    mapY = innerHeight * 1.6 - stop.y * mapZ;
//    updateTransform();
      stop.select();
      return idle;
    }
    const delta = Math.hypot(panDeltaX, panDeltaY);
    panSpeed = delta / panDeltaTime;
    panFactorX = panDeltaX / delta;
    panFactorY = panDeltaY / delta;
    return slide;
  }

}

const slide = {

  down(p, x, y) {
    p1 = p;
    p1x = x;
    p1y = y;
    panTime = performance.now();
    panDeltaTime = 0;
    return pan;
  },

  animate() {
    const now = performance.now();
    panDeltaTime = now - panTime;
    panTime = now;
    panSpeed -= (panDragCoefficient * panSpeed * panSpeed + panFriction) * panDeltaTime;
    if (panSpeed <= 0)
      return idle;
    const delta = panSpeed * panDeltaTime;
    mapX += delta * panFactorX;
    mapY += delta * panFactorY;
    updateTransform();
  }

};

const pinch = {

  down() {
    return idle;
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
    const oldDist = pinchDist;
    const oldScale = mapZ;
    pinchDist = Math.hypot(p2x - p1x, p2y - p1y);
    mapZ = Math.max(minScale, Math.min(maxScale, mapZ * pinchDist / oldDist));
    const offsetZ = mapZ / oldScale;
    mapX = (mapX - (o1x + o2x) / 2) * offsetZ + (p1x + p2x) / 2;
    mapY = (mapY - (o1y + o2y) / 2) * offsetZ + (p1y + p2y) / 2;
    updateTransform();
  },

  up(p) {
    if (p !== p1 && p !== p2)
      return;
    return idle;
  }

};

mode = idle;

function handleAnimate() {
  modeAnimateId = requestAnimationFrame(handleAnimate);
  handle(mode.animate());
}

function handlePointerDown(ev) {
  if (mode.down)
    handle(mode.down(ev.pointerId, ev.offsetX, ev.offsetY));
}

function handlePointerMove(ev) {
  if (mode.move)
    handle(mode.move(ev.pointerId, ev.offsetX, ev.offsetY));
}

function handlePointerUp(ev) {
  if (mode.up)
    handle(mode.up(ev.pointerId));
}

function handleWheel(ev) {
  const oldScale = mapZ;
  mapZ = Math.max(minScale, Math.min(maxScale, mapZ * Math.pow(2, -zoomIncrement * ev.deltaY)));
  if (mapZ === oldScale)
    return;
  // s0 F + T0 = s1 F + T1
  // T1 = s0 F - s1 F + T0
  // T1 = (s0 - s1) F + T0
  mapX += (1 - mapZ / oldScale) * (ev.offsetX - mapX);
  mapY += (1 - mapZ / oldScale) * (ev.offsetY - mapY);
  updateTransform();
}

map.addEventListener('pointerdown', handlePointerDown);
map.addEventListener('pointermove', handlePointerMove);
map.addEventListener('pointerup', handlePointerUp);
map.addEventListener('pointerleave', handlePointerUp);
map.addEventListener('pointercancel', handlePointerUp);
map.addEventListener('wheel', handleWheel, { passive: true });
updateTransform();
