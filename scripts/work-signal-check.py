import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

with tempfile.TemporaryDirectory() as temp:
    os.environ['CLAUDE_CONFIG_DIR']=temp
    spec=importlib.util.spec_from_file_location('signals','platform/local-tools/claude_signal.py')
    signals=importlib.util.module_from_spec(spec);spec.loader.exec_module(signals)
    session='11111111-1111-4111-8111-111111111111'
    signals.save({'session_id':session,'hook_event_name':'UserPromptSubmit','prompt':'PRIVATE'})
    states,usage=signals.read_signals();assert states[session]=='Running' and usage is None
    signals.save({'session_id':session,'rate_limits':{'seven_day':{'used_percentage':25,'resets_at':time.time()+3600}},'transcript_path':'PRIVATE'})
    states,usage=signals.read_signals();assert usage['rateLimits']['secondary']['usedPercent']==25
    signals.save({'session_id':session,'hook_event_name':'Stop'})
    assert signals.read_signals()[0][session]=='Completed'
    file=Path(temp)/'worldlet-signals'/f'{session}.json'
    assert 'PRIVATE' not in file.read_text()
    row=json.loads(file.read_text());row['stateAt']=0;row['usageAt']=0;file.write_text(json.dumps(row))
    assert signals.read_signals()==({},None)
    settings=Path(temp)/'settings.json'
    original={'statusLine':{'type':'command','command':'printf existing'},'hooks':{'Stop':[{'hooks':[{'type':'command','command':'true'}]}]}}
    settings.write_text(json.dumps(original))
    subprocess.run([sys.executable,'scripts/claude-signals.py','--install'],check=True,capture_output=True)
    installed=json.loads(settings.read_text());assert len(installed['hooks']['Stop'])==2
    output=subprocess.run(signals.shell(installed['statusLine']['command']),input=json.dumps({'session_id':session}),text=True,capture_output=True,check=True)
    assert output.stdout=='existing'
    subprocess.run([sys.executable,'scripts/claude-signals.py','--install'],check=True,capture_output=True)
    assert json.loads(settings.read_text())==installed
print('PASS Claude signals: privacy, running/completed, quota expiry, existing settings and idempotence')
