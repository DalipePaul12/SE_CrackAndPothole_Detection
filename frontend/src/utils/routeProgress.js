const METERS_PER_DEGREE = 111195;

function relativeTo([lat, lng], [originLat, originLng]) {
  return [
    (lng - originLng) * METERS_PER_DEGREE * Math.cos(originLat * Math.PI / 180),
    (lat - originLat) * METERS_PER_DEGREE,
  ];
}

export function movementBearing(from, to) {
  const [east, north] = relativeTo(to, from);
  return (Math.atan2(east, north) * 180 / Math.PI + 360) % 360;
}

export function prepareRoute(route) {
  const meters = [0];
  for (let i = 1; i < route.points.length; i++) {
    meters.push(meters[i - 1] + Math.hypot(...relativeTo(route.points[i], route.points[i - 1])));
  }
  return { ...route, meters };
}

export function locateOnRoute(route, position, previous = 0) {
  let offset = Infinity;
  let traveled = previous;
  for (let i = 1; i < route.points.length; i++) {
    const [ax, ay] = relativeTo(route.points[i - 1], position);
    const [bx, by] = relativeTo(route.points[i], position);
    const dx = bx - ax, dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    if (!lengthSquared) continue;
    const fraction = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
    const separation = Math.hypot(ax + fraction * dx, ay + fraction * dy);
    if (separation < offset) {
      offset = separation;
      traveled = route.meters[i - 1] + fraction * (route.meters[i] - route.meters[i - 1]);
    }
  }
  return { offset, traveled: Math.max(previous, traveled) };
}

export function nextTurn(route, traveled) {
  const step = route.steps.find(({ index }) => route.meters[index] > traveled);
  return {
    text: step?.text ?? "Continue to the report pin.",
    distance: Math.max(0, (step ? route.meters[step.index] : route.meters.at(-1)) - traveled),
  };
}
