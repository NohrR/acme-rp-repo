const VIDEO_FRAME_RATE = 60;
const FIRST_SEGMENT_END_FRAME = 80;
const SECOND_SEGMENT_START_FRAME = 80;
const SECOND_SEGMENT_END_FRAME = 160;
const FRAME_TOLERANCE_SECONDS = 0.5 / VIDEO_FRAME_RATE;
const DEBUG_FRAME_LOGGING = true;
const MAIN_PAGE_URL = "./main.html";
const RESUME_INTERACTION_OPTIONS = { passive: true };
const LOTTIE_PATH = "./assets/introLottie.json";
const VIDEO_RENDER_SIZE = { width: 1920, height: 1080 };
const LOTTIE_TARGET_POINTS = {
  topLeft: { x: 0.051433, y: 0.188806 },
  topRight: { x: 0.440065, y: 0.269771 },
  bottomRight: { x: 0.439635, y: 0.611527 },
  bottomLeft: { x: 0.047283, y: 0.628699 },
};

const heroShell = document.getElementById("hero-shell");
const lottieLayer = document.getElementById("hero-lottie-layer");
const lottieStage = document.getElementById("hero-lottie-stage");
const video = document.getElementById("hero-video");
const resumePrompt = document.getElementById("hero-resume-prompt");

if (!heroShell || !lottieLayer || !lottieStage || !video || !resumePrompt) {
  throw new Error("Homepage media elements were not found.");
}

let firstSegmentEndTime = FIRST_SEGMENT_END_FRAME / VIDEO_FRAME_RATE;
let secondSegmentStartTime = SECOND_SEGMENT_START_FRAME / VIDEO_FRAME_RATE;
let secondSegmentEndTime = SECOND_SEGMENT_END_FRAME / VIDEO_FRAME_RATE;
let boundaryFrameCallbackId = null;
let boundaryFallbackRafId = null;
let introLottieData = null;
let introLottieAnimation = null;
let lottieLayoutFrameId = null;
let isLottieDomReady = false;
let hasStartedLottieIntro = false;
let shouldStartLottieIntro = false;
let isWaitingForInteraction = false;
let isPlayingSecondSegment = false;
let hasCompletedFlow = false;
let loggedFrame = -1;

function getVideoSourceSize() {
  if (video.videoWidth > 0 && video.videoHeight > 0) {
    return {
      width: video.videoWidth,
      height: video.videoHeight,
    };
  }

  return VIDEO_RENDER_SIZE;
}

function getRenderedVideoBox() {
  const shellRect = heroShell.getBoundingClientRect();
  const videoRect = video.getBoundingClientRect();
  const { width: sourceWidth, height: sourceHeight } = getVideoSourceSize();
  const scale = Math.max(videoRect.width / sourceWidth, videoRect.height / sourceHeight);
  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;

  return {
    left: videoRect.left - shellRect.left + (videoRect.width - renderedWidth) / 2,
    top: videoRect.top - shellRect.top + (videoRect.height - renderedHeight) / 2,
    width: renderedWidth,
    height: renderedHeight,
  };
}

function mapNormalizedPointToScreen(point, box) {
  return {
    x: box.left + point.x * box.width,
    y: box.top + point.y * box.height,
  };
}

function solveLinearSystem(matrix) {
  const rowCount = matrix.length;
  const columnCount = matrix[0].length;

  for (let pivotIndex = 0; pivotIndex < rowCount; pivotIndex += 1) {
    let maxRowIndex = pivotIndex;

    for (let rowIndex = pivotIndex + 1; rowIndex < rowCount; rowIndex += 1) {
      if (Math.abs(matrix[rowIndex][pivotIndex]) > Math.abs(matrix[maxRowIndex][pivotIndex])) {
        maxRowIndex = rowIndex;
      }
    }

    if (Math.abs(matrix[maxRowIndex][pivotIndex]) < 1e-10) {
      throw new Error("The Lottie perspective transform could not be solved.");
    }

    if (maxRowIndex !== pivotIndex) {
      [matrix[pivotIndex], matrix[maxRowIndex]] = [matrix[maxRowIndex], matrix[pivotIndex]];
    }

    const pivotValue = matrix[pivotIndex][pivotIndex];

    for (let columnIndex = pivotIndex; columnIndex < columnCount; columnIndex += 1) {
      matrix[pivotIndex][columnIndex] /= pivotValue;
    }

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      if (rowIndex === pivotIndex) {
        continue;
      }

      const factor = matrix[rowIndex][pivotIndex];

      if (Math.abs(factor) < 1e-10) {
        continue;
      }

      for (let columnIndex = pivotIndex; columnIndex < columnCount; columnIndex += 1) {
        matrix[rowIndex][columnIndex] -= factor * matrix[pivotIndex][columnIndex];
      }
    }
  }

  return matrix.map((row) => row[columnCount - 1]);
}

function getHomographyMatrix(sourcePoints, destinationPoints) {
  const matrix = [];

  for (let pointIndex = 0; pointIndex < sourcePoints.length; pointIndex += 1) {
    const sourcePoint = sourcePoints[pointIndex];
    const destinationPoint = destinationPoints[pointIndex];

    matrix.push([
      sourcePoint.x,
      sourcePoint.y,
      1,
      0,
      0,
      0,
      -sourcePoint.x * destinationPoint.x,
      -sourcePoint.y * destinationPoint.x,
      destinationPoint.x,
    ]);

    matrix.push([
      0,
      0,
      0,
      sourcePoint.x,
      sourcePoint.y,
      1,
      -sourcePoint.x * destinationPoint.y,
      -sourcePoint.y * destinationPoint.y,
      destinationPoint.y,
    ]);
  }

  const solution = solveLinearSystem(matrix);

  return {
    h11: solution[0],
    h12: solution[1],
    h13: solution[2],
    h21: solution[3],
    h22: solution[4],
    h23: solution[5],
    h31: solution[6],
    h32: solution[7],
    h33: 1,
  };
}

function applyLottiePerspective() {
  if (!introLottieData) {
    return;
  }

  const box = getRenderedVideoBox();
  const destinationPoints = [
    mapNormalizedPointToScreen(LOTTIE_TARGET_POINTS.topLeft, box),
    mapNormalizedPointToScreen(LOTTIE_TARGET_POINTS.topRight, box),
    mapNormalizedPointToScreen(LOTTIE_TARGET_POINTS.bottomRight, box),
    mapNormalizedPointToScreen(LOTTIE_TARGET_POINTS.bottomLeft, box),
  ];

  const sourcePoints = [
    { x: 0, y: 0 },
    { x: introLottieData.w, y: 0 },
    { x: introLottieData.w, y: introLottieData.h },
    { x: 0, y: introLottieData.h },
  ];

  const homography = getHomographyMatrix(sourcePoints, destinationPoints);

  lottieStage.style.width = `${introLottieData.w + 2}px`;
  lottieStage.style.height = `${introLottieData.h}px`;
  lottieStage.style.transform = `matrix3d(${[
    homography.h11,
    homography.h21,
    0,
    homography.h31,
    homography.h12,
    homography.h22,
    0,
    homography.h32,
    0,
    0,
    1,
    0,
    homography.h13,
    homography.h23,
    0,
    homography.h33,
  ].join(",")})`;
}

function requestLottieLayout() {
  if (!introLottieData) {
    return;
  }

  if (lottieLayoutFrameId !== null) {
    cancelAnimationFrame(lottieLayoutFrameId);
  }

  lottieLayoutFrameId = requestAnimationFrame(() => {
    lottieLayoutFrameId = null;
    applyLottiePerspective();
  });
}

function startLottieIntro() {
  shouldStartLottieIntro = true;

  if (!introLottieAnimation || !isLottieDomReady || hasStartedLottieIntro) {
    return;
  }

  hasStartedLottieIntro = true;
  lottieLayer.classList.add("is-visible");
  requestLottieLayout();
  introLottieAnimation.goToAndPlay(0, true);
}

function hideLottieIntro() {
  shouldStartLottieIntro = false;
  lottieLayer.classList.remove("is-visible");

  if (introLottieAnimation) {
    introLottieAnimation.stop();
  }
}

async function initialiseLottieOverlay() {
  if (!window.lottie || typeof window.lottie.loadAnimation !== "function") {
    console.warn("The Lottie runtime failed to load.");
    return;
  }

  try {
    const response = await fetch(LOTTIE_PATH);

    if (!response.ok) {
      throw new Error(`Failed to load ${LOTTIE_PATH}: ${response.status}`);
    }

    introLottieData = await response.json();
    introLottieAnimation = window.lottie.loadAnimation({
      container: lottieStage,
      renderer: "svg",
      loop: true,
      autoplay: false,
      animationData: introLottieData,
      rendererSettings: {
        preserveAspectRatio: "none",
      },
    });

    introLottieAnimation.addEventListener("DOMLoaded", () => {
      isLottieDomReady = true;
      requestLottieLayout();
      if (shouldStartLottieIntro) {
        startLottieIntro();
      }
    });
  } catch (error) {
    console.warn("The intro Lottie overlay could not be initialised:", error);
  }
}

function refreshBoundaryTimes() {
  const firstTargetTime = FIRST_SEGMENT_END_FRAME / VIDEO_FRAME_RATE;
  const secondStartTargetTime = SECOND_SEGMENT_START_FRAME / VIDEO_FRAME_RATE;
  const secondTargetTime = SECOND_SEGMENT_END_FRAME / VIDEO_FRAME_RATE;

  if (Number.isFinite(video.duration) && video.duration > 0) {
    firstSegmentEndTime = Math.min(firstTargetTime, video.duration);
    secondSegmentStartTime = Math.min(secondStartTargetTime, video.duration);
    secondSegmentEndTime = Math.min(secondTargetTime, video.duration);
    return;
  }

  firstSegmentEndTime = firstTargetTime;
  secondSegmentStartTime = secondStartTargetTime;
  secondSegmentEndTime = secondTargetTime;
}

function clearBoundaryWatcher() {
  if (boundaryFrameCallbackId !== null && typeof video.cancelVideoFrameCallback === "function") {
    video.cancelVideoFrameCallback(boundaryFrameCallbackId);
  }

  if (boundaryFallbackRafId !== null) {
    cancelAnimationFrame(boundaryFallbackRafId);
  }

  boundaryFrameCallbackId = null;
  boundaryFallbackRafId = null;
}

function logCurrentFrame() {
  if (!DEBUG_FRAME_LOGGING) {
    return;
  }

  const currentFrame = Math.max(0, Math.round(video.currentTime * VIDEO_FRAME_RATE));

  if (currentFrame === loggedFrame) {
    return;
  }

  loggedFrame = currentFrame;
  console.log(`hero-render.mp4 frame: ${currentFrame}`);
}

function setResumePromptVisibility(isVisible) {
  resumePrompt.classList.toggle("is-visible", isVisible);
}

function removeResumeInteractionListeners() {
  window.removeEventListener("pointerdown", handleResumeInteraction, RESUME_INTERACTION_OPTIONS);
  window.removeEventListener("wheel", handleResumeInteraction, RESUME_INTERACTION_OPTIONS);
  window.removeEventListener("touchmove", handleResumeInteraction, RESUME_INTERACTION_OPTIONS);
}

function addResumeInteractionListeners() {
  removeResumeInteractionListeners();
  window.addEventListener("pointerdown", handleResumeInteraction, RESUME_INTERACTION_OPTIONS);
  window.addEventListener("wheel", handleResumeInteraction, RESUME_INTERACTION_OPTIONS);
  window.addEventListener("touchmove", handleResumeInteraction, RESUME_INTERACTION_OPTIONS);
}

function seekVideoTo(targetTime) {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - targetTime) <= FRAME_TOLERANCE_SECONDS) {
      video.currentTime = targetTime;
      resolve();
      return;
    }

    const handleSeeked = () => {
      cleanup();
      resolve();
    };

    const cleanup = () => {
      video.removeEventListener("seeked", handleSeeked);
    };

    video.addEventListener("seeked", handleSeeked, { once: true });
    video.currentTime = targetTime;
  });
}

async function pauseAtFirstBoundary() {
  if (isWaitingForInteraction || isPlayingSecondSegment || hasCompletedFlow || video.ended) {
    return;
  }

  clearBoundaryWatcher();
  video.pause();

  try {
    await seekVideoTo(firstSegmentEndTime);
  } catch (error) {
    console.warn("Seeking to the first homepage boundary failed:", error);
  }

  logCurrentFrame();
  startLottieIntro();
  isWaitingForInteraction = true;
  setResumePromptVisibility(true);
  addResumeInteractionListeners();
}

function finishSecondSegment() {
  if (!isPlayingSecondSegment || hasCompletedFlow) {
    return;
  }

  clearBoundaryWatcher();
  removeResumeInteractionListeners();
  hasCompletedFlow = true;
  isPlayingSecondSegment = false;
  setResumePromptVisibility(false);
  video.pause();
  window.location.assign(MAIN_PAGE_URL);
}

function watchBoundaryWithFallback(targetTime, onReached, shouldContinue) {
  const tick = () => {
    if (video.paused || video.ended || !shouldContinue()) {
      boundaryFallbackRafId = null;
      return;
    }

    if (video.currentTime + FRAME_TOLERANCE_SECONDS >= targetTime) {
      onReached();
      return;
    }

    boundaryFallbackRafId = requestAnimationFrame(tick);
  };

  tick();
}

function startBoundaryWatcher(targetTime, onReached, shouldContinue) {
  if (targetTime <= 0 || video.paused || video.ended || !shouldContinue()) {
    return;
  }

  clearBoundaryWatcher();

  if (typeof video.requestVideoFrameCallback === "function") {
    const watchFrame = (_now, metadata) => {
      if (video.paused || video.ended || !shouldContinue()) {
        boundaryFrameCallbackId = null;
        return;
      }

      if (metadata.mediaTime + FRAME_TOLERANCE_SECONDS >= targetTime) {
        boundaryFrameCallbackId = null;
        onReached();
        return;
      }

      boundaryFrameCallbackId = video.requestVideoFrameCallback(watchFrame);
    };

    boundaryFrameCallbackId = video.requestVideoFrameCallback(watchFrame);
    return;
  }

  watchBoundaryWithFallback(targetTime, onReached, shouldContinue);
}

async function startVideo() {
  try {
    hasCompletedFlow = false;
    isWaitingForInteraction = false;
    isPlayingSecondSegment = false;
    setResumePromptVisibility(false);
    removeResumeInteractionListeners();
    await video.play();
  } catch (error) {
    console.warn("Homepage autoplay was blocked or the video is unavailable:", error);
  }
}

async function resumeSecondSegment() {
  if (!isWaitingForInteraction || hasCompletedFlow) {
    return;
  }

  clearBoundaryWatcher();
  removeResumeInteractionListeners();
  isWaitingForInteraction = false;
  isPlayingSecondSegment = true;
  setResumePromptVisibility(false);
  hideLottieIntro();

  try {
    await seekVideoTo(secondSegmentStartTime);
    logCurrentFrame();
    await video.play();
  } catch (error) {
    isWaitingForInteraction = true;
    isPlayingSecondSegment = false;
    addResumeInteractionListeners();
    console.warn("Resuming the homepage video was blocked:", error);
  }
}

function handleResumeInteraction() {
  resumeSecondSegment();
}

function isPlayingFirstSegment() {
  return !isWaitingForInteraction && !isPlayingSecondSegment && !hasCompletedFlow;
}

video.addEventListener("loadedmetadata", () => {
  refreshBoundaryTimes();
  requestLottieLayout();
  startVideo();
}, { once: true });

video.addEventListener("play", () => {
  if (isPlayingFirstSegment()) {
    startBoundaryWatcher(firstSegmentEndTime, pauseAtFirstBoundary, isPlayingFirstSegment);
    return;
  }

  if (isPlayingSecondSegment) {
    startBoundaryWatcher(
      secondSegmentEndTime,
      finishSecondSegment,
      () => isPlayingSecondSegment && !hasCompletedFlow
    );
  }
});

video.addEventListener("timeupdate", logCurrentFrame);
video.addEventListener("seeking", logCurrentFrame);
video.addEventListener("seeked", logCurrentFrame);
video.addEventListener("pause", logCurrentFrame);

video.addEventListener("ended", () => {
  clearBoundaryWatcher();
  logCurrentFrame();

  if (isPlayingSecondSegment && !hasCompletedFlow) {
    finishSecondSegment();
  }
});

window.addEventListener("resize", requestLottieLayout);

initialiseLottieOverlay();
