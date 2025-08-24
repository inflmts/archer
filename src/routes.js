import { biasX, biasY, html, svg, api } from './util.js';
import { addStop, updatePredictions } from './stops.js';

const ROUTES_STORAGE_KEY = 'routes';

const routeLayer = document.querySelector('#map-routes');
const vehicleLayer = document.querySelector('#map-vehicles');
const list = document.querySelector('#routes-list');

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

let routes = null;
let enabledRoutes = null;
let vehicleTimeoutId = null;

class Route {

  enabled = false;
  patternLoading = false;
  patternIds = null;
  stopsLoading = false;
  stops = null;

  _vehicleMarkerCreated = false;

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

    this.pattern = svg('path', {
      'class': 'map-route',
      'stroke': this.color
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
    routeLayer.append(this.pattern);
    if (this.stops)
      for (const stop of this.stops)
        stop.ref();
    updatePredictions();

    this.loadPattern();
    this.loadStops();
    if (!vehicleTimeoutId)
      updateVehicles();
  }

  disable() {
    if (!this.enabled)
      return;
    this.enabled = false;
    enabledRoutes.splice(this._enabledIndex, 1);
    for (let i = this._enabledIndex; i < enabledRoutes.length; i++)
      enabledRoutes[i]._enabledIndex = i;

    this.button.classList.remove('route-enabled');
    this.pattern.remove();
    if (this.stops)
      for (const stop of this.stops)
        stop.unref();
    updatePredictions();
  }

  loadPattern() {
    if (this.patternLoading)
      return;
    this.patternLoading = true;
    this.patternIds = [];
    this._loadPattern();
  }

  async _loadPattern() {
    let data;
    try {
      data = await api(`getpatterns?rt=${this.id}`);
    } finally {
      this.patternLoading = false;
    }

    const d = [];
    for (const { pid, pt } of data.ptr) {
      this.patternIds.push(pid);
      d.push('M');
      for (const { lon, lat } of pt) {
        d.push(lon * 1.15 - biasX, -lat - biasY);
      }
    }
    this.pattern.setAttribute('d', d.join(' '));
  }

  loadStops() {
    if (this.stopsLoading)
      return;
    this.stopsLoading = true;
    this._loadStops();
  }

  async _loadStops() {
    const data = await Promise.all([
      api(`getstops?rt=${this.id}&dir=INBOUND`),
      api(`getstops?rt=${this.id}&dir=OUTBOUND`)
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

  createVehicle(element, lon, lat, hdg) {
    if (!element) {
      element = svg('g', { 'class': 'map-vehicle' });
      element.append(
        svg('path', { 'd': 'M 0,-20 L-10,-10 A 14.1,14.1,270,1,0,10,-10 Z' }),
        svg('text', { 'dy': '6' })
      );
      vehicleLayer.append(element);
    }

    const x = lon * 1.15 - biasX;
    const y = -lat - biasY;
    element.style.setProperty('--transform', `translate(${x}px, ${y}px)`);
    element.children[0].setAttribute('transform', `rotate(${hdg})`);
    element.children[0].setAttribute('fill', this.color);
    element.children[1].textContent = this.id;
    return element;
  }

}

export function getRoute(id) {
  return routes[id];
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

  routes = Object.create(null);
  enabledRoutes = [];
  for (const { rt, rtnm, rtclr } of data.routes) {
    const route = new Route(rt, rtnm, rtclr);
    routes[route.id] = route;
    list.append(route.button);
  }

  const ids = localStorage.getItem(ROUTES_STORAGE_KEY);
  if (ids) {
    console.log('Loading routes:', ids);
    vehicleTimeoutId = 1;
    for (const id of ids.split(','))
      if (id in routes)
        routes[id].enable();
    vehicleTimeoutId = null;
    updateVehicles();
  }
}

async function updateVehicles() {
  if (!enabledRoutes.length) {
    vehicleTimeoutId = null;
    while (vehicleLayer.children.length)
      vehicleLayer.lastChild.remove();
    return;
  }
  const requests = [];
  for (let i = 0; i < enabledRoutes.length; i += 10) {
    const rt = enabledRoutes.slice(i, i + 10).map(route => route.id).join(',');
    requests.push(api(`getvehicles?rt=${rt}`));
  }
  let data;
  try {
    data = await Promise.all(requests);
  } catch (e) {
    vehicleTimeoutId = setTimeout(updateVehicles, 5000);
    throw e;
  }
  let i = 0;
  for (const item of data) {
    if (!item.vehicle)
      continue;
    for (const { rt, pid, lon, lat, hdg } of item.vehicle) {
      const route = routes[rt];
      if (!route)
        continue;
      if (!route.patternIds || !route.patternIds.includes(pid))
        route.loadPattern();
      route.createVehicle(vehicleLayer.children[i++], lon, lat, hdg);
    }
  }
  while (vehicleLayer.children.length > i)
    vehicleLayer.lastChild.remove();
  vehicleTimeoutId = setTimeout(updateVehicles, i ? 5000 : 60000);
}

document.querySelector('#routes-button').addEventListener('click', toggleRoutes);
document.querySelector('#routes-clear-button').addEventListener('click', clearRoutes);
document.querySelector('#refresh-button').addEventListener('click', () => { location.reload(); });

loadRoutes();
