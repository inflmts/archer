import { svg, api } from './util.js';
import { scale, offset } from './map.js';

const layer = document.querySelector('#stop-layer');

const stops = Object.create(null);
let currentStop = null;

class Stop {

  constructor(id, name, lon, lat) {
    this.id = id;
    this.name = name;
    this.x = lon * 1.15;
    this.y = -lat;
    this.refcnt = 0;

    this.marker = svg('circle', {
      'fill': 'black',
      'r': '4',
      'cx': this.x * scale + offset.x,
      'cy': this.y * scale + offset.y
    });
    this.marker.style.display = 'none';
  }

  ref() {
    if (this.refcnt++ === 0)
      this.marker.style.display = null;
  }

  unref() {
    if (--this.refcnt === 0)
      this.marker.style.display = 'none';
  }

  async predict() {
    const data = await api(`getpredictions?stpid=${this.id}`);
    if (data.prd) {
      this.predictions = data.prd.map(prd => ({
        route: getRoute(prd.rt),
        dest: prd.des,
        time: prd.prdctdn === 'DUE' ? 'DUE' : `${prd.prdctdn}m`
      }));
    }
  }

  updatePredictionsDisplay() {
  }

}

export function addStop(id, name, lon, lat) {
  if (id in stops)
    return stops[id];
  const stop = new Stop(id, name, lon, lat);
  layer.append(stop.marker);
  stops[id] = stop;
  return stop;
}

export function updateStopTransforms() {
  for (const id in stops) {
    const stop = stops[id];
    stop.marker.setAttribute('cx', stop.x * scale + offset.x);
    stop.marker.setAttribute('cy', stop.y * scale + offset.y);
  }
}

export function getNearestStop(x, y) {
  let nearest = null;
  let nearestDistSq = Infinity;
  for (const id in stops) {
    const stop = stops[id];
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
