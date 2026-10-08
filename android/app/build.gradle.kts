import java.time.LocalDate
import java.time.ZoneId
import java.util.Properties

plugins {
    id("com.android.application")
    id("io.github.takahirom.roborazzi")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// One version number on every platform (owner request 2026-10-04): versionCode is the commit's position on main, the
// Build the desktop and iPhone builds of that commit carry (scripts/release-rc-build.mjs), and versionName is the day in
// the desktop's native form plus that Build (2026.1004.2716). -PworldletBuild=N overrides it; without Git history it is 1.
val worldletBuild: Int = (findProperty("worldletBuild") as String?)?.toIntOrNull() ?: runCatching {
    ProcessBuilder("git", "rev-list", "--count", "HEAD").directory(rootDir).redirectErrorStream(true).start()
        .inputStream.bufferedReader().readText().trim().toInt()
}.getOrDefault(1)
val worldletVersion: String = LocalDate.now(ZoneId.of("America/Los_Angeles"))
    .let { day -> "${day.year}.${day.monthValue * 100 + day.dayOfMonth}.$worldletBuild" }

// Release signing comes from android/keystore.properties (storeFile, storePassword, keyAlias, keyPassword), kept out
// of Git; without it a release build is signed with the debug key so it still installs (README.md, Distribution).
val signing = Properties().apply {
    val file = rootProject.file("keystore.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}

// Notifications (README.md) come through Firebase Messaging, configured from these values instead of a
// google-services.json: the Firebase project worldlet's Android app (not secrets; every build carries them),
// replaced by -PFCM_APP_ID=… (or ~/.gradle/gradle.properties) or the environment, and an empty one turns push off.
val fcmDefaults = mapOf(
    "FCM_PROJECT_ID" to "worldlet",
    "FCM_APP_ID" to "1:575876440084:android:0e7edbdc33e264a9d6c701",
    "FCM_API_KEY" to "AIzaSyDCs2jy6NhNKolpko3WvOk9DvdQXIdYF6Q",
    "FCM_SENDER_ID" to "575876440084",
)
fun fcm(name: String): String = ((findProperty(name) as String?) ?: System.getenv(name) ?: fcmDefaults[name] ?: "").trim().replace("\\", "").replace("\"", "")

android {
    namespace = "app.worldlet.android"
    compileSdk = 36

    defaultConfig {
        applicationId = "app.worldlet.android"
        // Android 8.0 and later: about 97% of Android phones in use.
        minSdk = 26
        targetSdk = 36
        versionCode = worldletBuild
        versionName = worldletVersion
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        for (name in listOf("FCM_PROJECT_ID", "FCM_APP_ID", "FCM_API_KEY", "FCM_SENDER_ID")) buildConfigField("String", name, "\"${fcm(name)}\"")
    }

    signingConfigs {
        if (signing.isNotEmpty()) {
            create("release") {
                storeFile = rootProject.file(signing.getProperty("storeFile"))
                storePassword = signing.getProperty("storePassword")
                keyAlias = signing.getProperty("keyAlias")
                keyPassword = signing.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures { compose = true; buildConfig = true }
    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
    // The demo UI tests in src/test run on the JVM with Robolectric (no device) and save screenshots.
    testOptions { unitTests { isIncludeAndroidResources = true } }
}

// Robolectric's Android jar comes through Gradle (and its proxy and cache) instead of Robolectric's own downloader.
val robolectricAndroid: Configuration by configurations.creating
dependencies { robolectricAndroid("org.robolectric:android-all-instrumented:15-robolectric-13954326-i7") }
val robolectricJars = tasks.register<Sync>("robolectricJars") {
    from(robolectricAndroid)
    into(layout.buildDirectory.dir("robolectric"))
}
tasks.withType<Test>().configureEach {
    dependsOn(robolectricJars)
    systemProperty("robolectric.offline", "true")
    systemProperty("robolectric.dependency.dir", layout.buildDirectory.dir("robolectric").get().asFile.absolutePath)
}

kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }

dependencies {
    implementation(project(":kit"))
    val compose = platform("androidx.compose:compose-bom:2025.12.01")
    implementation(compose)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.activity:activity-compose:1.11.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.4")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.4")
    // Google's code scanner: scans the pairing code without the camera permission (Google Play services).
    implementation("com.google.android.gms:play-services-code-scanner:16.1.0")
    // Notifications while the app is closed; the app sets Firebase up itself (Push.kt), with no Google services plugin.
    implementation(platform("com.google.firebase:firebase-bom:34.6.0"))
    implementation("com.google.firebase:firebase-messaging")
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
    testImplementation(compose)
    testImplementation("androidx.compose.ui:ui-test-junit4")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.17")
    testImplementation("io.github.takahirom.roborazzi:roborazzi:1.76.0")
    testImplementation("io.github.takahirom.roborazzi:roborazzi-compose:1.76.0")
    androidTestImplementation(compose)
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
    androidTestImplementation("androidx.test:runner:1.7.0")
    androidTestImplementation("androidx.test:core-ktx:1.7.0")
}
