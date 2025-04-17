import { html, svg } from './util.js';
import { loadRoutes, updateRouteTransforms } from './routes.js';
import { updateStopTransforms } from './stops.js';

const map = document.querySelector('#map');

const routeContainer = document.querySelector('#route-layer');

export let zoom = 0;
export let scale = 1;
export const offset = {
  x: -82.34697,
  y: 29.465201
};

let pan = null;

//function setOffset(x, y) {
//  offset.x = x;
//  offset.y = y;
//  routeContainer.setAttribute('transform', `translate(${x}, ${y})`);
//}

//function updateTransform() {
//  routeContainer.setAttribute('transform', `matrix(${scale}, 0, 0, ${scale}, ${offset.x}, ${offset.y})`);
//  routeContainer.setAttribute('stroke-width', `${4 / scale}`);
//}

map.addEventListener('wheel', (ev) => {
  const oldScale = scale;
  zoom -= ev.deltaY * 0.01;
  scale = Math.pow(2, zoom);
  offset.x = (offset.x - ev.offsetX) * scale / oldScale + ev.offsetX;
  offset.y = (offset.y - ev.offsetY) * scale / oldScale + ev.offsetY;
  updateRouteTransforms();
  updateStopTransforms();
}, { passive: true });

map.addEventListener('pointerdown', (ev) => {
  ev.preventDefault();
  const x = offset.x - ev.offsetX;
  const y = offset.y - ev.offsetY;
  pan = { x, y };
});

map.addEventListener('pointermove', (ev) => {
  if (pan) {
    ev.preventDefault();
    offset.x = pan.x + ev.offsetX;
    offset.y = pan.y + ev.offsetY;
    updateRouteTransforms();
    updateStopTransforms();
  }
});

map.addEventListener('pointerup', () => {
  pan = null;
});

map.addEventListener('pointerleave', () => {
  pan = null;
});

loadRoutes(routeContainer);
