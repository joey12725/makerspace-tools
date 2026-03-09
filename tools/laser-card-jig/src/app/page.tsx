'use client';

import { useState, useRef, useEffect } from 'react';
import ReactCrop, { Crop, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { calculateLayout, LayoutResult } from '@/lib/layoutAlgorithm';
import { generateSTL } from '@/lib/stlGenerator';
import { generatePNG } from '@/lib/pngGenerator';
import { saveAs } from 'file-saver';

interface Config {
  laserBedWidth: number;
  laserBedHeight: number;
  jigWidth: number;
  jigHeight: number;
  cardWidth: number;
  cardHeight: number;
  cardTolerance: number;
  grayscale: boolean;
  blackPoint: number;
  whitePoint: number;
}

export default function Home() {
  const [config, setConfig] = useState<Config>({
    laserBedWidth: 15.0,
    laserBedHeight: 12.01,
    jigWidth: 15.0,
    jigHeight: 12.0,
    cardWidth: 3.346,
    cardHeight: 2.165,
    cardTolerance: 0.02,
    grayscale: true,
    blackPoint: 0,
    whitePoint: 255,
  });

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [layout, setLayout] = useState<LayoutResult | null>(null);
  
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Recalculate layout when config changes
  useEffect(() => {
    const result = calculateLayout(
      config.jigWidth,
      config.jigHeight,
      config.cardWidth,
      config.cardHeight,
      config.cardTolerance
    );
    setLayout(result);
  }, [config.jigWidth, config.jigHeight, config.cardWidth, config.cardHeight, config.cardTolerance]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        setImageSrc(reader.result?.toString() || null);
      });
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const updateConfig = (key: keyof Config, value: number | boolean) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  // Apply image processing to canvas
  useEffect(() => {
    if (!completedCrop || !imgRef.current || !canvasRef.current) return;

    const image = imgRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    canvas.width = completedCrop.width;
    canvas.height = completedCrop.height;

    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      completedCrop.width,
      completedCrop.height
    );

    // Apply grayscale and black/white point adjustments
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      // Grayscale conversion
      if (config.grayscale) {
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        r = g = b = gray;
      }

      // Black/white point adjustment
      const range = config.whitePoint - config.blackPoint;
      r = Math.max(0, Math.min(255, ((r - config.blackPoint) / range) * 255));
      g = Math.max(0, Math.min(255, ((g - config.blackPoint) / range) * 255));
      b = Math.max(0, Math.min(255, ((b - config.blackPoint) / range) * 255));

      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }

    ctx.putImageData(imageData, 0, 0);
  }, [completedCrop, config.grayscale, config.blackPoint, config.whitePoint]);

  const handleGenerate = async () => {
    if (!layout || !canvasRef.current) {
      alert('Please ensure all parameters are set and an image is uploaded.');
      return;
    }

    try {
      // Generate STL
      const stlBlob = generateSTL(
        config.jigWidth,
        config.jigHeight,
        config.cardWidth,
        config.cardHeight,
        config.cardTolerance,
        layout
      );
      saveAs(stlBlob, 'jig_template.stl');

      // Generate PNG
      const pngBlob = await generatePNG(
        config.laserBedWidth,
        config.laserBedHeight,
        config.cardWidth,
        config.cardHeight,
        layout,
        canvasRef.current
      );
      saveAs(pngBlob, 'laser_layout.png');

      // Generate JSON config
      const configData = {
        ...config,
        timestamp: new Date().toISOString(),
      };
      const configBlob = new Blob([JSON.stringify(configData, null, 2)], {
        type: 'application/json',
      });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      saveAs(configBlob, `config_${timestamp}.json`);

      alert('Files generated successfully!');
    } catch (error) {
      console.error('Error generating files:', error);
      alert('Failed to generate files. Check console for details.');
    }
  };

  const handleConfigUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        try {
          const loadedConfig = JSON.parse(reader.result as string);
          // Remove timestamp before setting
          const { timestamp, ...configWithoutTimestamp } = loadedConfig;
          setConfig(configWithoutTimestamp);
        } catch (error) {
          alert('Failed to load configuration file.');
          console.error(error);
        }
      });
      reader.readAsText(e.target.files[0]);
    }
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-gray-800">
          Laser Card Jig Generator
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column: Configuration */}
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-2xl font-semibold mb-4 text-gray-700">
                Dimensions
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Laser Bed Width (in)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={config.laserBedWidth}
                    onChange={(e) =>
                      updateConfig('laserBedWidth', parseFloat(e.target.value))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Laser Bed Height (in)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={config.laserBedHeight}
                    onChange={(e) =>
                      updateConfig('laserBedHeight', parseFloat(e.target.value))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Jig Width (in)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={config.jigWidth}
                    onChange={(e) =>
                      updateConfig('jigWidth', parseFloat(e.target.value))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Jig Height (in)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={config.jigHeight}
                    onChange={(e) =>
                      updateConfig('jigHeight', parseFloat(e.target.value))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Card Width (in)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    value={config.cardWidth}
                    onChange={(e) =>
                      updateConfig('cardWidth', parseFloat(e.target.value))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Card Height (in)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    value={config.cardHeight}
                    onChange={(e) =>
                      updateConfig('cardHeight', parseFloat(e.target.value))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Card Tolerance (in)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    value={config.cardTolerance}
                    onChange={(e) =>
                      updateConfig('cardTolerance', parseFloat(e.target.value))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-2xl font-semibold mb-4 text-gray-700">
                Image Processing
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Upload Image
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="grayscale"
                    checked={config.grayscale}
                    onChange={(e) => updateConfig('grayscale', e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label
                    htmlFor="grayscale"
                    className="text-sm font-medium text-gray-700"
                  >
                    Grayscale
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Black Point ({config.blackPoint})
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="255"
                    value={config.blackPoint}
                    onChange={(e) =>
                      updateConfig('blackPoint', parseInt(e.target.value))
                    }
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    White Point ({config.whitePoint})
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="255"
                    value={config.whitePoint}
                    onChange={(e) =>
                      updateConfig('whitePoint', parseInt(e.target.value))
                    }
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            {layout && (
              <div className="bg-white p-6 rounded-lg shadow">
                <h2 className="text-2xl font-semibold mb-4 text-gray-700">
                  Layout Preview
                </h2>
                <div className="space-y-2 text-sm">
                  <p>
                    <strong>Cards (X × Y):</strong> {layout.cardsX} × {layout.cardsY} ={' '}
                    {layout.cardsX * layout.cardsY} total
                  </p>
                  <p>
                    <strong>Horizontal Gap:</strong> {layout.horizontalGap.toFixed(3)}&quot;
                  </p>
                  <p>
                    <strong>Vertical Gap:</strong> {layout.verticalGap.toFixed(3)}&quot;
                  </p>
                  <p>
                    <strong>Edge Margin X:</strong> {layout.edgeMarginX.toFixed(3)}&quot;
                  </p>
                  <p>
                    <strong>Edge Margin Y:</strong> {layout.edgeMarginY.toFixed(3)}&quot;
                  </p>
                  {(layout.edgeMarginX < 0.125 ||
                    layout.edgeMarginY < 0.125 ||
                    layout.horizontalGap < 0.125 ||
                    layout.verticalGap < 0.125) && (
                    <p className="text-red-600 font-semibold mt-2">
                      ⚠️ Warning: Some constraints are below minimum (1/8&quot;)
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-2xl font-semibold mb-4 text-gray-700">
                Configuration
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Load Configuration
                  </label>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleConfigUpload}
                    className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Image Preview */}
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-2xl font-semibold mb-4 text-gray-700">
                Image Preview
              </h2>

              {imageSrc && (
                <div className="space-y-4">
                  <div className="border border-gray-300 rounded-md overflow-hidden">
                    <ReactCrop
                      crop={crop}
                      onChange={(c) => setCrop(c)}
                      onComplete={(c) => setCompletedCrop(c)}
                      aspect={config.cardWidth / config.cardHeight}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        ref={imgRef}
                        src={imageSrc}
                        alt="Upload"
                        className="max-w-full"
                      />
                    </ReactCrop>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold mb-2 text-gray-700">
                      Processed Preview
                    </h3>
                    <canvas
                      ref={canvasRef}
                      className="border border-gray-300 rounded-md max-w-full"
                    />
                  </div>
                </div>
              )}

              {!imageSrc && (
                <div className="flex items-center justify-center h-64 bg-gray-100 rounded-md">
                  <p className="text-gray-500">Upload an image to begin</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Generate Button */}
        <div className="mt-8 flex justify-center">
          <button
            onClick={handleGenerate}
            disabled={!imageSrc || !completedCrop || !layout}
            className="px-8 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            Generate All Files (STL + PNG + JSON)
          </button>
        </div>
      </div>
    </div>
  );
}
