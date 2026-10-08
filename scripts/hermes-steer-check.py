"""Pinned Hermes redirect through the real JSONL adapter; disposable data only."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import threading
import time
import http.server

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('check',ROOT/'scripts/hermes-desktop-check.py')
check=importlib.util.module_from_spec(spec);spec.loader.exec_module(check)
requests=[]

class Model(http.server.BaseHTTPRequestHandler):
    def log_message(self,*_):pass
    def do_POST(self):
        body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        messages=body.get('messages',[]);requests.append(messages)
        users='\n'.join(str(m.get('content','')) for m in messages if m.get('role')=='user')
        newest=next((str(m.get('content','')) for m in reversed(messages) if m.get('role')=='user'),'')
        corrected='blue-supplement' in users or 'small-supplement' in users
        tool='tool-original' in users and not any(m.get('role')=='tool' for m in messages)
        self.send_response(200);self.send_header('Content-Type','text/event-stream');self.end_headers()
        def chunk(delta,finish=None):
            self.wfile.write(('data: '+json.dumps({'id':'fixture','object':'chat.completion.chunk','choices':[{'index':0,'delta':delta,'finish_reason':finish}]})+'\n\n').encode());self.wfile.flush()
        try:
            if tool:
                chunk({'tool_calls':[{'index':0,'id':'only-tool','type':'function','function':{'name':'call_world_tool','arguments':json.dumps({'target':'applets','action':'open','arguments':json.dumps({'id':'app-youtube'})})}}]});chunk({},'tool_calls')
            elif not corrected and 'original' in newest:
                chunk({'content':'Obsolete draft '})
                for _ in range(45):time.sleep(.1);chunk({'content':'.'})
                chunk({},'stop')
            else:
                # Leave room for a second correction while a replacement is streaming.
                time.sleep(.3)
                answer=('blue ' if 'blue-supplement' in users else '')+('small ' if 'small-supplement' in users else '')+'Fixture complete.'
                chunk({'content':answer});chunk({},'stop')
            self.wfile.write(b'data: [DONE]\n\n');self.wfile.flush()
        except (BrokenPipeError,ConnectionResetError):pass


def run_case(home,session,*,early=False,tool=False):
    child=check.Client(home);rid=child.start('tool-original' if tool else 'stream-original',session=session)
    sent=False;acks=[];tools=0;started=time.monotonic();done=None
    def send():
        nonlocal sent
        sent=True
        for i,text in enumerate(['blue-supplement','small-supplement']):
            child.send({'type':'steer','requestId':rid,'controlId':str(i),'text':text})
    if early:send()
    try:
        while done is None:
            event=child.frames.get(timeout=25)
            print(session,event['type'],event.get('stage',''),event.get('accepted',''),flush=True) if os.environ.get('FOX_STEER_DEBUG') else None
            assert time.monotonic()-started<25, (session,event,requests[-1][-2:])
            assert event.get('requestId')==rid,event
            assert event['type']!='error',event
            if event['type']=='delta' and not sent and not tool:send()
            if event['type']=='tool':
                tools+=1;assert tools==1,'Tool replayed'
                send()
                # Wait for acceptance while the tool is still outstanding.
                tool_event=event
            if event['type']=='steer_result':
                assert event['accepted'],event
                acks.append(event['controlId'])
                if tool and len(acks)==2:
                    child.send({'type':'tool_result','requestId':rid,'id':tool_event['id'],'result':{'ok':True,'places':[]}})
            if event['type']=='result':done=event['value']
        assert sorted(acks)==['0','1'],acks
        assert 'blue' in done['message'] and 'small' in done['message'],done
        assert 'Obsolete' not in done['message'],done
        assert all('endMs' in c for c in done['timings']['modelCalls']), 'Interrupted request timing was lost'
        assert time.monotonic()-started<15
        if tool:assert tools==1
        pid=child.p.pid
        # Late control is explicitly rejected, never attached to the next request.
        child.send({'type':'steer','requestId':rid,'controlId':'late','text':'late-sentinel'})
        event=child.frames.get(timeout=5);assert event['type']=='steer_result' and not event['accepted'],event
        child.finish(child.start('Followup',session=session))
        assert child.p.pid==pid and 'late-sentinel' not in json.dumps(requests[-1])
        print('PASS Hermes redirect:',session,'both supplements considered, no tool replay, same process, late control rejected')
    finally:child.close()
    child=check.Client(home)
    try:
        child.finish(child.start('After restart',session=session))
        assert 'blue-supplement' in json.dumps(requests[-1]) and 'small-supplement' in json.dumps(requests[-1])
    finally:child.close()


def cancellation(home):
    child=check.Client(home);rid=child.start('stream-original',session='cancel-steer')
    try:
        while child.frames.get(timeout=25)['type']!='delta':pass
        child.send({'type':'steer','requestId':rid,'controlId':'cancel-control','text':'blue-supplement'})
        while child.frames.get(timeout=25)['type']!='steer_result':pass
        child.send({'type':'cancel','requestId':rid})
        value,_=child.finish(rid)
        assert value.get('cancelled'),value
        child.finish(child.start('After cancellation',session='cancel-steer'))
        print('PASS cancellation after correction, same-process recovery and no stale control')
    finally:child.close()


def main():
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Model)
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        with tempfile.TemporaryDirectory(prefix='worldlet-steer-check-') as directory:
            home=Path(directory)
            (home/'config.yaml').write_text(json.dumps({'model':{'provider':'custom','default':'fixture-model','base_url':f'http://127.0.0.1:{server.server_port}/v1'},'tools':{'tool_search':{'enabled':'off'}}}))
            run_case(home,'stream')
            run_case(home,'early',early=True)
            run_case(home,'tool',tool=True)
            cancellation(home)
    finally:server.shutdown()

if __name__=='__main__':main()
