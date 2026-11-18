import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { EvidencePhotoPreview, EvidencePhotoViewer } from "../pages/Inside-App-User/EvidencePhoto";
import { normalizePrediction } from "./SegmentationMask";
import { resolveMediaUrl } from "../utils/mediaUrl";
import "./ReportEvidence.css";

export function submissionMedia(report) {
  return (report?.media_attachments ?? []).filter((item) => !item.attachment_type || item.attachment_type === "submission");
}

export function hasSubmissionPhotos(report) {
  return submissionMedia(report).some((item) => item.media_type === "image" && item.file_url);
}

export function hasSubmissionEvidence(report) {
  return submissionMedia(report).some((item) => item.file_url && ["image", "video"].includes(item.media_type));
}

export function ReportDamageBadges({ report }) {
  const detections = submissionMedia(report).flatMap((attachment) => attachment.detections ?? []);
  return damageTypes(detections).length
    ? <span className="report-evidence-badges"><DetectionBadges detections={detections} /></span>
    : report.ai_damage_type ?? "—";
}

function damageTypes(detections) {
  return ["crack", "pothole"].filter((type) => detections.some((d) => d.class === type));
}

function DetectionBadges({ detections }) {
  return damageTypes(detections).map((type) => <span key={type} className={`report-evidence-badge is-${type}`}>
    {type === "crack" ? "Crack" : "Pothole"}
  </span>);
}

function VideoDetectionFrames({ frames, onExpand }) {
  const track = useRef(null);
  const scroll = (direction) => {
    const element = track.current;
    element.scrollBy({ left: direction * element.clientWidth });
  };

  return (
    <section className="report-video-frames" aria-label="Detection frames">
      <div className="report-video-frames-header">
        <strong>Detection Frames ({frames.length})</strong>
        {frames.length > 1 && (
          <div className="report-video-frames-nav">
            <button type="button" aria-label="Previous detection frames" onClick={() => scroll(-1)}>
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <button type="button" aria-label="Next detection frames" onClick={() => scroll(1)}>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      <ul ref={track} className="report-video-frames-track">
        {frames.map((frame) => (
          <li key={frame.id}>
            <div className="report-evidence-image">
              <EvidencePhotoPreview photo={frame} onExpand={() => onExpand(frame.id)} />
            </div>
            <span>{frame.file.name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function ReportEvidence({ report, compact = false, showProof = false }) {
  const [selected, setSelected] = useState(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const dialogRef = useRef(null);
  const playerRef = useRef(null);
  const video = submissionMedia(report).find((item) => item.media_type === "video" && item.file_url);
  const photos = submissionMedia(report)
    .filter(({ media_type, file_url }) => media_type === "image" && file_url)
    .map((item, index) => ({
      id: item.id ?? item.file_url,
      file: { name: `Photo ${index + 1}${item.file_name ? ` · ${item.file_name}` : ""}` },
      preview: resolveMediaUrl(item.file_url),
      analysis: { allDetections: (item.detections ?? []).map(normalizePrediction).filter(Boolean) },
    }));
  const proof = showProof ? (report.media_attachments ?? []).filter((item) => item.attachment_type === "completion_proof" && item.file_url)
    .map((item, index) => ({
      id: item.id ?? item.file_url,
      file: { name: `Repair proof ${index + 1}` },
      preview: resolveMediaUrl(item.file_url),
      type: item.media_type,
      analysis: { allDetections: [] },
    })) : [];
  const videoUrl = !photos.length && video ? resolveMediaUrl(video.file_url) : null;
  const frames = galleryOpen && videoUrl ? (report.frame_detections ?? [])
    .filter((frame) => frame.image_url)
    .sort((a, b) => a.frame_index - b.frame_index)
    .map((frame) => {
      const label = frame.damage_type.replaceAll("+", " + ");
      const timestamp = frame.timestamp_seconds == null ? "" : ` · ${frame.timestamp_seconds}s`;
      return {
        id: `frame-${frame.id}`,
        file: { name: `${label} · ${Math.round(frame.confidence * 100)}%${timestamp}` },
        // Saved frame JPEGs already contain the model's polygon masks and boxes.
        preview: resolveMediaUrl(frame.image_url),
        analysis: { allDetections: [] },
      };
    }) : [];
  const group = [photos, proof.filter(({ type }) => type !== "video"), frames]
    .find((items) => items.some(({ id }) => id === selected)) ?? [];
  const index = group.findIndex(({ id }) => id === selected);
  const current = group[index];
  const allDetections = photos.flatMap((photo) => photo.analysis.allDetections);
  useEffect(() => {
    if (!galleryOpen) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, [galleryOpen]);

  if (!photos.length && !video) return null;
  const gallery = (
    <section aria-label="Submission photos" className="report-evidence-gallery">
      <div className="report-evidence-heading">
        <strong>Submission Photos ({photos.length})</strong>
        <span className="report-evidence-badges"><DetectionBadges detections={allDetections} /></span>
      </div>
      <div className={`report-evidence-grid${photos.length === 1 ? " report-evidence-grid--single" : ""}`}>
        {photos.map((photo) => (
          <div key={photo.id} className="report-evidence-card">
            <div className="report-evidence-image">
              <EvidencePhotoPreview photo={photo} onExpand={() => setSelected(photo.id)} />
            </div>
          </div>
        ))}
      </div>
      {!!proof.length && <section className="report-evidence-proof" aria-label="Repair proof">
        <strong>Repair Proof ({proof.length})</strong>
        <div className="report-evidence-grid">
          {proof.map((item) => <div className="report-evidence-image" key={item.id}>
            {item.type === "video" ? <video src={item.preview} controls aria-label={item.file.name} />
              : <EvidencePhotoPreview photo={item} onExpand={() => setSelected(item.id)} />}
          </div>)}
        </div>
      </section>}
    </section>
  );

  return (
    <div className={compact ? "report-evidence report-evidence--compact" : "report-evidence"} onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}>
      {compact || videoUrl ? (
        <>
          <button type="button" className="report-evidence-cover" onClick={() => setGalleryOpen(true)}
            aria-label={videoUrl ? "Play report video" : `Open report gallery, ${photos.length} ${photos.length === 1 ? "photo" : "photos"}`}>
            {videoUrl ? <>
              <video src={videoUrl} muted playsInline preload="metadata" />
              <span className="report-evidence-play" aria-hidden="true" />
            </> : <>
              {photos[0].analysis.allDetections.some((detection) => detection.has_mask)
                ? <EvidencePhotoPreview photo={photos[0]} compact />
                : <img src={photos[0].preview} alt="" loading="lazy" />}
              {photos.length > 1 && <span className="report-evidence-count">{photos.length}</span>}
            </>}
          </button>
          {galleryOpen && createPortal(
            <dialog ref={dialogRef} className="adm-modal report-evidence-dialog" aria-label={videoUrl ? "Report video" : "Report evidence gallery"}
              onCancel={(event) => { event.preventDefault(); setGalleryOpen(false); }}>
              <div className="report-evidence-dialog-bar">
                {videoUrl && <strong>Report video</strong>}
                <button type="button" className="report-evidence-dialog-close"
                  aria-label={videoUrl ? "Close video" : "Close gallery"} onClick={() => setGalleryOpen(false)}>
                  <X size={20} aria-hidden="true" />
                </button>
              </div>
              {videoUrl ? (
                <>
                  <video ref={playerRef} className={`report-evidence-player${frames.length ? " has-detection-frames" : ""}`}
                    src={videoUrl} controls autoPlay playsInline />
                  {frames.length > 0 && <VideoDetectionFrames frames={frames} onExpand={(id) => {
                    playerRef.current?.pause();
                    setSelected(id);
                  }} />}
                </>
              ) : gallery}
            </dialog>, document.body,
          )}
        </>
      ) : gallery}
      {current && createPortal(<EvidencePhotoViewer photo={current}
        navigation={group.length > 1 ? {
          index,
          count: group.length,
          step: (offset) => setSelected(group[(index + offset + group.length) % group.length].id),
        } : undefined}
        onClose={() => setSelected(null)} />, document.body)}
    </div>
  );
}
