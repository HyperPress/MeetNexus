import { useEffect, useRef, useState } from 'react'
import {
  enumerateLocalMediaDevices,
  getLocalMediaErrorMessage,
  getScreenShareInfo,
  setLocalTrackEnabled,
  startLocalMedia,
  startScreenShare,
  stopLocalMedia,
  type LocalMediaDevices,
  type ScreenShareInfo,
} from '../../../lib/media/localMedia'
import { LocalVideoPreview } from '../components/LocalVideoPreview'
import { ScreenSharePreview } from '../components/ScreenSharePreview'

const emptyDevices: LocalMediaDevices = {
  cameras: [],
  microphones: [],
}

export function PreJoinPage() {
  const mountedRef = useRef(true)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [stream, setStream] = useState<MediaStream | null>(null)
  const [devices, setDevices] =
    useState<LocalMediaDevices>(emptyDevices)
  const [selectedCameraId, setSelectedCameraId] = useState('')
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState('')
  const [cameraEnabled, setCameraEnabled] = useState(false)
  const [cameraMirrored, setCameraMirrored] = useState(true)
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null)
  const [screenInfo, setScreenInfo] = useState<ScreenShareInfo | null>(null)
  const [isScreenLoading, setIsScreenLoading] = useState(false)
  const [screenErrorMessage, setScreenErrorMessage] = useState<string | null>(
    null,
  )
  const [screenStatusMessage, setScreenStatusMessage] = useState<
    string | null
  >(null)

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
      stopLocalMedia(streamRef.current)
      stopLocalMedia(screenStreamRef.current)
      streamRef.current = null
      screenStreamRef.current = null
    }
  }, [])

  function replaceStream(nextStream: MediaStream | null) {
    stopLocalMedia(streamRef.current)
    streamRef.current = nextStream
    setStream(nextStream)
  }

  function replaceScreenStream(nextStream: MediaStream | null) {
    stopLocalMedia(screenStreamRef.current)
    screenStreamRef.current = nextStream
    setScreenStream(nextStream)
  }

  async function handleStartPreview() {
    setIsLoading(true)
    setErrorMessage(null)
    setStatusMessage(null)
    replaceStream(null)

    try {
      const nextStream = await startLocalMedia({
        cameraId: selectedCameraId || undefined,
        microphoneId: selectedMicrophoneId || undefined,
      })

      if (!mountedRef.current) {
        stopLocalMedia(nextStream)
        return
      }

      streamRef.current = nextStream
      setStream(nextStream)
      setCameraEnabled(nextStream.getVideoTracks().length > 0)
      setMicrophoneEnabled(nextStream.getAudioTracks().length > 0)

      try {
        const availableDevices = await enumerateLocalMediaDevices()

        if (mountedRef.current) {
          setDevices(availableDevices)

          const activeCameraId =
            nextStream.getVideoTracks()[0]?.getSettings().deviceId
          const activeMicrophoneId =
            nextStream.getAudioTracks()[0]?.getSettings().deviceId

          if (selectedCameraId === '' && activeCameraId !== undefined) {
            setSelectedCameraId(activeCameraId)
          }

          if (
            selectedMicrophoneId === '' &&
            activeMicrophoneId !== undefined
          ) {
            setSelectedMicrophoneId(activeMicrophoneId)
          }
        }
      } catch {
        if (mountedRef.current) {
          setDevices(emptyDevices)
        }
      }

      if (mountedRef.current) {
        setStatusMessage('设备已准备好，你可以检查画面和声音设置。')
      }
    } catch (error) {
      if (mountedRef.current) {
        replaceStream(null)
        setCameraEnabled(false)
        setMicrophoneEnabled(false)
        setErrorMessage(getLocalMediaErrorMessage(error))
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false)
      }
    }
  }

  function handleToggleCamera() {
    if (stream === null) {
      return
    }

    const nextEnabled = !cameraEnabled
    setLocalTrackEnabled(stream, 'video', nextEnabled)
    setCameraEnabled(nextEnabled)
  }

  function handleToggleMicrophone() {
    if (stream === null) {
      return
    }

    const nextEnabled = !microphoneEnabled
    setLocalTrackEnabled(stream, 'audio', nextEnabled)
    setMicrophoneEnabled(nextEnabled)
  }

  function handleToggleMirror() {
    setCameraMirrored((currentValue) => !currentValue)
  }

  function handleStopPreview() {
    replaceStream(null)
    setCameraEnabled(false)
    setMicrophoneEnabled(false)
    setStatusMessage('设备预览已停止。')
    setErrorMessage(null)
  }

  function handleCameraChange(deviceId: string) {
    setSelectedCameraId(deviceId)

    if (stream !== null) {
      setStatusMessage('摄像头选择已更改，请重新检测设备以应用。')
    }
  }

  function handleMicrophoneChange(deviceId: string) {
    setSelectedMicrophoneId(deviceId)

    if (stream !== null) {
      setStatusMessage('麦克风选择已更改，请重新检测设备以应用。')
    }
  }

  function handleScreenShareEnded() {
    if (!mountedRef.current) {
      return
    }

    screenStreamRef.current = null
    setScreenStream(null)
    setScreenInfo(null)
    setScreenStatusMessage('屏幕分享已由浏览器停止。')
  }

  async function handleStartScreenShare() {
    setIsScreenLoading(true)
    setScreenErrorMessage(null)
    setScreenStatusMessage(null)
    replaceScreenStream(null)
    setScreenInfo(null)

    let nextScreenStream: MediaStream | null = null

    try {
      nextScreenStream = await startScreenShare()

      if (!mountedRef.current) {
        stopLocalMedia(nextScreenStream)
        return
      }

      const nextScreenInfo = getScreenShareInfo(nextScreenStream)
      const screenTrack = nextScreenStream.getVideoTracks()[0]

      screenTrack?.addEventListener('ended', handleScreenShareEnded, {
        once: true,
      })

      screenStreamRef.current = nextScreenStream
      setScreenStream(nextScreenStream)
      setScreenInfo(nextScreenInfo)
      setScreenStatusMessage('已获取屏幕分享信息，当前仅在本机预览。')
    } catch (error) {
      stopLocalMedia(nextScreenStream)

      if (mountedRef.current) {
        screenStreamRef.current = null
        setScreenStream(null)
        setScreenInfo(null)
        setScreenErrorMessage(getLocalMediaErrorMessage(error))
      }
    } finally {
      if (mountedRef.current) {
        setIsScreenLoading(false)
      }
    }
  }

  function handleStopScreenShare() {
    replaceScreenStream(null)
    setScreenInfo(null)
    setScreenErrorMessage(null)
    setScreenStatusMessage('屏幕分享预览已停止。')
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <section className="w-full max-w-6xl">
        <div className="mb-6">
          <a className="link link-hover text-sm" href="#/">
            ← 返回首页
          </a>

          <h1 className="mt-4 text-3xl font-bold">会前设备检测</h1>

          <p className="mt-2 text-base-content/70">
            在进入会议前检查摄像头和麦克风。当前页面只进行本地设备预览，不会加入或创建会议。
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(20rem,1fr)]">
          <div>
            <LocalVideoPreview
              cameraEnabled={cameraEnabled}
              mirrored={cameraMirrored}
              stream={stream}
            />

            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <button
                aria-pressed={!microphoneEnabled}
                className="btn btn-outline"
                disabled={stream === null}
                onClick={handleToggleMicrophone}
                type="button"
              >
                {microphoneEnabled ? '关闭麦克风' : '打开麦克风'}
              </button>

              <button
                aria-pressed={!cameraEnabled}
                className="btn btn-outline"
                disabled={stream === null}
                onClick={handleToggleCamera}
                type="button"
              >
                {cameraEnabled ? '关闭摄像头' : '打开摄像头'}
              </button>

              <button
                aria-pressed={cameraMirrored}
                className="btn btn-outline"
                disabled={stream === null || !cameraEnabled}
                onClick={handleToggleMirror}
                type="button"
              >
                {cameraMirrored ? '关闭镜像' : '开启镜像'}
              </button>

              <button
                className="btn btn-ghost"
                disabled={stream === null}
                onClick={handleStopPreview}
                type="button"
              >
                停止预览
              </button>
            </div>
          </div>

          <div className="card bg-base-100 shadow-xl">
            <div className="card-body gap-5">
              <div>
                <h2 className="card-title">设备设置</h2>
                <p className="mt-1 text-sm text-base-content/70">
                  首次检测时，浏览器会请求摄像头和麦克风权限。
                </p>
              </div>

              <fieldset className="fieldset">
                <label className="fieldset-legend" htmlFor="camera-device">
                  摄像头
                </label>
                <select
                  className="select w-full"
                  disabled={devices.cameras.length === 0}
                  id="camera-device"
                  onChange={(event) =>
                    handleCameraChange(event.target.value)
                  }
                  value={selectedCameraId}
                >
                  <option value="">系统默认摄像头</option>
                  {devices.cameras.map((camera) => (
                    <option key={camera.deviceId} value={camera.deviceId}>
                      {camera.label}
                    </option>
                  ))}
                </select>
              </fieldset>

              <fieldset className="fieldset">
                <label
                  className="fieldset-legend"
                  htmlFor="microphone-device"
                >
                  麦克风
                </label>
                <select
                  className="select w-full"
                  disabled={devices.microphones.length === 0}
                  id="microphone-device"
                  onChange={(event) =>
                    handleMicrophoneChange(event.target.value)
                  }
                  value={selectedMicrophoneId}
                >
                  <option value="">系统默认麦克风</option>
                  {devices.microphones.map((microphone) => (
                    <option
                      key={microphone.deviceId}
                      value={microphone.deviceId}
                    >
                      {microphone.label}
                    </option>
                  ))}
                </select>
              </fieldset>

              {errorMessage !== null && (
                <div className="alert alert-error" role="alert">
                  <span>{errorMessage}</span>
                </div>
              )}

              {statusMessage !== null && (
                <div
                  aria-live="polite"
                  className="alert alert-info"
                  role="status"
                >
                  <span>{statusMessage}</span>
                </div>
              )}

              <button
                className="btn btn-primary w-full"
                disabled={isLoading}
                onClick={handleStartPreview}
                type="button"
              >
                {isLoading
                  ? '正在检测设备……'
                  : stream === null
                    ? '开始设备检测'
                    : '重新检测设备'}
              </button>

              <p className="text-xs leading-5 text-base-content/60">
                摄像头和麦克风仅用于本地预览。当前阶段不会向服务器发送音视频。
              </p>
            </div>
          </div>
        </div>

        <section className="card mt-8 bg-base-100 shadow-xl">
          <div className="card-body gap-5">
            <div>
              <h2 className="card-title">屏幕分享测试</h2>
              <p className="mt-1 text-sm text-base-content/70">
                选择一个屏幕、窗口或浏览器标签页，并读取浏览器提供的捕获信息。当前不会把画面发送到服务器。
              </p>
            </div>

            <ScreenSharePreview info={screenInfo} stream={screenStream} />

            {screenErrorMessage !== null && (
              <div className="alert alert-error" role="alert">
                <span>{screenErrorMessage}</span>
              </div>
            )}

            {screenStatusMessage !== null && (
              <div
                aria-label="屏幕分享状态"
                aria-live="polite"
                className="alert alert-info"
                role="status"
              >
                <span>{screenStatusMessage}</span>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                className="btn btn-secondary"
                disabled={isScreenLoading}
                onClick={handleStartScreenShare}
                type="button"
              >
                {isScreenLoading
                  ? '正在等待选择……'
                  : screenStream === null
                    ? '开始屏幕分享测试'
                    : '重新选择共享内容'}
              </button>

              <button
                className="btn btn-ghost"
                disabled={screenStream === null}
                onClick={handleStopScreenShare}
                type="button"
              >
                停止屏幕分享
              </button>
            </div>
          </div>
        </section>
      </section>
    </main>
  )
}
