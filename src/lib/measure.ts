import type { MeasureMarker } from "./types";

export type MarkerPoint = {
  measureNumber: number;
  timestampMs: number;
};

export function sortMarkers(markers: MeasureMarker[]): MarkerPoint[] {
  return [...markers]
    .sort((left, right) => left.measureNumber - right.measureNumber)
    .map((marker) => ({
      measureNumber: marker.measureNumber,
      timestampMs: marker.timestampMs,
    }));
}

export function estimateMeasureTimestamp(
  measureNumber: number,
  markers: MeasureMarker[],
): number | null {
  const points = sortMarkers(markers);
  if (points.length === 0) {
    return null;
  }

  const exact = points.find((point) => point.measureNumber === measureNumber);
  if (exact) {
    return exact.timestampMs;
  }

  const previous = [...points].reverse().find((point) => point.measureNumber < measureNumber);
  const next = points.find((point) => point.measureNumber > measureNumber);

  if (!previous && next) {
    return next.timestampMs;
  }

  if (previous && !next) {
    return previous.timestampMs;
  }

  if (!previous || !next) {
    return null;
  }

  const measureDistance = next.measureNumber - previous.measureNumber;
  const timestampDistance = next.timestampMs - previous.timestampMs;
  const offset = measureNumber - previous.measureNumber;

  if (measureDistance <= 0) {
    return previous.timestampMs;
  }

  return previous.timestampMs + (timestampDistance * offset) / measureDistance;
}

export function deriveLoopTimes(
  markers: MeasureMarker[],
  startMeasure: number,
  endMeasure: number,
): { startTime: number | null; endTime: number | null } {
  return {
    startTime: estimateMeasureTimestamp(startMeasure, markers),
    endTime: estimateMeasureTimestamp(endMeasure, markers),
  };
}

export function estimateCurrentMeasure(
  currentTimeMs: number,
  markers: MeasureMarker[],
): number {
  const points = sortMarkers(markers);
  if (points.length === 0) {
    return 1;
  }

  let previous = points[0];
  if (currentTimeMs <= previous.timestampMs) {
    return previous.measureNumber;
  }

  for (let index = 1; index < points.length; index += 1) {
    const next = points[index];
    if (currentTimeMs <= next.timestampMs) {
      const span = next.timestampMs - previous.timestampMs;
      if (span <= 0) {
        return previous.measureNumber;
      }
      const ratio = (currentTimeMs - previous.timestampMs) / span;
      return Math.max(
        1,
        Math.round(previous.measureNumber + ratio * (next.measureNumber - previous.measureNumber)),
      );
    }
    previous = next;
  }

  return points[points.length - 1].measureNumber;
}
