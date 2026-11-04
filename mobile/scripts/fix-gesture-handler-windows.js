const fs = require('fs');
const path = require('path');

const configPath = path.join(
  process.cwd(),
  'node_modules',
  'react-native-gesture-handler',
  'react-native.config.js'
);

if (!fs.existsSync(configPath)) {
  console.log('Gesture Handler config not found. Skipping patch.');
  process.exit(0);
}

let content = fs.readFileSync(configPath, 'utf8');

const detectorDescriptor =
  /^\s*'RNGestureHandlerDetectorComponentDescriptor',\r?\n/m;

if (detectorDescriptor.test(content)) {
  content = content.replace(detectorDescriptor, '');
  fs.writeFileSync(configPath, content, 'utf8');

  console.log('Gesture Handler Windows patch applied.');
} else {
  console.log('Gesture Handler patch already applied.');
}

