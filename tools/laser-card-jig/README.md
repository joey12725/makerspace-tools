# Laser Card Jig & Template Generator

A web-based utility for generating 3D-printable alignment jigs and laser-ready layouts for batch card engraving.

## Features

- **3D Jig Generation**: Automatically generates STL files for 3D-printable card alignment jigs
- **Laser Layout Generation**: Creates PNG layouts matching your laser cutter's bed dimensions
- **Smart Layout Algorithm**: Maximizes card count while ensuring minimum 1/8" walls and edge margins
- **Image Processing**: Upload, crop, and adjust images with grayscale, black point, and white point controls
- **Configuration Management**: Save and reload settings via JSON files

## Tech Stack

- **Framework**: Next.js 15 with TypeScript
- **Styling**: TailwindCSS
- **3D Generation**: @jscad/modeling
- **Image Processing**: HTML5 Canvas API
- **Testing**: Jest + React Testing Library

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

### Build

```bash
npm run build
npm start
```

### Testing

```bash
npm test
```

## Usage

1. **Configure Dimensions**: Set your laser bed size, jig dimensions, and card dimensions
2. **Upload Image**: Choose an image file to engrave on your cards
3. **Crop & Process**: Crop the image to match card aspect ratio and adjust processing settings
4. **Generate**: Click the generate button to download:
   - `jig_template.stl` - 3D printable jig
   - `laser_layout.png` - Laser cutter layout
   - `config_[timestamp].json` - Reusable configuration

## Default Values

- **Laser Bed**: 15.00" × 12.01" (Creality Falcon A1 Max)
- **Jig**: 15.00" × 12.00"
- **Card**: 3.346" × 2.165" (85mm × 55mm business card)
- **Tolerance**: 0.02"

## Layout Algorithm

The layout algorithm automatically:
- Maximizes the number of cards that fit in the jig
- Ensures minimum 1/8" (0.125") walls between cards
- Ensures minimum 1/8" edge margins
- Auto-reduces card count if constraints would be violated
- Applies card tolerance to pocket dimensions

## Deployment

This app is ready to deploy on Vercel:

```bash
vercel deploy
```

## Testing

Unit tests cover the layout algorithm's critical functionality:
- Minimum wall thickness enforcement
- Edge margin constraints
- Tolerance application
- Card count optimization
- Edge cases (single card, no fit scenarios)

Run tests with:
```bash
npm test
```

## License

MIT
