import { useEffect, useRef } from "react";
import { DomEvent } from "leaflet";

const fromLatLng = ([lat, lng]) => [lng, lat];
const routeLine = (route) => ({
  type: "Feature",
  geometry: { type: "LineString", coordinates: route.points.map(fromLatLng) },
  properties: {},
});

function createCamera(map, LngLatBounds) {
  return {
    resize: () => map.resize(),
    view: () => {
      const canvas = map.getCanvas();
      const { lat, lng } = map.unproject([canvas.clientWidth / 2, canvas.clientHeight / 2]);
      return { center: [lat, lng], zoom: map.getZoom() + 1 };
    },
    restore: ({ center, zoom }) => map.jumpTo({
      center: fromLatLng(center), zoom: zoom - 1, padding: { top: 0, bottom: 0, left: 0, right: 0 },
    }),
    fit: (points, padding) => {
      const bounds = new LngLatBounds();
      points.forEach((point) => bounds.extend(fromLatLng(point)));
      map.jumpTo({ pitch: 0, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 } });
      map.fitBounds(bounds, { padding, duration: 0, maxZoom: map.getMaxZoom() });
    },
    follow: (position, padding, heading) => map.jumpTo({
      center: fromLatLng(position), padding, bearing: heading, pitch: 45,
    }),
  };
}

export default function ReportNavigation3D({ route, destination, position, heading, ready, getView, onReady, onFailure, onPan }) {
  const containerRef = useRef(null);
  const latest = useRef(null);
  const updateRef = useRef(null);
  latest.current = { route, destination, position, heading, getView, onReady, onFailure, onPan };

  useEffect(() => {
    const container = containerRef.current;
    DomEvent.disableClickPropagation(container);
    DomEvent.disableScrollPropagation(container);
    let disposed = false;
    let loaded = false;
    let map;
    const fail = () => {
      if (disposed) return;
      latest.current.onFailure();
    };
    const timeout = setTimeout(fail, 18_000);

    async function start() {
      try {
        const [{ Map, Marker, LngLatBounds }] = await Promise.all([
          import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl.css"),
        ]);
        if (disposed) return;
        const { center, zoom } = latest.current.getView();
        map = new Map({
          container,
          style: "https://tiles.openfreemap.org/styles/fiord",
          center: fromLatLng(center),
          zoom: zoom - 1,
          renderWorldCopies: false,
        });
        map.on("webglcontextlost", fail);
        map.on("error", () => { if (!loaded) fail(); });
        for (const event of ["dragstart", "rotatestart", "pitchstart", "zoomstart"]) {
          map.on(event, ({ originalEvent }) => { if (originalEvent) latest.current.onPan(); });
        }
        map.once("load", () => {
          if (disposed) return;
          try {
            const { sources, layers } = map.getStyle();
            const buildings = Object.keys(sources).find((id) => sources[id].type === "vector");
            if (buildings) {
              map.addLayer({
                id: "report-3d-buildings", type: "fill-extrusion", source: buildings,
                "source-layer": "building", minzoom: 15,
                paint: {
                  "fill-extrusion-color": "#536679",
                  "fill-extrusion-height": ["coalesce", ["get", "render_height"], 0],
                  "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
                },
              }, layers.find((layer) => layer.type === "symbol")?.id);
            }
            map.addSource("report-navigation", { type: "geojson", data: routeLine(latest.current.route) });
            for (const [id, color, width] of [["report-route-outline", "#111c2b", 10], ["report-route-3d", "#57b5ff", 6]]) {
              map.addLayer({
                id, type: "line", source: "report-navigation",
                layout: { "line-join": "round", "line-cap": "round" },
                paint: { "line-color": color, "line-width": width },
              });
            }
            const marker = (kind, label) => {
              const element = document.createElement("div");
              element.className = `report-3d-marker report-3d-${kind}`;
              element.role = "img";
              element.setAttribute("aria-label", label);
              return new Marker({ element, rotationAlignment: "map" });
            };
            marker("destination", "Report pin").setLngLat(fromLatLng(latest.current.destination)).addTo(map);
            const worker = marker("position", "Your location");
            const origin = marker("origin", "Starting point");
            let renderedRoute;
            updateRef.current = () => {
              const { position, heading, route } = latest.current;
              if (route !== renderedRoute) {
                map.getSource("report-navigation").setData(routeLine(route));
                if (route.preview) origin.setLngLat(fromLatLng(route.origin)).addTo(map);
                else origin.remove();
                renderedRoute = route;
              }
              if (position) {
                worker.setLngLat(fromLatLng(position)).setRotation(heading);
                if (!worker.getElement().isConnected) worker.addTo(map);
              } else worker.remove();
            };
            loaded = true;
            clearTimeout(timeout);
            updateRef.current();
            latest.current.onReady(createCamera(map, LngLatBounds));
          } catch {
            fail();
          }
        });
      } catch {
        fail();
      }
    }
    start();
    return () => {
      disposed = true;
      clearTimeout(timeout);
      updateRef.current = null;
      DomEvent.off(container);
      map?.remove();
    };
  }, []);

  useEffect(() => {
    updateRef.current?.();
  }, [heading, position, route]);

  return <div className={`report-navigation-3d maplibregl-map${ready ? " is-ready" : ""}`} aria-label="3D navigation map"
    aria-hidden={!ready} ref={containerRef} />;
}
