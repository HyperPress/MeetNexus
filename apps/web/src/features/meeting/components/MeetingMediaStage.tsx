import { useMeetingLocalMedia } from '../hooks/useMeetingLocalMedia'
import { MeetingMediaGrid } from './MeetingMediaGrid'
import { ScreenSharePreview } from './ScreenSharePreview'

interface MeetingMediaStageProps {
  canControlMedia: boolean
  displayName: string
}

export function MeetingMediaStage({
  canControlMedia,
  displayName,
}: MeetingMediaStageProps) {
  const media = useMeetingLocalMedia()

  const hasLocalDevices = media.localStream !== null
  const isSharingScreen = media.screenStream !== null

  return (
    <section className="space-y-5">
      <section
        aria-label="会议画面"
        className="card bg-neutral text-neutral-content shadow-xl"
      >
        <div className="card-body gap-4 p-4 sm:p-6">
          <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="card-title text-neutral-content">
                会议画面
              </h2>
              <p className="mt-1 text-sm text-neutral-content/70">
                当前展示本机真实摄像头和屏幕共享预览；远端音视频将在媒体链路接入后显示。
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isSharingScreen && (
                <span className="badge badge-secondary">
                  正在共享屏幕
                </span>
              )}
              <span className="badge badge-warning">
                仅本地预览
              </span>
            </div>
          </header>

          <MeetingMediaGrid
            cameraEnabled={media.cameraEnabled}
            displayName={displayName}
            localStream={media.localStream}
            microphoneEnabled={media.microphoneEnabled}
            mirrored={media.cameraMirrored}
            remoteMembers={[]}
            remoteScreenStreams={{}}
            remoteStreams={{}}
            screenStream={media.screenStream}
          />
        </div>
      </section>

      <section
        aria-label="会议媒体控制"
        className="card bg-base-100 shadow-xl"
      >
        <div className="card-body gap-5">
          <div>
            <h2 className="card-title">音视频控制</h2>
            <p className="mt-1 text-sm text-base-content/65">
              只有当前房间成员可以操作并预览本机媒体设备。
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-3 rounded-box bg-base-200 p-4">
            {!hasLocalDevices ? (
              <button
                className="btn btn-primary"
                disabled={
                  !canControlMedia || media.isStartingDevices
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
                      : 'btn btn-error btn-outline'
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
                      : 'btn btn-error btn-outline'
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

            {!isSharingScreen ? (
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
            <div className="alert alert-warning" role="alert">
              <span>
                当前浏览器没有该房间的成员身份，不能使用会议媒体控制。
              </span>
            </div>
          )}

          {media.mediaErrorMessage !== null && (
            <div className="alert alert-error" role="alert">
              <span>{media.mediaErrorMessage}</span>
            </div>
          )}

          {media.screenErrorMessage !== null && (
            <div className="alert alert-error" role="alert">
              <span>{media.screenErrorMessage}</span>
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

          <p className="text-center text-xs leading-5 text-base-content/60">
            当前音视频与屏幕共享只在本机预览，不会发送给其他成员，也不会直接访问
            Live777。
          </p>
        </div>
      </section>

      {isSharingScreen && (
        <details className="collapse-arrow collapse bg-base-100 shadow-xl">
          <summary className="collapse-title font-semibold">
            查看本地屏幕捕获详情
          </summary>
          <div className="collapse-content">
            <p className="mb-4 text-sm text-base-content/65">
              这里显示浏览器返回的共享画面和捕获参数，用于调试共享质量。
            </p>
            <ScreenSharePreview
              info={media.screenInfo}
              stream={media.screenStream}
            />
          </div>
        </details>
      )}
    </section>
  )
}
