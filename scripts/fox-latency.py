"""Native end-to-end benchmark using only model credentials and fictional sample data."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile

ROOT=Path(__file__).resolve().parents[1]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--steer-only',action='store_true')
    parser.add_argument('--model-home',type=Path,required=True)
    parser.add_argument('--output',type=Path,default=ROOT/'output/fox-latency/current.json')
    args=parser.parse_args()
    args.output.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='worldlet-model-only-') as directory:
        # Parse with the pinned runtime; never copy connectors, private memory or history.
        code="""import json,os,yaml;from pathlib import Path
src=Path(os.environ['FOX_SOURCE_MODEL']);dst=Path(os.environ['FOX_TARGET_MODEL'])
config=yaml.safe_load((src/'config.yaml').read_text())
(dst/'config.yaml').write_text(json.dumps({'model':config['model'],'tools':{'tool_search':{'enabled':'off'}}}))
if (src/'.env').exists():
 from dotenv import dotenv_values
 key=dotenv_values(src/'.env').get('OPENAI_API_KEY','')
 (dst/'.env').write_text('OPENAI_API_KEY='+json.dumps(key)+'\\n')
 (dst/'.env').chmod(0o600)
"""
        subprocess.run([str(ROOT/'.local/hermes-source/.venv/bin/python3'),'-c',code],env=dict(os.environ,FOX_SOURCE_MODEL=str(args.model_home),FOX_TARGET_MODEL=directory),check=True)
        env=dict(os.environ,WORLDLET_DEV='1',WORLDLET_WEB_ROOT=str(ROOT/'dist/WorldletWeb'),WORLDLET_HERMES_PYTHON=str(ROOT/'.local/hermes-source/.venv/bin/python3'),WORLDLET_LATENCY_MODEL_HOME=directory,WORLDLET_LATENCY_STEER_ONLY='1' if args.steer_only else '0',WORLDLET_LATENCY_OUTPUT=str(args.output.resolve()))
        subprocess.run([str(ROOT/'.local/dev/Worldlet Dev.app/Contents/MacOS/Worldlet'),'--fox-latency-check'],env=env,check=True,timeout=1200)
    rows=json.loads(args.output.read_text())
    print(json.dumps([{k:r[k] for k in ('case','completeMs','firstPaintMs','paintMs','prepareMs','modelMs','toolsMs','contextChars') if k in r} for r in rows],indent=2))

if __name__=='__main__':main()
