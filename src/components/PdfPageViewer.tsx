import { useEffect, useRef, useState, type ReactNode, type MouseEvent } from "react";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.js",
  import.meta.url,
).toString();

const documentCache = new Map<string, Promise<PDFDocumentProxy>>();

function loadDocument(src: string): Promise<PDFDocumentProxy> {
  let pending = documentCache.get(src);
  if (!pending) {
    pending = pdfjsLib.getDocument(src).promise;
    documentCache.set(src, pending);
  }
  return pending;
}

export function usePdfDocument(src: string | null) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!src) {
      setDoc(null);
      setNumPages(0);
      setError(null);
      return;
    }
    let cancelled = false;
    setError(null);
    loadDocument(src)
      .then((pdf) => {
        if (cancelled) {
          return;
        }
        setDoc(pdf);
        setNumPages(pdf.numPages);
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        setError(err instanceof Error ? err.message : "Unable to load the PDF score.");
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  return { doc, numPages, error };
}

export type NormalizedPoint = { x: number; y: number };

type PdfPageCanvasProps = {
  doc: PDFDocumentProxy | null;
  pageNumber: number;
  scale?: number;
  editable?: boolean;
  onMark?: (point: NormalizedPoint) => void;
  onPointPreview?: (point: NormalizedPoint | null) => void;
  className?: string;
  fitToContainer?: boolean;
  children?: ReactNode;
  /** Normalized (0-1) page window to display; omit to show the full page. */
  cropLeft?: number;
  cropRight?: number;
  cropTop?: number;
  cropBottom?: number;
};

export function PdfPageCanvas({
  doc,
  pageNumber,
  scale = 1.2,
  editable = false,
  onMark,
  onPointPreview,
  className,
  fitToContainer = false,
  children,
  cropLeft,
  cropRight,
  cropTop,
  cropBottom,
}: PdfPageCanvasProps) {
  const pageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [renderedSize, setRenderedSize] = useState({ width: 0, height: 0 });
  const [fitDisplayWidth, setFitDisplayWidth] = useState<number | null>(null);
  const left = clamp01(cropLeft ?? 0);
  const right = clamp01(cropRight ?? 1);
  const top = clamp01(cropTop ?? 0);
  const bottom = clamp01(cropBottom ?? 1);
  const isCropped = right > left && bottom > top && (left > 0 || right < 1 || top > 0 || bottom < 1);

  useEffect(() => {
    if (!doc || pageNumber < 1) {
      return;
    }
    let cancelled = false;
    let renderTask: ReturnType<import("pdfjs-dist").PDFPageProxy["render"]> | null = null;

    void (async () => {
      const page = await doc.getPage(pageNumber);
      if (cancelled) {
        return;
      }
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }
      const cropX = isCropped ? left * viewport.width : 0;
      const cropY = isCropped ? top * viewport.height : 0;
      const renderWidth = isCropped ? (right - left) * viewport.width : viewport.width;
      const renderHeight = isCropped ? (bottom - top) * viewport.height : viewport.height;
      canvas.width = renderWidth;
      canvas.height = renderHeight;
      setRenderedSize({ width: renderWidth, height: renderHeight });
      context.clearRect(0, 0, renderWidth, renderHeight);
      context.fillStyle = "#fff";
      context.fillRect(0, 0, renderWidth, renderHeight);
      renderTask = page.render({
        canvasContext: context,
        viewport,
        transform: isCropped ? [1, 0, 0, 1, -cropX, -cropY] : undefined,
      });
      try {
        await renderTask.promise;
      } catch {
        // A newer render request cancelled this one; nothing to do.
      }
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [bottom, doc, isCropped, left, pageNumber, right, scale, top]);

  useEffect(() => {
    if (!fitToContainer || renderedSize.width <= 0 || renderedSize.height <= 0) {
      setFitDisplayWidth(null);
      return;
    }

    function updateFitWidth() {
      const parent = pageRef.current?.parentElement;
      if (!parent) {
        return;
      }
      const aspectRatio = renderedSize.width / renderedSize.height;
      const availableWidth = parent.clientWidth || renderedSize.width;
      const availableHeight = Math.max(260, window.innerHeight - 360);
      const nextWidth = Math.max(180, Math.min(renderedSize.width, availableWidth, availableHeight * aspectRatio));
      setFitDisplayWidth((current) => (current != null && Math.abs(current - nextWidth) < 1 ? current : nextWidth));
    }

    updateFitWidth();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateFitWidth);
    const parent = pageRef.current?.parentElement;
    if (observer && parent) {
      observer.observe(parent);
    }
    window.addEventListener("resize", updateFitWidth);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateFitWidth);
    };
  }, [fitToContainer, renderedSize.height, renderedSize.width]);

  function pointFromEvent(event: MouseEvent<HTMLDivElement>): NormalizedPoint {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = bounds.width > 0 ? (event.clientX - bounds.left) / bounds.width : 0;
    const y = bounds.height > 0 ? (event.clientY - bounds.top) / bounds.height : 0;
    return { x: clamp01(x), y: clamp01(y) };
  }

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (!editable || !onMark) {
      return;
    }
    onMark(pointFromEvent(event));
  }

  function handleMouseMove(event: MouseEvent<HTMLDivElement>) {
    if (!editable || !onPointPreview) {
      return;
    }
    onPointPreview(pointFromEvent(event));
  }

  const pageClassName = [
    "pdf-page",
    className ?? "",
    fitToContainer ? "pdf-page--fit" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const pageStyle =
    fitToContainer && renderedSize.width > 0 && renderedSize.height > 0
      ? {
          width: `min(${fitDisplayWidth ?? renderedSize.width}px, 100%)`,
          aspectRatio: `${renderedSize.width} / ${renderedSize.height}`,
        }
      : { width: renderedSize.width || undefined, height: renderedSize.height || undefined };

  return (
    <div
      ref={pageRef}
      className={pageClassName}
      style={pageStyle}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => onPointPreview?.(null)}
      data-editable={editable ? "true" : "false"}
    >
      <canvas ref={canvasRef} className="pdf-page__canvas" />
      <div className="pdf-page__overlay">{children}</div>
    </div>
  );
}

export function PdfPageGrid({
  doc,
  numPages,
  activePage,
  onSelectPage,
}: {
  doc: PDFDocumentProxy | null;
  numPages: number;
  activePage: number;
  onSelectPage: (page: number) => void;
}) {
  return (
    <div className="pdf-page-grid">
      {Array.from({ length: numPages }, (_, index) => index + 1).map((pageNumber) => (
        <button
          key={pageNumber}
          type="button"
          className={
            pageNumber === activePage ? "pdf-page-grid__item pdf-page-grid__item--active" : "pdf-page-grid__item"
          }
          onClick={() => onSelectPage(pageNumber)}
        >
          <PdfPageCanvas doc={doc} pageNumber={pageNumber} scale={0.22} />
          <span>{pageNumber}</span>
        </button>
      ))}
    </div>
  );
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
