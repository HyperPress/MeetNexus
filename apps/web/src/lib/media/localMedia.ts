export interface LocalMediaRequest {
  cameraId?: string
  microphoneId?: string
}

export interface MediaDeviceOption {
  deviceId: string
  label: string
}

export interface LocalMediaDevices {
  cameras: MediaDeviceOption[]
  microphones: MediaDeviceOption[]
}

export interface ScreenShareInfo {
  displaySurface: string
  frameRate: number | null
  height: number | null
  label: string
  width: number | null
}

type LocalMediaErrorCode =
  | 'UNSUPPORTED'
  | 'PERMISSION_DENIED'
  | 'DEVICE_NOT_FOUND'
  | 'DEVICE_BUSY'
  | 'DEVICE_UNAVAILABLE'
  | 'SECURITY_ERROR'
  | 'SCREEN_SHARE_CANCELED'
  | 'UNKNOWN'

export class LocalMediaError extends Error {
  readonly code: LocalMediaErrorCode

  constructor(code: LocalMediaErrorCode, message: string) {
    super(message)
    this.name = 'LocalMediaError'
    this.code = code
  }
}

function createDeviceConstraint(
  deviceId: string | undefined,
): true | MediaTrackConstraints {
  if (deviceId === undefined || deviceId === '') {
    return true
  }

  return {
    deviceId: {
      exact: deviceId,
    },
  }
}

function normalizeMediaError(error: unknown): LocalMediaError {
  if (!(error instanceof DOMException)) {
    return new LocalMediaError(
      'UNKNOWN',
      '无法启动摄像头或麦克风，请检查设备设置后重试。',
    )
  }

  switch (error.name) {
    case 'NotAllowedError':
      return new LocalMediaError(
        'PERMISSION_DENIED',
        '摄像头或麦克风权限被拒绝，请在浏览器设置中允许访问后重试。',
      )
    case 'NotFoundError':
      return new LocalMediaError(
        'DEVICE_NOT_FOUND',
        '没有找到可用的摄像头或麦克风，请连接设备后重试。',
      )
    case 'NotReadableError':
      return new LocalMediaError(
        'DEVICE_BUSY',
        '摄像头或麦克风可能正在被其他程序占用，请关闭相关程序后重试。',
      )
    case 'OverconstrainedError':
      return new LocalMediaError(
        'DEVICE_UNAVAILABLE',
        '所选设备当前不可用，请重新选择摄像头或麦克风。',
      )
    case 'SecurityError':
      return new LocalMediaError(
        'SECURITY_ERROR',
        '浏览器阻止了设备访问，请通过安全连接或本机地址打开页面。',
      )
    default:
      return new LocalMediaError(
        'UNKNOWN',
        '无法启动摄像头或麦克风，请检查设备设置后重试。',
      )
  }
}

function normalizeScreenShareError(error: unknown): LocalMediaError {
  if (!(error instanceof DOMException)) {
    return new LocalMediaError(
      'UNKNOWN',
      '无法获取屏幕分享，请检查浏览器设置后重试。',
    )
  }

  switch (error.name) {
    case 'NotAllowedError':
      return new LocalMediaError(
        'SCREEN_SHARE_CANCELED',
        '已取消屏幕分享，或浏览器没有获得屏幕分享权限。',
      )
    case 'NotReadableError':
      return new LocalMediaError(
        'DEVICE_BUSY',
        '无法读取所选屏幕或窗口，请重新选择后重试。',
      )
    case 'SecurityError':
      return new LocalMediaError(
        'SECURITY_ERROR',
        '浏览器阻止了屏幕分享，请通过安全连接或本机地址打开页面。',
      )
    default:
      return new LocalMediaError(
        'UNKNOWN',
        '无法获取屏幕分享，请检查浏览器设置后重试。',
      )
  }
}

function getDisplaySurfaceLabel(displaySurface: string | undefined): string {
  switch (displaySurface) {
    case 'browser':
      return '浏览器标签页'
    case 'monitor':
      return '整个屏幕'
    case 'window':
      return '应用窗口'
    default:
      return '浏览器未提供来源类型'
  }
}

export async function startLocalMedia(
  request: LocalMediaRequest = {},
): Promise<MediaStream> {
  if (navigator.mediaDevices?.getUserMedia === undefined) {
    throw new LocalMediaError(
      'UNSUPPORTED',
      '当前浏览器不支持摄像头和麦克风访问。',
    )
  }

  try {
    const cameraConstraint = createDeviceConstraint(request.cameraId)
    return await navigator.mediaDevices.getUserMedia({
      audio: createDeviceConstraint(request.microphoneId),
      video: {
        ...(cameraConstraint === true ? {} : cameraConstraint),
        // 限制摄像头分辨率和帧率，控制 TURN 中继下的总带宽。
        frameRate: { ideal: 24, max: 30 },
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
      },
    })
  } catch (error) {
    throw normalizeMediaError(error)
  }
}

export async function enumerateLocalMediaDevices(): Promise<LocalMediaDevices> {
  if (navigator.mediaDevices?.enumerateDevices === undefined) {
    throw new LocalMediaError(
      'UNSUPPORTED',
      '当前浏览器不支持媒体设备列表。',
    )
  }

  const devices = await navigator.mediaDevices.enumerateDevices()

  return {
    cameras: devices
      .filter((device) => device.kind === 'videoinput')
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `摄像头 ${index + 1}`,
      })),
    microphones: devices
      .filter((device) => device.kind === 'audioinput')
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `麦克风 ${index + 1}`,
      })),
  }
}

export async function startScreenShare(): Promise<MediaStream> {
  if (navigator.mediaDevices?.getDisplayMedia === undefined) {
    throw new LocalMediaError(
      'UNSUPPORTED',
      '当前浏览器不支持屏幕分享。',
    )
  }

  try {
    return await navigator.mediaDevices.getDisplayMedia({
      audio: false,
      // 限制共享分辨率与帧率，避免高码率在 TURN 中继下占满服务器带宽。
      video: {
        frameRate: { ideal: 15, max: 15 },
        width: { max: 960 },
        height: { max: 540 },
      },
    })
  } catch (error) {
    throw normalizeScreenShareError(error)
  }
}

export function getScreenShareInfo(stream: MediaStream): ScreenShareInfo {
  const track = stream.getVideoTracks()[0]

  if (track === undefined) {
    throw new LocalMediaError(
      'DEVICE_NOT_FOUND',
      '屏幕分享没有提供可用的视频轨道。',
    )
  }

  const settings = track.getSettings()

  return {
    displaySurface: getDisplaySurfaceLabel(settings.displaySurface),
    frameRate: settings.frameRate ?? null,
    height: settings.height ?? null,
    label: track.label || '共享屏幕',
    width: settings.width ?? null,
  }
}

export function setLocalTrackEnabled(
  stream: MediaStream,
  kind: 'audio' | 'video',
  enabled: boolean,
) {
  const tracks =
    kind === 'audio' ? stream.getAudioTracks() : stream.getVideoTracks()

  for (const track of tracks) {
    track.enabled = enabled
  }
}

export function stopLocalMedia(stream: MediaStream | null) {
  if (stream === null) {
    return
  }

  for (const track of stream.getTracks()) {
    track.stop()
  }
}

export function getLocalMediaErrorMessage(error: unknown): string {
  if (error instanceof LocalMediaError) {
    return error.message
  }

  return '设备检测失败，请检查摄像头和麦克风后重试。'
}
