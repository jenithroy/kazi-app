import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { PushNotifications } from "@capacitor/push-notifications";
import { Haptics, ImpactStyle } from "@capacitor/haptics";

export const isNative = Capacitor.isNativePlatform();

// GPS — uses native on device, falls back to web API in browser
export async function getCurrentPosition() {
  if (isNative) {
    const perm = await Geolocation.requestPermissions();
    if (perm.location !== "granted") throw new Error("Location permission denied");
    return Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
  }
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true, timeout: 10000, maximumAge: 0,
    })
  );
}

// Push notifications — registers device token with Firebase for dispatch alerts
export async function initPushNotifications(onToken, onMessage) {
  if (!isNative) return;

  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== "granted") return;

  await PushNotifications.register();

  PushNotifications.addListener("registration", token => {
    onToken?.(token.value);
  });

  PushNotifications.addListener("pushNotificationReceived", notification => {
    onMessage?.(notification);
  });

  PushNotifications.addListener("pushNotificationActionPerformed", action => {
    onMessage?.(action.notification);
  });
}

// Haptic feedback for key actions (clock-in, task complete, dispatch accept)
export function hapticSuccess() {
  if (isNative) Haptics.impact({ style: ImpactStyle.Medium });
}
export function hapticLight() {
  if (isNative) Haptics.impact({ style: ImpactStyle.Light });
}
