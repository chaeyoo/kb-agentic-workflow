// 시드용 사용자와 보드. 모두 가상 인물/가상 작업이다.
import type { Comment, Ticket } from "../types.ts";

/** 이름 선택으로 로그인을 대신한다. 정책 문서 담당자 + 개발자 */
export const seedUsers = [
  { name: "한서윤", role: "회원팀 정책 담당" },
  { name: "오지훈", role: "예약팀 정책 담당" },
  { name: "문가람", role: "결과팀 정책 담당" },
  { name: "백도윤", role: "플랫폼팀 정책 담당" },
  { name: "유하린", role: "법무·컴플라이언스" },
  { name: "김하늘", role: "FE 개발자" },
  { name: "이준서", role: "앱 개발자" },
  { name: "박민재", role: "외주 개발자" },
];

const t = (d: string) => `2026-09-${d}T01:00:00.000Z`;

export const seedTickets: Ticket[] = [
  {
    id: "T-1", title: "검진 예약 화면: 가족 대리 예약 UI",
    description: "예약 화면에서 '누구의 검진인가요?' 선택지를 추가한다. 가족 연결된 가족만 목록에 보인다.",
    type: "task", status: "in_progress", assignee: { kind: "user", name: "김하늘" },
    linkedSectionKeys: ["checkup-booking.who"], proposalIds: [],
    createdBy: "오지훈", createdAt: t("20"), updatedAt: t("24"),
  },
  {
    id: "T-2", title: "결과 등록 푸시 알림 문구 확정",
    description: "결과 등록 알림의 제목/본문 문구를 확정한다. 민감 항목 포함 여부에 따라 문구가 달라진다.",
    type: "task", status: "todo", assignee: { kind: "user", name: "이준서" },
    linkedSectionKeys: ["notification.result-ready"], proposalIds: [],
    createdBy: "백도윤", createdAt: t("22"), updatedAt: t("22"),
  },
  {
    id: "T-3", title: "가입 가능 연령 만 14세로 하향 검토",
    description: "청소년 회원 유입을 위해 가입 가능 연령을 만 19세에서 만 14세로 낮추는 안. 법무 검토 필요.",
    type: "task", status: "done", assignee: { kind: "user", name: "한서윤" },
    linkedSectionKeys: ["membership.age"], proposalIds: [],
    createdBy: "한서윤", createdAt: "2026-06-01T01:00:00.000Z", updatedAt: "2026-06-15T01:00:00.000Z",
  },
  {
    id: "T-4", title: "보호자용 자녀 검진 결과 열람 화면",
    description: "보호자가 가족 연결된 자녀의 검진 결과를 볼 수 있는 화면을 만든다. 어떤 자녀의 결과를 어떤 조건에서 보여줘야 하는지 정책 확인이 필요하다.",
    type: "task", status: "todo", assignee: { kind: "user", name: "이준서" },
    linkedSectionKeys: ["result-access.guardian"], proposalIds: [],
    createdBy: "문가람", createdAt: t("25"), updatedAt: t("25"),
  },
];

export const seedComments: Comment[] = [
  {
    id: "C-1", ticketId: "T-1", author: { kind: "user", name: "김하늘" },
    body: "가족 목록 API 는 가족 연결 완료 상태만 내려주는 걸로 백엔드와 합의했습니다.", createdAt: t("24"),
  },
  {
    id: "C-2", ticketId: "T-3", author: { kind: "user", name: "유하린" },
    body: "법무 검토 완료. 만 14세 이상은 본인 동의로 가입 가능합니다. 정책서 반영 부탁드립니다.", createdAt: "2026-06-14T01:00:00.000Z",
  },
];
