#!/usr/bin/env python3
"""개발 빌드 테스트 하네스 클라이언트.
사용: scripts/harness.py '<json 명령>' [timeout초]
예:   scripts/harness.py '{"type":"status"}'
      scripts/harness.py '{"type":"broadcast","text":"질서 자동 테스트 1","wait":true}' 240
      scripts/harness.py '{"type":"set_role","serviceId":"claude","role":"generate"}'
      scripts/harness.py '{"type":"pipeline","text":"질서 파이프라인 테스트 1"}' 480
"""
import json, os, sys, time, uuid
D = os.path.expanduser("~/Library/Application Support/jilseo")
CMD, RES = os.path.join(D, "dev_commands.json"), os.path.join(D, "dev_results.json")

def run(cmd: dict, timeout: float = 60) -> dict:
    cmd = {**cmd, "id": str(uuid.uuid4()), "at": int(time.time() * 1000)}
    tmp = CMD + ".tmp"
    with open(tmp, "w") as f: json.dump(cmd, f, ensure_ascii=False)
    os.replace(tmp, CMD)
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            r = json.load(open(RES))
            if r.get("id") == cmd["id"]: return r
        except Exception: pass
        time.sleep(0.5)
    return {"id": cmd["id"], "ok": False, "result": {"error": f"timeout after {timeout}s"}}

if __name__ == "__main__":
    cmd = json.loads(sys.argv[1]); timeout = float(sys.argv[2]) if len(sys.argv) > 2 else 60
    print(json.dumps(run(cmd, timeout), ensure_ascii=False, indent=2))
