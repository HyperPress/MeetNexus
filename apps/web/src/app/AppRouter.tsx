import { useEffect, useState } from 'react'
import { PreJoinPage } from '../features/meeting/pages/PreJoinPage'
import { CreateRoomPage } from '../features/rooms/pages/CreateRoomPage'
import { HomePage } from '../features/rooms/pages/HomePage'
import { JoinRoomPage } from '../features/rooms/pages/JoinRoomPage'

type RouteName = 'home' | 'create' | 'join' | 'preview'

function readRoute(): RouteName {
  const route = window.location.hash.replace(/^#\/?/, '')

  if (route === 'create') {
    return 'create'
  }

  if (route === 'join') {
    return 'join'
  }

  if (route === 'preview') {
    return 'preview'
  }

  return 'home'
}

export function AppRouter() {
  const [route, setRoute] = useState<RouteName>(readRoute)

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

  if (route === 'create') {
    page = <CreateRoomPage />
  }

  if (route === 'join') {
    page = <JoinRoomPage />
  }

  if (route === 'preview') {
    page = <PreJoinPage />
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
