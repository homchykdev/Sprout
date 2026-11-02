import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "sports.sprout.app",
  appName: "Sprout Sport",
  webDir: ".output/public",
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_sprout",
    },
  },
};

export default config;
