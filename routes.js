import { html, svg, api } from './util.js';
import { scale, offset } from './map.js';
import { stopFor } from './stops.js';

const container = document.querySelector('#routes');

export let routes = null;

export function openRoutes() {
  container.style.display = null;
}

export function closeRoutes() {
  container.style.display = 'none';
}

export function toggleRoutes() {
  if (container.style.display === 'none')
    container.style.display = null;
  else
    container.style.display = 'none';
}

function handleClick(ev) {
  ev.currentTarget.route.toggle();
}

class Route {

  constructor(id, name, color) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.enabled = false;
    this.patternLoading = false;
    this.stops = null;
    this.patterns = null;

    this.element = html('button', { class: 'route' });
    this.element.route = this;
    this.element.append(
      html('div', { class: 'route-id' }, this.id),
      html('div', { class: 'route-name' }, this.name)
    );
    this.element.style.borderColor = this.color;
    this.element.addEventListener('click', handleClick);

    this.pattern = svg('g');
    this.pattern.style.display = 'none';
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
    this.element.classList.add('route-enabled');
    this.pattern.style.display = null;
    this.loadPattern();
    if (this.stops)
      for (const stop of this.stops)
        stop.ref();
  }

  disable() {
    if (!this.enabled)
      return;
    this.enabled = false;
    this.element.classList.remove('route-enabled');
    this.pattern.style.display = 'none';
    if (this.stops)
      for (const stop of this.stops)
        stop.unref();
  }

  loadPattern() {
    if (this.patternLoading)
      return;
    this.patternLoading = true;
    this._loadPattern();
  }

  async _loadPattern() {
    const data = await api(`getpatterns?rt=${this.id}`);
    this.patterns = [];
    this.stops = [];
    for (const path of data.ptr) {
      const element = svg('polyline', {
        'fill': 'none',
        'stroke': this.color,
        'stroke-width': '4'
      });
      const points = path.pt.map(({ lon, lat, stpid, stpnm }) => {
        if (stpid) {
          const stop = stopFor(stpid, stpnm, lon, lat);
          this.stops.push(stop);
          if (this.enabled)
            stop.ref();
        }
        return { lon, lat };
      });
      this.patterns.push({ element, points });
      this.pattern.append(element);
    }
    this.updatePattern();
  }

  updatePattern() {
    if (this.patterns) {
      for (const pattern of this.patterns) {
        pattern.element.setAttribute('points', pattern.points.map(({ lon, lat }, i) => {
          const x = lon * 1.15 * scale + offset.x;
          const y = -lat * scale + offset.y;
          return `${x} ${y}`;
        }).join(' '));
      }
    }
  }

}

async function getRoutes() {
  const data = await api('getroutes');
  return data.routes.map(item => new Route(item.rt, item.rtnm, item.rtclr));
}

export async function loadRoutes(mapRouteContainer) {
  routes = await getRoutes();
  for (const route of routes) {
    container.append(route.element);
    mapRouteContainer.append(route.pattern);
  }
}

export function updateRouteTransforms() {
  if (routes) {
    for (const route of routes) {
      route.updatePattern();
    }
  }
}

document.querySelector('#routes-open').addEventListener('click', toggleRoutes);
