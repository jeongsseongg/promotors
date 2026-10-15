const messages: Record<string, string> = {
  AUTH_REQUIRED: '로그인 후 이용해 주세요.', INVALID_SESSION: '로그인 시간이 만료되었습니다. 다시 로그인해 주세요.',
  INVALID_LOGIN: '아이디 또는 비밀번호를 확인해 주세요.', INVALID_PASSWORD: '현재 비밀번호를 확인해 주세요.',
  ADMIN_REQUIRED: '관리자 로그인 후 이용해 주세요.', FORBIDDEN: '이 내용을 확인하거나 변경할 권한이 없습니다.',
  FORBIDDEN_ROW: '이 내용을 확인하거나 변경할 권한이 없습니다.', BOOKING_UNAVAILABLE: '예약이 없거나 지점 권한이 없습니다.',
  SESSION_CHANGED: '로그인 상태가 변경되었습니다. 다시 시도해 주세요.',
  PRIVACY_EPOCH_CHANGED: '정보가 갱신되었습니다. 화면을 새로 불러온 후 다시 시도해 주세요.',
  PRIVACY_EPOCH_NOT_READY: '계정 정보를 불러온 후 다시 시도해 주세요.',
  ACCOUNT_DELETION_PENDING: '탈퇴 신청을 취소한 후 정보를 변경할 수 있습니다.',
  BOOKING_CHANGE_NOT_ALLOWED: '예약 시간 변경은 기존 예약 취소 후 다시 예약해 주세요.',
  BOOKING_CONFLICT: '방금 다른 고객이 선택한 시간을 예약했습니다.', SLOT_TAKEN: '이미 예약된 시간입니다.',
  OUTSIDE_BUSINESS_HOURS: '지점의 예약 가능한 시간을 확인해 주세요.', BRANCH_HOURS_UNAVAILABLE: '예약 시간을 확인하지 못했습니다.',
  REJECTION_REASON_REQUIRED: '거절 사유를 입력해 주세요.', REQUEST_IN_PROGRESS: '처리 중입니다. 잠시 기다려 주세요.',
  PUSH_NOT_ENABLED: '먼저 이 기기에 알림을 연결해 주세요.', PUSH_NOT_CONFIGURED: '앱 알림 연결을 준비 중입니다.',
  NOTIFICATION_PERMISSION_DENIED: '휴대폰 설정에서 프로모터스 알림을 허용해 주세요.',
  DEVICE_BINDING_REQUIRED: '이 휴대폰의 알림을 다시 연결해 주세요.', INVALID_DEVICE: '휴대폰 알림 정보를 확인하지 못했습니다.',
  INVALID_ARGUMENT: '입력한 정보를 확인해 주세요.', DEVICE_LIMIT: '연결 가능한 알림 기기 수를 초과했습니다.',
  TRY_AFTER_ONE_MINUTE: '1분 후 다시 시도해 주세요.', TRY_LATER: '요청이 많습니다. 잠시 후 다시 시도해 주세요.',
  NOT_CANCELLABLE: '실제 삭제가 시작되어 신청을 취소할 수 없습니다.', DELETION_NOT_READY: '탈퇴 신청 기능을 준비 중입니다.',
  INVALID_RECEIPT: '조회 정보가 유효하지 않거나 조회 기간이 지났습니다.', RECEIPT_EXPIRED: '탈퇴 처리 조회 기간이 지났습니다.',
  WEAK_PASSWORD: '비밀번호는 문자와 숫자를 포함해 10자 이상 입력해 주세요.',
  DUPLICATE_ID: '이미 가입된 아이디입니다.', DUPLICATE_CAR: '이미 가입된 차량번호입니다.',
  ALREADY_ENTERED: '이미 응모한 이벤트입니다.', INVALID_PAYLOAD: '입력한 정보를 확인해 주세요.',
  INVALID_RESPONSE: '서버 응답을 확인하지 못했습니다. 다시 시도해 주세요.',
  NETWORK_ERROR: '서버에 연결하지 못했습니다. 연결 상태를 확인해 주세요.', TIMEOUT: '응답이 지연되고 있습니다. 처리 상태를 확인해 주세요.',
  API_CONFIG_INVALID: '앱 서버 연결 설정을 확인해 주세요.', SERVER_ERROR: '요청을 처리하지 못했습니다. 다시 시도해 주세요.',
};

export class ApiError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly traceId?: string;
  constructor(code: string, options: { status?: number; traceId?: string } = {}) {
    super(messages[code] || messages.SERVER_ERROR);
    this.name = 'ApiError'; this.code = code; this.status = options.status; this.traceId = options.traceId;
  }
}

export function responseError(body: unknown, status: number, traceId?: string): ApiError {
  const value = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const text = [value.code, value.message, value.hint].filter(x => typeof x === 'string').join(' ');
  const code = Object.keys(messages).find(key => new RegExp(`(^|[^A-Z_])${key}([^A-Z_]|$)`).test(text));
  const privacy = /PRIVACY_EPOCH/.test(text) ? 'PRIVACY_EPOCH_CHANGED' : undefined;
  return new ApiError(code || privacy || (status === 401 ? 'AUTH_REQUIRED' : status === 403 ? 'FORBIDDEN' : 'SERVER_ERROR'), { status, traceId });
}

export function requireValue(condition: unknown, code = 'INVALID_PAYLOAD'): asserts condition {
  if (!condition) throw new ApiError(code);
}
