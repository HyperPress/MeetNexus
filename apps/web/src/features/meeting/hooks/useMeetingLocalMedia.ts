import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
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
import {
  getMeetingMediaErrorMessage,
  publishWhip,
  subscribeWhep,
  type MediaSession,
  type SubscriptionSession,
} from '../../../lib/media/whipWhep'

interface MeetingMediaOptions {
  memberId: string | null
  remoteMemberIds: string[]
  remoteScreenMemberIds: string[]
  roomId: string
  sessionToken: string | null
}

const emptyDevices: LocalMediaDevices = {
  cameras: [],
  microphones: [],
}

export function useMeetingLocalMedia({
  memberId,
  remoteMemberIds,
  remoteScreenMemberIds,
  roomId,
  sessionToken,
}: MeetingMediaOptions) {
  const mountedRef = useRef(true)
  const localStreamRef = useRef<MediaStream | null>(null)
  const publishSessionRef = useRef<MediaSession | null>(null)
  const screenPublishSessionRef = useRef<MediaSession | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const subscriptionsRef = useRef(new Map<string, SubscriptionSession>())
  const screenSubscriptionsRef = useRef(new Map<string, SubscriptionSession>())

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
  const [devices, setDevices] = useState<LocalMediaDevices>(emptyDevices)
  const [selectedCameraId, setSelectedCameraId] = useState('')
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState('')

  const [isStartingDevices, setIsStartingDevices] =
    useState(false)
  const [isStartingScreenShare, setIsStartingScreenShare] =
    useState(false)
  const [isRefreshingDevices, setIsRefreshingDevices] = useState(false)

  const [mediaErrorMessage, setMediaErrorMessage] =
    useState<string | null>(null)
  const [screenErrorMessage, setScreenErrorMessage] =
    useState<string | null>(null)
  const [statusMessage, setStatusMessage] =
    useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = useState('未连接')
  const [remoteStreams, setRemoteStreams] = useState<
    Record<string, MediaStream>
  >({})
  const [remoteScreenStreams, setRemoteScreenStreams] = useState<
    Record<string, MediaStream>
  >({})

  const refreshDevices = useCallback(async () => {
    setIsRefreshingDevices(true)
    try {
      const availableDevices = await enumerateLocalMediaDevices()
      if (mountedRef.current) {
        setDevices(availableDevices)
      }
    } catch {
      if (mountedRef.current) {
        setDevices(emptyDevices)
      }
    } finally {
      if (mountedRef.current) {
        setIsRefreshingDevices(false)
      }
    }
  }, [])

  const closePublishSession = useCallback(() => {
    const session = publishSessionRef.current
    publishSessionRef.current = null
    if (session !== null) {
      void session.close()
    }
  }, [])

  const closeScreenPublishSession = useCallback(() => {
    const session = screenPublishSessionRef.current
    screenPublishSessionRef.current = null
    if (session !== null) {
      void session.close()
    }
  }, [])

  const publishLocalStream = useCallback(
    async (stream: MediaStream) => {
      if (memberId === null || sessionToken === null) {
        return
      }

      closePublishSession()
      setConnectionStatus('连接中')
      try {
        const session = await publishWhip(
          {
            roomId,
            memberId,
            streamMemberId: memberId,
            sessionToken,
          },
          stream,
        )
        if (!mountedRef.current || localStreamRef.current !== stream) {
          await session.close()
          return
        }
        publishSessionRef.current = session
        setConnectionStatus('已连接')
        setStatusMessage('音视频已发布，正在等待其他成员订阅。')
        session.connection.addEventListener('connectionstatechange', () => {
          if (
            !mountedRef.current ||
            !['disconnected', 'failed'].includes(session.connection.connectionState)
          ) {
            return
          }
          setConnectionStatus('正在恢复连接')
          if (reconnectTimerRef.current !== null) {
            window.clearTimeout(reconnectTimerRef.current)
          }
          reconnectTimerRef.current = window.setTimeout(() => {
            reconnectTimerRef.current = null
            const currentStream = localStreamRef.current
            if (currentStream !== null) {
              void publishLocalStream(currentStream)
            }
          }, 1_000)
        })
      } catch (error) {
        if (mountedRef.current) {
          setConnectionStatus('连接失败')
          setMediaErrorMessage(getMeetingMediaErrorMessage(error))
        }
      }
    },
    [closePublishSession, memberId, roomId, sessionToken],
  )

  const stopDevices = useCallback(() => {
    const currentStream = localStreamRef.current

    localStreamRef.current = null
    closePublishSession()
    stopLocalMedia(currentStream)

    setLocalStream(null)
    setCameraEnabled(false)
    setMicrophoneEnabled(false)
    setMediaErrorMessage(null)
    setConnectionStatus('未连接')
    setStatusMessage('摄像头和麦克风已释放。')
  }, [closePublishSession])

  const stopScreenSharing = useCallback(() => {
    const currentStream = screenStreamRef.current

    screenStreamRef.current = null
    closeScreenPublishSession()
    stopLocalMedia(currentStream)

    setScreenStream(null)
    setScreenInfo(null)
    setScreenErrorMessage(null)
    setStatusMessage('屏幕分享已停止。')
  }, [closeScreenPublishSession])

  const stopAllMedia = useCallback(() => {
    const currentLocalStream = localStreamRef.current
    const currentScreenStream = screenStreamRef.current

    localStreamRef.current = null
    screenStreamRef.current = null

    closePublishSession()
    closeScreenPublishSession()
    stopLocalMedia(currentLocalStream)
    stopLocalMedia(currentScreenStream)

    setLocalStream(null)
    setScreenStream(null)
    setScreenInfo(null)
    setCameraEnabled(false)
    setMicrophoneEnabled(false)
    setConnectionStatus('未连接')
  }, [closePublishSession, closeScreenPublishSession])

  useEffect(() => {
    mountedRef.current = true
    const subscriptions = subscriptionsRef.current
    const screenSubscriptions = screenSubscriptionsRef.current

    return () => {
      mountedRef.current = false

      const currentLocalStream = localStreamRef.current
      const currentScreenStream = screenStreamRef.current

      localStreamRef.current = null
      screenStreamRef.current = null

      closePublishSession()
      closeScreenPublishSession()
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current)
      }
      for (const session of subscriptions.values()) {
        void session.close()
      }
      subscriptions.clear()
      for (const session of screenSubscriptions.values()) {
        void session.close()
      }
      screenSubscriptions.clear()
      stopLocalMedia(currentLocalStream)
      stopLocalMedia(currentScreenStream)
    }
  }, [closePublishSession, closeScreenPublishSession])

  useEffect(() => {
    void refreshDevices()
  }, [refreshDevices])

  const startDevices = useCallback(async () => {
    if (isStartingDevices) {
      return
    }

    setIsStartingDevices(true)
    setMediaErrorMessage(null)
    setStatusMessage(null)

    try {
      const nextStream = await startLocalMedia({
        cameraId: selectedCameraId || undefined,
        microphoneId: selectedMicrophoneId || undefined,
      })

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
      void refreshDevices()
      setStatusMessage('本地音视频设备已启动，正在连接媒体服务。')
      void publishLocalStream(nextStream)
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
  }, [
    isStartingDevices,
    publishLocalStream,
    refreshDevices,
    selectedCameraId,
    selectedMicrophoneId,
  ])

  useEffect(() => {
    if (
      memberId === null ||
      sessionToken === null ||
      localStreamRef.current === null
    ) {
      return
    }

    const desiredMemberIds = new Set(
      remoteMemberIds.filter((remoteMemberId) => remoteMemberId !== memberId),
    )
    for (const [remoteMemberId, session] of subscriptionsRef.current) {
      if (!desiredMemberIds.has(remoteMemberId)) {
        subscriptionsRef.current.delete(remoteMemberId)
        void session.close()
        setRemoteStreams((currentStreams) => {
          const { [remoteMemberId]: _, ...remainingStreams } = currentStreams
          return remainingStreams
        })
      }
    }

    for (const remoteMemberId of desiredMemberIds) {
      if (subscriptionsRef.current.has(remoteMemberId)) {
        continue
      }
      void subscribeWhep({
        roomId,
        memberId,
        streamMemberId: remoteMemberId,
        sessionToken,
      })
        .then((session) => {
          if (!mountedRef.current || !desiredMemberIds.has(remoteMemberId)) {
            void session.close()
            return
          }
          subscriptionsRef.current.set(remoteMemberId, session)
          setRemoteStreams((currentStreams) => ({
            ...currentStreams,
            [remoteMemberId]: session.stream,
          }))
        })
        .catch((error: unknown) => {
          if (mountedRef.current) {
            setMediaErrorMessage(getMeetingMediaErrorMessage(error))
          }
        })
    }
  }, [memberId, remoteMemberIds, roomId, sessionToken])

  useEffect(() => {
    if (memberId === null || sessionToken === null) {
      return
    }

    const desiredMemberIds = new Set(
      remoteScreenMemberIds.filter((remoteMemberId) => remoteMemberId !== memberId),
    )
    for (const [remoteMemberId, session] of screenSubscriptionsRef.current) {
      if (!desiredMemberIds.has(remoteMemberId)) {
        screenSubscriptionsRef.current.delete(remoteMemberId)
        void session.close()
        setRemoteScreenStreams((streams) => {
          const { [remoteMemberId]: _, ...remainingStreams } = streams
          return remainingStreams
        })
      }
    }
    for (const remoteMemberId of desiredMemberIds) {
      if (screenSubscriptionsRef.current.has(remoteMemberId)) {
        continue
      }
      void subscribeWhep({
        roomId,
        memberId,
        sessionToken,
        streamKind: 'screen',
        streamMemberId: remoteMemberId,
      })
        .then((session) => {
          if (!mountedRef.current || !desiredMemberIds.has(remoteMemberId)) {
            void session.close()
            return
          }
          screenSubscriptionsRef.current.set(remoteMemberId, session)
          setRemoteScreenStreams((streams) => ({
            ...streams,
            [remoteMemberId]: session.stream,
          }))
        })
        .catch((error: unknown) => {
          if (mountedRef.current) {
            setScreenErrorMessage(getMeetingMediaErrorMessage(error))
          }
        })
    }
  }, [memberId, remoteScreenMemberIds, roomId, sessionToken])

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

  const publishScreenStream = useCallback(
    async (stream: MediaStream) => {
      if (memberId === null || sessionToken === null) {
        return
      }

      closeScreenPublishSession()
      try {
        const session = await publishWhip(
          {
            roomId,
            memberId,
            sessionToken,
            streamKind: 'screen',
            streamMemberId: memberId,
          },
          stream,
        )
        if (!mountedRef.current || screenStreamRef.current !== stream) {
          await session.close()
          return
        }
        screenPublishSessionRef.current = session
        setStatusMessage('屏幕共享已发布，正在等待其他成员订阅。')
      } catch (error) {
        if (mountedRef.current) {
          setScreenErrorMessage(getMeetingMediaErrorMessage(error))
        }
      }
    },
    [closeScreenPublishSession, memberId, roomId, sessionToken],
  )

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
        '已开始屏幕共享，正在连接媒体服务。',
      )
      void publishScreenStream(nextStream)
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
  }, [isStartingScreenShare, publishScreenStream])

  return {
    cameraEnabled,
    cameraMirrored,
    connectionStatus,
    devices,
    isStartingDevices,
    isStartingScreenShare,
    isRefreshingDevices,
    localStream,
    mediaErrorMessage,
    microphoneEnabled,
    screenErrorMessage,
    screenInfo,
    screenStream,
    remoteStreams,
    remoteScreenStreams,
    refreshDevices,
    statusMessage,
    selectedCameraId,
    selectedMicrophoneId,
    setSelectedCameraId,
    setSelectedMicrophoneId,
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
