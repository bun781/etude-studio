import { useEffect, useMemo, useState } from "react";

export type TutorialStep = {
  id: string;
  title: string;
  body: string;
  targetId: string;
  view?: string;
};

type Props = {
  steps: TutorialStep[];
  currentIndex: number;
  onStepChange: (index: number) => void;
  onClose: () => void;
};

type TargetBox = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export function TutorialTour({ steps, currentIndex, onStepChange, onClose }: Props) {
  const [targetBox, setTargetBox] = useState<TargetBox | null>(null);
  const currentStep = steps[currentIndex];
  const progressText = `${currentIndex + 1} of ${steps.length}`;

  useEffect(() => {
    if (!currentStep) {
      return;
    }

    let frameId = 0;

    function updateTargetBox() {
      const target = document.querySelector<HTMLElement>(`[data-tour-id="${currentStep.targetId}"]`);
      if (!target) {
        setTargetBox(null);
        return;
      }

      target.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      frameId = window.requestAnimationFrame(() => {
        const bounds = target.getBoundingClientRect();
        setTargetBox({
          top: bounds.top,
          left: bounds.left,
          width: bounds.width,
          height: bounds.height,
        });
      });
    }

    const timeoutId = window.setTimeout(updateTargetBox, 120);
    window.addEventListener("resize", updateTargetBox);
    window.addEventListener("scroll", updateTargetBox, true);

    return () => {
      window.clearTimeout(timeoutId);
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", updateTargetBox);
      window.removeEventListener("scroll", updateTargetBox, true);
    };
  }, [currentStep]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
      if (event.key === "ArrowRight") {
        onStepChange(Math.min(steps.length - 1, currentIndex + 1));
      }
      if (event.key === "ArrowLeft") {
        onStepChange(Math.max(0, currentIndex - 1));
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, onClose, onStepChange, steps.length]);

  const cardStyle = useMemo(() => {
    if (!targetBox) {
      return undefined;
    }

    const cardWidth = 360;
    const spacing = 18;
    const fitsRight = targetBox.left + targetBox.width + cardWidth + spacing < window.innerWidth;
    const fitsBelow = targetBox.top + targetBox.height + 220 + spacing < window.innerHeight;
    const left = fitsRight
      ? targetBox.left + targetBox.width + spacing
      : Math.max(16, Math.min(window.innerWidth - cardWidth - 16, targetBox.left));
    const top = fitsRight
      ? Math.max(16, Math.min(window.innerHeight - 240, targetBox.top))
      : fitsBelow
        ? targetBox.top + targetBox.height + spacing
        : Math.max(16, targetBox.top - 236);

    return {
      left,
      top,
      width: cardWidth,
    };
  }, [targetBox]);

  if (!currentStep) {
    return null;
  }

  return (
    <div className="tour-layer" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div className="tour-scrim" onClick={onClose} />
      {targetBox ? (
        <div
          className="tour-highlight"
          style={{
            top: targetBox.top - 8,
            left: targetBox.left - 8,
            width: targetBox.width + 16,
            height: targetBox.height + 16,
          }}
        />
      ) : null}
      <section className="tour-card" style={cardStyle}>
        <div className="tour-card__header">
          <span className="eyebrow">Guided Tour</span>
          <span className="pill">{progressText}</span>
        </div>
        <h2 id="tour-title">{currentStep.title}</h2>
        <p>{currentStep.body}</p>
        {!targetBox ? (
          <p className="muted">This control appears when the related project data is available.</p>
        ) : null}
        <div className="tour-card__actions">
          <button className="secondary-btn" onClick={onClose}>
            End tour
          </button>
          <button
            className="secondary-btn"
            onClick={() => onStepChange(Math.max(0, currentIndex - 1))}
            disabled={currentIndex === 0}
          >
            Back
          </button>
          <button
            className="primary-btn"
            onClick={() => {
              if (currentIndex >= steps.length - 1) {
                onClose();
                return;
              }
              onStepChange(currentIndex + 1);
            }}
          >
            {currentIndex >= steps.length - 1 ? "Finish" : "Next"}
          </button>
        </div>
      </section>
    </div>
  );
}
