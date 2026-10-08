"""Offline cart-outcome classification; never starts dd-cli or accesses an account."""
import json
from pathlib import Path
import subprocess
import sys
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'harness/hermes'))
import doordash_cli as dd

for outcome in [
    subprocess.CompletedProcess([],1,'','private token=must-not-leak'),
    subprocess.CompletedProcess([],0,'not-json',''),
    subprocess.CompletedProcess([],0,'x'*1_000_001,''),
    subprocess.CompletedProcess([],0,json.dumps({'success':False}),''),
    subprocess.CompletedProcess([],0,json.dumps({'item_errors':[{'message':'one item failed'}],'added':1}),''),
    subprocess.TimeoutExpired('dd-cli',60),
]:
    for mutation in [False,True]:
        kwargs={'side_effect':outcome} if isinstance(outcome,Exception) else {'return_value':outcome}
        with patch.object(dd.subprocess,'run',**kwargs) as run:
            result=dd.execute(['fixture'],mutation=mutation)
            assert result['ok'] is False and result['uncertain'] is mutation,result
            assert 'must-not-leak' not in json.dumps(result)
            assert run.call_count==1,'Never retry a potentially applied cart mutation'
with patch.object(dd.subprocess,'run',return_value=subprocess.CompletedProcess([],0,json.dumps({'cart_id':'fixture','token':'private','success':True}),'')):
    result=dd.execute(['fixture'],mutation=True)
    assert result['ok'] and 'token' not in result['data'] and not result.get('uncertain')
for operation in ['submit','payment','order_submit']:
    try: dd.argv(operation,{})
    except ValueError: pass
    else: raise AssertionError('Payment submission became available')
assert dd.valid_checkout('https://www.doordash.com/checkout')
for url in ['https://doordash.com.evil.test/checkout','https://evil.test/','https://user:secret@doordash.com/','http://doordash.com/']:
    assert not dd.valid_checkout(url)
print('PASS cart failure uncertainty, partial results, no retries, private stderr exclusion and official checkout boundary; no real CLI/account used')
