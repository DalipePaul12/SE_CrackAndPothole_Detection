import { useEffect, useRef, useState } from "react";
import { FaChevronLeft, FaChevronRight, FaExpand, FaMinus, FaPlus, FaTimes } from "react-icons/fa";
import SegmentationMask from "../../components/SegmentationMask";
import "./CreateReport.css";
import "../../components/SegmentationMask.css";

function PhotoSurface({ photo, expanded = false, compact = false, zoom = 1, onExpand }) {
  const viewport = useRef(null);
  const drag = useRef(null);
  const [natural, setNatural] = useState(null);
  const [size, setSize] = useState(null);

  useEffect(() => {
    const el = viewport.current;
    const observer = new ResizeObserver(([entry]) => {
      if (expanded) {
        const { inlineSize, blockSize } = entry.borderBoxSize[0];
        setSize({ width: Math.floor(inlineSize), height: Math.floor(blockSize) });
      } else {
        const { width, height } = entry.contentRect;
        setSize({ width, height });
      }
    });
    observer.observe(el, { box: expanded ? "border-box" : "content-box" });
    return () => observer.disconnect();
  }, [expanded]);

  // The image and SVG share the actual painted image bounds, including cover cropping.
  const scale = natural && size && (expanded ? Math.min : Math.max)(
    size.width / natural.width, size.height / natural.height,
  );
  const imageSize = scale ? { width: natural.width * scale, height: natural.height * scale } : null;
  const layerSize = imageSize && { width: imageSize.width * zoom, height: imageSize.height * zoom };
  const layer = (
    <span className="evidence-photo-layer" style={layerSize || undefined}>
      <img className="preview-img" src={photo.preview} alt={compact ? "" : photo.file.name} draggable={false}
        loading={compact ? "lazy" : undefined}
        onLoad={({ currentTarget }) => setNatural({
          width: currentTarget.naturalWidth, height: currentTarget.naturalHeight,
        })} />
      {!!imageSize && !!photo.analysis.allDetections?.length && (
        <SegmentationMask predictions={photo.analysis.allDetections}
          imageSize={imageSize} naturalSize={natural} showBoundingBox={!compact} showLabels={!compact} smoothPasses={1} />
      )}
    </span>
  );

  if (compact) {
    return <span ref={viewport} className="evidence-photo-cover" aria-hidden="true">{layer}</span>;
  }

  if (!expanded) {
    return (
      <button type="button" className="evidence-photo-preview" ref={viewport}
        onClick={onExpand} aria-label={`Expand ${photo.file.name}`}>
        {layer}
        <span className="evidence-photo-expand" aria-hidden="true"><FaExpand /></span>
      </button>
    );
  }

  return (
    <div ref={viewport} className="evidence-photo-viewport" tabIndex={0} role="region"
      aria-label="Zoomed photo. Use arrow keys to pan."
      data-zoomed={zoom > 1}
      onPointerDown={(e) => {
        if (e.pointerType === "touch" || e.button !== 0 || zoom === 1) return;
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const { x, y, left, top } = drag.current;
        e.currentTarget.scrollTo(left + x - e.clientX, top + y - e.clientY);
      }}
      onLostPointerCapture={() => { drag.current = null; }}>
      <div className="evidence-photo-stage">{layer}</div>
    </div>
  );
}

export function EvidencePhotoPreview({ photo, onExpand, compact }) {
  return <PhotoSurface photo={photo} onExpand={onExpand} compact={compact} />;
}

export function EvidencePhotoViewer({ photo, onClose, navigation }) {
  const dialog = useRef(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const el = dialog.current;
    el.showModal();
    return () => { if (el.open) el.close(); };
  }, []);

  const step = (offset) => {
    setZoom(1);
    navigation.step(offset);
  };

  return (
    <dialog ref={dialog} className="evidence-photo-viewer" aria-label={`Evidence photo: ${photo.file.name}`}
      onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <div className="evidence-viewer-toolbar">
        {navigation && (
          <span className="evidence-viewer-counter" aria-live="polite">{navigation.index + 1} / {navigation.count}</span>
        )}
        <div className="evidence-viewer-actions">
          <button type="button" aria-label="Zoom out" disabled={zoom <= 1}
            onClick={() => setZoom(zoom - 0.5)}><FaMinus aria-hidden="true" /></button>
          <button type="button" aria-label="Reset zoom" onClick={() => setZoom(1)}>{zoom * 100}%</button>
          <button type="button" aria-label="Zoom in" disabled={zoom >= 3}
            onClick={() => setZoom(zoom + 0.5)}><FaPlus aria-hidden="true" /></button>
          <button type="button" aria-label="Close photo viewer" onClick={onClose}>
            <FaTimes aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="evidence-viewer-media" data-navigation={!!navigation}>
        {navigation && (
          <button type="button" aria-label="Previous image" onClick={() => step(-1)}>
            <FaChevronLeft aria-hidden="true" />
          </button>
        )}
        <PhotoSurface key={photo.id ?? photo.preview} photo={photo} expanded zoom={zoom} />
        {navigation && (
          <button type="button" aria-label="Next image" onClick={() => step(1)}>
            <FaChevronRight aria-hidden="true" />
          </button>
        )}
      </div>
    </dialog>
  );
}
