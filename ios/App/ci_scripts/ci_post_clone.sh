#!/bin/sh
#
# Xcode Cloud: runs after cloning, before the iOS build.
#
# The web game (dist/) and the Capacitor packages in node_modules are not in the
# repository. Without this step Package.swift points at missing folders and the
# app would ship without its game. Same steps as `npm run ios:sync`.
#
# Needs in the Xcode Cloud workflow (Environment Variables):
#   VITE_REVENUECAT_IOS_KEY   RevenueCat public iOS SDK key (appl_...), marked secret

set -eu

cd "${CI_PRIMARY_REPOSITORY_PATH:?CI_PRIMARY_REPOSITORY_PATH missing}"

if [ -z "${VITE_REVENUECAT_IOS_KEY:-}" ]; then
  echo "error: Environment variable VITE_REVENUECAT_IOS_KEY is missing in the Xcode Cloud workflow - purchases would not work."
  exit 1
fi

export HOMEBREW_NO_AUTO_UPDATE=1
brew install node@22
export PATH="$(brew --prefix node@22)/bin:$PATH"
node --version

npm ci
npm run build
npx cap sync ios

if [ ! -f ios/App/App/public/index.html ]; then
  echo "error: ios/App/App/public/index.html missing after cap sync - the game would not be in the app."
  exit 1
fi
if ! grep -rqE 'appl_[A-Za-z0-9]{6,}' ios/App/App/public; then
  echo "error: no RevenueCat iOS key in the bundle - purchases would not work."
  exit 1
fi

# Xcode Cloud resolves Swift packages with automatic resolution disabled and then
# requires a checked-in Package.resolved. The Capacitor packages live in
# node_modules and only exist from here on, so resolve now and let Xcode write it.
xcodebuild -resolvePackageDependencies -project ios/App/App.xcodeproj -scheme App -scmProvider system
test -f ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved \
  || { echo "error: Package.resolved was not written."; exit 1; }

echo "Game built and synced into the iOS project."
