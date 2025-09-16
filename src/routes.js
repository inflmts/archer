import { $, biasLon, biasLat, biasXScale, map, html, svg, api } from './util.js';

const ROUTES_STORAGE_KEY = 'routes';

const content = $('map-content');
const routeLayer = $('map-routes');
const stopLayer = $('map-stops');
const busLayer = $('map-buses');
const routeList = $('routes-list');

const predStopIdElement = $('predictions-stop-id');
const predStopNameElement = $('predictions-stop-name');
const predMessageElement = $('predictions-message');
const predNoneElement = $('predictions-none');
const predListElement = $('predictions-list');

const minOffsetZ = 0.5;
const maxOffsetZ = 2;
let mapX, mapY, mapZ;
let routeZ;

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

    this.line = svg('path', {
      'fill': 'none',
      'stroke': this.color,
      'stroke-width': '4',
      'stroke-linejoin': 'bevel'
    });
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
    routeLayer.append(this.line);
    if (this.stops)
      for (const stop of this.stops)
        stop.ref();
    updatePredictions();

    for (const bus of buses)
      if (bus.route === this)
        bus.marker.style.display = null;

    if (!this.patterns)
      this.loadPattern();
    this.loadStops();
    updateBuses();
  }

  disable() {
    if (!this.enabled)
      return;
    this.enabled = false;
    enabledRoutes.splice(this._enabledIndex, 1);
    for (let i = this._enabledIndex; i < enabledRoutes.length; i++)
      enabledRoutes[i]._enabledIndex = i;

    this.button.classList.remove('route-enabled');
    this.line.remove();
    if (this.stops)
      for (const stop of this.stops)
        stop.unref();
    updatePredictions();

    for (const bus of buses)
      if (bus.route === this)
        bus.marker.style.display = 'none';
  }

  updateTransform() {
    if (!this.patterns) {
      this.line.setAttribute('d', '');
      return;
    }
    const d = [];
    for (const pattern of this.patterns) {
      d.push('M');
      for (const { x, y } of pattern.points)
        d.push(x * routeZ | 0, y * routeZ | 0);
        //d.push(x * geoZ + geoX | 0, y * geoZ + geoY | 0);
    }
    this.line.setAttribute('d', d.join(' '));
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
    for (const { pid, pt } of data.ptr) {
      const pattern = { id: pid, points: [] };
      for (const { lon, lat } of pt) {
        pattern.points.push({
          x: (lon - biasLon) * biasXScale,
          y: -(lat - biasLat)
        });
      }
      this.patterns.push(pattern);
    }
    this.updateTransform();
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
    for (const { route, id, dest, time } of this.predictions) {
      const element = html('li', { class: 'prediction' });
      if (route)
        element.style.setProperty('--color', route.color);
      if (!route || !route.enabled)
        element.classList.add('prediction-other');
      element.append(
        html('div', { class: 'prediction-route' }, id),
        html('div', { class: 'prediction-time' + (time === 'DUE' ? ' prediction-due' : '') }, time),
        html('div', { class: 'prediction-dest' }, dest)
      );
      predListElement.append(element);
    }
  }

}

function refreshPredictions() {
  currentStop.refreshPredictions();
}

export function openRoutes() {
  document.body.classList.add('routes-open');
}

export function closeRoutes() {
  document.body.classList.remove('routes-open');
}

export function toggleRoutes() {
  document.body.classList.toggle('routes-open');
}

function clearRoutes() {
  while (enabledRoutes.length)
    enabledRoutes[enabledRoutes.length - 1].disable();
  saveRoutes();
}

function handleClick(ev) {
  ev.currentTarget.route.toggle();
  saveRoutes();
}

export function saveRoutes() {
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

export function updateTransform(x, y, z) {
  mapX = x;
  mapY = y;
  mapZ = z;
  let offsetZ = mapZ / routeZ;
  if (routeZ === undefined || offsetZ < minOffsetZ || offsetZ > maxOffsetZ) {
    routeZ = mapZ;
    offsetZ = 1;
    const off = 0.1 * routeZ | 0;
    const dim = 2 * off;
    content.setAttribute('width', dim);
    content.setAttribute('height', dim);
    content.setAttribute('viewBox', `${-off},${-off},${dim},${dim}`);
    for (const route of routes.values())
      route.updateTransform();
  }
  const off = 0.1 * mapZ | 0;
  map.style.backgroundPosition = `${mapX}px ${mapY}px`;
  map.style.backgroundSize = `${mapZ * 0.005}px`;
  content.style.transform = `translate3d(${mapX - off}px,${mapY - off}px,0px) scale(${offsetZ})`;
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

export function updatePredictions() {
  if (currentStop)
    currentStop.updatePredictions();
}

export function deselectStop() {
  if (currentStop)
    currentStop.deselect();
}

export function addStop(id, name, lon, lat) {
  let stop = stops.get(id);
  if (!stop)
    stops.set(id, stop = new Stop(id, name, lon, lat));
  return stop;
}

export function getNearestStop(x, y) {
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

document.addEventListener('visibilitychange', () => {
  if (document.hidden)
    pause();
  else
    resume();
});

document.querySelector('#routes-button').addEventListener('click', toggleRoutes);
document.querySelector('#routes-clear-button').addEventListener('click', clearRoutes);
document.querySelector('#refresh-button').addEventListener('click', () => { location.reload(); });

loadRoutes();
