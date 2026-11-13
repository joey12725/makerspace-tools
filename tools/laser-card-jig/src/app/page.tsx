"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { saveAs } from "file-saver";
import {
  buildPersistedConfig,
  DEFAULT_DIMENSIONS,
  DEFAULT_IMAGE_PROCESSING,
  formatTimestampForFile,
  parsePersistedConfig,
} from "@/lib/config";
import {
  autoCropToAspect,
  createProcessedArtworkCanvas,
  drawScaledPreview,
  drawSourcePreview,
  normalizeImageProcessing,
} from "@/lib/image-processing";
import { calculateJigLayout, getJigOffsetOnLaserBed, MIN_EDGE_MARGIN_IN, MIN_WALL_THICKNESS_IN } from "@/lib/layout";
import { buildLaserLayoutPngBlob, DEFAULT_OUTPUT_DPI } from "@/lib/png";
import { buildJigStlBlob } from "@/lib/stl";
import type { ImageProcessingConfig, JigDimensions, JigLayout } from "@/lib/types";

type Notice = {
  level: "error" | "success";
  message: string;
};

type NumberFieldProps = {
  label: string;
  value: number;
  step?: number;
  min?: number;
  onChange: (nextValue: number) => void;
};

function NumberField({ label, value, step = 0.001, min = 0, onChange }: NumberFieldProps) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-slate-200">
      <span>{label}</span>
      <input
        className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none ring-cyan-500 transition focus:ring"
        type="number"
        value={Number.isFinite(value) ? value : ""}
        step={step}
        min={min}
        onChange={(event) => {
          const parsed = Number(event.target.value);
          if (Number.isFinite(parsed)) {
            onChange(parsed);
          }
        }}
      />
    </label>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export default function Home() {
  const [dimensions, setDimensions] = useState<JigDimensions>(DEFAULT_DIMENSIONS);
  const [imageProcessing, setImageProcessing] = useState<ImageProcessingConfig>(DEFAULT_IMAGE_PROCESSING);
  const [uploadedImage, setUploadedImage] = useState<HTMLImageElement | null>(null);
  const [imageName, setImageName] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const sourcePreviewRef = useRef<HTMLCanvasElement | null>(null);
  const processedPreviewRef = useRef<HTMLCanvasElement | null>(null);

  const layoutResult = useMemo(() => {
    try {
      const layout = calculateJigLayout(dimensions);
      const jigOffset = getJigOffsetOnLaserBed(dimensions);
      return {
        layout,
        jigOffset,
        error: "",
      };
    } catch (error) {
      return {
        layout: null,
        jigOffset: null,
        error: error instanceof Error ? error.message : "Layout calculation failed.",
      };
    }
  }, [dimensions]);

  useEffect(() => {
    if (!uploadedImage || !sourcePreviewRef.current) {
      return;
    }

    drawSourcePreview(sourcePreviewRef.current, uploadedImage, imageProcessing);
  }, [uploadedImage, imageProcessing]);

  useEffect(() => {
    if (!uploadedImage || !processedPreviewRef.current) {
      return;
    }

    try {
      const processedCanvas = createProcessedArtworkCanvas(uploadedImage, imageProcessing);
      drawScaledPreview(processedPreviewRef.current, processedCanvas);
    } catch {
      // Keep the previous preview; validation is surfaced when generating.
    }
  }, [uploadedImage, imageProcessing]);

  const handleDimensionsChange = (key: keyof JigDimensions, nextValue: number) => {
    setDimensions((previous) => ({
      ...previous,
      [key]: nextValue,
    }));
    setNotice(null);
  };

  const handleImageSettingChange = (
    key: keyof ImageProcessingConfig,
    nextValue: number | boolean,
  ) => {
    setImageProcessing((previous) =>
      normalizeImageProcessing({
        ...previous,
        [key]: nextValue,
      }),
    );
    setNotice(null);
  };

  const handleCropBoundedUpdate = (
    key: "cropXPercent" | "cropYPercent" | "cropWidthPercent" | "cropHeightPercent",
    nextValue: number,
  ) => {
    setImageProcessing((previous) => {
      const next = { ...previous, [key]: nextValue };

      if (key === "cropXPercent") {
        next.cropXPercent = clamp(next.cropXPercent, 0, 99);
        next.cropWidthPercent = Math.min(next.cropWidthPercent, 100 - next.cropXPercent);
      }

      if (key === "cropYPercent") {
        next.cropYPercent = clamp(next.cropYPercent, 0, 99);
        next.cropHeightPercent = Math.min(next.cropHeightPercent, 100 - next.cropYPercent);
      }

      if (key === "cropWidthPercent") {
        next.cropWidthPercent = clamp(next.cropWidthPercent, 1, 100 - next.cropXPercent);
      }

      if (key === "cropHeightPercent") {
        next.cropHeightPercent = clamp(next.cropHeightPercent, 1, 100 - next.cropYPercent);
      }

      return normalizeImageProcessing(next);
    });
  };

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      setUploadedImage(image);
      setImageName(file.name);
      setNotice({ level: "success", message: `Loaded image: ${file.name}` });

      setImageProcessing((previous) => {
        const autoCrop = autoCropToAspect(
          image.naturalWidth,
          image.naturalHeight,
          dimensions.cardWidthIn / dimensions.cardHeightIn,
        );

        return normalizeImageProcessing({
          ...previous,
          ...autoCrop,
        });
      });

      URL.revokeObjectURL(objectUrl);
    };

    image.onerror = () => {
      setNotice({ level: "error", message: "Could not decode this image file." });
      URL.revokeObjectURL(objectUrl);
    };

    image.src = objectUrl;

    event.target.value = "";
  };

  const handleAutoCrop = () => {
    if (!uploadedImage) {
      return;
    }

    const autoCrop = autoCropToAspect(
      uploadedImage.naturalWidth,
      uploadedImage.naturalHeight,
      dimensions.cardWidthIn / dimensions.cardHeightIn,
    );

    setImageProcessing((previous) =>
      normalizeImageProcessing({
        ...previous,
        ...autoCrop,
      }),
    );
  };

  const handleConfigFileLoad = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = parsePersistedConfig(text);
      setDimensions(parsed.dimensions);
      setImageProcessing(parsed.imageProcessing);
      setNotice({
        level: "success",
        message: `Loaded config from ${file.name}.`,
      });
    } catch (error) {
      setNotice({
        level: "error",
        message: error instanceof Error ? error.message : "Failed to read config file.",
      });
    } finally {
      event.target.value = "";
    }
  };

  const handleDownloadConfig = () => {
    const normalized = normalizeImageProcessing(imageProcessing);
    const persisted = buildPersistedConfig(dimensions, normalized);
    const blob = new Blob([JSON.stringify(persisted, null, 2)], {
      type: "application/json",
    });

    saveAs(blob, `config_${formatTimestampForFile()}.json`);
    setNotice({ level: "success", message: "Downloaded configuration JSON." });
  };

  const handleGenerateAll = async () => {
    if (!uploadedImage) {
      setNotice({ level: "error", message: "Upload an image before generating outputs." });
      return;
    }

    if (!layoutResult.layout) {
      setNotice({ level: "error", message: layoutResult.error });
      return;
    }

    setIsGenerating(true);
    setNotice(null);

    try {
      const normalized = normalizeImageProcessing(imageProcessing);
      setImageProcessing(normalized);

      const processedCanvas = createProcessedArtworkCanvas(uploadedImage, normalized);
      const stlBlob = buildJigStlBlob(layoutResult.layout, dimensions);
      const pngBlob = await buildLaserLayoutPngBlob({
        dimensions,
        layout: layoutResult.layout,
        processedArtwork: processedCanvas,
      });

      const persisted = buildPersistedConfig(dimensions, normalized);
      const configBlob = new Blob([JSON.stringify(persisted, null, 2)], {
        type: "application/json",
      });

      saveAs(stlBlob, "jig_template.stl");
      saveAs(pngBlob, "laser_layout.png");
      saveAs(configBlob, `config_${formatTimestampForFile()}.json`);

      setNotice({
        level: "success",
        message: "Generated jig_template.stl, laser_layout.png, and config JSON.",
      });
    } catch (error) {
      setNotice({
        level: "error",
        message: error instanceof Error ? error.message : "Generation failed.",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-8">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl shadow-black/20">
          <h1 className="text-2xl font-bold tracking-tight">Bulk Laser Engraving Card Jig Generator</h1>
          <p className="mt-2 text-sm text-slate-300">
            Configure card geometry, process artwork, then generate all production files in one click.
          </p>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          <section className="space-y-6 rounded-xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl shadow-black/20">
            <div>
              <h2 className="text-lg font-semibold">Dimensions & Constraints (inches)</h2>
              <p className="text-sm text-slate-400">
                Minimum wall and edge constraints are fixed at {MIN_WALL_THICKNESS_IN.toFixed(3)} in and{" "}
                {MIN_EDGE_MARGIN_IN.toFixed(3)} in.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <NumberField
                label="Laser Bed Width"
                value={dimensions.laserBedWidthIn}
                onChange={(value) => handleDimensionsChange("laserBedWidthIn", value)}
              />
              <NumberField
                label="Laser Bed Height"
                value={dimensions.laserBedHeightIn}
                onChange={(value) => handleDimensionsChange("laserBedHeightIn", value)}
              />
              <NumberField
                label="Jig Width"
                value={dimensions.jigWidthIn}
                onChange={(value) => handleDimensionsChange("jigWidthIn", value)}
              />
              <NumberField
                label="Jig Height"
                value={dimensions.jigHeightIn}
                onChange={(value) => handleDimensionsChange("jigHeightIn", value)}
              />
              <NumberField
                label="Card Width"
                value={dimensions.cardWidthIn}
                onChange={(value) => handleDimensionsChange("cardWidthIn", value)}
              />
              <NumberField
                label="Card Height"
                value={dimensions.cardHeightIn}
                onChange={(value) => handleDimensionsChange("cardHeightIn", value)}
              />
              <NumberField
                label="Card Tolerance"
                value={dimensions.toleranceIn}
                onChange={(value) => handleDimensionsChange("toleranceIn", value)}
              />
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
              <h3 className="text-sm font-semibold text-slate-200">Artwork Input</h3>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-100 hover:border-cyan-500">
                  Upload Image
                  <input className="hidden" type="file" accept="image/*" onChange={handleImageUpload} />
                </label>
                <button
                  type="button"
                  className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-100 hover:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={handleAutoCrop}
                  disabled={!uploadedImage}
                >
                  Auto Crop to Card Ratio
                </button>
                {imageName ? <span className="text-sm text-cyan-300">{imageName}</span> : null}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-950/40 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={imageProcessing.grayscale}
                  onChange={(event) => handleImageSettingChange("grayscale", event.target.checked)}
                />
                Grayscale
              </label>

              <label className="flex flex-col gap-2 rounded-md border border-slate-800 bg-slate-950/40 p-3 text-sm">
                <span className="font-medium">Black Point: {imageProcessing.blackPoint}</span>
                <input
                  type="range"
                  min={0}
                  max={254}
                  value={imageProcessing.blackPoint}
                  onChange={(event) =>
                    handleImageSettingChange("blackPoint", Number(event.target.value))
                  }
                />
              </label>

              <label className="flex flex-col gap-2 rounded-md border border-slate-800 bg-slate-950/40 p-3 text-sm">
                <span className="font-medium">White Point: {imageProcessing.whitePoint}</span>
                <input
                  type="range"
                  min={1}
                  max={255}
                  value={imageProcessing.whitePoint}
                  onChange={(event) =>
                    handleImageSettingChange("whitePoint", Number(event.target.value))
                  }
                />
              </label>
            </div>

            <div className="grid gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
              <h3 className="text-sm font-semibold text-slate-200">Crop Controls (% of source image)</h3>

              <label className="flex flex-col gap-1 text-sm">
                <span>Crop X: {imageProcessing.cropXPercent.toFixed(1)}%</span>
                <input
                  type="range"
                  min={0}
                  max={99}
                  step={0.1}
                  value={imageProcessing.cropXPercent}
                  onChange={(event) =>
                    handleCropBoundedUpdate("cropXPercent", Number(event.target.value))
                  }
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span>Crop Y: {imageProcessing.cropYPercent.toFixed(1)}%</span>
                <input
                  type="range"
                  min={0}
                  max={99}
                  step={0.1}
                  value={imageProcessing.cropYPercent}
                  onChange={(event) =>
                    handleCropBoundedUpdate("cropYPercent", Number(event.target.value))
                  }
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span>Crop Width: {imageProcessing.cropWidthPercent.toFixed(1)}%</span>
                <input
                  type="range"
                  min={1}
                  max={100}
                  step={0.1}
                  value={imageProcessing.cropWidthPercent}
                  onChange={(event) =>
                    handleCropBoundedUpdate("cropWidthPercent", Number(event.target.value))
                  }
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span>Crop Height: {imageProcessing.cropHeightPercent.toFixed(1)}%</span>
                <input
                  type="range"
                  min={1}
                  max={100}
                  step={0.1}
                  value={imageProcessing.cropHeightPercent}
                  onChange={(event) =>
                    handleCropBoundedUpdate("cropHeightPercent", Number(event.target.value))
                  }
                />
              </label>
            </div>
          </section>

          <section className="space-y-6 rounded-xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl shadow-black/20">
            <h2 className="text-lg font-semibold">Layout & Previews</h2>

            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 text-sm">
              {layoutResult.layout && layoutResult.jigOffset ? (
                <LayoutSummary
                  layout={layoutResult.layout}
                  dimensions={dimensions}
                  offsetX={layoutResult.jigOffset.offsetXIn}
                  offsetY={layoutResult.jigOffset.offsetYIn}
                />
              ) : (
                <p className="text-red-300">{layoutResult.error}</p>
              )}
            </div>

            <div className="grid gap-4">
              <div>
                <p className="mb-2 text-sm font-medium text-slate-300">Source + Crop</p>
                <canvas
                  ref={sourcePreviewRef}
                  width={540}
                  height={320}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950"
                />
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-slate-300">Processed Artwork Preview</p>
                <canvas
                  ref={processedPreviewRef}
                  width={540}
                  height={320}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                className="rounded-md border border-cyan-400 bg-cyan-500/20 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={handleGenerateAll}
                disabled={isGenerating}
              >
                {isGenerating ? "Generating..." : "Generate STL + PNG + JSON"}
              </button>

              <button
                type="button"
                className="rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-100 hover:border-cyan-500"
                onClick={handleDownloadConfig}
              >
                Download JSON Config
              </button>

              <label className="inline-flex cursor-pointer items-center justify-center rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-100 hover:border-cyan-500 sm:col-span-2">
                Load JSON Config
                <input className="hidden" type="file" accept="application/json" onChange={handleConfigFileLoad} />
              </label>
            </div>

            <p className="text-xs text-slate-400">
              PNG output is generated at {DEFAULT_OUTPUT_DPI} DPI with canvas dimensions matching the full laser bed.
            </p>

            {notice ? (
              <p
                className={`rounded-md border p-3 text-sm ${
                  notice.level === "error"
                    ? "border-red-500/40 bg-red-950/50 text-red-200"
                    : "border-emerald-500/40 bg-emerald-950/40 text-emerald-200"
                }`}
              >
                {notice.message}
              </p>
            ) : null}
          </section>
        </div>
      </main>
    </div>
  );
}

function LayoutSummary({
  layout,
  dimensions,
  offsetX,
  offsetY,
}: {
  layout: JigLayout;
  dimensions: JigDimensions;
  offsetX: number;
  offsetY: number;
}) {
  return (
    <div className="space-y-2 text-slate-200">
      <p>
        Cards: <span className="font-semibold">{layout.columns * layout.rows}</span> ({layout.columns} columns x {layout.rows} rows)
      </p>
      <p>
        Pocket Size (Card + Tolerance): {layout.pocketWidthIn.toFixed(3)} in x {layout.pocketHeightIn.toFixed(3)} in
      </p>
      <p>
        X-axis wall / edge: {layout.axisX.wallThicknessIn.toFixed(3)} in / {layout.axisX.edgeMarginIn.toFixed(3)} in
      </p>
      <p>
        Y-axis wall / edge: {layout.axisY.wallThicknessIn.toFixed(3)} in / {layout.axisY.edgeMarginIn.toFixed(3)} in
      </p>
      <p>
        Jig center offset on laser bed: X {offsetX.toFixed(3)} in, Y {offsetY.toFixed(3)} in
      </p>
      <p>
        Thickness profile: 0.125 in base + 0.125 in wall grid = 0.250 in max height, with 0.125 in pocket depth.
      </p>
      <p>
        STL pocket dimensions use card tolerance ({dimensions.toleranceIn.toFixed(3)} in) in both axes.
      </p>
    </div>
  );
}
