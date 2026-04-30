import { $, html, api } from './util.js';

const ROUTES_STORAGE_KEY = 'routes';

const map = $('map');
const canvas = $('map-canvas');
const stopLayer = $('map-stops');
const busLayer = $('map-buses');
const routeList = $('routes-list');

const predStopIdElement = $('predictions-stop-id');
const predStopNameElement = $('predictions-stop-name');
const predMessageElement = $('predictions-message');
const predNoneElement = $('predictions-none');
const predListElement = $('predictions-list');

const ctx = canvas.getContext('2d');

const biasLon = -82.34834;
const biasLat = 29.64724;
const biasXScale = Math.cos(biasLat * Math.PI / 180);
const canvasResolution = 20000;

const minScale = 2000;
const maxScale = 200000;
const panDragCoefficient = 0.001;
const panFriction = 0.002;
const zoomIncrement = 0.005;

let mode, modeAnimateId;
let p1, p1x, p1y, p2, p2x, p2y;
let panTime, panDeltaTime, panDeltaX, panDeltaY;
let panSpeed, panFactorX, panFactorY;
let pinchDist;

let mapX = innerWidth * 0.5;
let mapY = innerHeight * 0.5;
let mapZ = 10000;

let canvasX, canvasY;

let needRender = false;
let paused = true;

const routes = new Map();
let enabledRoutes = null;
let busTimeoutId = null;
let loadingBuses = false;

const stops = new Map();
let currentStop = null;
let predTickTimeout = null;

let buses = [];

class Route {

  enabled = false;
  patternLoading = false;
  patterns = null;
  stopsLoading = false;
  stops = null;

  constructor(id, name, color) {
    this.id = id;
    this.name = name;
    this.color = color;

    this.button = html('button', { class: 'route' });
    this.button.route = this;
    this.button.append(
      html('div', { class: 'route-id' }, this.id),
      html('div', { class: 'route-name' }, this.name)
    );
    this.button.style.setProperty('--color', this.color);
    this.button.addEventListener('click', handleClick);
  }

  toggle() {
    if (this.enabled)
      this.disable();
    else
      this.enable();
  }

  enable() {
    if (this.enabled)
      return;
    this.enabled = true;
    this._enabledIndex = enabledRoutes.length;
    enabledRoutes.push(this);

    this.button.classList.add('route-enabled');

    if (this.stops)
      for (const stop of this.stops)
        stop.ref();

    for (const bus of buses)
      if (bus.route === this)
        bus.marker.style.display = null;

    if (this.patterns)
      needRender = true;
    else
      this.loadPattern();

    this.loadStops();
    updateBuses();
    updatePredictions();
  }

  disable() {
    if (!this.enabled)
      return;
    this.enabled = false;
    enabledRoutes.splice(this._enabledIndex, 1);
    for (let i = this._enabledIndex; i < enabledRoutes.length; i++)
      enabledRoutes[i]._enabledIndex = i;

    this.button.classList.remove('route-enabled');

    if (this.stops)
      for (const stop of this.stops)
        stop.unref();
    updatePredictions();

    for (const bus of buses)
      if (bus.route === this)
        bus.marker.style.display = 'none';

    if (this.patterns)
      needRender = true;
  }

  loadPattern() {
    if (this.patternLoading)
      return;
    this.patternLoading = true;
    this.patterns = null;
    this._loadPattern();
  }

  async _loadPattern() {
    let data;
    try {
      data = await api('getpatterns', { rt: this.id });
    } finally {
      this.patternLoading = false;
    }

    this.patterns = [];
    this.path = new Path2D();
    this.minX = Infinity;
    this.maxX = -Infinity;
    this.minY = Infinity;
    this.maxY = -Infinity;

    for (const { pid, pt } of data.ptr) {
      pt.forEach(({ lon, lat }, i) => {
        const x = (lon - biasLon) * biasXScale * canvasResolution;
        const y = -(lat - biasLat) * canvasResolution;
        if (x < this.minX) this.minX = x;
        if (x > this.maxX) this.maxX = x;
        if (y < this.minY) this.minY = y;
        if (y > this.maxY) this.maxY = y;
        if (i) this.path.lineTo(x, y);
        else   this.path.moveTo(x, y);
      });
      this.patterns.push({ id: pid });
    }

    if (this.enabled)
      render(true);
  }

  hasPattern(id) {
    if (!this.patterns)
      return false;
    for (const pattern of this.patterns)
      if (pattern.id === id)
        return true;
    return false;
  }

  loadStops() {
    if (this.stopsLoading)
      return;
    this.stopsLoading = true;
    this._loadStops();
  }

  async _loadStops() {
    const data = await Promise.all([
      api('getstops', { rt: this.id, dir: 'INBOUND' }),
      api('getstops', { rt: this.id, dir: 'OUTBOUND' })
    ]);

    this.stops = [];
    for (const dir of data) {
      for (const { stpid, stpnm, lon, lat } of dir.stops) {
          const stop = addStop(stpid, stpnm, lon, lat);
          this.stops.push(stop);
          if (this.enabled)
            stop.ref();
      }
    }
  }

}

class Bus {

  constructor(id, route, lon, lat, angle) {
    this.id = id;
    this.route = route;
    this.x = (lon - biasLon) * biasXScale;
    this.y = -(lat - biasLat);
    this.marker = html('div', { class: 'map-bus' }, route.id);
    this.marker.style.setProperty('--color', route.color);
    this.marker.style.setProperty('--angle', `${angle + 45}deg`);
    if (!route.enabled)
      this.marker.style.display = 'none';
    busLayer.append(this.marker);
    this.updateTransform();
  }

  updateTransform() {
    const x = this.x * mapZ + mapX - 15;
    const y = this.y * mapZ + mapY - 15;
    this.marker.style.transform = `translate3d(${x}px,${y}px,0px)`;
  }

}

class Stop {

  visible = 0;
  predictions = null;
  _loadingPredictions = false;
  _predictionsExpire = 0;

  constructor(id, name, lon, lat) {
    this.id = id;
    this.name = name;
    this.x = (lon - biasLon) * biasXScale;
    this.y = -(lat - biasLat);

    this.marker = html('div', { class: 'map-stop' });
    this.updateTransform();
  }

  ref() {
    if (!this.visible++)
      stopLayer.append(this.marker);
  }

  unref() {
    if (!--this.visible)
      this.marker.remove();
  }

  select() {
    if (currentStop === this)
      return;
    if (currentStop)
      currentStop.deselect();
    currentStop = this;
    this.ref();
    this.marker.classList.add('selected');
    document.body.classList.add('stop-selected');
    map.append(this.marker);
    predStopIdElement.textContent = this.id;
    predStopNameElement.textContent = this.name;
    clearPredictions();
    this.refreshPredictions();
    if (!this._loadingPredictions)
      this.updatePredictions();
    this.updateTransform();
  }

  deselect() {
    if (currentStop !== this)
      return;
    currentStop = null;
    this.unref();
    this.marker.classList.remove('selected');
    document.body.classList.remove('stop-selected');
    if (this.visible)
      stopLayer.append(this.marker);
    if (predTickTimeout)
      clearTimeout(predTickTimeout);
    this.updateTransform();
  }

  updateTransform() {
    const x = this.x * mapZ + mapX - 4;
    const y = this.y * mapZ + mapY - 4;
    this.marker.style.transform = `translate3d(${x}px,${y}px,0px)`;
  }

  refreshPredictions() {
    const remaining = this._predictionsExpire - Date.now();
    if (remaining > 0) {
      predMessageElement.textContent = `Refreshing predictions in ${Math.ceil(remaining / 1000)}s...`;
      predTickTimeout = setTimeout(refreshPredictions, remaining % 1000 + 10);
      return;
    }
    clearPredictions();
    predMessageElement.textContent = 'Loading predictions...';
    this._loadingPredictions = true;
    this._loadPredictions();
  }

  async _loadPredictions() {
    let data;
    try {
      data = await api('getpredictions', { stpid: this.id });
    } finally {
      this._loadingPredictions = false;
    }
    if (data.prd) {
      this.predictions = data.prd.map(prd => {
        return {
          route: routes.get(prd.rt),
          id: prd.rt,
          num: `#${prd.vid}`,
          dest: prd.des,
          time: prd.prdctdn === 'DUE' ? 'DUE' : `${prd.prdctdn}m`
        };
      });
    } else {
      this.predictions = null;
    }
    this._predictionsExpire = Date.now() + 30000;
    if (currentStop === this)
      this.updatePredictions();
    this.refreshPredictions();
  }

  updatePredictions() {
    clearPredictions();
    if (!this.predictions || !this.predictions.length) {
      predNoneElement.style.display = null;
      return;
    }
    for (const { route, id, num, dest, time } of this.predictions) {
      const element = html('li', { class: 'prediction' });
      if (route)
        element.style.setProperty('--color', route.color);
      if (!route || !route.enabled)
        element.classList.add('prediction-other');
      element.append(
        html('div', { class: 'prediction-route' }, id),
        html('div', { class: 'prediction-time' + (time === 'DUE' ? ' prediction-due' : '') }, time),
        html('div', { class: 'prediction-num' }, num),
        html('div', { class: 'prediction-dest' }, dest)
      );
      predListElement.append(element);
    }
  }

}

function refreshPredictions() {
  currentStop.refreshPredictions();
}

function openRoutes() {
  document.body.classList.add('routes-open');
}

function closeRoutes() {
  document.body.classList.remove('routes-open');
}

function toggleRoutes() {
  document.body.classList.toggle('routes-open');
}

function toggleNumbers() {
  document.body.classList.toggle('show-numbers');
}

function clearRoutes() {
  while (enabledRoutes.length)
    enabledRoutes[enabledRoutes.length - 1].disable();
  render();
  saveRoutes();
}

function handleClick(ev) {
  ev.currentTarget.route.toggle();
  render();
  saveRoutes();
}

function saveRoutes() {
  if (!enabledRoutes)
    return;
  let ids;
  if (enabledRoutes.length) {
    ids = enabledRoutes.map(route => route.id).join(',');
    console.log('Updating routes:', ids);
  } else {
    ids = '';
    console.log('Clearing routes');
  }
  localStorage.setItem(ROUTES_STORAGE_KEY, ids);
}

async function loadRoutes() {
  const data = await api('getroutes');

  enabledRoutes = [];
  for (const { rt, rtnm, rtclr } of data.routes) {
    const route = new Route(rt, rtnm, rtclr);
    routes.set(route.id, route);
    routeList.append(route.button);
  }

  const ids = localStorage.getItem(ROUTES_STORAGE_KEY);
  if (ids) {
    console.log('Loading routes:', ids);
    for (const id of ids.split(','))
      routes.get(id)?.enable();
    render();
    resume();
    updateBuses();
  }
}

function updateBuses() {
  if (paused || loadingBuses)
    return;
  if (busTimeoutId)
    clearTimeout(busTimeoutId);
  _updateBuses();
}

async function _updateBuses() {
  busTimeoutId = null;
  if (!enabledRoutes.length)
    return;
  const requests = [];
  for (let i = 0; i < enabledRoutes.length; i += 10) {
    const rt = enabledRoutes.slice(i, i + 10).map(route => route.id).join(',');
    requests.push(api('getvehicles', { rt }));
  }
  let data;
  loadingBuses = true;
  try {
    data = await Promise.all(requests);
  } catch (e) {
    if (!paused)
      busTimeoutId = setTimeout(_updateBuses, 5000);
    throw e;
  } finally {
    loadingBuses = false;
  }
  for (const bus of buses)
    bus.marker.remove();
  buses = [];
  for (const item of data) {
    if (!item.vehicle)
      continue;
    for (const { vid, rt, pid, lon, lat, hdg } of item.vehicle) {
      const route = routes.get(rt);
      if (!route)
        continue;
      if (!route.hasPattern(pid))
        route.loadPattern();
      buses.push(new Bus(vid, route, lon, lat, Number(hdg)));
    }
  }
  if (!paused)
    busTimeoutId = setTimeout(_updateBuses, buses.length ? 5000 : 60000);
}

function updateTransform() {
  canvas.style.transform = `translate(${mapX}px, ${mapY}px) scale(${mapZ / canvasResolution}) translate(${canvasX}px, ${canvasY}px)`;
  for (const stop of stops.values())
    stop.updateTransform();
  for (const bus of buses)
    bus.updateTransform();
}

function clearPredictions() {
  predNoneElement.style.display = 'none';
  while (predListElement.lastChild)
    predListElement.removeChild(predListElement.lastChild);
}

function updatePredictions() {
  if (currentStop)
    currentStop.updatePredictions();
}

function deselectStop() {
  if (currentStop)
    currentStop.deselect();
}

function addStop(id, name, lon, lat) {
  let stop = stops.get(id);
  if (!stop)
    stops.set(id, stop = new Stop(id, name, lon, lat));
  return stop;
}

function getNearestStop(x, y) {
  let nearest = null;
  let nearestDistSq = Infinity;
  for (const stop of stops.values()) {
    if (!stop.visible)
      continue;
    const dx = stop.x - x;
    const dy = stop.y - y;
    const distSq = dx * dx + dy * dy;
    if (distSq < nearestDistSq) {
      nearest = stop;
      nearestDistSq = distSq;
    }
  }
  return nearest;
}

function pause() {
  if (paused)
    return;
  paused = true;
  if (busTimeoutId)
    clearTimeout(busTimeoutId);
}

function resume() {
  if (!paused)
    return;
  paused = false;
  updateBuses();
}

function render(force = false) {
  if (!force && !needRender)
    return;
  needRender = false;
  if (!enabledRoutes)
    return;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const route of enabledRoutes) {
    if (route.minX < minX) minX = route.minX;
    if (route.maxX > maxX) maxX = route.maxX;
    if (route.minY < minY) minY = route.minY;
    if (route.maxY > maxY) maxY = route.maxY;
  }

  minX -= 1;
  maxX += 1;
  minY -= 1;
  maxY += 1;

  canvasX = minX;
  canvasY = minY;
  canvas.width = maxX - minX | 0;
  canvas.height = maxY - minY | 0;
  canvas.style.transform = `translate(${mapX}px, ${mapY}px) scale(${mapZ / canvasResolution}) translate(${canvasX}px, ${canvasY}px)`;

  ctx.setTransform(1, 0, 0, 1, -canvasX, -canvasY);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2;

  for (const route of enabledRoutes) {
    if (route.patterns) {
      ctx.strokeStyle = route.color;
      ctx.stroke(route.path);
    }
  }
}

function handleMode(ret) {
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
      if (panDeltaTime === null)
        return idle;
      const stop = getNearestStop((p1x - mapX) / mapZ, (p1y - mapY) / mapZ);
      if (!stop)
        return idle;
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
    if (p === p1) {
      p1 = p2;
      p1x = p2x;
      p1y = p2y;
    } else if (p !== p2) {
      return;
    }
    panTime = performance.now();
    panDeltaTime = null;
    return pan;
  }

};

mode = idle;

function handleAnimate() {
  modeAnimateId = requestAnimationFrame(handleAnimate);
  handleMode(mode.animate());
}

function handlePointerDown(ev) {
  if (mode.down)
    handleMode(mode.down(ev.pointerId, ev.offsetX, ev.offsetY));
}

function handlePointerMove(ev) {
  if (mode.move)
    handleMode(mode.move(ev.pointerId, ev.offsetX, ev.offsetY));
}

function handlePointerUp(ev) {
  if (mode.up)
    handleMode(mode.up(ev.pointerId));
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

document.addEventListener('visibilitychange', () => {
  if (document.hidden)
    pause();
  else
    resume();
});

$('routes-button').addEventListener('click', toggleRoutes);
$('routes-clear-button').addEventListener('click', clearRoutes);
$('refresh-button').addEventListener('click', () => { location.reload(); });
$('number-button').addEventListener('click', toggleNumbers);

updateTransform();
loadRoutes();
