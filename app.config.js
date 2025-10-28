export default {
  expo: {
    name: "Wheiz",
    slug: "bolt-expo-nativewind",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "myapp",
    userInterfaceStyle: "automatic",
    splash: {
      image: "./assets/images/favicon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    assetBundlePatterns: [
      "**/*"
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.shahryar.wheiz"
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/images/icon.png",
        backgroundColor: "#ffffff"
      },
      package: "com.shahryar.wheiz",
      googleServicesFile: "./google-services.json"
    },
    web: {
      bundler: "metro",
      output: "static",
      favicon: "./assets/images/favicon.png"
    },
    plugins: [
      "expo-router"
    ],
    experiments: {
      typedRoutes: true
    },
    extra: {
      // Read from environment at build/dev time; never hardcode secrets in the repo
      AZURE_TRANSLATOR_KEY: process.env.AZURE_TRANSLATOR_KEY,
      AZURE_TRANSLATOR_REGION: process.env.AZURE_TRANSLATOR_REGION,
      eas: {
        projectId: "25dbba8a-7834-4f45-8476-f790febb5dd4"
      }
    }
  }
}; 