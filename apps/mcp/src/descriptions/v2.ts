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
};
