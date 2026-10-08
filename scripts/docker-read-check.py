import json
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'platform/local-tools'))
from docker_reader import read
key='a'*64
class CLI:
 def __init__(self):self.calls=[];self.remote=False;self.changed=False
 def __call__(self,args):
  self.calls.append(args)
  if args==['context','show']:return 'desktop-linux\n'
  if args[:2]==['context','inspect']:return json.dumps('ssh://remote' if self.remote else 'unix:///tmp/docker.sock')
  if 'ls' in args:return json.dumps({'ID':key,'Names':'web','Status':'Up','State':'running','Image':'nginx','Command':'PRIVATE'})+'\n'
  if 'inspect' in args:
   template=args[args.index('--format')+1]
   assert '.Config.Env' not in template and '.Args' not in template and '.Mounts' not in template
   return json.dumps({'id':'b'*64 if self.changed else key,'name':'/web','image':'nginx','status':'running','started':'2026-09-01','exitCode':0,'restarts':2})
  raise AssertionError(args)
c=CLI();v=read('list',call=c);assert len(v['pages'])==1 and 'PRIVATE' not in json.dumps(v)
v=read('read',key,call=c);assert v['details']['restarts']==2 and v['title']=='web'
for op,id in [('exec',key),('read','--help'),('read','a'*12)]:
 n=len(c.calls)
 try:read(op,id,call=c)
 except ValueError:pass
 else:raise AssertionError('Invalid request allowed')
 assert n==len(c.calls)
c.remote=True;n=len(c.calls)
try:read('list',call=c)
except ValueError:pass
else:raise AssertionError('Remote context was read')
assert len(c.calls)==n+2
c.remote=False;c.changed=True
try:read('read',key,call=c)
except ValueError:pass
else:raise AssertionError('Changed container ID accepted')
print('PASS local Docker fixed reads, remote-context refusal, exact IDs, no environment/commands/labels/mounts.')
