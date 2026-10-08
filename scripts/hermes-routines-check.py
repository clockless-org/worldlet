"""Exercise actual Hermes cron ownership, scheduling and execution with a local model."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
ROOT=Path(__file__).resolve().parents[1]

def worker():
    sys.path.insert(0,str(ROOT/'harness/hermes'))
    import routines
    from cron import jobs
    from datetime import datetime,timedelta,timezone
    job=routines.manage({'action':'create','name':'Fixture research','prompt':'Hello fixture','schedule':(datetime.now(timezone.utc)+timedelta(minutes=5)).isoformat()})['job']
    key=job['id']
    assert routines.manage({'action':'update','id':key,'name':'Updated routine'})['job']['name']=='Updated routine'
    assert routines.manage({'action':'pause','id':key})['job']['state']=='paused'
    assert routines.manage({'action':'resume','id':key})['ok']
    jobs.update_job(key,{'next_run_at':(datetime.now(timezone.utc)-timedelta(seconds=5)).isoformat()})
    result=routines.tick(threading.Event(),lambda _: {'error':'No Google account in fixture'})
    assert result['ran'] and result['job']['last_status']=='ok',result
    assert 'Fixture complete.' in routines.manage({'action':'result','id':key})['output']
    assert not routines.tick(threading.Event(),lambda _: {})['ran'],'One-shot repeated'
    assert routines.manage({'action':'remove','id':key})['ok']
    assert not routines.manage({'action':'list'})['jobs']
    print('PASS real Hermes cron: create, pause/resume, due claim, model execution, saved result, no double fire, remove.')
    # A one-time routine whose time passed three hours ago while the computer slept: Hermes alone
    # retires it unrun (past ONESHOT_GRACE_SECONDS); the tick runs it once instead.
    key=routines.manage({'action':'create','name':'Reminder','prompt':'Hello fixture','schedule':(datetime.now(timezone.utc)+timedelta(minutes=5)).isoformat()})['job']['id']
    jobs.update_job(key,{'next_run_at':(datetime.now(timezone.utc)-timedelta(hours=3)).isoformat()})
    result=routines.tick(threading.Event(),lambda _: {})
    assert result['ran'] and result['job']['id']==key and result['job']['last_status']=='ok',result
    assert not routines.tick(threading.Event(),lambda _: {})['ran'],'Missed one-shot repeated'
    routines.manage({'action':'remove','id':key})
    print('PASS real Hermes cron: a one-time routine missed while asleep runs once on wake, not dropped.')
    # Scheduled jobs brought from OpenClaw at setup: paused ones stay paused, a schedule Hermes
    # cannot read is reported, and bringing them again replaces the earlier copy.
    brought=[{'key':'openclaw:main:news','name':'Morning news','prompt':'Summarize the news.','schedule':'0 8 * * *','enabled':True},
             {'key':'openclaw:main:flights','name':'Flight prices','prompt':'Check SFO to Tokyo prices.','schedule':'every 1h','enabled':False},
             {'key':'openclaw:main:odd','name':'Odd','prompt':'x','schedule':'whenever it rains','enabled':True}]
    result=routines.import_jobs(brought)
    assert result['routines']==['Morning news','Flight prices'] and [f['name'] for f in result['failed']]==['Odd'],result
    listed={j['name']:j for j in routines.manage({'action':'list'})['jobs']}
    assert set(listed)=={'Morning news','Flight prices'} and listed['Flight prices']['enabled'] is False and listed['Morning news']['enabled'] is not False,listed
    routines.import_jobs(brought[:2])
    assert sorted(j['name'] for j in routines.manage({'action':'list'})['jobs'])==['Flight prices','Morning news'],'brought again: replaced, not doubled'
    # Hermes Agent's own jobs come the same way under their own key; other keys are refused.
    result=routines.import_jobs([{'key':'hermes:j1','name':'Inbox digest','prompt':'Summarize my inbox.','schedule':'every 1d','enabled':True},
                                 {'key':'cron:x','name':'Stray','prompt':'x','schedule':'every 1h','enabled':True}])
    assert result['routines']==['Inbox digest'] and [f['name'] for f in result['failed']]==['Stray'],result
    assert sorted(j['name'] for j in routines.manage({'action':'list'})['jobs'])==['Flight prices','Inbox digest','Morning news']
    for job in routines.manage({'action':'list'})['jobs']: routines.manage({'action':'remove','id':job['id']})
    print('PASS scheduled jobs brought from OpenClaw and Hermes Agent become Worldlet routines, idempotently.')

if __name__=='__main__':
    if '--worker' in sys.argv: worker()
    else:
        spec=importlib.util.spec_from_file_location('fixture',ROOT/'scripts/hermes-check.py');f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
        server=f.http.server.ThreadingHTTPServer(('127.0.0.1',0),f.Model);threading.Thread(target=server.serve_forever,daemon=True).start()
        try:
            with tempfile.TemporaryDirectory(prefix='worldlet-routines-') as tmp:
                home=Path(tmp);(home/'config.yaml').write_text(json.dumps({'model':{'provider':'custom','default':'fixture-model','base_url':f'http://127.0.0.1:{server.server_port}/v1','api_key':'fixture'},'agent':{'max_turns':4},'tools':{'tool_search':{'enabled':'off'}}}))
                env={k:os.environ[k] for k in ('PATH','TMPDIR','TEMP','TMP','LANG','SystemRoot','SYSTEMROOT','SystemDrive','SYSTEMDRIVE','WINDIR') if k in os.environ};env.update(HERMES_HOME=tmp,HOME=tmp,USERPROFILE=tmp,OPENAI_API_KEY='fixture',HERMES_TEST_ISOLATION='1')
                subprocess.run([str(f.PYTHON),str(Path(__file__).resolve()),'--worker'],env=env,check=True,timeout=90)
                result,events=f.run(home,{"action":"chat","text":"routine-fixture","session":"routine-management"})
                assert result['backend']=='hermes-desktop'
                stored=json.loads((home/'cron/jobs.json').read_text())['jobs']
                assert any(j['name']=='Fixture routine' for j in stored)
                assert any({'web_search','describe_world_tools','call_world_tool'} <= {t['function']['name'] for t in request.get('tools',[])} for request in f.requests_seen)
                print('PASS Fox -> official Desktop backend -> manage_routines -> Hermes cron store.')
                # tool_search/describe/call is how Hermes defers the tools it already
                # filtered to, not a way to reach further: the bridge can only call
                # what the toolset already allowed. Its presence is not an expansion.
                bridge={'tool_search','tool_describe','tool_call'}
                allowed={'web_search','web_extract','memory','skills_list','skill_view','skill_manage'}|bridge
                for request in f.requests_seen:
                    if any(t['function']['name']=='call_world_tool' for t in request.get('tools',[])): continue
                    assert {t['function']['name'] for t in request.get('tools',[])}<=allowed,'Cron expanded its tool permissions'
        finally:server.shutdown()
