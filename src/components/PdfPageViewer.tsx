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
  className?: string;
  children?: ReactNode;
  /** Normalized (0-1) vertical window of the page to display; omit to show the full page. */
  cropTop?: number;
  cropBottom?: number;
};

export function PdfPageCanvas({
  doc,
  pageNumber,
  scale = 1.2,
  editable = false,
  onMark,
  className,
  children,
  cropTop,
  cropBottom,
}: PdfPageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [renderedSize, setRenderedSize] = useState({ width: 0, height: 0 });
  const top = clamp01(cropTop ?? 0);
  const bottom = clamp01(cropBottom ?? 1);
  const isCropped = bottom > top && (top > 0 || bottom < 1);

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
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      setRenderedSize({ width: viewport.width, height: viewport.height });
      renderTask = page.render({ canvasContext: context, viewport });
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
  }, [doc, pageNumber, scale]);

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (!editable || !onMark) {
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = bounds.width > 0 ? (event.clientX - bounds.left) / bounds.width : 0;
    const y = bounds.height > 0 ? (event.clientY - bounds.top) / bounds.height : 0;
    onMark({ x: clamp01(x), y: clamp01(y) });
  }

  const inner = (
    <div
      className={className ? `pdf-page ${className}` : "pdf-page"}
      style={{ width: renderedSize.width || undefined, height: renderedSize.height || undefined }}
      onClick={handleClick}
      data-editable={editable ? "true" : "false"}
    >
      <canvas ref={canvasRef} className="pdf-page__canvas" />
      <div className="pdf-page__overlay">{children}</div>
    </div>
  );

  if (!isCropped || !renderedSize.height) {
    return inner;
  }

  const cropHeight = (bottom - top) * renderedSize.height;

  return (
    <div className="pdf-page-crop" style={{ width: renderedSize.width, height: cropHeight }}>
      <div className="pdf-page-crop__inner" style={{ top: -(top * renderedSize.height) }}>
        {inner}
      </div>
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
