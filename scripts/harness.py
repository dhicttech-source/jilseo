#!/usr/bin/env python3
"""개발 빌드 테스트 하네스 클라이언트.
사용: scripts/harness.py '<json 명령>' [timeout초]
예:   scripts/harness.py '{"type":"status"}'
      scripts/harness.py '{"type":"broadcast","text":"질서 자동 테스트 1","wait":true}' 240
      scripts/harness.py '{"type":"set_role","serviceId":"claude","role":"generate"}'
      scripts/harness.py '{"type":"set_lens","serviceId":"perplexity","lensId":"fact"}'
      scripts/harness.py '{"type":"apply_preset","presetId":"report"}'   # report|idea|code|quick|opinion
      scripts/harness.py '{"type":"set_depth","depth":"standard"}'       # quick|standard|deep
      scripts/harness.py '{"type":"pipeline","text":"질서 파이프라인 테스트 1"}' 480
      scripts/harness.py '{"type":"judge","serviceId":"claude","judged":"right"}'
      scripts/harness.py '{"type":"revise"}' 300
      scripts/harness.py '{"type":"scorecard","presetId":"report"}'    # 집계 + 프리셋 추천                          # 마지막 결과의 판정을 생성 패널에 되돌려 수정본
"""
import json, os, sys, time, uuid
D = os.path.expanduser("~/Library/Application Support/jilseo")
CMD, RES = os.path.join(D, "dev_commands.json"), os.path.join(D, "dev_results.json")

def _consumed(cmd_id: str) -> bool:
    """앱이 이 명령을 실행해 결과를 남겼는가 (최상위 또는 recent)"""
    try:
        r = json.load(open(RES))
        return r.get("id") == cmd_id or cmd_id in (r.get("recent") or {})
    except Exception:
        return False

def wait_slot(timeout: float = 15):
    """명령 파일은 한 칸뿐이라, 앞 명령이 소비되기 전에 덮어쓰면 그 명령이 사라진다. 소비될 때까지 기다린다."""
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            prev = json.load(open(CMD))
        except Exception:
            return
        pid, at = prev.get("id"), prev.get("at", 0)
        if not pid or _consumed(pid) or time.time() * 1000 - at > 60_000:
            return
        time.sleep(0.2)

def run(cmd: dict, timeout: float = 60) -> dict:
    wait_slot()
    cmd = {**cmd, "id": str(uuid.uuid4()), "at": int(time.time() * 1000)}
    tmp = CMD + ".tmp"
    with open(tmp, "w") as f: json.dump(cmd, f, ensure_ascii=False)
    os.replace(tmp, CMD)
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            r = json.load(open(RES))
            if r.get("id") == cmd["id"]: return {k: v for k, v in r.items() if k != "recent"}
            hit = (r.get("recent") or {}).get(cmd["id"])  # 동시 실행된 다른 명령이 최상위를 덮었을 때
            if hit: return hit
        except Exception: pass
        time.sleep(0.5)
    return {"id": cmd["id"], "ok": False, "result": {"error": f"timeout after {timeout}s"}}

if __name__ == "__main__":
    cmd = json.loads(sys.argv[1]); timeout = float(sys.argv[2]) if len(sys.argv) > 2 else 60
    print(json.dumps(run(cmd, timeout), ensure_ascii=False, indent=2))
