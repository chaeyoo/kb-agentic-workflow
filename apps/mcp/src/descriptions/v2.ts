// v2: 언제 쓰는지 / 언제 쓰지 말아야 하는지 / 무엇을 돌려주는지를 적은 description.
// 모델은 도구 이름과 이 글만 보고 도구를 고른다. description 이 곧 도구의 사용 설명서다.
export const v2: Record<string, string> = {
  search_policies: `정책 문서 전체에서 키워드로 관련 섹션을 찾는다.

언제 쓰나: 정책 질문을 받으면 가장 먼저 쓴다. 질문에 조건이 여러 개면(예: 연령 + 예약) 조건별로 따로 검색한다.
쓰지 말 것: 이미 섹션 키를 알고 전문이 필요할 때는 get_policy_document 를 쓴다.
검색 팁: 질문 문장 그대로보다 핵심 명사 2~4개가 잘 찾아진다 ("14세 미만 예약"). 결과가 없으면 동의어로 다시 검색한다 (미성년자/아동/청소년, 보호자/법정대리인).
반환: { summary, hits: [{ sectionId("문서.앵커@버전"), sectionKey, documentTitle, heading, version, snippet }] }
snippet 은 일부만 보여준다. 답변 근거로 쓰기 전에 get_policy_document 로 섹션 전문을 확인한다.`,

  get_policy_document: `정책 문서 전체 또는 섹션 하나의 전문을 조회한다. 과거 버전도 조회할 수 있다.

언제 쓰나: 검색으로 찾은 섹션의 전문을 확인할 때, 한 문서의 전체 규칙 흐름을 봐야 할 때.
쓰지 말 것: 어떤 문서에 있는지 모를 때는 먼저 search_policies 를 쓴다. 변경 이유가 궁금하면 get_policy_history 를 쓴다.
인자: sectionKey("membership.age")를 주면 그 섹션만, documentId("membership")만 주면 문서 전체. version 을 생략하면 현재 버전.
반환: 섹션 조회 시 { section: { sectionId, sectionKey, heading, version, status, body, changeReason } }
      문서 조회 시 { document: { id, title, owner, version }, sections: [...] }
답변에 인용할 때는 반환된 sectionId(예: membership.age@2)를 그대로 쓴다.`,

  get_policy_history: `섹션 하나의 모든 버전과 각 버전의 변경 이유를 오래된 순서로 조회한다.

언제 쓰나: "왜 이렇게 정해졌나", "언제 바뀌었나", "예전에는 어땠나"를 물을 때. 변경안을 제안하기 전에 과거 결정을 확인할 때.
쓰지 말 것: 현재 규칙만 알면 되는 일반 질문에는 쓰지 않는다 (get_policy_document 로 충분).
반환: { versions: [{ version, status(active/deprecated), changedAt, changeReason, body }] }`,

  list_open_questions: `아직 결정되지 않은 정책 공백(완료되지 않은 policy_gap 티켓) 목록을 조회한다.

언제 쓰나: create_ticket 으로 정책 공백 티켓을 만들기 "직전에" 반드시 호출해서 같은 공백을 다루는 티켓이 있는지 확인한다.
  "지금 결정 대기 중인 정책이 뭐가 있나" 같은 질문에도 쓴다.
쓰지 말 것: 정책 내용 자체를 찾을 때는 search_policies 를 쓴다.
반환: { openQuestions: [{ ticketId, title, status, assignee, linkedSectionKeys, description }] }
같은 섹션을 다루는 티켓이 있으면 새로 만들지 말고 add_comment 로 덧붙인다.`,

  get_ticket: `티켓 하나의 제목, 설명, 상태, 담당자, 코멘트 전체, 연결된 정책 섹션을 조회한다.

언제 쓰나: 티켓 작업을 배정받았을 때 가장 먼저. 티켓 번호(T-숫자)가 언급됐을 때.
쓰지 말 것: 티켓 번호를 모르면 list_open_questions 로 찾는다.
반환: { ticket: { ticketId, title, type, status, assignee, linkedSectionKeys, description }, linkedSections: [...], comments: [{ author, body }] }
코멘트에 사람이 내린 결정이 적혀 있을 수 있으니 끝까지 읽는다.`,

  create_ticket: `보드에 새 티켓을 만든다. 주 용도는 정책 공백/모순을 담당자에게 확인 요청하는 것.

언제 쓰나: 정책서에 근거가 없거나 두 문서가 충돌해서 사람이 결정해야 할 때 (type: policy_gap).
쓰지 말 것: list_open_questions 로 중복을 확인하기 전에는 쓰지 않는다. 근거가 충분히 있는 질문에는 쓰지 않는다.
  정책서를 고치고 싶을 때도 쓰지 않는다 (그건 결정이 난 뒤 변경안 제안으로 한다).
작성 요령: title 은 "무엇을 결정해야 하는가"로 쓴다. description 에는 발견 경위, 충돌/공백 내용과 [[섹션키@버전]] 인용, 담당자가 고를 선택지(A/B)를 적는다.
담당자는 연결한 첫 섹션의 문서 담당자에게 자동 배정되므로, 가장 결정 권한이 있는 문서의 섹션을 첫 번째로 둔다.
반환: { ticketId, ticket: {...} }`,

  update_ticket_status: `티켓의 상태 컬럼을 옮긴다. 가능한 값: todo, in_progress, in_review.

언제 쓰나: 배정받은 티켓 작업을 시작할 때 in_progress, 조사/작업을 마치고 사람이 확인할 차례면 in_review.
쓰지 말 것: 완료(done)는 사람만 옮길 수 있어 이 도구로는 불가능하다. 승인 대기(needs_approval)는 request_approval 로만 간다.
반환: { ticketId, status }`,

  add_comment: `티켓에 코멘트를 남긴다. markdown 가능.

언제 쓰나: 조사 결과와 근거를 남길 때, 이미 있는 정책 공백 티켓에 새로운 사례를 덧붙일 때, 진행 상황을 알릴 때.
쓰지 말 것: 같은 내용을 반복해서 남기지 않는다. 사용자에게 답하는 용도가 아니다 (답은 최종 답변으로).
작성 요령: 근거 문장 끝에 [[섹션키@버전]] 인용을 붙인다. 개발자가 바로 구현에 쓸 수 있게 bullet 로 쓴다.
반환: { commentId }`,

  link_policy_section: `티켓에 관련 정책 섹션을 연결한다 (이미 연결된 것은 유지).

언제 쓰나: 조사 중 티켓과 관련된 섹션을 새로 찾았을 때. 연결해두면 정책서 뷰어와 티켓이 서로 이어진다.
쓰지 말 것: 관련 없는 섹션을 "혹시 몰라서" 연결하지 않는다.
반환: { linkedSectionKeys }`,
};
