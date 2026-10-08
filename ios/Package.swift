// swift-tools-version:5.9
// WorldletKit: the iPhone app's pairing protocol, relay client and payload models, kept free of UIKit so `swift test`
// runs them on Linux too (with swift-crypto standing in for CryptoKit). The app target itself is in project.yml.
import PackageDescription

let package = Package(
    name: "WorldletKit",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "WorldletKit", targets: ["WorldletKit"])],
    dependencies: [.package(url: "https://github.com/apple/swift-crypto.git", "3.0.0"..<"5.0.0")],
    targets: [
        .target(name: "WorldletKit", dependencies: [
            .product(name: "Crypto", package: "swift-crypto", condition: .when(platforms: [.linux])),
        ]),
        // Crypto (CryptoKit on Apple platforms) seals the test boxes the way the computer does.
        .testTarget(name: "WorldletKitTests", dependencies: [
            "WorldletKit",
            .product(name: "Crypto", package: "swift-crypto", condition: .when(platforms: [.linux])),
        ]),
    ]
)
