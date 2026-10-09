import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft,
  ChevronRight,
  ImageOff,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';

const FOCUSABLE_ELEMENTS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const ZOOM_LEVELS = [1, 1.5, 2, 2.5];

function normalizeMedia(images, materialName) {
  if (!Array.isArray(images)) return [];

  return images.reduce((media, image, index) => {
    const src = typeof image === 'string' ? image : image?.src || image?.url;
    if (!src) return media;

    media.push({
      src,
      alt: typeof image === 'object' && image.alt
        ? image.alt
        : `${materialName} natural stone, view ${index + 1}`,
      label: typeof image === 'object' ? image.label || image.finish || null : null,
    });
    return media;
  }, []);
}

function MediaPlaceholder({ materialName, compact = false }) {
  return (
    <div className={`grid h-full w-full place-items-center bg-stone-200 text-center text-stone-500 ${compact ? '' : 'min-h-64'}`}>
      <div className="px-6">
        <ImageOff className="mx-auto" size={compact ? 20 : 30} strokeWidth={1.4} aria-hidden="true" />
        <p className="mt-3 text-sm">Image unavailable for {materialName}</p>
      </div>
    </div>
  );
}

export default function MaterialMediaViewer({ images, materialName }) {
  const media = useMemo(() => normalizeMedia(images, materialName), [images, materialName]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoomIndex, setZoomIndex] = useState(0);
  const [failedSources, setFailedSources] = useState(() => new Set());
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const openerRef = useRef(null);
  const touchStartRef = useRef(null);
  const hasMultipleImages = media.length > 1;
  const currentMedia = media[activeIndex];
  const zoom = ZOOM_LEVELS[zoomIndex];

  const selectImage = useCallback((index) => {
    setActiveIndex(index);
    setZoomIndex(0);
  }, []);

  const showPrevious = useCallback(() => {
    if (!media.length) return;
    setActiveIndex((index) => (index - 1 + media.length) % media.length);
    setZoomIndex(0);
  }, [media.length]);

  const showNext = useCallback(() => {
    if (!media.length) return;
    setActiveIndex((index) => (index + 1) % media.length);
    setZoomIndex(0);
  }, [media.length]);

  const closeFullscreen = useCallback(() => {
    setIsFullscreen(false);
    setZoomIndex(0);
  }, []);

  const openFullscreen = (event) => {
    openerRef.current = event.currentTarget;
    setIsFullscreen(true);
  };

  const recordImageError = (src) => {
    setFailedSources((sources) => {
      const nextSources = new Set(sources);
      nextSources.add(src);
      return nextSources;
    });
  };

  useEffect(() => {
    if (activeIndex < media.length) return;
    setActiveIndex(Math.max(0, media.length - 1));
  }, [activeIndex, media.length]);

  useEffect(() => {
    if (!isFullscreen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const computedPaddingRight = window.getComputedStyle(document.body).paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const appRoot = document.getElementById('root');
    const appWasInert = appRoot?.hasAttribute('inert');
    const previousAriaHidden = appRoot?.getAttribute('aria-hidden');

    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `calc(${computedPaddingRight} + ${scrollbarWidth}px)`;
    }
    appRoot?.setAttribute('inert', '');
    appRoot?.setAttribute('aria-hidden', 'true');

    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeFullscreen();
        return;
      }

      if (event.key === 'ArrowLeft' && hasMultipleImages) {
        event.preventDefault();
        showPrevious();
        return;
      }

      if (event.key === 'ArrowRight' && hasMultipleImages) {
        event.preventDefault();
        showNext();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = [...(dialogRef.current?.querySelectorAll(FOCUSABLE_ELEMENTS) || [])]
        .filter((element) => element.getClientRects().length > 0);

      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialogRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      if (!appWasInert) appRoot?.removeAttribute('inert');
      if (previousAriaHidden == null) appRoot?.removeAttribute('aria-hidden');
      else appRoot?.setAttribute('aria-hidden', previousAriaHidden);
      openerRef.current?.focus();
    };
  }, [closeFullscreen, hasMultipleImages, isFullscreen, showNext, showPrevious]);

  const handlePointerDown = (event) => {
    if (event.pointerType !== 'touch' || zoom > 1) return;
    touchStartRef.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event) => {
    if (!touchStartRef.current || event.pointerType !== 'touch' || zoom > 1) return;

    const deltaX = event.clientX - touchStartRef.current.x;
    const deltaY = event.clientY - touchStartRef.current.y;
    touchStartRef.current = null;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    if (deltaX > 0) showPrevious();
    else showNext();
  };

  const fullscreenDialog = isFullscreen && currentMedia
    ? createPortal(
      <div
        className="fixed inset-0 z-[120] bg-stone-950/95 text-white"
        role="dialog"
        aria-modal="true"
        aria-label={`${materialName} image viewer`}
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className="flex h-full flex-col">
          <div className="flex min-h-16 shrink-0 items-center justify-between gap-4 border-b border-white/15 px-4 sm:px-6">
            <div className="min-w-0">
              <p className="truncate font-serif text-lg">{materialName}</p>
              <p className="text-xs text-stone-400" aria-live="polite">
                Image {activeIndex + 1} of {media.length} · {Math.round(zoom * 100)}% zoom
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                className="grid h-11 w-11 place-items-center rounded-full text-stone-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => setZoomIndex((index) => Math.max(0, index - 1))}
                disabled={zoomIndex === 0}
                aria-label="Zoom out"
              >
                <Minus size={20} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="grid h-11 w-11 place-items-center rounded-full text-stone-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => setZoomIndex((index) => Math.min(ZOOM_LEVELS.length - 1, index + 1))}
                disabled={zoomIndex === ZOOM_LEVELS.length - 1}
                aria-label="Zoom in"
              >
                <Plus size={20} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="grid h-11 w-11 place-items-center rounded-full text-stone-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => setZoomIndex(0)}
                disabled={zoomIndex === 0}
                aria-label="Reset zoom"
              >
                <RotateCcw size={18} aria-hidden="true" />
              </button>
              <button
                ref={closeButtonRef}
                type="button"
                className="ml-1 grid h-11 w-11 place-items-center rounded-full border border-white/25 text-white hover:bg-white hover:text-stone-950"
                onClick={closeFullscreen}
                aria-label="Close fullscreen image viewer"
              >
                <X size={21} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div
            className="relative min-h-0 flex-1 overflow-auto overscroll-contain"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            style={{ touchAction: zoom > 1 ? 'pan-x pan-y' : 'pan-y' }}
          >
            <div className="grid min-h-full min-w-full place-items-center p-4 sm:p-8">
              {failedSources.has(currentMedia.src) ? (
                <div className="h-[70vh] w-full max-w-4xl overflow-hidden rounded-sm">
                  <MediaPlaceholder materialName={materialName} />
                </div>
              ) : (
                <img
                  key={currentMedia.src}
                  src={currentMedia.src}
                  alt={currentMedia.alt}
                  onError={() => recordImageError(currentMedia.src)}
                  draggable="false"
                  decoding="async"
                  className="max-w-none select-none object-contain transition-[width] duration-200 motion-reduce:transition-none"
                  style={{ width: `${zoom * 100}%`, maxHeight: zoom === 1 ? 'calc(100vh - 11rem)' : 'none' }}
                />
              )}
            </div>

            {hasMultipleImages && (
              <>
                <button
                  type="button"
                  className="fixed left-3 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-stone-950/70 hover:bg-white hover:text-stone-950 sm:left-6"
                  onClick={showPrevious}
                  aria-label="Show previous material image"
                >
                  <ChevronLeft size={23} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="fixed right-3 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-stone-950/70 hover:bg-white hover:text-stone-950 sm:right-6"
                  onClick={showNext}
                  aria-label="Show next material image"
                >
                  <ChevronRight size={23} aria-hidden="true" />
                </button>
              </>
            )}
          </div>

          {hasMultipleImages && (
            <div className="flex shrink-0 justify-center gap-2 overflow-x-auto border-t border-white/15 px-4 py-3">
              {media.map((item, index) => (
                <button
                  key={`${item.src}-${index}`}
                  type="button"
                  onClick={() => selectImage(index)}
                  className={`h-14 w-14 shrink-0 overflow-hidden border-2 bg-stone-900 ${index === activeIndex ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'}`}
                  aria-label={`Show image ${index + 1} of ${materialName}`}
                  aria-current={index === activeIndex ? 'true' : undefined}
                >
                  {failedSources.has(item.src) ? (
                    <MediaPlaceholder materialName={materialName} compact />
                  ) : (
                    <img src={item.src} alt="" className="h-full w-full object-cover" decoding="async" onError={() => recordImageError(item.src)} />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>,
      document.body,
    )
    : null;

  if (!currentMedia) {
    return (
      <div className="aspect-[4/5] overflow-hidden border border-[var(--color-border)] bg-stone-200 sm:aspect-square">
        <MediaPlaceholder materialName={materialName} />
      </div>
    );
  }

  return (
    <div aria-label={`${materialName} material photographs`}>
      <div className="relative aspect-[4/5] overflow-hidden border border-[var(--color-border)] bg-stone-200 sm:aspect-square">
        {failedSources.has(currentMedia.src) ? (
          <MediaPlaceholder materialName={materialName} />
        ) : (
          <button
            type="button"
            className="group block h-full w-full cursor-zoom-in overflow-hidden text-left"
            onClick={openFullscreen}
            aria-label={`Open ${materialName} image ${activeIndex + 1} in fullscreen`}
          >
            <img
              key={currentMedia.src}
              src={currentMedia.src}
              alt={currentMedia.alt}
              onError={() => recordImageError(currentMedia.src)}
              width="1200"
              height="1200"
              fetchPriority="high"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.025] motion-reduce:transform-none motion-reduce:transition-none"
            />
            <span className="absolute bottom-4 right-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-stone-950/80 px-4 text-xs font-semibold uppercase tracking-[.12em] text-white backdrop-blur-sm">
              <Maximize2 size={15} aria-hidden="true" /> Inspect material
            </span>
          </button>
        )}

        {hasMultipleImages && (
          <div className="absolute inset-x-4 top-1/2 flex -translate-y-1/2 justify-between pointer-events-none">
            <button
              type="button"
              className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full bg-white/90 text-stone-950 shadow-md hover:bg-white"
              onClick={showPrevious}
              aria-label="Show previous material image"
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full bg-white/90 text-stone-950 shadow-md hover:bg-white"
              onClick={showNext}
              aria-label="Show next material image"
            >
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {hasMultipleImages && (
        <div className="mt-3 flex gap-3 overflow-x-auto pb-1" aria-label="Choose a material image">
          {media.map((item, index) => (
            <button
              key={`${item.src}-${index}`}
              type="button"
              onClick={() => selectImage(index)}
              className={`relative h-20 w-20 shrink-0 overflow-hidden border-2 bg-stone-200 sm:h-24 sm:w-24 ${index === activeIndex ? 'border-[var(--color-brand)]' : 'border-transparent hover:border-stone-400'}`}
              aria-label={`Show image ${index + 1} of ${materialName}`}
              aria-current={index === activeIndex ? 'true' : undefined}
            >
              {failedSources.has(item.src) ? (
                <MediaPlaceholder materialName={materialName} compact />
              ) : (
                <img src={item.src} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" onError={() => recordImageError(item.src)} />
              )}
              {item.label && <span className="sr-only">{item.label}</span>}
            </button>
          ))}
        </div>
      )}

      {fullscreenDialog}
    </div>
  );
}
