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
/*
REF: https://stackoverflow.com/questions/47718081/universal-framework-binaries-why-build-simulator-and-archive-device
REF: https://dzone.com/articles/creating-a-universal-framework-in-xcode-9

FRAMEWORK=&lt;framework name&gt;
​
BUILD=build
FRAMEWORK_PATH=$FRAMEWORK.framework
​
# iOS
rm -Rf $FRAMEWORK-iOS/$BUILD
rm -f $FRAMEWORK-iOS.framework.tar.gz
​
xcodebuild archive -project $FRAMEWORK-iOS/$FRAMEWORK-iOS.xcodeproj -scheme $FRAMEWORK -sdk iphoneos SYMROOT=$BUILD
xcodebuild build -project $FRAMEWORK-iOS/$FRAMEWORK-iOS.xcodeproj -target $FRAMEWORK -sdk iphonesimulator SYMROOT=$BUILD
​
cp -RL $FRAMEWORK-iOS/$BUILD/Release-iphoneos $FRAMEWORK-iOS/$BUILD/Release-universal
cp -RL $FRAMEWORK-iOS/$BUILD/Release-iphonesimulator/$FRAMEWORK_PATH/Modules/$FRAMEWORK.swiftmodule/* $FRAMEWORK-iOS/$BUILD/Release-universal/$FRAMEWORK_PATH/Modules/$FRAMEWORK.swiftmodule
​
lipo -create $FRAMEWORK-iOS/$BUILD/Release-iphoneos/$FRAMEWORK_PATH/$FRAMEWORK $FRAMEWORK-iOS/$BUILD/Release-iphonesimulator/$FRAMEWORK_PATH/$FRAMEWORK -output $FRAMEWORK-iOS/$BUILD/Release-universal/$FRAMEWORK_PATH/$FRAMEWORK
​
tar -czv -C $FRAMEWORK-iOS/$BUILD/Release-universal -f $FRAMEWORK-iOS.tar.gz $FRAMEWORK_PATH $FRAMEWORK_PATH.dSYM

*/
