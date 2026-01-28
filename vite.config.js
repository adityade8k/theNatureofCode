import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  server: {
    proxy: {
      '/api/file': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/file/, '/file')
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        // Ensure assets are copied to build
      }
    }
  },
  plugins: [
    {
      name: 'copy-assets-and-create-mapping',
      writeBundle() {
        // Copy assets from public/assets to dist/assets
        const srcAssets = join(__dirname, 'public', 'assets');
        const distAssets = join(__dirname, 'dist', 'assets');
        const sketchesPath = join(__dirname, 'public', 'data', 'sketches.json');
        
        try {
          mkdirSync(distAssets, { recursive: true });
          
          // Read sketches.json to find all uploaded files
          const sketches = JSON.parse(readFileSync(sketchesPath, 'utf8'));
          const nodes = sketches.nodes || {};
          const assetMapping = {};
          
          // Process all nodes
          for (const [nodeId, node] of Object.entries(nodes)) {
            const files = node.files || {};
            for (const [logicalPath, content] of Object.entries(files)) {
              if (typeof content === 'string' && content.startsWith('#UPLOADED_FILE#')) {
                const parts = content.split('#');
                if (parts.length >= 3) {
                  const serverPath = parts[2].trim();
                  // Extract filename from server path (e.g., "assets/file.png" -> "file.png")
                  const fileName = serverPath.startsWith('assets/') 
                    ? serverPath.substring(7) 
                    : serverPath.split('/').pop();
                  
                  // Copy the actual file
                  const srcFile = join(__dirname, 'public', 'assets', fileName);
                  const distFile = join(distAssets, fileName);
                  try {
                    copyFileSync(srcFile, distFile);
                    // Map logical path to actual filename
                    assetMapping[logicalPath] = fileName;
                    assetMapping[logicalPath.split('/').pop()] = fileName; // Also map by filename
                  } catch (err) {
                    console.warn(`Could not copy asset ${fileName}:`, err.message);
                  }
                }
              }
            }
          }
          
          // Write mapping file for runtime lookup
          const mappingPath = join(__dirname, 'dist', 'asset-mapping.json');
          writeFileSync(mappingPath, JSON.stringify(assetMapping, null, 2));
          console.log('Asset mapping created:', mappingPath);
        } catch (err) {
          console.error('Error copying assets:', err);
        }
      }
    }
  ]
});

