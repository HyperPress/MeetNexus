import { useMeetingLocalMedia } from '../hooks/useMeetingLocalMedia'
import { LocalVideoPreview } from './LocalVideoPreview'
import { RemoteVideoPreview } from './RemoteVideoPreview'
import { ScreenSharePreview } from './ScreenSharePreview'

interface MeetingMediaStageProps {
  canControlMedia: boolean
  displayName: string
  memberId: string | null
  remoteMembers: Array<{
    displayName: string
    id: string
  }>
  roomId: string
  sessionToken: string | null
}

export function MeetingMediaStage({
  canControlMedia,
  displayName,
  memberId,
  remoteMembers,
  roomId,
  sessionToken,
}: MeetingMediaStageProps) {
  const media = useMeetingLocalMedia({
    memberId,
    remoteMemberIds: remoteMembers.map((member) => member.id),
    roomId,
    sessionToken,
  })

  return (
    <section className="space-y-5">
      <div className="card bg-neutral text-neutral-content shadow-xl">
        <div className="card-body">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="card-title text-neutral-content">
                会议画面
              </h2>

              <p className="mt-1 text-sm text-neutral-content/70">
                通过同源 WHIP/WHEP 接入 Live777，远端成员加入后会显示在下方。
              </p>
            </div>

            <div className="badge badge-info">
              {media.connectionStatus}
            </div>
          </div>

          <div className="mt-4">
            <LocalVideoPreview
              cameraEnabled={media.cameraEnabled}
              mirrored={media.cameraMirrored}
              stream={media.localStream}
            />
          </div>

          {Object.entries(media.remoteStreams).length > 0 && (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {remoteMembers.map((member) => {
                const stream = media.remoteStreams[member.id]
                return stream === undefined ? null : (
                  <RemoteVideoPreview
                    displayName={member.displayName}
                    key={member.id}
                    stream={stream}
                  />
                )
              })}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-3 rounded-box bg-black/30 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-medium">
                {displayName}
              </p>

              <p className="text-xs text-neutral-content/60">
                {canControlMedia
                  ? '当前成员（本机）'
                  : '访客只读模式'}
              </p>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <span
                className={
                  media.microphoneEnabled
                    ? 'badge badge-success'
                    : 'badge badge-ghost'
                }
              >
                {media.microphoneEnabled
                  ? '麦克风开启'
                  : '麦克风关闭'}
              </span>

              <span
                className={
                  media.cameraEnabled
                    ? 'badge badge-success'
                    : 'badge badge-ghost'
                }
              >
                {media.cameraEnabled
                  ? '摄像头开启'
                  : '摄像头关闭'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div
        aria-label="会议媒体控制"
        className="card bg-base-100 shadow-xl"
      >
        <div className="card-body">
          <div className="flex flex-wrap justify-center gap-3">
            {media.localStream === null ? (
              <button
                className="btn btn-primary"
                disabled={
                  !canControlMedia ||
                  media.isStartingDevices
                }
                onClick={() => {
                  void media.startDevices()
                }}
                type="button"
              >
                {media.isStartingDevices
                  ? '正在启动设备……'
                  : '启动音视频设备'}
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
                  释放音视频设备
                </button>
              </>
            )}

            {media.screenStream === null ? (
              <button
                className="btn btn-secondary"
                disabled={
                  !canControlMedia ||
                  media.isStartingScreenShare
                }
                onClick={() => {
                  void media.startScreenSharing()
                }}
                type="button"
              >
                {media.isStartingScreenShare
                  ? '正在等待选择……'
                  : '共享屏幕'}
              </button>
            ) : (
              <button
                className="btn btn-error"
                onClick={media.stopScreenSharing}
                type="button"
              >
                停止共享屏幕
              </button>
            )}
          </div>

          {!canControlMedia && (
            <div className="alert alert-warning mt-4" role="alert">
              <span>
                当前浏览器没有该房间的成员身份，不能使用会议媒体控制。
              </span>
            </div>
          )}

          {media.mediaErrorMessage !== null && (
            <div className="alert alert-error mt-4" role="alert">
              <span>{media.mediaErrorMessage}</span>
            </div>
          )}

          {media.screenErrorMessage !== null && (
            <div className="alert alert-error mt-4" role="alert">
              <span>{media.screenErrorMessage}</span>
            </div>
          )}

          {media.statusMessage !== null && (
            <div
              aria-live="polite"
              className="alert alert-info mt-4"
              role="status"
            >
              <span>{media.statusMessage}</span>
            </div>
          )}

          <p className="mt-3 text-center text-xs leading-5 text-base-content/60">
            摄像头和麦克风通过 MeetNexus 的同源媒体代理发布；浏览器不会直接访问
            Live777。屏幕分享当前仍只用于本地预览。
          </p>
        </div>
      </div>

      {media.screenStream !== null && (
        <section className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">本地屏幕分享</h2>

            <p className="text-sm text-base-content/70">
              这是浏览器返回的共享画面和捕获信息，当前仅供本机检查。
            </p>

            <ScreenSharePreview
              info={media.screenInfo}
              stream={media.screenStream}
            />
          </div>
        </section>
      )}
    </section>
  )
}
