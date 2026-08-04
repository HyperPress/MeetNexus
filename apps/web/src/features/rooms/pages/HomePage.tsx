export function HomePage() {
  return (
    <main className="flex flex-1 items-center">
      <section className="hero px-4 py-16">
        <div className="hero-content max-w-5xl flex-col gap-12 lg:flex-row">
          <div className="max-w-2xl">
            <div className="badge badge-primary badge-outline mb-5">
              一站式在线会议与协作
            </div>

            <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
              让每一次连接，
              <span className="block text-primary">都更清晰高效</span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-8 text-base-content/70">
              MeetNexus 提供稳定的音视频会议、屏幕共享与录制能力。
              会前快速检测设备，一键创建或加入会议，让团队随时保持高效沟通。
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a className="btn btn-primary btn-lg" href="#/create">
                创建会议
              </a>

              <a className="btn btn-outline btn-lg" href="#/join">
                加入会议
              </a>
            </div>
          </div>

          <div className="card w-full max-w-md bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title text-2xl">开始使用 MeetNexus</h2>

              <div className="mt-4 space-y-4">
                <div className="rounded-box bg-base-200 p-4">
                  <p className="font-semibold">1. 填写房间信息</p>
                  <p className="mt-1 text-sm text-base-content/70">
                    在创建或加入页面检查会议主题、会议号和显示名称。
                  </p>
                </div>

                <div className="rounded-box bg-base-200 p-4">
                  <p className="font-semibold">2. 检查本地设备</p>
                  <p className="mt-1 text-sm text-base-content/70">
                    预览摄像头、麦克风和屏幕分享效果。
                  </p>
                </div>

                <div className="rounded-box bg-base-200 p-4">
                  <p className="font-semibold">3. 等待完整接入</p>
                  <p className="mt-1 text-sm text-base-content/70">
                    房间接口和多人音视频接入完成后，才可进行真实会议。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
