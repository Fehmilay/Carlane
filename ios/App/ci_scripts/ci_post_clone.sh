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

# Without VITE_REVENUECAT_IOS_KEY the App Store build has no shop at all
# (NoStoreIAPService, see src/services/IAP.ts). Intended for 1.0: purchases
# come later. Say it loudly, but do not stop the build.
if [ -z "${VITE_REVENUECAT_IOS_KEY:-}" ]; then
  echo "warning: VITE_REVENUECAT_IOS_KEY is not set - this build ships WITHOUT a shop."
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
if [ -n "${VITE_REVENUECAT_IOS_KEY:-}" ] && ! grep -rqE 'appl_[A-Za-z0-9]{6,}' ios/App/App/public; then
  echo "error: no RevenueCat iOS key in the bundle - purchases would not work."
  exit 1
fi

# Xcode Cloud resolves Swift packages with automatic resolution disabled and then
# requires a checked-in Package.resolved. The Capacitor packages live in
# node_modules and only exist from here on, so resolve now and let Xcode write it.
# Xcode Cloud resolves packages with automatic resolution DISABLED and needs a
# COMMITTED Package.resolved - "xcodebuild -resolvePackageDependencies" fails
# there with exactly the error it was meant to prevent (HandwerkNOW builds 1-3).
# Pinned: capacitor-swift-pm (= @capacitor/ios), and via
# @revenuecat/purchases-capacitor purchases-hybrid-common and purchases-ios-spm.
# Bump the pins together with those npm packages.
test -f ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved \
  || { echo "error: Package.resolved is missing from the repository."; exit 1; }

echo "Game built and synced into the iOS project."
