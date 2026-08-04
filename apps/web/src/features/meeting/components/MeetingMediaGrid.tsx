import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

type MeetingLayoutMode = 'grid' | 'focus'
type MeetingTileKind = 'camera' | 'screen'

interface RemoteMember {
  displayName: string
  id: string
}

interface MeetingMediaGridProps {
  cameraEnabled: boolean
  displayName: string
  localStream: MediaStream | null
  microphoneEnabled: boolean
  mirrored: boolean
  remoteMembers: RemoteMember[]
  remoteScreenStreams: Record<string, MediaStream>
  remoteStreams: Record<string, MediaStream>
  screenStream: MediaStream | null
}

interface MeetingTile {
  cameraEnabled: boolean
  id: string
  kind: MeetingTileKind
  label: string
  microphoneEnabled: boolean
  mirrored: boolean
  muted: boolean
  stream: MediaStream | null
  videoLabel: string
}

interface MediaIconProps {
  enabled: boolean
}

function MicrophoneIcon({ enabled }: MediaIconProps) {
  return (
    <span
      aria-label={enabled ? '麦克风开启' : '麦克风关闭'}
      className={enabled ? 'text-white' : 'text-error'}
      role="img"
    >
      <svg
        aria-hidden="true"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
      >
        <path
          d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        <path
          d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        {!enabled && (
          <path
            d="M3 3l18 18"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2.5"
          />
        )}
      </svg>
    </span>
  )
}

function CameraIcon({ enabled }: MediaIconProps) {
  return (
    <span
      aria-label={enabled ? '摄像头开启' : '摄像头关闭'}
      className={enabled ? 'text-white' : 'text-error'}
      role="img"
    >
      <svg
        aria-hidden="true"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
      >
        <path
          d="M15 8.5 20 6v12l-5-2.5M4 6h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        {!enabled && (
          <path
            d="M3 3l18 18"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2.5"
          />
        )}
      </svg>
    </span>
  )
}

function ScreenIcon() {
  return (
    <span aria-label="屏幕共享" className="text-white" role="img">
      <svg
        aria-hidden="true"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
      >
        <path
          d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM8 22h8M12 18v4"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    </span>
  )
}

interface MediaStatusIconsProps {
  cameraEnabled: boolean
  microphoneEnabled: boolean
}

function MediaStatusIcons({
  cameraEnabled,
  microphoneEnabled,
}: MediaStatusIconsProps) {
  return (
    <span
      aria-label="音视频设备状态"
      className="inline-flex items-center gap-2 rounded-full bg-black/55 px-2 py-1"
    >
      <MicrophoneIcon enabled={microphoneEnabled} />
      <CameraIcon enabled={cameraEnabled} />
    </span>
  )
}

interface MeetingVideoTileProps {
  className?: string
  isPrimary: boolean
  onSetPrimary: () => void
  tile: MeetingTile
}

function MeetingVideoTile({
  className = '',
  isPrimary,
  onSetPrimary,
  tile,
}: MeetingVideoTileProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaybackBlocked, setIsPlaybackBlocked] = useState(false)

  const tryToPlayAudio = useCallback((audio: HTMLAudioElement) => {
    void audio.play().then(
      () => {
        setIsPlaybackBlocked(false)
      },
      () => {
        if (!tile.muted) {
          setIsPlaybackBlocked(true)
        }
      },
    )
  }, [tile.muted])

  useEffect(() => {
    const video = videoRef.current
    const audio = audioRef.current

    if (video !== null) {
      video.srcObject = tile.stream
      void video.play().catch(() => {
        // 静音画面播放失败时不影响远端声音的单独授权。
      })
    }

    if (audio !== null) {
      audio.srcObject = tile.stream
      setIsPlaybackBlocked(false)
      tryToPlayAudio(audio)
    }

    return () => {
      if (video !== null) {
        video.srcObject = null
      }
      if (audio !== null) {
        audio.srcObject = null
      }
    }
  }, [tile.cameraEnabled, tile.stream, tryToPlayAudio])

  const firstCharacter = tile.label.trim().charAt(0) || '会'
  const showVideo =
    tile.stream !== null &&
    (tile.kind === 'screen' || tile.cameraEnabled)

  return (
    <article
      className={`relative min-h-52 overflow-hidden rounded-box border bg-neutral text-neutral-content ${
        isPrimary
          ? 'border-primary sm:col-span-2 xl:col-span-3'
          : 'border-neutral-content/10'
      } ${className}`}
      data-tile-id={tile.id}
      aria-label={`${tile.label}画面卡片`}
    >
      {showVideo ? (
        <video
          ref={videoRef}
          aria-label={tile.videoLabel}
          autoPlay
          className={
            tile.kind === 'screen'
              ? 'aspect-video h-full min-h-52 w-full bg-black object-contain'
              : tile.mirrored
                ? 'aspect-video h-full min-h-52 w-full -scale-x-100 object-cover'
                : 'aspect-video h-full min-h-52 w-full object-cover'
          }
          muted
          playsInline
        />
      ) : (
        <div className="flex aspect-video min-h-52 items-center justify-center p-6">
          <div className="text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary text-3xl font-bold text-primary-content">
              {firstCharacter}
            </div>
            <p className="mt-4 text-sm text-neutral-content/70">
              {tile.stream === null
                ? '暂无可用画面'
                : '摄像头已关闭'}
            </p>
          </div>
        </div>
      )}

      {tile.stream !== null && !tile.muted && (
        <audio
          ref={audioRef}
          aria-label={`${tile.label}的远端声音`}
          autoPlay
          className="hidden"
        />
      )}

      {isPlaybackBlocked && (
        <div className="absolute inset-x-3 top-3 z-10 flex justify-end">
          <button
            aria-label={`开启${tile.label}的声音`}
            className="btn btn-primary btn-sm"
            onClick={() => {
              const audio = audioRef.current

              if (audio !== null) {
                tryToPlayAudio(audio)
              }
            }}
            type="button"
          >
            点击开启声音
          </button>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 px-3 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate rounded-full bg-black/55 px-3 py-1.5 text-sm font-medium text-white">
            {tile.label}
          </p>

          {tile.kind === 'screen' ? (
            <span className="inline-flex rounded-full bg-black/55 px-2 py-1">
              <ScreenIcon />
            </span>
          ) : (
            <MediaStatusIcons
              cameraEnabled={tile.cameraEnabled}
              microphoneEnabled={tile.microphoneEnabled}
            />
          )}
        </div>

        {isPrimary ? (
          <span className="badge badge-primary badge-sm">
            主画面
          </span>
        ) : (
          <button
            aria-label={`将${tile.label}设为主画面`}
            className="btn btn-neutral btn-xs"
            onClick={onSetPrimary}
            type="button"
          >
            设为主画面
          </button>
        )}
      </div>
    </article>
  )
}

function hasLiveTrack(
  stream: MediaStream,
  kind: 'audio' | 'video',
): boolean {
  const tracks =
    kind === 'audio'
      ? stream.getAudioTracks()
      : stream.getVideoTracks()

  return tracks.some((track) => track.readyState === 'live')
}

export function MeetingMediaGrid({
  cameraEnabled,
  displayName,
  localStream,
  microphoneEnabled,
  mirrored,
  remoteMembers,
  remoteScreenStreams,
  remoteStreams,
  screenStream,
}: MeetingMediaGridProps) {
  const containerRef = useRef<HTMLElement | null>(null)
  const [layoutMode, setLayoutMode] =
    useState<MeetingLayoutMode>('grid')
  const [primaryTileId, setPrimaryTileId] =
    useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [fullscreenError, setFullscreenError] =
    useState<string | null>(null)

  const memberNames = useMemo(
    () =>
      new Map(
        remoteMembers.map((member) => [
          member.id,
          member.displayName,
        ]),
      ),
    [remoteMembers],
  )

  const tiles = useMemo<MeetingTile[]>(() => {
    const nextTiles: MeetingTile[] = [
      {
        cameraEnabled,
        id: 'local-camera',
        kind: 'camera',
        label: `${displayName}（我）`,
        microphoneEnabled,
        mirrored,
        muted: true,
        stream: localStream,
        videoLabel: '本地摄像头预览',
      },
    ]

    const knownRemoteMemberIds = new Set<string>()

    for (const member of remoteMembers) {
      knownRemoteMemberIds.add(member.id)
      const stream = remoteStreams[member.id] ?? null

      nextTiles.push({
        cameraEnabled:
          stream !== null && hasLiveTrack(stream, 'video'),
        id: `remote-camera-${member.id}`,
        kind: 'camera',
        label: member.displayName,
        microphoneEnabled:
          stream !== null && hasLiveTrack(stream, 'audio'),
        mirrored: false,
        muted: false,
        stream,
        videoLabel: `${member.displayName}的远端画面`,
      })
    }

    for (const [memberId, stream] of Object.entries(remoteStreams)) {
      if (knownRemoteMemberIds.has(memberId)) {
        continue
      }

      const fallbackName = `成员 ${memberId.slice(0, 8)}`
      nextTiles.push({
        cameraEnabled: hasLiveTrack(stream, 'video'),
        id: `remote-camera-${memberId}`,
        kind: 'camera',
        label: fallbackName,
        microphoneEnabled: hasLiveTrack(stream, 'audio'),
        mirrored: false,
        muted: false,
        stream,
        videoLabel: `${fallbackName}的远端画面`,
      })
    }

    if (screenStream !== null) {
      nextTiles.push({
        cameraEnabled: true,
        id: 'local-screen',
        kind: 'screen',
        label: `${displayName}的屏幕`,
        microphoneEnabled: false,
        mirrored: false,
        muted: true,
        stream: screenStream,
        videoLabel: `${displayName}的屏幕共享画面`,
      })
    }

    for (const [memberId, stream] of Object.entries(
      remoteScreenStreams,
    )) {
      const memberName =
        memberNames.get(memberId) ??
        `成员 ${memberId.slice(0, 8)}`

      nextTiles.push({
        cameraEnabled: true,
        id: `remote-screen-${memberId}`,
        kind: 'screen',
        label: `${memberName}的屏幕`,
        microphoneEnabled: false,
        mirrored: false,
        muted: false,
        stream,
        videoLabel: `${memberName}的屏幕共享画面`,
      })
    }

    return nextTiles
  }, [
    cameraEnabled,
    displayName,
    localStream,
    memberNames,
    microphoneEnabled,
    mirrored,
    remoteMembers,
    remoteScreenStreams,
    remoteStreams,
    screenStream,
  ])

  const selectedPrimaryTileId = tiles.some(
    (tile) => tile.id === primaryTileId,
  )
    ? primaryTileId
    : null

  const firstScreenTile = tiles.find(
    (tile) => tile.kind === 'screen',
  )

  const effectivePrimaryTileId =
    selectedPrimaryTileId ??
    firstScreenTile?.id ??
    tiles[0]?.id ??
    null

  const useFocusLayout =
    layoutMode === 'focus' || firstScreenTile !== undefined

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(
        document.fullscreenElement === containerRef.current,
      )
    }

    document.addEventListener(
      'fullscreenchange',
      handleFullscreenChange,
    )

    return () => {
      document.removeEventListener(
        'fullscreenchange',
        handleFullscreenChange,
      )
    }
  }, [])

  async function toggleFullscreen() {
    const container = containerRef.current

    if (container === null) {
      return
    }

    setFullscreenError(null)

    try {
      if (document.fullscreenElement === container) {
        await document.exitFullscreen()
        return
      }

      if (container.requestFullscreen === undefined) {
        setFullscreenError('当前浏览器不支持会议画面全屏。')
        return
      }

      await container.requestFullscreen()
    } catch {
      setFullscreenError(
        '无法进入全屏，请检查浏览器权限后重试。',
      )
    }
  }

  function togglePrimaryTile(tileId: string) {
    setPrimaryTileId((currentId) =>
      currentId === tileId ? null : tileId,
    )
    setLayoutMode('focus')
  }

  return (
    <section
      ref={containerRef}
      aria-label="会议画面区域"
      className="rounded-box bg-base-300 p-4"
    >
      <div
        aria-label="会议布局控制"
        className="mb-4 flex flex-wrap items-center justify-between gap-3"
      >
        <div className="join">
          <button
            aria-pressed={layoutMode === 'grid'}
            className={
              layoutMode === 'grid'
                ? 'btn btn-primary btn-sm join-item'
                : 'btn btn-sm join-item'
            }
            onClick={() => {
              setLayoutMode('grid')
            }}
            type="button"
          >
            宫格布局
          </button>

          <button
            aria-pressed={layoutMode === 'focus'}
            className={
              layoutMode === 'focus'
                ? 'btn btn-primary btn-sm join-item'
                : 'btn btn-sm join-item'
            }
            onClick={() => {
              setLayoutMode('focus')
            }}
            type="button"
          >
            主画面布局
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {selectedPrimaryTileId !== null && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setPrimaryTileId(null)
              }}
              type="button"
            >
              取消主画面
            </button>
          )}

          <button
            className="btn btn-outline btn-sm"
            onClick={() => {
              void toggleFullscreen()
            }}
            type="button"
          >
            {isFullscreen ? '退出全屏' : '全屏显示'}
          </button>
        </div>
      </div>

      {firstScreenTile !== undefined && (
        <div className="alert alert-info mb-4 py-2" role="status">
          <span>
            检测到屏幕共享，已自动将共享内容设为主画面。
          </span>
        </div>
      )}

      {fullscreenError !== null && (
        <div className="alert alert-error mb-4" role="alert">
          <span>{fullscreenError}</span>
        </div>
      )}

      <div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
        data-layout={useFocusLayout ? 'focus' : 'grid'}
      >
        {tiles.map((tile) => (
          <MeetingVideoTile
            isPrimary={
              useFocusLayout &&
              tile.id === effectivePrimaryTileId
            }
            key={tile.id}
            onSetPrimary={() => {
              togglePrimaryTile(tile.id)
            }}
            tile={tile}
          />
        ))}
      </div>
    </section>
  )
}
