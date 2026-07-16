const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '../node_modules/monaco-editor/min/vs');
const destDir = path.resolve(__dirname, '../public/vs');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

try {
  if (fs.existsSync(srcDir)) {
    console.log(`Copying Monaco Editor assets from ${srcDir} to ${destDir}...`);
    // Ensure destination parent directory exists
    const publicDir = path.resolve(__dirname, '../public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    copyDir(srcDir, destDir);
    console.log('Monaco Editor assets copied successfully.');
  } else {
    console.warn(`Warning: Monaco Editor source directory not found at: ${srcDir}`);
    console.warn('Please run "npm install" first to install dependencies.');
  }
} catch (error) {
  console.error('Failed to copy Monaco Editor assets:', error);
}
