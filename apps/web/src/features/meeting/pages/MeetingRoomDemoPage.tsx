import {
  useEffect,
  useRef,
  useState,
} from 'react'
import { useMeetingLocalMedia } from '../hooks/useMeetingLocalMedia'

type LayoutMode = 'grid' | 'focus'

interface DemoMember {
  cameraEnabled: boolean
  id: string
  initial: string
  microphoneEnabled: boolean
  name: string
  role: '主持人' | '参会者'
}

const demoMembers: DemoMember[] = [
  {
    cameraEnabled: true,
    id: 'local',
    initial: '李',
    microphoneEnabled: true,
    name: '李建明（我）',
    role: '参会者',
  },
  {
    cameraEnabled: true,
    id: 'host',
    initial: '张',
    microphoneEnabled: true,
    name: '张组长',
    role: '主持人',
  },
  {
    cameraEnabled: false,
    id: 'member-a',
    initial: '王',
    microphoneEnabled: false,
    name: '王同学',
    role: '参会者',
  },
  {
    cameraEnabled: false,
    id: 'member-b',
    initial: '陈',
    microphoneEnabled: true,
    name: '陈同学',
    role: '参会者',
  },
]

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

interface MemberTileProps {
  isPrimary: boolean
  isPinned: boolean
  member: DemoMember
  mirrored: boolean
  onTogglePin: () => void
  stream: MediaStream | null
}

function MemberTile({
  isPrimary,
  isPinned,
  member,
  mirrored,
  onTogglePin,
  stream,
}: MemberTileProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const video = videoRef.current

    if (video === null) {
      return
    }

    video.srcObject = stream

    return () => {
      video.srcObject = null
    }
  }, [member.cameraEnabled, stream])

  return (
    <article
      className={`relative min-h-52 overflow-hidden rounded-box border bg-neutral text-neutral-content ${
        isPrimary
          ? 'border-primary sm:col-span-2 xl:col-span-3'
          : 'border-neutral-content/10'
      }`}
    >
      <div className="flex min-h-52 items-center justify-center bg-gradient-to-br from-neutral to-neutral/80 p-6">
        {stream !== null && member.cameraEnabled ? (
          <video
            ref={videoRef}
            aria-label={`${member.name}的真实摄像头画面`}
            autoPlay
            className={
              mirrored
                ? 'absolute inset-0 h-full w-full -scale-x-100 object-cover'
                : 'absolute inset-0 h-full w-full object-cover'
            }
            muted
            playsInline
          />
        ) : (
          <div className="text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary text-3xl font-bold text-primary-content">
              {member.initial}
            </div>

            <p className="mt-4 text-sm text-neutral-content/70">
              {member.id === 'local'
                ? stream === null
                  ? '尚未启动真实设备'
                  : '摄像头已关闭'
                : member.cameraEnabled
                  ? '远端画面模拟占位'
                  : '摄像头已关闭'}
            </p>
          </div>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 px-3 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate rounded-full bg-black/55 px-3 py-1.5 text-sm font-medium text-white">
            {member.name}
          </p>
          <MediaStatusIcons
            cameraEnabled={member.cameraEnabled}
            microphoneEnabled={member.microphoneEnabled}
          />
        </div>

        <button
          aria-label={
            isPinned
              ? `取消将${member.name}设为主画面`
              : `将${member.name}设为主画面`
          }
          aria-pressed={isPinned}
          className={
            isPinned
              ? 'btn btn-primary btn-xs'
              : 'btn btn-neutral btn-xs'
          }
          onClick={onTogglePin}
          type="button"
        >
          {isPinned ? '主画面' : '设为主画面'}
        </button>
      </div>
    </article>
  )
}

interface ScreenShareTileProps {
  isPinned: boolean
  onTogglePin: () => void
}

function ScreenShareTile({
  isPinned,
  onTogglePin,
}: ScreenShareTileProps) {
  return (
    <article className="relative min-h-72 overflow-hidden rounded-box border border-primary bg-neutral sm:col-span-2 xl:col-span-3">
      <div className="absolute inset-5 bottom-16 grid grid-cols-[5rem_minmax(0,1fr)] gap-4 rounded-box bg-base-100 p-5 text-base-content">
        <div className="rounded-box bg-primary/15" />

        <div className="flex flex-col justify-center gap-3">
          <div className="h-4 w-2/3 rounded-full bg-base-300" />
          <div className="h-3 w-full rounded-full bg-base-300" />
          <div className="h-3 w-5/6 rounded-full bg-base-300" />
          <div className="h-24 rounded-box bg-base-200" />
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 px-3 py-3 text-white">
        <div className="rounded-box bg-black/55 px-3 py-2">
          <p className="text-sm font-medium">张组长的屏幕共享</p>
          <p className="text-xs text-white/70">已自动设为主画面</p>
        </div>

        <button
          aria-label={
            isPinned
              ? '取消将张组长的屏幕共享设为主画面'
              : '将张组长的屏幕共享设为主画面'
          }
          aria-pressed={isPinned}
          className={
            isPinned
              ? 'btn btn-primary btn-xs'
              : 'btn btn-ghost btn-xs text-white'
          }
          onClick={onTogglePin}
          type="button"
        >
          {isPinned ? '主画面' : '设为主画面'}
        </button>
      </div>
    </article>
  )
}

export function MeetingRoomDemoPage() {
  const media = useMeetingLocalMedia({
    memberId: null,
    remoteMemberIds: [],
    remoteScreenMemberIds: [],
    roomId: 'demo-room',
    sessionToken: null,
  })
  const [layoutMode, setLayoutMode] =
    useState<LayoutMode>('grid')
  const [pinnedTileId, setPinnedTileId] =
    useState<string | null>(null)
  const [screenSharing, setScreenSharing] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [membersOpen, setMembersOpen] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [leaveDialogOpen, setLeaveDialogOpen] =
    useState(false)
  const [hasLeft, setHasLeft] = useState(false)

  const cameraTrack = media.localStream?.getVideoTracks()[0]
  const microphoneTrack =
    media.localStream?.getAudioTracks()[0]

  const effectiveLayout =
    layoutMode === 'focus' || screenSharing
      ? 'focus'
      : 'grid'

  const primaryTileId =
    pinnedTileId ?? (screenSharing ? 'screen' : 'local')

  function togglePin(tileId: string) {
    setPinnedTileId((currentId) =>
      currentId === tileId ? null : tileId,
    )
  }

  if (hasLeft) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <section className="card w-full max-w-lg bg-base-100 shadow-xl">
          <div className="card-body text-center">
            <h1 className="text-2xl font-bold">你已离开会议</h1>
            <p className="text-base-content/70">
              这是界面演示，没有调用真实离开会议接口。
            </p>
            <div className="card-actions mt-4 justify-center">
              <button
                className="btn btn-primary"
                onClick={() => {
                  setHasLeft(false)
                }}
                type="button"
              >
                重新进入演示
              </button>
              <a className="btn btn-ghost" href="#/">
                返回首页
              </a>
            </div>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="flex flex-1 px-4 py-6 sm:px-8">
      <section className="mx-auto w-full max-w-7xl">
        <div className="alert alert-warning mb-5" role="status">
          <span>
            真实设备演示：本地摄像头和麦克风来自当前电脑；远端成员、屏幕共享画面和网络状态为模拟数据，不会请求 API 或 Live777。
          </span>
        </div>

        <header className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-3xl font-bold">
              MeetNexus 项目例会
            </h1>
            <p className="mt-1 text-sm text-base-content/60">
              会议号：11111111-1111-4111-8111-111111111111
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="badge badge-success">
              媒体连接正常
            </span>
            <span className="badge badge-neutral">4 人在线</span>
          </div>
        </header>

        <div
          className={
            expanded || !membersOpen
              ? 'grid gap-5'
              : 'grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]'
          }
        >
          <section className="card min-w-0 bg-base-100 shadow-xl">
            <div className="card-body p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
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
                  {pinnedTileId !== null && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setPinnedTileId(null)
                      }}
                      type="button"
                    >
                      取消主画面
                    </button>
                  )}

                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => {
                      setExpanded((current) => !current)
                    }}
                    type="button"
                  >
                    {expanded ? '退出展开' : '展开画面'}
                  </button>
                </div>
              </div>

              {screenSharing && (
                <div className="alert alert-info mt-4 py-2" role="status">
                  <span>
                    检测到屏幕共享，已自动将共享内容设为主画面。
                  </span>
                </div>
              )}

              <div
                className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
                data-layout={effectiveLayout}
              >
                {screenSharing && (
                  <ScreenShareTile
                    isPinned={pinnedTileId === 'screen'}
                    onTogglePin={() => {
                      togglePin('screen')
                    }}
                  />
                )}

                {demoMembers.map((member) => {
                  const currentMember =
                    member.id === 'local'
                      ? {
                          ...member,
                          cameraEnabled: media.cameraEnabled,
                          microphoneEnabled: media.microphoneEnabled,
                        }
                      : member

                  return (
                    <MemberTile
                      isPinned={pinnedTileId === member.id}
                      isPrimary={
                        effectiveLayout === 'focus' &&
                        primaryTileId === member.id
                      }
                      key={member.id}
                      member={currentMember}
                      mirrored={
                        member.id === 'local' && media.cameraMirrored
                      }
                      onTogglePin={() => {
                        togglePin(member.id)
                      }}
                      stream={member.id === 'local' ? media.localStream : null}
                    />
                  )
                })}
              </div>
            </div>
          </section>

          {media.mediaErrorMessage !== null && (
            <div className="alert alert-error" role="alert">
              <span>{media.mediaErrorMessage}</span>
            </div>
          )}

          {media.statusMessage !== null && (
            <div
              aria-live="polite"
              className="alert alert-info"
              role="status"
            >
              <span>{media.statusMessage}</span>
            </div>
          )}

          {!expanded && membersOpen && (
            <aside className="card bg-base-100 shadow-xl">
              <div className="card-body p-5">
                <div className="flex items-center justify-between">
                  <h2 className="card-title">参会成员</h2>
                  <span className="badge badge-neutral">4 人</span>
                </div>

                <ul aria-label="演示参会成员" className="space-y-2">
                  {demoMembers.map((member) => {
                    const cameraEnabled =
                      member.id === 'local'
                        ? media.cameraEnabled
                        : member.cameraEnabled
                    const microphoneEnabled =
                      member.id === 'local'
                        ? media.microphoneEnabled
                        : member.microphoneEnabled

                    return (
                      <li
                        className="flex items-center justify-between gap-3 border-b border-base-300 py-3 last:border-0"
                        key={member.id}
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {member.name}
                          </p>
                          <p className="text-xs text-base-content/60">
                            {member.role}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <MediaStatusIcons
                            cameraEnabled={cameraEnabled}
                            microphoneEnabled={microphoneEnabled}
                          />
                          <span className="badge badge-success badge-sm">
                            在线
                          </span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </aside>
          )}
        </div>

        {settingsOpen && (
          <section className="card mt-5 bg-base-100 shadow-xl">
            <div className="card-body">
              <div className="flex items-center justify-between gap-3">
                <h2 className="card-title">真实设备信息</h2>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setSettingsOpen(false)
                  }}
                  type="button"
                >
                  关闭
                </button>
              </div>

              {media.localStream === null ? (
                <p className="text-base-content/70">
                  请先点击“启动真实摄像头和麦克风”，允许权限后将显示当前实际设备名称。
                </p>
              ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-box border border-base-300 p-4">
                  <p className="text-sm text-base-content/60">
                    当前摄像头
                  </p>
                  <p className="mt-1 break-all font-medium">
                    {cameraTrack?.label || '浏览器未提供设备名称'}
                  </p>
                </div>

                <div className="rounded-box border border-base-300 p-4">
                  <p className="text-sm text-base-content/60">
                    当前麦克风
                  </p>
                  <p className="mt-1 break-all font-medium">
                    {microphoneTrack?.label || '浏览器未提供设备名称'}
                  </p>
                </div>
              </div>
              )}
            </div>
          </section>
        )}

        <nav
          aria-label="演示会议控制栏"
          className="card mt-5 bg-base-100 shadow-xl"
        >
          <div className="card-body flex-row flex-wrap justify-center p-4">
            {media.localStream === null ? (
              <button
                className="btn btn-primary"
                disabled={media.isStartingDevices}
                onClick={() => {
                  void media.startDevices()
                }}
                type="button"
              >
                {media.isStartingDevices
                  ? '正在请求设备权限……'
                  : '启动真实摄像头和麦克风'}
              </button>
            ) : (
              <>
                <button
                  aria-pressed={media.microphoneEnabled}
                  className={
                    media.microphoneEnabled
                      ? 'btn btn-success'
                      : 'btn btn-outline'
                  }
                  onClick={media.toggleMicrophone}
                  type="button"
                >
                  {media.microphoneEnabled
                    ? '关闭麦克风'
                    : '打开麦克风'}
                </button>

                <button
                  aria-pressed={media.cameraEnabled}
                  className={
                    media.cameraEnabled
                      ? 'btn btn-success'
                      : 'btn btn-outline'
                  }
                  onClick={media.toggleCamera}
                  type="button"
                >
                  {media.cameraEnabled
                    ? '关闭摄像头'
                    : '打开摄像头'}
                </button>

                <button
                  aria-pressed={media.cameraMirrored}
                  className="btn btn-outline"
                  disabled={!media.cameraEnabled}
                  onClick={media.toggleMirror}
                  type="button"
                >
                  {media.cameraMirrored
                    ? '关闭镜像'
                    : '开启镜像'}
                </button>

                <button
                  className="btn btn-ghost"
                  onClick={media.stopDevices}
                  type="button"
                >
                  释放真实设备
                </button>
              </>
            )}

            <button
              aria-pressed={screenSharing}
              className={
                screenSharing
                  ? 'btn btn-error'
                  : 'btn btn-secondary'
              }
              onClick={() => {
                setScreenSharing((current) => !current)
                if (screenSharing && pinnedTileId === 'screen') {
                  setPinnedTileId(null)
                }
              }}
              type="button"
            >
              {screenSharing
                ? '停止模拟屏幕共享'
                : '演示屏幕共享布局'}
            </button>

            <button
              aria-expanded={settingsOpen}
              className="btn btn-outline"
              onClick={() => {
                setSettingsOpen((current) => !current)
              }}
              type="button"
            >
              设备设置
            </button>

            <button
              aria-pressed={membersOpen}
              className="btn btn-outline"
              onClick={() => {
                setMembersOpen((current) => !current)
              }}
              type="button"
            >
              {membersOpen ? '隐藏成员' : '显示成员'}
            </button>

            <button
              className="btn btn-error"
              onClick={() => {
                setLeaveDialogOpen(true)
              }}
              type="button"
            >
              离开会议
            </button>
          </div>
        </nav>

        <dialog
          aria-labelledby="demo-leave-title"
          className={
            leaveDialogOpen ? 'modal modal-open' : 'modal'
          }
          onCancel={(event) => {
            event.preventDefault()
            setLeaveDialogOpen(false)
          }}
          open={leaveDialogOpen}
        >
          <div className="modal-box">
            <h2
              className="text-xl font-bold"
              id="demo-leave-title"
            >
              确认离开会议
            </h2>
            <p className="mt-3 text-base-content/70">
              离开后，本机摄像头、麦克风和屏幕共享将停止。你可以之后重新加入会议。
            </p>
            <div className="modal-action">
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setLeaveDialogOpen(false)
                }}
                type="button"
              >
                继续参会
              </button>
              <button
                className="btn btn-error"
                onClick={() => {
                  media.stopAllMedia()
                  setLeaveDialogOpen(false)
                  setHasLeft(true)
                }}
                type="button"
              >
                确认离开
              </button>
            </div>
          </div>
        </dialog>
      </section>
    </main>
  )
}
