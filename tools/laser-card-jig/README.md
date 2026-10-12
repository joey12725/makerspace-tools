# Laser Card Jig Generator

Next.js + TailwindCSS app for generating a bulk laser engraving card jig workflow:
- `jig_template.stl` (3D printable alignment tray)
- `laser_layout.png` (laser bed image layout)
- `config_[timestamp].json` (re-loadable settings)

## Stack
- Next.js (App Router, TypeScript, `src/` layout)
- TailwindCSS
- Client-side STL geometry: `@jscad/modeling` + `@jscad/stl-serializer`
- Client-side image processing and PNG generation: HTML5 Canvas
- Download handling: `file-saver`
- Unit testing: Vitest

## Project Bootstrap
Scaffold command used for this project:

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --use-npm
```

## Default Configuration
- Laser max bed: `15.00 in x 12.01 in`
- Center jig bed: `15.00 in x 12.00 in`
- Card size: `3.346 in x 2.165 in`
- Min wall thickness: `1/8 in`
- Min edge margin: `1/8 in`

## Features
- Image upload
- Crop controls (x/y/width/height)
- Grayscale toggle
- Black point / white point level sliders
- Layout auto-sizing to maximize card count while enforcing minimum wall/edge rules
- JSON config download and upload (state restore)
- STL/PNG/JSON generation on one action

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Quality Checks

```bash
npm run lint
npm run test
npm run build
```

## Vercel Deployment

```bash
npm i -g vercel
vercel
vercel --prod
```

If your project is already linked, you can use:

```bash
vercel --prod --yes
```
