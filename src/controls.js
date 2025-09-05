import { $, map } from './util.js';
import { closeRoutes, updateTransform as updateRouteTransform, deselectStop, getNearestStop } from './routes.js';

const content = $('map-content');

const minScale = 2000;
const maxScale = 200000;
const panDragCoefficient = 0.004;
const panFriction = 0.001;
const zoomDragCoefficient = 0.02;
const zoomFriction = 0.0005;
const zoomIncrement = 0.0005;

let mode, modeAnimateId;
let p1, p1x, p1y, p2, p2x, p2y;
let panTime, panDeltaTime, panDeltaX, panDeltaY;
let panSpeed, panFactorX, panFactorY;
//let p1t, p1dt, p1dx, p1dy;
//let p2t, p2dt, p2dx, p2dy;
let pinchDist, /*pinchTime, pinchDeltaTime,*/ pinchDeltaZ;
let pinchVel;

let mapX = map.offsetWidth * 1.5;
let mapY = map.offsetHeight * 1.5;
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
//  pinchTime = p1t = p2t = performance.now();
//  pinchDeltaTime = p1dt = p2dt = Infinity;
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
//    mapX = map.offsetWidth * 1.6 - stop.x * mapZ;
//    mapY = map.offsetHeight * 1.6 - stop.y * mapZ;
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
//  let now;
    if (p === p1) {
      if (p1x === x && p1y === y)
        return;
//    now = performance.now();
//    p1dt = now - p1t;
//    p1dx = x - p1x;
//    p1dy = y - p1y;
//    p1t = now;
      p1x = x;
      p1y = y;
    } else if (p === p2) {
      if (p2x === x && p2y === y)
        return;
//    now = performance.now();
//    p2dt = now - p2t;
//    p2dx = x - p2x;
//    p2dy = y - p2y;
//    p2t = now;
      p2x = x;
      p2y = y;
    } else {
      return;
    }
    const oldDist = pinchDist;
    const oldScale = mapZ;
    pinchDist = Math.hypot(p2x - p1x, p2y - p1y);
//  pinchDeltaTime = now - pinchTime;
//  pinchTime = now;
    mapZ = Math.max(minScale, Math.min(maxScale, mapZ * pinchDist / oldDist));
    pinchDeltaZ = mapZ / oldScale;
    mapX = (mapX - (o1x + o2x) / 2) * pinchDeltaZ + (p1x + p2x) / 2;
    mapY = (mapY - (o1y + o2y) / 2) * pinchDeltaZ + (p1y + p2y) / 2;
    updateTransform();
  },

  up(p) {
    if (p !== p1 && p !== p2)
      return;
    return idle;
//  const velX = (p1dx / p1dt + p2dx / p2dt) / 2;
//  const velY = (p1dy / p1dt + p2dy / p2dt) / 2;
//  panSpeed = Math.hypot(velX, velY);
//  panFactorX = velX / panSpeed;
//  panFactorY = velY / panSpeed;
//  panTime = performance.now();
//  pinchVel = 2000 * Math.log2(pinchDeltaZ) / (pinchDeltaTime || Infinity);
//  return zoom;
  }

};

const zoom = {

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
    if (panSpeed < 0)
      panSpeed = 0;
    const dv = (zoomDragCoefficient * pinchVel * pinchVel + zoomFriction) * panDeltaTime;
    if (pinchVel > 0 ? (pinchVel -= dv) < 0 : (pinchVel += dv) > 0)
      pinchVel = 0;
    const oldScale = mapZ;
    mapZ = Math.max(minScale, Math.min(maxScale, mapZ * Math.pow(2, pinchVel)));
    if (oldScale === mapZ)
      pinchVel = 0;
    if (!panSpeed && !pinchVel)
      return idle;
    const delta = panSpeed * panDeltaTime;
    mapX += delta * panFactorX;
    mapY += delta * panFactorY;
    updateTransform();
  }

};

mode = idle;

function handleAnimate() {
  modeAnimateId = requestAnimationFrame(handleAnimate);
  handle(mode.animate());
}

function handlePointerDown(ev) {
  if (mode.down)
    handle(mode.down(ev.pointerId, ev.offsetX + map.offsetWidth, ev.offsetY + map.offsetHeight));
}

function handlePointerMove(ev) {
  if (mode.move)
    handle(mode.move(ev.pointerId, ev.offsetX + map.offsetWidth, ev.offsetY + map.offsetHeight));
}

function handlePointerUp(ev) {
  if (mode.up)
    handle(mode.up(ev.pointerId));
}

let zoomAnimating = false;
let zoomVel, zoomFocusX, zoomFocusY, zoomTime;

function updateWheel() {
  const now = performance.now();
  const dv = (zoomDragCoefficient * zoomVel * zoomVel + zoomFriction) * (now - zoomTime);
  zoomTime = now;
  if (zoomVel > 0 ? (zoomVel -= dv) <= 0 : (zoomVel += dv) >= 0) {
    zoomAnimating = false;
    return;
  }
  const oldScale = mapZ;
  mapZ = Math.max(minScale, Math.min(maxScale, mapZ * Math.pow(2, zoomVel)));
  if (mapZ === oldScale) {
    zoomAnimating = false;
    return;
  }
  // s0 F + T0 = s1 F + T1
  // T1 = s0 F - s1 F + T0
  // T1 = (s0 - s1) F + T0
  mapX += (oldScale - mapZ) * zoomFocusX;
  mapY += (oldScale - mapZ) * zoomFocusY;
  updateTransform();
  requestAnimationFrame(updateWheel);
}

function handleWheel(ev) {
  if (!zoomAnimating) {
    zoomAnimating = true;
    zoomVel = 0;
    zoomFocusX = (ev.offsetX + map.offsetWidth - mapX) / mapZ;
    zoomFocusY = (ev.offsetY + map.offsetHeight - mapY) / mapZ;
    zoomTime = performance.now();
    requestAnimationFrame(updateWheel);
  }
  zoomVel -= ev.deltaY * zoomIncrement;
}

function handleResize() {
  content.setAttribute('width', innerWidth * 3);
  content.setAttribute('height', innerHeight * 3);
}

map.addEventListener('pointerdown', handlePointerDown);
map.addEventListener('pointermove', handlePointerMove);
map.addEventListener('pointerup', handlePointerUp);
map.addEventListener('pointerleave', handlePointerUp);
map.addEventListener('pointercancel', handlePointerUp);
map.addEventListener('wheel', handleWheel, { passive: true });
window.addEventListener('resize', handleResize);
handleResize();
updateTransform();
