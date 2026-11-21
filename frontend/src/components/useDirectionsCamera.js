import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { point } from "leaflet";

function leafletCamera(map) {
  return {
    resize: () => map.invalidateSize({ animate: false }),
    view: () => {
      const { lat, lng } = map.getCenter();
      return { center: [lat, lng], zoom: map.getZoom() };
    },
    restore: ({ center, zoom }) => map.setView(center, zoom, { animate: false }),
    fit: (points, padding) => map.fitBounds(points, {
      paddingTopLeft: [padding.left, padding.top],
      paddingBottomRight: [padding.right, padding.bottom],
      maxZoom: map.getMaxZoom(),
      animate: false,
    }),
    follow: (position, padding) => {
      const offset = point((padding.left - padding.right) / 2, (padding.top - padding.bottom) / 2);
      const zoom = map.getZoom();
      map.setView(map.unproject(map.project(position, zoom).subtract(offset), zoom), zoom, { animate: false });
    },
  };
}

function controlsPadding(controls) {
  const frame = controls.getBoundingClientRect();
  const top = controls.querySelector(".report-route-top")?.getBoundingClientRect();
  const bottom = controls.querySelector(".report-route-bottom")?.getBoundingClientRect();
  return {
    top: top ? Math.ceil(top.bottom - frame.top + 8) : 0,
    bottom: bottom ? Math.ceil(frame.bottom - bottom.top + 8) : 0,
    left: 16,
    right: 16,
  };
}

export function useDirectionsCamera({ map, controlsRef, route, destination, position, heading, live }) {
  const leaflet = useMemo(() => leafletCamera(map), [map]);
  const active = useRef(leaflet);
  const mode = useRef("initial");
  const lastRoute = useRef(null);
  const lastPosition = useRef(null);
  const current = useRef(null);
  current.current = { route, destination, position, heading, live };

  const fit = useCallback(() => {
    const { route, destination } = current.current;
    if (!route) return;
    active.current.fit([...route.points, route.origin, destination], controlsPadding(controlsRef.current));
  }, [controlsRef]);

  const follow = useCallback(() => {
    const { position, heading, live } = current.current;
    if (!position || !live) return;
    active.current.follow(position, controlsPadding(controlsRef.current), heading);
  }, [controlsRef]);

  const reflow = useCallback(() => {
    active.current.resize();
    if (mode.current === "overview" || mode.current === "preview" || mode.current === "initial-live") fit();
    if (mode.current === "following") follow();
  }, [fit, follow]);

  useLayoutEffect(() => {
    const { maxBounds, minZoom, zoomSnap } = map.options;
    const original = leaflet.view();
    map.stop();
    map.setMaxBounds(null);
    map.setMinZoom(undefined);
    map.options.zoomSnap = 0;
    return () => {
      map.options.zoomSnap = zoomSnap;
      map.setMaxBounds(maxBounds ?? null);
      map.setMinZoom(minZoom);
      leaflet.restore(original);
    };
  }, [leaflet, map]);

  useLayoutEffect(() => {
    if (!route) {
      lastRoute.current = null;
      mode.current = "initial";
      return;
    }
    const previous = lastRoute.current;
    lastRoute.current = route;
    if (!previous || (mode.current === "preview" && !route.preview)) {
      mode.current = route.preview ? "preview" : "initial-live";
      lastPosition.current = position;
      active.current.resize();
      fit();
    } else if (previous !== route && (mode.current === "overview" || mode.current === "preview")) {
      fit();
    }
    if (position !== lastPosition.current && (mode.current === "initial-live" || mode.current === "following")) {
      mode.current = "following";
      follow();
    }
    lastPosition.current = position;
  }, [fit, follow, position, route]);

  const hasRoute = Boolean(route);
  useLayoutEffect(() => {
    const controls = controlsRef.current;
    const observer = new ResizeObserver(reflow);
    observer.observe(controls);
    controls.querySelectorAll(".report-route-card").forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [controlsRef, hasRoute, reflow]);

  const switchTo = useCallback((camera = leaflet) => {
    if (active.current === camera) return;
    let view;
    try {
      view = active.current.view();
    } catch {
      view = leaflet.view();
    }
    active.current = camera;
    camera.resize();
    camera.restore(view);
    if (mode.current === "overview" || mode.current === "preview" || mode.current === "initial-live") fit();
    if (mode.current === "following") follow();
  }, [fit, follow, leaflet]);

  const pause = useCallback(() => { mode.current = "paused"; }, []);
  const overview = () => { mode.current = "overview"; fit(); };
  const recenter = () => { mode.current = "following"; follow(); };
  const view = () => active.current.view();
  return { switchTo, pause, overview, recenter, view };
}
