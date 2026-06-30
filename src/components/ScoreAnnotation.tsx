import type { CSSProperties, ReactNode } from "react";
import type { PracticeSegment, PracticeSegmentCoordinate } from "../lib/types";

export type AnnotationRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type PageWindow = {
  pageNumber: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type ScoreAnnotationProps = {
  rect: AnnotationRect;
  label: string;
  number?: number;
  isActive?: boolean;
  isDraft?: boolean;
  onSelect?: () => void;
};

const MIN_RECT_WIDTH = 0.08;
const MIN_RECT_HEIGHT = 0.035;
const PRACTICE_CROP_PADDING = 0.055;

export function ScoreAnnotation({
  rect,
  label,
  number,
  isActive = false,
  isDraft = false,
  onSelect,
}: ScoreAnnotationProps) {
  const className = [
    "score-annotation",
    isActive ? "score-annotation--active" : "",
    isDraft ? "score-annotation--draft" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const style: CSSProperties = {
    left: `${rect.left * 100}%`,
    top: `${rect.top * 100}%`,
    width: `${rect.width * 100}%`,
    height: `${rect.height * 100}%`,
  };

  const content: ReactNode = (
    <>
      {number != null ? <span className="score-annotation__badge">{number}</span> : null}
      <span className="score-annotation__label">{label}</span>
    </>
  );

  if (!onSelect) {
    return (
      <span className={className} style={style}>
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={className}
      style={style}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      {content}
    </button>
  );
}

export function getDraftAnnotationRect(
  pageNumber: number,
  start: { page: number; point: PracticeSegmentCoordinate } | null,
  end: { page: number; point: PracticeSegmentCoordinate } | null,
): AnnotationRect | null {
  if (!start || !end) {
    return null;
  }
  return getAnnotationRect(pageNumber, start.page, start.point, end.page, end.point);
}

export function getSegmentAnnotationRect(segment: PracticeSegment, pageNumber: number): AnnotationRect | null {
  if (!segment.startCoordinate || !segment.endCoordinate) {
    return null;
  }
  return getAnnotationRect(pageNumber, segment.startPage, segment.startCoordinate, segment.endPage, segment.endCoordinate);
}

export function getSegmentPageWindows(segment: PracticeSegment): PageWindow[] {
  if (!segment.startCoordinate || !segment.endCoordinate) {
    const windows: PageWindow[] = [];
    for (let pageNumber = segment.startPage; pageNumber <= segment.endPage; pageNumber += 1) {
      windows.push({ pageNumber, left: 0, right: 1, top: 0, bottom: 1 });
    }
    return windows;
  }

  const windows: PageWindow[] = [];
  for (let pageNumber = segment.startPage; pageNumber <= segment.endPage; pageNumber += 1) {
    const rect = getSegmentAnnotationRect(segment, pageNumber);
    if (!rect) {
      continue;
    }
    const padded = padRect(rect, PRACTICE_CROP_PADDING);
    windows.push({
      pageNumber,
      left: padded.left,
      right: padded.left + padded.width,
      top: padded.top,
      bottom: padded.top + padded.height,
    });
  }
  return windows.length > 0 ? windows : [{ pageNumber: segment.startPage, left: 0, right: 1, top: 0, bottom: 1 }];
}

export function getRectInPageWindow(rect: AnnotationRect, window: PageWindow): AnnotationRect | null {
  const windowWidth = window.right - window.left;
  const windowHeight = window.bottom - window.top;
  if (windowWidth <= 0 || windowHeight <= 0) {
    return null;
  }

  const rectLeft = rect.left;
  const rectRight = rect.left + rect.width;
  const rectTop = rect.top;
  const rectBottom = rect.top + rect.height;
  const left = Math.max(rectLeft, window.left);
  const right = Math.min(rectRight, window.right);
  const top = Math.max(rectTop, window.top);
  const bottom = Math.min(rectBottom, window.bottom);

  if (right <= left || bottom <= top) {
    return null;
  }

  return {
    left: (left - window.left) / windowWidth,
    top: (top - window.top) / windowHeight,
    width: (right - left) / windowWidth,
    height: (bottom - top) / windowHeight,
  };
}

function getAnnotationRect(
  pageNumber: number,
  startPage: number,
  start: PracticeSegmentCoordinate,
  endPage: number,
  end: PracticeSegmentCoordinate,
): AnnotationRect | null {
  const firstPage = Math.min(startPage, endPage);
  const lastPage = Math.max(startPage, endPage);
  if (pageNumber < firstPage || pageNumber > lastPage) {
    return null;
  }

  if (startPage === endPage) {
    return rectFromPoints(start, end);
  }

  if (pageNumber === startPage) {
    return rectFromBounds(0, start.y, 1, 1);
  }
  if (pageNumber === endPage) {
    return rectFromBounds(0, 0, 1, end.y);
  }
  return rectFromBounds(0, 0, 1, 1);
}

function rectFromPoints(start: PracticeSegmentCoordinate, end: PracticeSegmentCoordinate): AnnotationRect {
  return rectFromBounds(start.x, start.y, end.x, end.y);
}

function rectFromBounds(leftValue: number, topValue: number, rightValue: number, bottomValue: number): AnnotationRect {
  let left = clamp01(Math.min(leftValue, rightValue));
  let right = clamp01(Math.max(leftValue, rightValue));
  let top = clamp01(Math.min(topValue, bottomValue));
  let bottom = clamp01(Math.max(topValue, bottomValue));

  if (right - left < MIN_RECT_WIDTH) {
    const center = (left + right) / 2;
    left = clamp01(center - MIN_RECT_WIDTH / 2);
    right = clamp01(left + MIN_RECT_WIDTH);
    left = clamp01(right - MIN_RECT_WIDTH);
  }

  if (bottom - top < MIN_RECT_HEIGHT) {
    const center = (top + bottom) / 2;
    top = clamp01(center - MIN_RECT_HEIGHT / 2);
    bottom = clamp01(top + MIN_RECT_HEIGHT);
    top = clamp01(bottom - MIN_RECT_HEIGHT);
  }

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

function padRect(rect: AnnotationRect, padding: number): AnnotationRect {
  const left = clamp01(rect.left - padding);
  const top = clamp01(rect.top - padding);
  const right = clamp01(rect.left + rect.width + padding);
  const bottom = clamp01(rect.top + rect.height + padding);
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
