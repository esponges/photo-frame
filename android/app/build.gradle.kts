plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.fer.photoframe"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.fer.photoframe"
        // Nexus 7 2013 on Android 7.1 (LineageOS 14.1). 25 is the real floor:
        // ISRG Root X1 only entered the Android trust store in 7.1.1.
        minSdk = 25
        targetSdk = 35
        versionCode = 1
        versionName = "0.1"

        // Set FRAME_BASE_URL and FRAME_TOKEN in android/local.properties
        // (gitignored) or pass -PframeBaseUrl=... -PframeToken=... on the CLI.
        val baseUrl = (project.findProperty("frameBaseUrl") as String?) ?: ""
        val token = (project.findProperty("frameToken") as String?) ?: ""
        buildConfigField("String", "FRAME_BASE_URL", "\"$baseUrl\"")
        buildConfigField("String", "FRAME_TOKEN", "\"$token\"")
    }

    buildFeatures {
        buildConfig = true
        viewBinding = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Debug-signed so `assembleRelease` is installable without a keystore;
            // this app is sideloaded onto one tablet, never published.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.work:work-runtime-ktx:2.9.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    // Coil 2.x keeps minSdk 21 support; Coil 3 would also work but brings more.
    implementation("io.coil-kt:coil:2.7.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
