import { biasX, biasY, html, svg, api } from './util.js';
import { getRoute } from './routes.js';

const layer = document.querySelector('#map-stops');
const selectedLayer = document.querySelector('#map-content');

const predStopIdElement = document.querySelector('#predictions-stop-id');
const predStopNameElement = document.querySelector('#predictions-stop-name');
const predTimeoutElement = document.querySelector('#predictions-timeout');
const predListElement = document.querySelector('#predictions-list');
const predNoneElement = document.querySelector('#predictions-none');

const stops = Object.create(null);
export let currentStop = null;
let predTickTimeout = null;

function tickCurrentPredictions() {
  predTickTimeout = null;
  const remaining = currentStop._predictionsExpire - Date.now();
  if (remaining > 0) {
    predTimeoutElement.textContent = `${Math.ceil(remaining / 1000)}s`;
    predTickTimeout = setTimeout(tickCurrentPredictions, remaining % 1000 + 10);
  } else {
    currentStop.refreshPredictions();
  }
}

function clearPredictions() {
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

class Stop {

  visible = 0;
  predictions = null;
  _loadingPredictions = false;
  _predictionsExpire = 0;

  constructor(id, name, lon, lat) {
    this.id = id;
    this.name = name;
    this.x = lon * 1.15 - biasX;
    this.y = -lat - biasY;

    this.marker = svg('circle', {
      'class': 'map-stop',
      'cx': this.x,
      'cy': this.y
    });
  }

  ref() {
    if (!this.visible++)
      layer.append(this.marker);
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
    selectedLayer.append(this.marker);
    document.body.classList.add('stop-selected');
    predStopIdElement.textContent = this.id;
    predStopNameElement.textContent = this.name;
    clearPredictions();
    this.refreshPredictions();
  }

  deselect() {
    if (currentStop !== this)
      return;
    currentStop = null;
    this.unref();
    if (this.visible)
      layer.append(this.marker);
    if (predTickTimeout)
      clearTimeout(predTickTimeout);
    document.body.classList.remove('stop-selected');
  }

  refreshPredictions(force = false) {
    if (this._loadingPredictions || (!force && Date.now() < this._predictionsExpire)) {
      this.updatePredictions();
      return;
    }
    this._loadingPredictions = true;
    this._loadPredictions();
  }

  async _loadPredictions() {
    let data;
    try {
      data = await api(`getpredictions?stpid=${this.id}`);
    } finally {
      this._loadingPredictions = false;
    }
    if (data.prd) {
      this.predictions = data.prd.map(prd => {
        return {
          route: getRoute(prd.rt),
          id: prd.rt,
          dest: prd.des,
          time: prd.prdctdn === 'DUE' ? 'DUE' : `${prd.prdctdn}m`
        };
      });
    } else {
      this.predictions = null;
    }
    this._predictionsExpire = Date.now() + 30000;
    if (currentStop === this) {
      predTickTimeout = setTimeout(tickCurrentPredictions, 1000);
      this.updatePredictions();
    }
  }

  updatePredictions() {
    clearPredictions();
    if (!this.predictions || !this.predictions.length) {
      predNoneElement.style.display = null;
    } else {
      predNoneElement.style.display = 'none';
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

}

export function addStop(id, name, lon, lat) {
  if (id in stops)
    return stops[id];
  const stop = new Stop(id, name, lon, lat);
  stops[id] = stop;
  return stop;
}

export function getNearestStop(x, y) {
  let nearest = null;
  let nearestDistSq = Infinity;
  for (const id in stops) {
    const stop = stops[id];
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
