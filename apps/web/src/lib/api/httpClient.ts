import type { ZodType } from 'zod'
import { ErrorResponseSchema } from '../../schemas/room'

export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly requestId: string | null

  constructor(
    message: string,
    code: string,
    status: number,
    requestId: string | null,
  ) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.requestId = requestId
  }
}

function createRequestHeaders(init: RequestInit): Headers {
  const headers = new Headers(init.headers)

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json')
  }

  if (
    init.body !== undefined &&
    init.body !== null &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json')
  }

  return headers
}

async function sendRequest(
  path: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetch(path, {
      ...init,
      headers: createRequestHeaders(init),
    })
  } catch {
    throw new ApiError(
      '无法连接会议服务，请确认后端服务已经启动。',
      'NETWORK_ERROR',
      0,
      null,
    )
  }
}

async function ensureSuccessfulResponse(
  response: Response,
): Promise<void> {
  if (response.ok) {
    return
  }

  let payload: unknown

  try {
    payload = await response.json()
  } catch {
    throw new ApiError(
      '服务器返回了无法识别的错误内容。',
      'INVALID_ERROR_RESPONSE',
      response.status,
      response.headers.get('X-Request-Id'),
    )
  }

  const result = ErrorResponseSchema.safeParse(payload)

  if (!result.success) {
    throw new ApiError(
      '服务器错误响应不符合 OpenAPI 契约。',
      'INVALID_ERROR_RESPONSE',
      response.status,
      response.headers.get('X-Request-Id'),
    )
  }

  throw new ApiError(
    result.data.error.message,
    result.data.error.code,
    response.status,
    result.data.request_id,
  )
}

export async function requestJson<T>(
  path: string,
  schema: ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  const response = await sendRequest(path, init)

  await ensureSuccessfulResponse(response)

  let payload: unknown

  try {
    payload = await response.json()
  } catch {
    throw new ApiError(
      '服务器没有返回有效的 JSON 数据。',
      'INVALID_RESPONSE',
      response.status,
      response.headers.get('X-Request-Id'),
    )
  }

  const result = schema.safeParse(payload)

  if (!result.success) {
    console.error('房间 API 响应校验失败：', result.error)

    throw new ApiError(
      '服务器响应格式不符合 OpenAPI 契约。',
      'INVALID_RESPONSE',
      response.status,
      response.headers.get('X-Request-Id'),
    )
  }

  return result.data
}

export async function requestNoContent(
  path: string,
  init: RequestInit = {},
): Promise<void> {
  const response = await sendRequest(path, init)

  await ensureSuccessfulResponse(response)

  if (response.status !== 204) {
    throw new ApiError(
      '服务器响应状态不符合 OpenAPI 契约。',
      'INVALID_RESPONSE',
      response.status,
      response.headers.get('X-Request-Id'),
    )
  }
}

export interface BinaryResponse {
  body: ArrayBuffer
  contentType: string | null
}

export async function requestBinary(
  path: string,
  init: RequestInit = {},
): Promise<BinaryResponse> {
  const response = await sendRequest(path, init)

  await ensureSuccessfulResponse(response)

  return {
    body: await response.arrayBuffer(),
    contentType: response.headers.get('Content-Type'),
  }
}

export function getApiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.requestId !== null) {
      return `${error.message}（请求编号：${error.requestId}）`
    }

    return error.message
  }

  return '操作没有完成，请稍后重试。'
}
