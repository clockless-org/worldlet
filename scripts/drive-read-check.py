import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'harness/hermes'))
from drive_reader import read, DOC
class Request:
    def __init__(self,result): self.result=result
    def execute(self): return self.result
class Drive:
    def __init__(self): self.calls=[];self.kind=DOC;self.download=True;self.bytes='Whole document 正文'.encode()
    def files(self): return self
    def row(self): return {'id':'file_123','name':'Plan','mimeType':self.kind,'description':'Context','capabilities':{'canDownload':self.download}}
    def list(self,**kw): self.calls.append(('list',kw));return Request({'files':[self.row()],'nextPageToken':'next'})
    def get(self,**kw): self.calls.append(('get',kw));return Request(self.row())
    def export_media(self,**kw): self.calls.append(('export',kw));return Request(self.bytes)
a=Drive();v=read(a,{'readOperation':'list','cursor':'page2'});assert v['next']=='next' and a.calls[-1][1]['pageToken']=='page2'
v=read(a,{'readOperation':'read','id':'file_123'});assert v['text']=='Whole document 正文' and not v['partial']
a.kind='application/pdf';n=len(a.calls);v=read(a,{'readOperation':'read','id':'file_123'});assert v['partial'] and len(a.calls)==n+1
a.kind=DOC;a.download=False;n=len(a.calls);v=read(a,{'readOperation':'read','id':'file_123'});assert v['partial'] and len(a.calls)==n+1
a.download=True;a.bytes=b'x'*(2*1024*1024+1);assert read(a,{'readOperation':'read','id':'file_123'})['partial']
for b in [{'readOperation':'delete'},{'readOperation':'read','id':'https://evil.test'},{'readOperation':'list','cursor':45}]:
 n=len(a.calls)
 try: read(a,b)
 except ValueError: pass
 else: raise AssertionError('Invalid operation accepted')
 assert len(a.calls)==n
print('PASS Drive pagination, complete text, export permission, unsupported formats, size bound and fixed API reads.')
from drive_reader import SHEET, SLIDES
for applet,kind in [('google-docs',DOC),('google-sheets',SHEET),('google-slides',SLIDES)]:
 a=Drive();a.kind=kind;a.bytes=b'Name,Value\n"Quoted, name",42\n'
 read(a,{'readOperation':'list','applet':applet})
 assert kind in a.calls[-1][1]['q']
 v=read(a,{'readOperation':'read','applet':applet,'id':'file_123'})
 assert v['url'].startswith('https://docs.google.com/')
 if kind==SHEET:
  assert v['table'][1]==['Quoted, name','42'] and v['partial']
  assert a.calls[-1][1]['mimeType']=='text/csv'
 else: assert a.calls[-1][1]['mimeType']=='text/plain'
 a.kind='application/pdf';n=len(a.calls)
 try: read(a,{'readOperation':'read','applet':applet,'id':'file_123'})
 except ValueError: pass
 else: raise AssertionError('Wrong applet file type accepted')
 assert len(a.calls)==n+1
print('PASS typed Docs/Sheets/Slides lists, original URLs, CSV cells and type-change refusal.')
