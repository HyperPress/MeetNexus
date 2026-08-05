import {
  type MutableRefObject,
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
  onMediaStateChange?: (state: {
    cameraEnabled: boolean
    microphoneEnabled: boolean
  }) => void
  remoteMemberIds: string[]
  remoteScreenMemberIds: string[]
  roomId: string
  sessionToken: string | null
}

const emptyDevices: LocalMediaDevices = {
  cameras: [],
  microphones: [],
}

const remoteVideoTrackTimeoutMs = 15_000
const remoteDisconnectedRetryTimeoutMs = 10_000

export function useMeetingLocalMedia({
  memberId,
  onMediaStateChange,
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
  const pendingSubscriptionsRef = useRef(new Set<string>())
  const pendingScreenSubscriptionsRef = useRef(new Set<string>())
  const subscriptionRetryTimersRef = useRef(new Map<string, number>())
  const subscriptionTrackWatchdogsRef = useRef(new Map<string, number>())
  const screenSubscriptionRetryTimersRef = useRef(new Map<string, number>())
  const screenSubscriptionTrackWatchdogsRef = useRef(new Map<string, number>())
  const desiredRemoteMemberIdsRef = useRef(new Set<string>())
  const desiredRemoteScreenMemberIdsRef = useRef(new Set<string>())

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
  const [isIdentifyingDevices, setIsIdentifyingDevices] = useState(false)
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
  const [subscriptionRetryVersion, setSubscriptionRetryVersion] = useState(0)

  const notifyMediaStateChange = useCallback(
    (cameraEnabled: boolean, microphoneEnabled: boolean) => {
      onMediaStateChange?.({ cameraEnabled, microphoneEnabled })
    },
    [onMediaStateChange],
  )

  const scheduleSubscriptionRetry = useCallback((memberId: string) => {
    if (subscriptionRetryTimersRef.current.has(memberId)) {
      return
    }

    const timerId = window.setTimeout(() => {
      subscriptionRetryTimersRef.current.delete(memberId)
      if (
        mountedRef.current &&
        desiredRemoteMemberIdsRef.current.has(memberId)
      ) {
        setSubscriptionRetryVersion((version) => version + 1)
      }
    }, 1_000)
    subscriptionRetryTimersRef.current.set(memberId, timerId)
  }, [])

  const scheduleScreenSubscriptionRetry = useCallback((memberId: string) => {
    if (screenSubscriptionRetryTimersRef.current.has(memberId)) {
      return
    }

    const timerId = window.setTimeout(() => {
      screenSubscriptionRetryTimersRef.current.delete(memberId)
      if (
        mountedRef.current &&
        desiredRemoteScreenMemberIdsRef.current.has(memberId)
      ) {
        setSubscriptionRetryVersion((version) => version + 1)
      }
    }, 1_000)
    screenSubscriptionRetryTimersRef.current.set(memberId, timerId)
  }, [])

  const clearTrackWatchdog = useCallback(
    (timers: MutableRefObject<Map<string, number>>, memberId: string) => {
      const timerId = timers.current.get(memberId)
      if (timerId !== undefined) {
        window.clearTimeout(timerId)
        timers.current.delete(memberId)
      }
    },
    [],
  )

  const armVideoTrackWatchdog = useCallback(
    (
      timers: MutableRefObject<Map<string, number>>,
      memberId: string,
      stream: MediaStream,
      onWatchdogFire: () => void,
    ) => {
      const handleTrackAdded = (event: MediaStreamTrackEvent) => {
        if (
          event.track.kind !== 'video' ||
          stream.getVideoTracks().length === 0
        ) {
          return
        }
        clearTrackWatchdog(timers, memberId)
        stream.removeEventListener('addtrack', handleTrackAdded)
      }
      stream.addEventListener('addtrack', handleTrackAdded)
      const timerId = window.setTimeout(() => {
        timers.current.delete(memberId)
        stream.removeEventListener('addtrack', handleTrackAdded)
        onWatchdogFire()
      }, remoteVideoTrackTimeoutMs)
      timers.current.set(memberId, timerId)
    },
    [clearTrackWatchdog],
  )

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
    notifyMediaStateChange(false, false)
    setMediaErrorMessage(null)
    setConnectionStatus('未连接')
    setStatusMessage('摄像头和麦克风已释放。')
  }, [closePublishSession, notifyMediaStateChange])

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
    notifyMediaStateChange(false, false)
    setConnectionStatus('未连接')
  }, [
    closePublishSession,
    closeScreenPublishSession,
    notifyMediaStateChange,
  ])

  useEffect(() => {
    mountedRef.current = true
    const subscriptions = subscriptionsRef.current
    const screenSubscriptions = screenSubscriptionsRef.current
    const pendingSubscriptions = pendingSubscriptionsRef.current
    const pendingScreenSubscriptions = pendingScreenSubscriptionsRef.current
    const subscriptionRetryTimers = subscriptionRetryTimersRef.current
    const subscriptionTrackWatchdogs = subscriptionTrackWatchdogsRef.current
    const screenSubscriptionRetryTimers =
      screenSubscriptionRetryTimersRef.current
    const screenSubscriptionTrackWatchdogs =
      screenSubscriptionTrackWatchdogsRef.current
    const desiredRemoteMemberIds = desiredRemoteMemberIdsRef.current
    const desiredRemoteScreenMemberIds =
      desiredRemoteScreenMemberIdsRef.current

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
      pendingSubscriptions.clear()
      desiredRemoteMemberIds.clear()
      for (const timerId of subscriptionRetryTimers.values()) {
        window.clearTimeout(timerId)
      }
      subscriptionRetryTimers.clear()
      for (const timerId of subscriptionTrackWatchdogs.values()) {
        window.clearTimeout(timerId)
      }
      subscriptionTrackWatchdogs.clear()
      for (const session of screenSubscriptions.values()) {
        void session.close()
      }
      screenSubscriptions.clear()
      pendingScreenSubscriptions.clear()
      desiredRemoteScreenMemberIds.clear()
      for (const timerId of screenSubscriptionRetryTimers.values()) {
        window.clearTimeout(timerId)
      }
      screenSubscriptionRetryTimers.clear()
      for (const timerId of screenSubscriptionTrackWatchdogs.values()) {
        window.clearTimeout(timerId)
      }
      screenSubscriptionTrackWatchdogs.clear()
      stopLocalMedia(currentLocalStream)
      stopLocalMedia(currentScreenStream)
    }
  }, [closePublishSession, closeScreenPublishSession])

  useEffect(() => {
    void refreshDevices()
  }, [refreshDevices])

  const identifyDevices = useCallback(async () => {
    if (isIdentifyingDevices) {
      return
    }

    setIsIdentifyingDevices(true)
    setMediaErrorMessage(null)
    try {
      const permissionStream = await startLocalMedia()
      stopLocalMedia(permissionStream)
      await refreshDevices()
      if (mountedRef.current) {
        setStatusMessage('设备名称已更新，请选择后再启动音视频设备。')
      }
    } catch (error) {
      if (mountedRef.current) {
        setMediaErrorMessage(getLocalMediaErrorMessage(error))
      }
    } finally {
      if (mountedRef.current) {
        setIsIdentifyingDevices(false)
      }
    }
  }, [isIdentifyingDevices, refreshDevices])

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
      const nextCameraEnabled = nextStream.getVideoTracks().length > 0
      const nextMicrophoneEnabled = nextStream.getAudioTracks().length > 0
      setCameraEnabled(nextCameraEnabled)
      setMicrophoneEnabled(nextMicrophoneEnabled)
      notifyMediaStateChange(nextCameraEnabled, nextMicrophoneEnabled)
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
    notifyMediaStateChange,
    publishLocalStream,
    refreshDevices,
    selectedCameraId,
    selectedMicrophoneId,
  ])

  useEffect(() => {
    if (memberId === null || sessionToken === null) {
      desiredRemoteMemberIdsRef.current.clear()
      return
    }

    const desiredMemberIds = new Set(
      remoteMemberIds.filter((remoteMemberId) => remoteMemberId !== memberId),
    )
    desiredRemoteMemberIdsRef.current = desiredMemberIds
    for (const [remoteMemberId, session] of subscriptionsRef.current) {
      if (!desiredMemberIds.has(remoteMemberId)) {
        clearTrackWatchdog(
          subscriptionTrackWatchdogsRef,
          remoteMemberId,
        )
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
      if (pendingSubscriptionsRef.current.has(remoteMemberId)) {
        continue
      }

      pendingSubscriptionsRef.current.add(remoteMemberId)
      void subscribeWhep({
        roomId,
        memberId,
        streamMemberId: remoteMemberId,
        sessionToken,
      })
        .then((session) => {
          pendingSubscriptionsRef.current.delete(remoteMemberId)
          if (
            !mountedRef.current ||
            !desiredRemoteMemberIdsRef.current.has(remoteMemberId) ||
            subscriptionsRef.current.has(remoteMemberId)
          ) {
            void session.close()
            return
          }
          subscriptionsRef.current.set(remoteMemberId, session)
          setRemoteStreams((currentStreams) => ({
            ...currentStreams,
            [remoteMemberId]: session.stream,
          }))
          let disconnectTimer: number | null = null
          const retrySubscription = () => {
            clearTrackWatchdog(
              subscriptionTrackWatchdogsRef,
              remoteMemberId,
            )
            if (disconnectTimer !== null) {
              window.clearTimeout(disconnectTimer)
              disconnectTimer = null
            }
            if (subscriptionsRef.current.get(remoteMemberId) !== session) {
              return
            }
            subscriptionsRef.current.delete(remoteMemberId)
            void session.close()
            setRemoteStreams((currentStreams) => {
              const { [remoteMemberId]: _, ...remainingStreams } = currentStreams
              return remainingStreams
            })
            scheduleSubscriptionRetry(remoteMemberId)
          }
          session.connection.addEventListener('connectionstatechange', () => {
            if (!mountedRef.current) {
              return
            }
            const connectionState = session.connection.connectionState
            if (connectionState === 'failed') {
              retrySubscription()
            }
            if (connectionState === 'disconnected') {
              // disconnected 通常是 ICE 切换等临时状态，放宽窗口等待恢复。
              if (disconnectTimer === null) {
                disconnectTimer = window.setTimeout(
                  retrySubscription,
                  remoteDisconnectedRetryTimeoutMs,
                )
              }
            }
            if (
              connectionState === 'connecting' ||
              connectionState === 'connected'
            ) {
              if (disconnectTimer !== null) {
                window.clearTimeout(disconnectTimer)
                disconnectTimer = null
              }
            }
          })
          // WHEP 完成协商但 Live777 尚未转发视频时，按连接状态判断而不是
          // 盲目重订阅：只有连接已 connected 且 15s 内仍未收到视频轨才恢复。
          armVideoTrackWatchdog(
            subscriptionTrackWatchdogsRef,
            remoteMemberId,
            session.stream,
            () => {
              if (
                mountedRef.current &&
                subscriptionsRef.current.get(remoteMemberId) === session &&
                session.connection.connectionState === 'connected' &&
                session.stream.getVideoTracks().length === 0
              ) {
                retrySubscription()
              }
            },
          )
        })
        .catch((error: unknown) => {
          pendingSubscriptionsRef.current.delete(remoteMemberId)
          if (mountedRef.current) {
            setMediaErrorMessage(getMeetingMediaErrorMessage(error))
            scheduleSubscriptionRetry(remoteMemberId)
          }
        })
    }
  }, [
    armVideoTrackWatchdog,
    clearTrackWatchdog,
    memberId,
    remoteMemberIds,
    roomId,
    scheduleSubscriptionRetry,
    sessionToken,
    subscriptionRetryVersion,
  ])

  useEffect(() => {
    if (memberId === null || sessionToken === null) {
      desiredRemoteScreenMemberIdsRef.current.clear()
      return
    }

    const desiredMemberIds = new Set(
      remoteScreenMemberIds.filter((remoteMemberId) => remoteMemberId !== memberId),
    )
    desiredRemoteScreenMemberIdsRef.current = desiredMemberIds
    for (const [remoteMemberId, session] of screenSubscriptionsRef.current) {
      if (!desiredMemberIds.has(remoteMemberId)) {
        clearTrackWatchdog(
          screenSubscriptionTrackWatchdogsRef,
          remoteMemberId,
        )
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
      if (pendingScreenSubscriptionsRef.current.has(remoteMemberId)) {
        continue
      }

      pendingScreenSubscriptionsRef.current.add(remoteMemberId)
      void subscribeWhep({
        roomId,
        memberId,
        sessionToken,
        streamKind: 'screen',
        streamMemberId: remoteMemberId,
      })
        .then((session) => {
          pendingScreenSubscriptionsRef.current.delete(remoteMemberId)
          if (
            !mountedRef.current ||
            !desiredRemoteScreenMemberIdsRef.current.has(remoteMemberId) ||
            screenSubscriptionsRef.current.has(remoteMemberId)
          ) {
            void session.close()
            return
          }
          screenSubscriptionsRef.current.set(remoteMemberId, session)
          setRemoteScreenStreams((streams) => ({
            ...streams,
            [remoteMemberId]: session.stream,
          }))
          let disconnectTimer: number | null = null
          const retryScreenSubscription = () => {
            clearTrackWatchdog(
              screenSubscriptionTrackWatchdogsRef,
              remoteMemberId,
            )
            if (disconnectTimer !== null) {
              window.clearTimeout(disconnectTimer)
              disconnectTimer = null
            }
            if (
              screenSubscriptionsRef.current.get(remoteMemberId) !== session
            ) {
              return
            }
            screenSubscriptionsRef.current.delete(remoteMemberId)
            void session.close()
            setRemoteScreenStreams((streams) => {
              const { [remoteMemberId]: _, ...remainingStreams } = streams
              return remainingStreams
            })
            scheduleScreenSubscriptionRetry(remoteMemberId)
          }
          session.connection.addEventListener('connectionstatechange', () => {
            if (!mountedRef.current) {
              return
            }
            const connectionState = session.connection.connectionState
            if (connectionState === 'failed') {
              retryScreenSubscription()
            }
            if (connectionState === 'disconnected') {
              // disconnected 通常是 ICE 切换等临时状态，放宽窗口等待恢复。
              if (disconnectTimer === null) {
                disconnectTimer = window.setTimeout(
                  retryScreenSubscription,
                  remoteDisconnectedRetryTimeoutMs,
                )
              }
            }
            if (
              connectionState === 'connecting' ||
              connectionState === 'connected'
            ) {
              if (disconnectTimer !== null) {
                window.clearTimeout(disconnectTimer)
                disconnectTimer = null
              }
            }
          })
          // WHEP 完成协商但 Live777 尚未转发视频时，按连接状态判断而不是
          // 盲目重订阅：只有连接已 connected 且 15s 内仍未收到视频轨才恢复。
          armVideoTrackWatchdog(
            screenSubscriptionTrackWatchdogsRef,
            remoteMemberId,
            session.stream,
            () => {
              if (
                mountedRef.current &&
                screenSubscriptionsRef.current.get(remoteMemberId) === session &&
                session.connection.connectionState === 'connected' &&
                session.stream.getVideoTracks().length === 0
              ) {
                retryScreenSubscription()
              }
            },
          )
        })
        .catch((error: unknown) => {
          pendingScreenSubscriptionsRef.current.delete(remoteMemberId)
          if (mountedRef.current) {
            setScreenErrorMessage(getMeetingMediaErrorMessage(error))
            scheduleScreenSubscriptionRetry(remoteMemberId)
          }
        })
    }
  }, [
    armVideoTrackWatchdog,
    clearTrackWatchdog,
    memberId,
    remoteScreenMemberIds,
    roomId,
    scheduleScreenSubscriptionRetry,
    sessionToken,
    subscriptionRetryVersion,
  ])

  const toggleCamera = useCallback(() => {
    const currentStream = localStreamRef.current

    if (currentStream === null) {
      return
    }

    const nextEnabled = !cameraEnabled

    setLocalTrackEnabled(currentStream, 'video', nextEnabled)
    setCameraEnabled(nextEnabled)
    notifyMediaStateChange(nextEnabled, microphoneEnabled)
  }, [cameraEnabled, microphoneEnabled, notifyMediaStateChange])

  const toggleMicrophone = useCallback(() => {
    const currentStream = localStreamRef.current

    if (currentStream === null) {
      return
    }

    const nextEnabled = !microphoneEnabled

    setLocalTrackEnabled(currentStream, 'audio', nextEnabled)
    setMicrophoneEnabled(nextEnabled)
    notifyMediaStateChange(cameraEnabled, nextEnabled)
  }, [cameraEnabled, microphoneEnabled, notifyMediaStateChange])

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
          closeScreenPublishSession()
          setScreenStream(null)
          setScreenInfo(null)
          setScreenErrorMessage(null)
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
  }, [closeScreenPublishSession, isStartingScreenShare, publishScreenStream])

  return {
    cameraEnabled,
    cameraMirrored,
    connectionStatus,
    devices,
    identifyDevices,
    isIdentifyingDevices,
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
