const builder = require('electron-builder');
const path = require('path');
const fs = require('fs');

// First, ensure the app directory exists
const appDir = path.join(__dirname, 'app');
if (!fs.existsSync(appDir)) {
  fs.mkdirSync(appDir, { recursive: true });
}

// Copy essential files to app directory
fs.copyFileSync(
  path.join(__dirname, 'electron.js'),
  path.join(appDir, 'electron.js')
);

fs.copyFileSync(
  path.join(__dirname, 'preload.js'),
  path.join(appDir, 'preload.js')
);

// Copy package.json with modified main entry
const packageJson = require('./package.json');
const appPackageJson = {
  name: packageJson.name,
  version: packageJson.version,
  description: packageJson.description,
  main: 'electron.js',
  author: packageJson.author
};

fs.writeFileSync(
  path.join(appDir, 'package.json'),
  JSON.stringify(appPackageJson, null, 2)
);

// Start the build process
console.log('Starting build process...');
builder.build({
  config: {
    appId: 'com.ultramarinedreams.urlOpener',
    productName: 'URL Opener',
    files: [
      'app/**/*',
      'build/**/*',
    ],
    directories: {
      output: path.resolve(__dirname, 'dist'),
      app: '.'
    },
    asar: false,
    mac: {
      target: 'dir',
      category: 'public.app-category.productivity'
    }
  }
})
.then(() => {
  console.log('Build completed successfully');
})
.catch((error) => {
  console.error('Error during build:', error);
}); 