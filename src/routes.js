import { biasLon, biasLat, biasXScale, $, map, html, svg, api } from './util.js';

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
let commitTimer = null;
let mapX, mapY, mapZ;
let geoX, geoY, geoZ;

const routes = new Map();
let enabledRoutes = null;
let busTimeoutId = null;
let stallTimeoutId = null;

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

    if (!this.patterns)
      this.loadPattern();
    this.loadStops();
    if (!busTimeoutId)
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
  }

  updateTransform() {
    if (!this.patterns)
      return;
    const d = [];
    for (const pattern of this.patterns) {
      d.push('M');
      for (const { x, y } of pattern.points)
        d.push(x * geoZ + geoX | 0, y * geoZ + geoY | 0);
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

    this.button.classList.add('route-loaded');
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
    this.x = (lon - biasLon) * biasXScale;
    this.y = -(lat - biasLat);
    this.marker = html('div', { class: 'map-bus' }, route.id);
    this.marker.style.setProperty('--color', route.color);
    this.marker.style.setProperty('--angle', `${angle + 45}deg`);
    busLayer.append(this.marker);
    this.updateTransform();
  }

  updateTransform() {
    const x = this.x * mapZ + mapX - map.offsetWidth - 14;
    const y = this.y * mapZ + mapY - map.offsetHeight - 14;
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
    //this.marker.setAttribute('r', '12');
    //this.marker.setAttribute('fill', 'red');
    document.body.classList.add('stop-selected');
    //content.append(this.marker);
    predStopIdElement.textContent = this.id;
    predStopNameElement.textContent = this.name;
    clearPredictions();
    this.refreshPredictions();
    if (!this._loadingPredictions)
      this.updatePredictions();
  }

  deselect() {
    if (currentStop !== this)
      return;
    currentStop = null;
    this.unref();
    //this.marker.setAttribute('r', '4');
    //this.marker.removeAttribute('fill');
    document.body.classList.remove('stop-selected');
    //if (this.visible)
    //  stopLayer.append(this.marker);
    if (predTickTimeout)
      clearTimeout(predTickTimeout);
  }

  updateTransform() {
    const x = this.x * mapZ + mapX - map.offsetWidth - 4;
    const y = this.y * mapZ + mapY - map.offsetHeight - 4;
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
    busTimeoutId = 1;
    for (const id of ids.split(','))
      routes.get(id)?.enable();
    busTimeoutId = null;
    updateBuses();
  }
}

function stall() {
  stallTimeoutId = null;
  map.classList.add('map-stalled');
}

function updateBuses() {
  if (busTimeoutId)
    clearTimeout(busTimeoutId);
  _updateBuses();
}

async function _updateBuses() {
  busTimeoutId = null;
  if (!enabledRoutes.length)
    return;
  if (!stallTimeoutId)
    stallTimeoutId = setTimeout(stall, 2000);
  const requests = [];
  for (let i = 0; i < enabledRoutes.length; i += 10) {
    const rt = enabledRoutes.slice(i, i + 10).map(route => route.id).join(',');
    requests.push(api('getvehicles', { rt }));
  }
  let data;
  try {
    data = await Promise.all(requests);
  } catch (e) {
    busTimeoutId = setTimeout(_updateBuses, 5000);
    console.log(e);
    return;
  }
  if (stallTimeoutId) {
    clearTimeout(stallTimeoutId);
    stallTimeoutId = null;
  }
  map.classList.remove('map-stalled');
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
  busTimeoutId = setTimeout(_updateBuses, buses.length ? 5000 : 60000);
}

export function updateTransform(x, y, z) {
  mapX = x;
  mapY = y;
  mapZ = z;
  let offsetZ;
  if (geoZ === undefined || (offsetZ = mapZ / geoZ) < minOffsetZ || offsetZ > maxOffsetZ) {
    commitTransform();
  } else {
    if (!commitTimer)
      commitTimer = setTimeout(commitTransform, 500);
    const offsetX = mapX - geoX * offsetZ - innerWidth;
    const offsetY = mapY - geoY * offsetZ - innerHeight;
    content.style.transform = `translate3d(${offsetX}px,${offsetY}px,0px) scale(${offsetZ})`;
    for (const stop of stops.values())
      stop.updateTransform();
    for (const bus of buses)
      bus.updateTransform();
  }
}

function commitTransform() {
  if (commitTimer) {
    clearTimeout(commitTimer);
    commitTimer = null;
  }
  geoX = mapX;
  geoY = mapY;
  geoZ = mapZ;
  content.style.transform = `translate3d(${-innerWidth}px,${-innerHeight}px,0px)`;
  content.style.backgroundPosition = `${mapX}px ${mapY}px`;
  content.style.backgroundSize = `${mapZ * 0.005}px`;

  if (routes.size) {
    for (const route of routes.values())
      route.updateTransform();
  }
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

document.querySelector('#routes-button').addEventListener('click', toggleRoutes);
document.querySelector('#routes-clear-button').addEventListener('click', clearRoutes);
document.querySelector('#refresh-button').addEventListener('click', () => { location.reload(); });

loadRoutes();
