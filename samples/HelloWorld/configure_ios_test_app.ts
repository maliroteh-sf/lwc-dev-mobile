import childProcess from "child_process";
import path from "path";

exports.run = function () {
  const projectRootPath = path.resolve(__dirname, "../apps/ios/LwcTestApp");
  const expectedProjectPath = path.resolve(
    `${projectRootPath}/LwcTestApp.xcodeproj`
  );

  // build project for simulators
  childProcess.execSync(
    `xcodebuild CODE_SIGNING_ALLOWED=NO ONLY_ACTIVE_ARCH=NO -configuration Debug -sdk iphonesimulator -project '${expectedProjectPath}' build`,
    { stdio: ["ignore", "pipe", "ignore"] }
  );

  // build project for physical devices
  childProcess.execSync(
    `xcodebuild ONLY_ACTIVE_ARCH=NO -configuration Debug -sdk iphoneos -project '${expectedProjectPath}' build`,
    { stdio: ["ignore", "pipe", "ignore"] }
  );

  return `${projectRootPath}/build/Debug-$SDK$/LwcTestApp.app`;
};
