import { DEVICE_PAIRING_DEVICE_NAME_QUERY_PARAM, DEVICE_PAIRING_USER_CODE_QUERY_PARAM } from "./constants";

const MAX_DEVICE_NAME_LENGTH = 80;

type LinkDevicePrefill = {
  initialUserCode: string;
  initialDeviceName: string;
};

type BuildLinkDevicePathInput = {
  userCode: string;
  deviceName?: string;
};

function trimDeviceName(value: string | null | undefined) {
  return (value ?? "").trim().slice(0, MAX_DEVICE_NAME_LENGTH);
}

export function readLinkDevicePrefill(url: URL): LinkDevicePrefill {
  return {
    initialUserCode: url.searchParams.get(DEVICE_PAIRING_USER_CODE_QUERY_PARAM)?.trim() ?? "",
    initialDeviceName: trimDeviceName(url.searchParams.get(DEVICE_PAIRING_DEVICE_NAME_QUERY_PARAM)),
  };
}

export function buildLinkDevicePath(input: BuildLinkDevicePathInput) {
  const params = new URLSearchParams();
  params.set(DEVICE_PAIRING_USER_CODE_QUERY_PARAM, input.userCode);

  const deviceName = trimDeviceName(input.deviceName);
  if (deviceName) {
    params.set(DEVICE_PAIRING_DEVICE_NAME_QUERY_PARAM, deviceName);
  }

  return `/link-device?${params.toString()}`;
}

export function buildLinkDeviceUrl(origin: string, input: BuildLinkDevicePathInput) {
  const normalizedOrigin = origin.replace(/\/$/, "");
  return `${normalizedOrigin}${buildLinkDevicePath(input)}`;
}
