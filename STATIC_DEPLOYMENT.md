# Static Deployment Guide for Barkeep

This guide explains how to deploy Barkeep as a static website.

## Building the Static Site

1. Clone the repository
2. Install dependencies:
   \`\`\`
   npm install
   \`\`\`
3. Build the static site:
   \`\`\`
   npm run export
   \`\`\`
4. The static site will be generated in the `out` directory

## Deployment Options

### Option 1: Local Testing

To test the static build locally:
\`\`\`
npx serve out
\`\`\`

### Option 2: Deploy to GitHub Pages

1. Push the `out` directory to a GitHub repository
2. Enable GitHub Pages in the repository settings
3. Set the source to the branch containing your `out` directory

### Option 3: Deploy to Netlify

1. Create a new site in Netlify
2. Connect to your GitHub repository
3. Set the build command to `npm run export`
4. Set the publish directory to `out`

### Option 4: Deploy to Vercel

1. Import your project to Vercel
2. Vercel will automatically detect Next.js and use the correct settings
3. Make sure the output directory is set to `out`

## Important Notes

- This application uses client-side storage (localStorage) to save character data
- No server-side functionality is required
- All data is stored in the user's browser
- The application can be used offline once loaded

## Customization

You can customize the static deployment by modifying the `next.config.mjs` file.
