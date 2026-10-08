"""One local-model turn: attach to a real profile without replacing its config/SOUL."""
import http.server
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading

ROOT = Path(__file__).resolve().parents[1]
BASE = Path(sys.argv[1]) if len(sys.argv)>1 else ROOT
seen=[]
class Model(http.server.BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def do_POST(self):
        data=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        seen.append(data)
        response={'id':'fixture','object':'chat.completion','model':'fixture','choices':[{'index':0,'message':{'role':'assistant','content':'Hello from Willow.'},'finish_reason':'stop'}],'usage':{'prompt_tokens':10,'completion_tokens':5,'total_tokens':15}}
        self.send_response(200)
        self.send_header('Content-Type','text/event-stream' if data.get('stream') else 'application/json');self.end_headers()
        if data.get('stream'):
            chunk={'id':'fixture','object':'chat.completion.chunk','model':'fixture','choices':[{'index':0,'delta':{'role':'assistant','content':'Hello from Willow.'},'finish_reason':None}]}
            self.wfile.write(('data: '+json.dumps(chunk)+'\n\n').encode())
            chunk['choices']=[{'index':0,'delta':{},'finish_reason':'stop'}]
            self.wfile.write(('data: '+json.dumps(chunk)+'\n\ndata: [DONE]\n\n').encode())
        else:self.wfile.write(json.dumps(response).encode())
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Model)
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with tempfile.TemporaryDirectory(prefix='worldlet-attachment-') as directory:
    root=Path(directory);home=root/'existing';home.mkdir();runtime=root/'runtime'
    shutil.copytree(BASE/'dist/WorldletWeb/hermes',runtime)
    for name in ['host.py','desktop.py','model_access.py']:
        shutil.copy2(ROOT/'harness/hermes'/name,runtime/name)
    config=f'model:\n  provider: custom\n  default: fixture\n  base_url: http://127.0.0.1:{server.server_port}/v1\n  api_key: fixture\nagent:\n  system_prompt: Preserve my existing identity.\ndisplay:\n  personality: concise\ndesktop:\n  auto_continue:\n    enabled: true\n'
    (home/'config.yaml').write_text(config);(home/'.env').write_text('OPENAI_API_KEY=fixture\n')
    (home/'SOUL.md').write_text('# Identity\nName: Willow\nYou are Willow, the existing personal companion.\n')
    original={name:(home/name).read_bytes() for name in ['config.yaml','.env','SOUL.md']}
    env={**os.environ,'HERMES_HOME':str(home),'WORLDLET_EXTERNAL_AGENT':'1','HERMES_INTERACTIVE':'0'}
    env.pop('WORLDLET_MODEL_HOME',None)
    process=subprocess.Popen([os.environ.get('WORLDLET_HERMES_PYTHON') or str(BASE/'.local/hermes-source/.venv/bin/python3'),str(runtime/'host.py'),'--serve'],env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True)
    try:
        process.stdin.write(json.dumps({'action':'chat','requestId':'attachment-check','session':'attachment-check','text':'Say hello without using tools.','mode':'chat','context':{},'style':'Your companion name is Willow.'})+'\n');process.stdin.flush()
        import select,time
        deadline=time.monotonic()+75;result=None
        while time.monotonic()<deadline:
            if not select.select([process.stdout],[],[],1)[0]:continue
            line=process.stdout.readline()
            if not line:break
            event=json.loads(line)
            if event.get('type')=='error':raise AssertionError(event.get('message'))
            if event.get('type')=='result':result=event['value'];break
        assert result is not None,'No result from attached Hermes'
        assert seen,'The existing model endpoint was not used'
        assert 'Willow' in json.dumps(seen),'Existing identity was absent from the model request'
        for name,data in original.items():assert (home/name).read_bytes()==data,f'{name} was modified'
        assert (home/'worldlet-desktop-sessions.json').exists(),'Missing separately named Worldlet session'
        print('PASS attached Hermes: existing endpoint and identity, separate Worldlet session, config/env/SOUL byte-for-byte unchanged')
    finally:
        process.terminate()
        try:process.wait(timeout=5)
        except subprocess.TimeoutExpired:process.kill();process.wait()
finally:server.shutdown()
