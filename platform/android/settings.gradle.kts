// Worldlet for Android (README.md): the phone app (app/) and its pairing protocol library (kit/), which is plain
// Kotlin so its tests run on any JVM, as WorldletKit's do for the iPhone.
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "Worldlet"
include(":kit", ":app")
