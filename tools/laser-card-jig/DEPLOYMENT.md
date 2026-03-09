# Deployment Guide

## Local Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Production Build (Local)

```bash
npm run build
npm start
```

## Deploy to Vercel (Recommended)

### Option 1: Vercel CLI

```bash
# Install Vercel CLI globally (if not already installed)
npm install -g vercel

# Deploy
vercel
```

Follow the prompts to link to your Vercel account and deploy.

### Option 2: Vercel Web UI

1. Push this repository to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Click "Import Project"
4. Select your GitHub repository
5. Vercel will auto-detect Next.js and deploy

## Environment Variables

No environment variables required - all processing happens client-side.

## Build Settings (Vercel)

- **Framework Preset**: Next.js
- **Build Command**: `npm run build`
- **Output Directory**: `.next`
- **Install Command**: `npm install`
- **Node Version**: 18.x or higher

## Testing Before Deploy

Run the full test suite:

```bash
npm test
```

All 10 tests should pass.

## Post-Deployment Checklist

- [ ] Verify app loads at deployment URL
- [ ] Upload a test image
- [ ] Crop and adjust image settings
- [ ] Click "Generate All Files"
- [ ] Verify 3 files download: STL, PNG, JSON
- [ ] Upload JSON config to verify state restoration
- [ ] Check that layout preview shows correct card counts

## Troubleshooting

**Build fails with module errors:**
- Delete `node_modules` and `package-lock.json`
- Run `npm install` again

**Tests fail:**
- Check that all dependencies are installed
- Run `npm install --save-dev jest @testing-library/react @testing-library/jest-dom jest-environment-jsdom`

**STL generation errors:**
- Ensure @jscad/modeling and @jscad/stl-serializer are installed
- Check browser console for detailed error messages

## Performance Notes

- All file generation happens client-side (no server required)
- Large images may take a few seconds to process
- Generated STL files are typically 50-200KB
- Generated PNG files depend on laser bed resolution (typically 1-5MB)
