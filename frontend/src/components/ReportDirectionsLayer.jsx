import { useCallback, useEffect, useRef, useState } from "react";
import { CircleMarker, Polyline, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { DomEvent } from "leaflet";
import { useLocation, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { getContractorProject } from "../api/contractor";
import { getReport } from "../api/reports";
import { getReportPin } from "../utils/reportPin";
import { locateOnRoute, movementBearing, nextTurn, prepareRoute } from "../utils/routeProgress";
import ReportNavigation3D from "./ReportNavigation3D";
import { useDirectionsCamera } from "./useDirectionsCamera";
import "./ReportDirectionsLayer.css";

const REROUTE_DELAY = 30_000;
const GPS_FIX_TIMEOUT = 15_000;
const GPS_MAX_ACCURACY = 50;

function formatDistance(meters) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

export default function ReportDirectionsLayer({ contractor = false }) {
  const map = useMap();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const targetId = params.get("directions");
  const navigating = Boolean(targetId && /^\d+$/.test(targetId));
  useEffect(() => {
    if (navigating) return;
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map, navigating]);
  if (!navigating) return null;

  const end = () => setParams((current) => {
    const next = new URLSearchParams(current);
    next.delete("directions");
    return next;
  }, { replace: true });

  return <RouteGuidance key={location.key} contractor={contractor} targetId={targetId}
    autoStart={location.state?.startDirections === true} end={end} />;
}

function RouteGuidance({ contractor, targetId, autoStart, end }) {
  const map = useMap();
  const gpsAvailable = window.isSecureContext && Boolean(navigator.geolocation);
  const [destination, setDestination] = useState(null);
  const [mode, setMode] = useState(autoStart && gpsAvailable ? "live" : "ready");
  const [visible, setVisible] = useState(!document.hidden);
  const [position, setPosition] = useState(null);
  const [heading, setHeading] = useState(0);
  const [route, setRoute] = useState(null);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [routeError, setRouteError] = useState("");
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [wants3D, setWants3D] = useState(true);
  const [ready3D, setReady3D] = useState(false);
  const [failed3D, setFailed3D] = useState(false);
  const camera3DRef = useRef(null);
  const wants3DRef = useRef(true);
  const stopGpsRef = useRef(null);
  const originRef = useRef(null);
  const requestRef = useRef({ revision: 0, lastAttempt: null, pending: false });
  const routeRef = useRef(null);
  const progressRef = useRef(0);
  const offRouteRef = useRef(0);
  const reroutePausedRef = useRef(false);
  const controlsRef = useRef(null);
  const camera = useDirectionsCamera({
    map, controlsRef, route, destination, position, heading, live: mode === "live" && !route?.preview,
  });

  const invalidate = useCallback(() => {
    requestRef.current.revision++;
    requestRef.current.pending = false;
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadPin() {
      const result = await (contractor ? getContractorProject(targetId) : getReport(targetId));
      if (cancelled) return;
      if (!result.success) {
        setMessage("The report location could not be opened.");
        return;
      }
      const pin = getReportPin((contractor ? result.data?.report : result.data) ?? {});
      if (!pin) {
        setMessage("No map pin saved.");
        return;
      }
      setDestination(pin);
      map.setView(pin, map.getZoom(), { animate: false });
    }
    loadPin();
    return () => { cancelled = true; invalidate(); };
  }, [contractor, invalidate, map, targetId]);

  useEffect(() => {
    const changed = () => {
      if (document.hidden) {
        stopGpsRef.current?.();
        if (requestRef.current.pending && (!routeRef.current || routeRef.current.preview)) {
          requestRef.current.lastAttempt = null;
          setMessage("Route calculation paused. Retry when you return.");
        }
        offRouteRef.current = 0;
        invalidate();
        setLoading(false);
      }
      setVisible(!document.hidden);
    };
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, [invalidate]);

  useEffect(() => {
    const controls = controlsRef.current;
    DomEvent.disableClickPropagation(controls);
    DomEvent.disableScrollPropagation(controls);
    return () => DomEvent.off(controls);
  }, []);

  const requestRoute = useCallback(async (origin, preview = false) => {
    const request = requestRef.current;
    if (request.pending || document.hidden) return;
    if (routeRef.current?.preview === preview && Date.now() - request.lastAttempt < REROUTE_DELAY) {
      setRouteError("Wait a moment before retrying the route.");
      return;
    }
    request.pending = true;
    request.lastAttempt = Date.now();
    const revision = ++request.revision;
    setLoading(true);
    setMessage("");
    setRouteError("");
    const path = contractor ? "projects" : "reports";
    const result = await api.post(`/directions/${path}/${targetId}`, {
      latitude: origin[0], longitude: origin[1],
    });
    if (revision !== request.revision) return;
    request.pending = false;
    setLoading(false);
    if (!result.success) {
      reroutePausedRef.current = result.status === 429;
      setRouteError(typeof result.error === "string" ? result.error : "Directions are temporarily unavailable.");
      return;
    }

    const next = prepareRoute({ ...result.data, origin, preview });
    reroutePausedRef.current = false;
    routeRef.current = next;
    progressRef.current = 0;
    offRouteRef.current = 0;
    setProgress(0);
    setRoute(next);
  }, [contractor, targetId]);

  useEffect(() => {
    if (mode !== "live" || !visible || !destination || !gpsAvailable) return;
    let active = true;
    let acquired = Boolean(originRef.current);
    let watch;
    let timer;
    const deadline = performance.now() + GPS_FIX_TIMEOUT;
    const stop = () => {
      if (!active) return;
      active = false;
      clearTimeout(timer);
      if (watch !== undefined) navigator.geolocation.clearWatch(watch);
      if (stopGpsRef.current === stop) stopGpsRef.current = null;
    };
    const fail = (text) => {
      stop();
      invalidate();
      setLoading(false);
      setMessage(text);
      setMode("ready");
    };
    const expire = () => {
      if (!active || acquired) return;
      fail("We couldn’t get an accurate location. Try again or choose a starting point.");
    };

    stopGpsRef.current = stop;
    if (!acquired) timer = setTimeout(expire, GPS_FIX_TIMEOUT);
    watch = navigator.geolocation.watchPosition(({ coords }) => {
      if (!active || document.hidden) return;
      if (!acquired && performance.now() >= deadline) {
        expire();
        return;
      }
      if (!Number.isFinite(coords.accuracy) || coords.accuracy < 0 || coords.accuracy > GPS_MAX_ACCURACY) {
        offRouteRef.current = 0;
        if (!acquired && Number.isFinite(coords.accuracy) && coords.accuracy > GPS_MAX_ACCURACY) {
          setGpsAccuracy(Math.ceil(coords.accuracy));
        }
        return;
      }
      if (!acquired) {
        acquired = true;
        clearTimeout(timer);
      }
      const fix = [coords.latitude, coords.longitude];
      const previous = originRef.current;
      if (Number.isFinite(coords.heading)) setHeading(coords.heading);
      else if (previous && map.distance(previous, fix) >= 3) setHeading(movementBearing(previous, fix));
      originRef.current = fix;
      setPosition(fix);
      if (map.distance(fix, destination) <= Math.max(15, coords.accuracy) && coords.accuracy <= 25) {
        stop();
        invalidate();
        setLoading(false);
        setMessage("You are near the report pin.");
        setMode("arrived");
        return;
      }

      const { lastAttempt } = requestRef.current;
      const activeRoute = routeRef.current;
      if (!activeRoute || activeRoute.preview) {
        if (lastAttempt == null) requestRoute(fix);
        return;
      }
      const { offset, traveled } = locateOnRoute(activeRoute, fix, progressRef.current);
      if (offset > Math.max(40, coords.accuracy)) {
        offRouteRef.current++;
        if (!reroutePausedRef.current && offRouteRef.current >= 2 && Date.now() - lastAttempt >= REROUTE_DELAY) {
          requestRoute(fix);
        }
      } else {
        offRouteRef.current = 0;
        progressRef.current = traveled;
        setProgress(traveled);
      }
    }, ({ code }) => {
      if (!active || document.hidden) return;
      if (code === 1) {
        fail("Location permission was denied. Allow location access or choose a starting point.");
      } else if (acquired) {
        fail("GPS is unavailable. Choose a starting point on the map or try GPS again.");
      }
    }, { enableHighAccuracy: true, timeout: GPS_FIX_TIMEOUT, maximumAge: 5_000 });
    if (!active) navigator.geolocation.clearWatch(watch);
    return stop;
  }, [destination, gpsAvailable, invalidate, map, mode, requestRoute, visible]);

  const resetRoute = (nextMode) => {
    stopGpsRef.current?.();
    invalidate();
    requestRef.current.lastAttempt = null;
    const keepPreview = nextMode === "live" && routeRef.current?.preview;
    if (!keepPreview) {
      camera.switchTo();
      camera3DRef.current = null;
      setReady3D(false);
      routeRef.current = null;
      setRoute(null);
    }
    originRef.current = null;
    progressRef.current = 0;
    offRouteRef.current = 0;
    reroutePausedRef.current = false;
    setPosition(null);
    setHeading(0);
    setProgress(0);
    setLoading(false);
    setMessage("");
    setRouteError("");
    setGpsAccuracy(null);
    setMode(nextMode);
  };

  useMapEvents({
    dragstart: camera.pause,
    click: ({ latlng }) => {
      if (mode !== "pick") return;
      const origin = [latlng.lat, latlng.lng];
      originRef.current = origin;
      setPosition(origin);
      setMode("preview");
      requestRoute(origin, true);
    },
  });

  const fraction = route ? Math.max(0, 1 - progress / (route.meters.at(-1) || 1)) : 0;
  const turn = route && !route.preview && mode === "live" ? nextTurn(route, progress) : null;
  const preview = route?.preview || mode === "preview";
  const manualOrigin = route?.preview ? route.origin : mode === "preview" ? position : null;
  const workerPosition = mode === "preview" ? null : position;
  const use2D = () => {
    wants3DRef.current = false;
    camera.switchTo();
    setWants3D(false);
  };
  const use3D = () => {
    wants3DRef.current = true;
    if (camera3DRef.current) camera.switchTo(camera3DRef.current);
    setFailed3D(false);
    setWants3D(true);
  };
  const endDirections = () => {
    stopGpsRef.current?.();
    invalidate();
    end();
  };
  return (
    <>
      {destination && (
        <CircleMarker center={destination} radius={10} className="report-route-pin"
          pathOptions={{ color: "#fff", weight: 3, fillColor: "#d6414f", fillOpacity: 1 }}>
          <Tooltip>Report pin</Tooltip>
        </CircleMarker>
      )}
      {route && <Polyline positions={route.points} className="report-route-line"
        pathOptions={{ color: "#2877e6", weight: 6 }} interactive={false} />}
      {manualOrigin && (
        <CircleMarker center={manualOrigin} radius={7} pathOptions={{ color: "#2877e6", weight: 3, fillColor: "#fff", fillOpacity: 1 }}>
          <Tooltip>Starting point</Tooltip>
        </CircleMarker>
      )}
      {workerPosition && (
        <CircleMarker center={workerPosition} radius={8} className="report-route-location"
          pathOptions={{ color: "#fff", weight: 3, fillColor: "#2877e6", fillOpacity: 1 }}>
          <Tooltip>Your location</Tooltip>
        </CircleMarker>
      )}
      {route && (wants3D || ready3D) && (
        <ReportNavigation3D route={route} destination={destination} position={workerPosition} heading={heading}
          ready={ready3D && wants3D} getView={camera.view} onPan={camera.pause}
          onReady={(next) => {
            camera3DRef.current = next;
            if (wants3DRef.current) camera.switchTo(next);
            setReady3D(true);
          }}
          onFailure={() => {
            use2D();
            camera3DRef.current = null;
            setReady3D(false);
            setFailed3D(true);
          }} />
      )}
      <section className={`report-route-overlay${route ? " report-route-overlay--active" : ""}`}
        ref={controlsRef} aria-label="Driving directions">
        <div className="report-route-card report-route-top">
          <div className="report-route-heading">
            <strong>{preview ? "Route preview" : "Driving directions"}</strong>
            {!route && <button type="button" onClick={endDirections}>End directions</button>}
          </div>
          {turn && (
            <p className="report-route-turn">
              <strong>{formatDistance(turn.distance)}</strong><span>{turn.text}</span>
            </p>
          )}
          {destination && !route && (mode === "ready" || (mode === "live" && !position)) && (
            <p>Snap2Fix sends the starting point and report pin to Geoapify to calculate the route.</p>
          )}
          {destination && !gpsAvailable && (
            <p role="status">{window.isSecureContext ? "GPS is unavailable in this browser." : "GPS requires a secure connection (HTTPS)."} Choose a starting point on the map.</p>
          )}
          {mode === "pick" && <p>Tap the map to choose your starting point.</p>}
          {mode === "live" && !position && !message && (
            <p role="status">{gpsAccuracy == null ? "Waiting for GPS…" :
              `Waiting for a more accurate GPS position (±${gpsAccuracy} m reported; ${GPS_MAX_ACCURACY} m required).`}</p>
          )}
          {loading && <p role="status">Calculating driving route…</p>}
          {message && <p role="status">{message}</p>}
          {mode === "ready" && !position && gpsAccuracy != null && (
            <p>Last reported accuracy: ±{gpsAccuracy} m. Live guidance requires {GPS_MAX_ACCURACY} m or better.</p>
          )}
          {routeError && <p role="alert">Routing failed. {routeError}</p>}
          {failed3D && !wants3D && <p role="status">3D unavailable. Continuing in 2D.</p>}
          {route?.preview && (
            <details>
              <summary>Driving steps</summary>
              <ol>{route.steps.map(({ index, text }, i) => <li key={`${index}-${i}`}>{text}</li>)}</ol>
            </details>
          )}
          {destination && !route && (
            <div className="report-route-actions">
              {mode === "ready" && gpsAvailable && (
                <button type="button" onClick={() => resetRoute("live")}>
                  {message ? "Try again" : "Use my location"}
                </button>
              )}
              {mode !== "pick" && mode !== "arrived" && (
                <button type="button" onClick={() => resetRoute("pick")}>Choose starting point</button>
              )}
              {!loading && routeError && originRef.current && (
                <button type="button" onClick={() => requestRoute(originRef.current, mode === "preview")}>Retry route</button>
              )}
            </div>
          )}
        </div>
        {route && (
          <div className="report-route-card report-route-bottom">
            {mode !== "arrived" && (
              <p className="report-route-summary">
                <strong>{Math.max(1, Math.ceil(route.duration * fraction / 60))} min estimated</strong>
                <span>{formatDistance(route.distance * fraction)} remaining</span>
              </p>
            )}
            <div className="report-route-actions">
              {route.preview && mode !== "live" && gpsAvailable && (
                <button type="button" onClick={() => resetRoute("live")}>Start live guidance</button>
              )}
              {!route.preview && mode === "ready" && (
                <>
                  <button type="button" onClick={() => resetRoute("live")}>Try again</button>
                  <button type="button" onClick={() => resetRoute("pick")}>Choose starting point</button>
                </>
              )}
              {position && mode === "live" && !route.preview && (
                <button type="button" onClick={camera.recenter}>Recenter</button>
              )}
              <button type="button" onClick={camera.overview}>Route overview</button>
              {wants3D ? (
                <button type="button" onClick={use2D}>{ready3D ? "2D" : "Use 2D"}</button>
              ) : (
                <button type="button" onClick={use3D}>
                  {failed3D ? "Retry 3D" : "3D"}
                </button>
              )}
              {!loading && routeError && originRef.current && (
                <button type="button" onClick={() => requestRoute(originRef.current, mode === "preview")}>Retry route</button>
              )}
              <button type="button" onClick={endDirections}>End directions</button>
            </div>
            <small>Powered by <a href="https://www.geoapify.com/">Geoapify</a> · Map data © OpenStreetMap contributors</small>
          </div>
        )}
      </section>
    </>
  );
}
