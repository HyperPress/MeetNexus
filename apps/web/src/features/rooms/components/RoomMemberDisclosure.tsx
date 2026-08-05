import { useId, useState } from 'react'

export interface RoomMemberDisclosureItem {
  id: string
  displayName: string
  isCurrentMember?: boolean
  isHandRaised: boolean
  online: boolean
  roleLabel: string
  statusDetail?: string
}

interface RoomMemberDisclosureProps {
  listLabel?: string
  members: RoomMemberDisclosureItem[]
}

export function RoomMemberDisclosure({
  listLabel = '参会成员',
  members,
}: RoomMemberDisclosureProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const memberListId = useId()
  const onlineCount = members.filter((member) => member.online).length

  return (
    <section>
      <button
        aria-controls={memberListId}
        aria-expanded={isExpanded}
        className="flex w-full items-center justify-between gap-4 rounded-box border border-base-300 bg-base-200 px-4 py-3 text-left transition-colors hover:bg-base-300"
        onClick={() => {
          setIsExpanded((currentValue) => !currentValue)
        }}
        type="button"
      >
        <span>
          <span className="block font-semibold">参会成员</span>
          <span className="mt-0.5 block text-xs text-base-content/60">
            {onlineCount} 人在线
          </span>
        </span>

        <span className="flex items-center gap-2">
          <span className="badge badge-neutral">{onlineCount}</span>
          <span
            aria-hidden="true"
            className={`text-lg transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          >
            ⌄
          </span>
        </span>
      </button>

      {isExpanded && (
        <div className="mt-3" id={memberListId}>
          {members.length === 0 ? (
            <p className="py-6 text-center text-sm text-base-content/60">
              暂无成员
            </p>
          ) : (
            <ul
              aria-label={listLabel}
              className="max-h-72 space-y-2 overflow-y-auto pr-1"
            >
              {members.map((member) => (
                <li
                  className="rounded-box border border-base-300 bg-base-100 p-3"
                  key={member.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {member.displayName}
                        {member.isCurrentMember ? '（你）' : ''}
                      </p>
                      <p className="mt-1 text-xs text-base-content/60">
                        {member.roleLabel}
                      </p>
                      {member.statusDetail !== undefined && (
                        <p className="mt-1 text-xs text-base-content/60">
                          {member.statusDetail}
                        </p>
                      )}
                    </div>

                    <span
                      className={
                        member.online
                          ? 'badge badge-success badge-sm'
                          : 'badge badge-ghost badge-sm'
                      }
                    >
                      {member.online ? '在线' : '离线'}
                    </span>
                  </div>

                  {member.isHandRaised && (
                    <span className="badge badge-warning badge-sm mt-2">
                      ✋ 已举手
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
