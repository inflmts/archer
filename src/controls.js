import { map } from './util.js';
import { closeRoutes, updateTransform as updateRouteTransform, deselectStop, getNearestStop } from './map.js';

function updateTransform() {
  updateRouteTransform(mapX, mapY, mapZ);
}

updateTransform();
