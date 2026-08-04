import { useMeetingLocalMedia } from '../hooks/useMeetingLocalMedia'
import { MeetingMediaGrid } from './MeetingMediaGrid'
import { ScreenSharePreview } from './ScreenSharePreview'

interface MeetingMediaStageProps {
  canControlMedia: boolean
  displayName: string
  memberId: string | null
  onMediaStateChange: (state: {
    cameraEnabled: boolean
    microphoneEnabled: boolean
  }) => void
  remoteMembers: Array<{
    cameraEnabled?: boolean
    displayName: string
    id: string
    microphoneEnabled?: boolean
  }>
  remoteScreenMemberIds: string[]
  roomId: string
  sessionToken: string | null
}

export function MeetingMediaStage({
  canControlMedia,
  displayName,
  memberId,
  onMediaStateChange,
  remoteMembers,
  remoteScreenMemberIds,
  roomId,
  sessionToken,
}: MeetingMediaStageProps) {
  const media = useMeetingLocalMedia({
    memberId,
    onMediaStateChange,
    remoteMemberIds: remoteMembers.map((member) => member.id),
    remoteScreenMemberIds,
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
            <MeetingMediaGrid
              cameraEnabled={media.cameraEnabled}
              displayName={displayName}
              localStream={media.localStream}
              microphoneEnabled={media.microphoneEnabled}
              mirrored={media.cameraMirrored}
              remoteMembers={remoteMembers}
              remoteScreenStreams={media.remoteScreenStreams}
              remoteStreams={media.remoteStreams}
              screenStream={media.screenStream}
            />
          </div>
        </div>
      </div>

      <div
        aria-label="会议媒体控制"
        className="card bg-base-100 shadow-xl"
      >
        <div className="card-body">
          {canControlMedia && media.localStream === null && (
            <section className="rounded-box border border-base-300 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">音视频设备</h3>
                  <p className="mt-1 text-sm text-base-content/70">
                    选择设备后再启动音视频。首次启动时浏览器会请求设备权限。
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn btn-outline btn-sm"
                    disabled={
                      media.isIdentifyingDevices ||
                      media.isRefreshingDevices
                    }
                    onClick={() => {
                      void media.identifyDevices()
                    }}
                    type="button"
                  >
                    {media.isIdentifyingDevices
                      ? '正在识别…'
                      : '识别设备名称'}
                  </button>

                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={
                      media.isIdentifyingDevices ||
                      media.isRefreshingDevices
                    }
                    onClick={() => {
                      void media.refreshDevices()
                    }}
                    type="button"
                  >
                    {media.isRefreshingDevices ? '正在刷新…' : '刷新设备列表'}
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <fieldset className="fieldset">
                  <label
                    className="fieldset-legend"
                    htmlFor="meeting-camera-device"
                  >
                    摄像头设备
                  </label>
                  <select
                    className="select w-full"
                    disabled={
                      media.isRefreshingDevices ||
                      media.devices.cameras.length === 0
                    }
                    id="meeting-camera-device"
                    onChange={(event) => {
                      media.setSelectedCameraId(event.target.value)
                    }}
                    value={media.selectedCameraId}
                  >
                    <option value="">系统默认摄像头</option>
                    {media.devices.cameras.map((camera) => (
                      <option key={camera.deviceId} value={camera.deviceId}>
                        {camera.label}
                      </option>
                    ))}
                  </select>
                </fieldset>

                <fieldset className="fieldset">
                  <label
                    className="fieldset-legend"
                    htmlFor="meeting-microphone-device"
                  >
                    麦克风设备
                  </label>
                  <select
                    className="select w-full"
                    disabled={
                      media.isRefreshingDevices ||
                      media.devices.microphones.length === 0
                    }
                    id="meeting-microphone-device"
                    onChange={(event) => {
                      media.setSelectedMicrophoneId(event.target.value)
                    }}
                    value={media.selectedMicrophoneId}
                  >
                    <option value="">系统默认麦克风</option>
                    {media.devices.microphones.map((microphone) => (
                      <option
                        key={microphone.deviceId}
                        value={microphone.deviceId}
                      >
                        {microphone.label}
                      </option>
                    ))}
                  </select>
                </fieldset>
              </div>

              <p className="mt-3 text-xs text-base-content/60">
                首次使用请先点击“识别设备名称”并允许权限，以显示真实设备名称。设备启动后如需切换，请先释放音视频设备，再重新选择并启动。
              </p>
            </section>
          )}

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
            摄像头、麦克风和屏幕分享均通过 MeetNexus 的同源媒体代理发布；浏览器不会直接访问
            Live777。
          </p>
        </div>
      </div>

      {media.screenStream !== null && (
        <section className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">本地屏幕分享</h2>

            <p className="text-sm text-base-content/70">
              这是浏览器返回的共享画面和捕获信息；共享流会同时发布给会议中的其他成员。
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
