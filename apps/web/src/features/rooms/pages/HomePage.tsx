export function HomePage() {
  return (
    <main className="flex flex-1 items-center">
      <section className="hero px-4 py-16">
        <div className="hero-content max-w-5xl flex-col gap-12 lg:flex-row">
          <div className="max-w-2xl">
            <div className="badge badge-primary badge-outline mb-5">
              简单、清晰的多人视频会议
            </div>

            <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
              随时发起会议，
              <span className="text-primary">让沟通更简单</span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-8 text-base-content/70">
              MeetNexus 提供中文多人视频会议体验。你可以创建新会议，
              也可以使用会议号加入已有会议。
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
                  <p className="font-semibold">1. 创建会议</p>
                  <p className="mt-1 text-sm text-base-content/70">
                    填写会议主题和你的显示名称。
                  </p>
                </div>

                <div className="rounded-box bg-base-200 p-4">
                  <p className="font-semibold">2. 分享会议号</p>
                  <p className="mt-1 text-sm text-base-content/70">
                    将会议号发送给需要参会的成员。
                  </p>
                </div>

                <div className="rounded-box bg-base-200 p-4">
                  <p className="font-semibold">3. 加入会议</p>
                  <p className="mt-1 text-sm text-base-content/70">
                    参会成员输入会议号即可加入。
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