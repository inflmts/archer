import { svg } from './util.js';
import { scale, offset } from './map.js';

const layer = document.querySelector('#stop-layer');

class Stop {

  constructor(id, name, lon, lat) {
    this.id = id;
    this.name = name;
    this.x = lon * 1.15;
    this.y = -lat;
    this.refcnt = 0;

    this.marker = svg('circle', {
      'fill': 'black',
      'r': '4'
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

}

const stops = Object.create(null);

export function stopFor(id, name, lon, lat) {
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
