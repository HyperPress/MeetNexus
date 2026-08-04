import { useEffect, useState } from 'react'
import { MeetingRoomDemoPage } from '../features/meeting/pages/MeetingRoomDemoPage'
import { PreJoinPage } from '../features/meeting/pages/PreJoinPage'
import { CreateRoomPage } from '../features/rooms/pages/CreateRoomPage'
import { HomePage } from '../features/rooms/pages/HomePage'
import { JoinRoomPage } from '../features/rooms/pages/JoinRoomPage'
import { RoomPage } from '../features/rooms/pages/RoomPage'
import { UuidSchema } from '../schemas/room'

type Route =
  | { name: 'home' }
  | { name: 'create' }
  | { name: 'join' }
  | { name: 'preview' }
  | { name: 'demoRoom' }
  | { name: 'room'; roomId: string }
  | { name: 'notFound' }

function readRoute(): Route {
  const path = window.location.hash.replace(/^#\/?/, '')

  if (path === '') {
    return { name: 'home' }
  }

  if (path === 'create') {
    return { name: 'create' }
  }

  if (path === 'join') {
    return { name: 'join' }
  }

  if (path === 'preview') {
    return { name: 'preview' }
  }

  if (path === 'demo-room') {
    return { name: 'demoRoom' }
  }

  const roomMatch = /^rooms\/([^/]+)$/.exec(path)
  const roomId = roomMatch?.[1]

  if (
    roomId !== undefined &&
    UuidSchema.safeParse(roomId).success
  ) {
    return {
      name: 'room',
      roomId,
    }
  }

  return { name: 'notFound' }
}

function NotFoundPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <section className="card w-full max-w-lg bg-base-100 shadow-xl">
        <div className="card-body text-center">
          <h1 className="text-3xl font-bold">页面不存在</h1>

          <p className="text-base-content/70">
            请检查访问地址，或返回 MeetNexus 首页。
          </p>

          <div className="card-actions mt-4 justify-center">
            <a className="btn btn-primary" href="#/">
              返回首页
            </a>
          </div>
        </div>
      </section>
    </main>
  )
}

export function AppRouter() {
  const [route, setRoute] = useState<Route>(readRoute)

  useEffect(() => {
    function handleHashChange() {
      setRoute(readRoute())
    }

    window.addEventListener('hashchange', handleHashChange)

    return () => {
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [])

  let page = <HomePage />

  if (route.name === 'create') {
    page = <CreateRoomPage />
  }

  if (route.name === 'join') {
    page = <JoinRoomPage />
  }

  if (route.name === 'preview') {
    page = <PreJoinPage />
  }

  if (route.name === 'demoRoom') {
    page = <MeetingRoomDemoPage />
  }

  if (route.name === 'room') {
    page = <RoomPage roomId={route.roomId} />
  }

  if (route.name === 'notFound') {
    page = <NotFoundPage />
  }

  return (
    <div className="flex min-h-screen flex-col bg-base-200">
      <header className="navbar border-b border-base-300 bg-base-100 px-4 sm:px-8">
        <div className="navbar-start">
          <a className="btn btn-ghost text-xl" href="#/">
            MeetNexus
          </a>
        </div>

        <nav
          aria-label="主要导航"
          className="navbar-end gap-1 sm:gap-2"
        >
          <a className="btn btn-ghost btn-sm sm:btn-md" href="#/">
            首页
          </a>

          <a className="btn btn-ghost btn-sm sm:btn-md" href="#/preview">
            设备检测
          </a>

          <a className="btn btn-ghost btn-sm sm:btn-md" href="#/create">
            创建会议
          </a>

          <a className="btn btn-primary btn-sm sm:btn-md" href="#/join">
            加入会议
          </a>
        </nav>
      </header>

      {page}

      <footer className="border-t border-base-300 bg-base-100 px-4 py-6 text-center text-sm text-base-content/60">
        MeetNexus 多人视频会议
      </footer>
    </div>
  )
}
