import { useStage } from "../store/stage";

/** 첫 실행 안내. 스테이지 대신 표시되므로 webview와 겹치지 않는다. */
export function Onboarding({ onSettings }: { onSettings: () => void }) {
  const setOnboarded = useStage((s) => s.setOnboarded);
  return (
    <main className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-8">
      <div className="flex w-full max-w-lg flex-col gap-5">
        <div>
          <h1 className="text-xl font-medium text-white/95">질서 疾書</h1>
          <p className="mt-1 text-sm text-white/50">질문 하나를 여러 AI에 동시에 보내고 나란히 비교합니다. 각 서비스의 구독 계정을 그대로 씁니다.</p>
        </div>
        <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm text-white/75">
          <li>
            <b className="text-white/90">각 패널에서 직접 로그인</b>하세요. 앱은 비밀번호·쿠키를 다루지 않고 웹뷰에 맡깁니다. 재시작해도 유지됩니다.
          </li>
          <li>
            <b className="text-white/90">패스키(지문·Face ID)는 이 앱 안에서 쓸 수 없습니다.</b> 로그인 화면에서 "다른 방법 시도 → 비밀번호"를 고르세요.
            Google 계정에 "가능하면 비밀번호 건너뛰기"가 켜져 있으면 끄셔야 합니다.
          </li>
          <li>
            Claude 등 일부 서비스의 Google 로그인은 <b className="text-white/90">팝업 창</b>으로 열립니다. 끝난 뒤 닫히지 않으면 직접 닫으세요.
          </li>
          <li>
            사이트가 개편되어 전송이 실패하면 헤더의 <b className="text-white/90">셀렉터 JSON 폴더</b>에서 해당 서비스 JSON을 고치고 앱을 재시작하면 됩니다.
          </li>
          <li>
            <b className="text-white/90">화면이 잠기면 앱이 멈춥니다.</b> 잠금 화면이 창을 가리는 동안 macOS가 모든 패널의 동작을 정지시키므로,
            긴 응답을 기다릴 때는 화면을 잠그지 마세요. 잠금을 풀면 그대로 이어집니다.
          </li>
          <li>
            프롬프트·메모·비교 기록을 두 맥 간 공유하려면 <b className="text-white/90">설정</b>에서 Supabase를 연결하세요. 없어도 로컬로 동작합니다.
          </li>
        </ol>
        <div className="flex gap-2">
          <button onClick={() => setOnboarded(true)} className="rounded-lg bg-white/90 px-4 py-2 text-sm font-medium text-black hover:bg-white">
            시작하기
          </button>
          <button
            onClick={() => {
              setOnboarded(true);
              onSettings();
            }}
            className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/20"
          >
            먼저 Supabase 설정
          </button>
        </div>
      </div>
    </main>
  );
}
