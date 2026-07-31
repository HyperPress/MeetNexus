import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  getLocalMediaErrorMessage,
  getScreenShareInfo,
  setLocalTrackEnabled,
  startLocalMedia,
  startScreenShare,
  stopLocalMedia,
  type ScreenShareInfo,
} from '../../../lib/media/localMedia'

export function useMeetingLocalMedia() {
  const mountedRef = useRef(true)
  const localStreamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)

  const [localStream, setLocalStream] =
    useState<MediaStream | null>(null)
  const [screenStream, setScreenStream] =
    useState<MediaStream | null>(null)
  const [screenInfo, setScreenInfo] =
    useState<ScreenShareInfo | null>(null)

  const [cameraEnabled, setCameraEnabled] = useState(false)
  const [microphoneEnabled, setMicrophoneEnabled] =
    useState(false)
  const [cameraMirrored, setCameraMirrored] = useState(true)

  const [isStartingDevices, setIsStartingDevices] =
    useState(false)
  const [isStartingScreenShare, setIsStartingScreenShare] =
    useState(false)

  const [mediaErrorMessage, setMediaErrorMessage] =
    useState<string | null>(null)
  const [screenErrorMessage, setScreenErrorMessage] =
    useState<string | null>(null)
  const [statusMessage, setStatusMessage] =
    useState<string | null>(null)

  const stopDevices = useCallback(() => {
    const currentStream = localStreamRef.current

    localStreamRef.current = null
    stopLocalMedia(currentStream)

    setLocalStream(null)
    setCameraEnabled(false)
    setMicrophoneEnabled(false)
    setMediaErrorMessage(null)
    setStatusMessage('摄像头和麦克风已释放。')
  }, [])

  const stopScreenSharing = useCallback(() => {
    const currentStream = screenStreamRef.current

    screenStreamRef.current = null
    stopLocalMedia(currentStream)

    setScreenStream(null)
    setScreenInfo(null)
    setScreenErrorMessage(null)
    setStatusMessage('屏幕分享已停止。')
  }, [])

  const stopAllMedia = useCallback(() => {
    const currentLocalStream = localStreamRef.current
    const currentScreenStream = screenStreamRef.current

    localStreamRef.current = null
    screenStreamRef.current = null

    stopLocalMedia(currentLocalStream)
    stopLocalMedia(currentScreenStream)

    setLocalStream(null)
    setScreenStream(null)
    setScreenInfo(null)
    setCameraEnabled(false)
    setMicrophoneEnabled(false)
  }, [])

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false

      const currentLocalStream = localStreamRef.current
      const currentScreenStream = screenStreamRef.current

      localStreamRef.current = null
      screenStreamRef.current = null

      stopLocalMedia(currentLocalStream)
      stopLocalMedia(currentScreenStream)
    }
  }, [])

  const startDevices = useCallback(async () => {
    if (isStartingDevices) {
      return
    }

    setIsStartingDevices(true)
    setMediaErrorMessage(null)
    setStatusMessage(null)

    try {
      const nextStream = await startLocalMedia()

      if (!mountedRef.current) {
        stopLocalMedia(nextStream)
        return
      }

      const previousStream = localStreamRef.current

      localStreamRef.current = nextStream
      stopLocalMedia(previousStream)

      setLocalStream(nextStream)
      setCameraEnabled(nextStream.getVideoTracks().length > 0)
      setMicrophoneEnabled(
        nextStream.getAudioTracks().length > 0,
      )
      setStatusMessage(
        '本地音视频设备已启动，当前画面只在本机显示。',
      )
    } catch (error) {
      if (mountedRef.current) {
        setMediaErrorMessage(
          getLocalMediaErrorMessage(error),
        )
      }
    } finally {
      if (mountedRef.current) {
        setIsStartingDevices(false)
      }
    }
  }, [isStartingDevices])

  const toggleCamera = useCallback(() => {
    const currentStream = localStreamRef.current

    if (currentStream === null) {
      return
    }

    const nextEnabled = !cameraEnabled

    setLocalTrackEnabled(currentStream, 'video', nextEnabled)
    setCameraEnabled(nextEnabled)
  }, [cameraEnabled])

  const toggleMicrophone = useCallback(() => {
    const currentStream = localStreamRef.current

    if (currentStream === null) {
      return
    }

    const nextEnabled = !microphoneEnabled

    setLocalTrackEnabled(currentStream, 'audio', nextEnabled)
    setMicrophoneEnabled(nextEnabled)
  }, [microphoneEnabled])

  const toggleMirror = useCallback(() => {
    setCameraMirrored((currentValue) => !currentValue)
  }, [])

  const startScreenSharing = useCallback(async () => {
    if (isStartingScreenShare) {
      return
    }

    setIsStartingScreenShare(true)
    setScreenErrorMessage(null)
    setStatusMessage(null)

    let nextStream: MediaStream | null = null

    try {
      nextStream = await startScreenShare()
      const nextScreenInfo = getScreenShareInfo(nextStream)

      if (!mountedRef.current) {
        stopLocalMedia(nextStream)
        return
      }

      const previousStream = screenStreamRef.current

      screenStreamRef.current = nextStream
      stopLocalMedia(previousStream)

      const screenTrack = nextStream.getVideoTracks()[0]

      screenTrack?.addEventListener(
        'ended',
        () => {
          if (
            !mountedRef.current ||
            screenStreamRef.current !== nextStream
          ) {
            return
          }

          screenStreamRef.current = null
          setScreenStream(null)
          setScreenInfo(null)
          setStatusMessage('屏幕分享已由浏览器停止。')
        },
        {
          once: true,
        },
      )

      setScreenStream(nextStream)
      setScreenInfo(nextScreenInfo)
      setStatusMessage(
        '已开始本地屏幕分享预览，当前不会发送给其他成员。',
      )
    } catch (error) {
      stopLocalMedia(nextStream)

      if (mountedRef.current) {
        setScreenErrorMessage(
          getLocalMediaErrorMessage(error),
        )
      }
    } finally {
      if (mountedRef.current) {
        setIsStartingScreenShare(false)
      }
    }
  }, [isStartingScreenShare])

  return {
    cameraEnabled,
    cameraMirrored,
    isStartingDevices,
    isStartingScreenShare,
    localStream,
    mediaErrorMessage,
    microphoneEnabled,
    screenErrorMessage,
    screenInfo,
    screenStream,
    statusMessage,
    startDevices,
    startScreenSharing,
    stopAllMedia,
    stopDevices,
    stopScreenSharing,
    toggleCamera,
    toggleMicrophone,
    toggleMirror,
  }
}
