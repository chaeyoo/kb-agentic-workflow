// 시드용 과거 버전. get_policy_history 로 "왜 이렇게 바뀌었는지"를 보여주기 위한 가상 이력이다.
// 각 항목은 해당 섹션의 이전 버전 본문이며, 오래된 순서로 적는다.
// 현재 본문(버전 = 과거 버전 수 + 1)은 policies/*.md 에 있다.

export interface SeedHistoryEntry {
  sectionKey: string;
  heading: string;
  body: string;
  changedAt: string;
  changeReason: string;
}

export const seedHistory: SeedHistoryEntry[] = [
  {
    sectionKey: "membership.age",
    heading: "가입 연령",
    body: [
      "- 만 19세 이상인 사람만 회원 가입할 수 있다.",
      "- 연령은 본인인증 결과의 생년월일을 기준으로 가입 신청일에 계산한다.",
    ].join("\n"),
    changedAt: "2026-03-02T09:00:00.000Z",
    changeReason: "최초 작성",
  },
  {
    sectionKey: "notification.quiet-hours",
    heading: "야간 발송 제한",
    body: [
      "- 22:00부터 다음 날 08:00까지는 마케팅 알림을 보내지 않는다.",
      "- 정보성 알림은 야간에도 보낼 수 있다.",
    ].join("\n"),
    changedAt: "2026-03-02T09:00:00.000Z",
    changeReason: "최초 작성",
  },
];

/** 과거 버전 다음에 온 "현재 버전"의 변경 이유. 키가 없으면 "최초 작성". */
export const seedCurrentChangeReasons: Record<string, { changedAt: string; changeReason: string }> = {
  "membership.age": {
    changedAt: "2026-06-15T09:00:00.000Z",
    changeReason: "청소년 회원 유입을 위해 가입 가능 연령을 만 14세로 낮춤 (티켓 T-3, 법무 검토 완료)",
  },
  "notification.quiet-hours": {
    changedAt: "2026-07-01T09:00:00.000Z",
    changeReason: "정보통신망법 야간 광고 전송 제한 시간(21시~08시)에 맞춤",
  },
};
