const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

if (process.platform !== 'win32') {
  process.exit(0);
}

// 1. Fix react-native-reanimated
const reanimatedDir = path.resolve(__dirname, '..', 'node_modules', 'react-native-reanimated');
const reanimatedAndroidDir = path.join(reanimatedDir, 'android');
const commonTargetDir = path.join(reanimatedDir, 'Common');
const commonJunctionDir = path.join(reanimatedAndroidDir, 'Common');
const reanimatedCMake = path.join(reanimatedAndroidDir, 'CMakeLists.txt');

try {
  if (fs.existsSync(reanimatedAndroidDir) && fs.existsSync(commonTargetDir)) {
    if (!fs.existsSync(commonJunctionDir)) {
      execSync(`cmd /c mklink /J "${commonJunctionDir}" "${commonTargetDir}"`, { stdio: 'ignore' });
    }

    if (fs.existsSync(reanimatedCMake)) {
      let cmakeContent = fs.readFileSync(reanimatedCMake, 'utf8');
      const oldCommon = 'set(COMMON_CPP_DIR "${CMAKE_SOURCE_DIR}/../Common/cpp")';
      const oldNative = 'set(NATIVEVIEW_DIR "${CMAKE_SOURCE_DIR}/../Common/NativeView")';
      const newCommon = 'set(COMMON_CPP_DIR "${CMAKE_CURRENT_SOURCE_DIR}/Common/cpp")';
      const newNative = 'set(NATIVEVIEW_DIR "${CMAKE_CURRENT_SOURCE_DIR}/Common/NativeView")';

      let modified = false;
      if (cmakeContent.includes(oldCommon)) {
        cmakeContent = cmakeContent.replace(oldCommon, newCommon);
        modified = true;
      }
      if (cmakeContent.includes(oldNative)) {
        cmakeContent = cmakeContent.replace(oldNative, newNative);
        modified = true;
      }

      if (modified) {
        fs.writeFileSync(reanimatedCMake, cmakeContent, 'utf8');
        console.log('[fix-native-windows] Successfully applied Windows MAX_PATH fix to react-native-reanimated');
      }
    }
  }
} catch (err) {
  console.warn('[fix-native-windows] Reanimated warning:', err.message);
}

// 2. Fix react-native-gesture-handler
const rnghDir = path.resolve(__dirname, '..', 'node_modules', 'react-native-gesture-handler');
const rnghAndroidDir = path.join(rnghDir, 'android');
const rnghSharedTargetDir = path.join(rnghDir, 'shared');
const rnghSharedJunctionDir = path.join(rnghAndroidDir, 'shared');
const rnghCMake = path.join(rnghAndroidDir, 'CMakeLists.txt');

try {
  if (fs.existsSync(rnghAndroidDir) && fs.existsSync(rnghSharedTargetDir)) {
    if (!fs.existsSync(rnghSharedJunctionDir)) {
      execSync(`cmd /c mklink /J "${rnghSharedJunctionDir}" "${rnghSharedTargetDir}"`, { stdio: 'ignore' });
    }

    if (fs.existsSync(rnghCMake)) {
      let cmakeContent = fs.readFileSync(rnghCMake, 'utf8');
      const oldGlob = 'rn_gesture_handler_SRCS CONFIGURE_DEPENDS ../shared/shadowNodes/*.cpp';
      const newGlob = 'rn_gesture_handler_SRCS CONFIGURE_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/shared/shadowNodes/*.cpp';
      const oldInc = 'target_include_directories(react_codegen_rngesturehandler_codegen PUBLIC ../shared/shadowNodes)';
      const newInc = 'target_include_directories(react_codegen_rngesturehandler_codegen PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/shared/shadowNodes)';

      let modified = false;
      if (cmakeContent.includes(oldGlob)) {
        cmakeContent = cmakeContent.replace(oldGlob, newGlob);
        modified = true;
      }
      if (cmakeContent.includes(oldInc)) {
        cmakeContent = cmakeContent.replace(oldInc, newInc);
        modified = true;
      }

      if (modified) {
        fs.writeFileSync(rnghCMake, cmakeContent, 'utf8');
        console.log('[fix-native-windows] Successfully applied Windows MAX_PATH fix to react-native-gesture-handler');
      }
    }
  }
} catch (err) {
  console.warn('[fix-native-windows] Gesture handler warning:', err.message);
}
