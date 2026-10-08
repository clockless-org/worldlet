"""Pinned official dd-cli adapter. No shell, payment submission or credential export."""
import json
import os
from pathlib import Path
import subprocess
from urllib.parse import urlparse

VERSION = '0.2.4'
INTENT = 'Summary: Help the user order food through Worldlet\nuser prompt/purpose: "Food ordering"'
# Deliberately exclude submit, payment, account/address edits and arbitrary flags.
COMMANDS = {
 'addresses': (['address','list'], {}, []),
 'search': (['search'], {'query':str,'address-id':str,'limit':int}, ['query','address-id']),
 'menu': (['menu'], {'store-id':str,'address-id':str}, ['store-id']),
 'item': (['restaurant-item-details'], {'store-id':str,'menu-id':str,'item-id':str,'address-id':str}, ['store-id','menu-id','item-id']),
 'cart_list': (['cart','list'], {'store-id':str}, []),
 'cart_show': (['cart','show'], {'cart-uuid':str}, ['cart-uuid']),
 'cart_add': (['cart','add-items'], {'store-id':str,'menu-id':str,'items-json':str,'cart-uuid':str,'fulfillment':str}, ['store-id','menu-id','items-json']),
 'cart_remove': (['cart','remove-item'], {'cart-uuid':str,'cart-item-id':str}, ['cart-uuid','cart-item-id']),
 'preview': (['order','preview'], {'cart-uuid':str,'fulfillment':str,'include-work-benefits':bool}, ['cart-uuid']),
 'checkout': (['order','checkout-url'], {'cart-uuid':str}, ['cart-uuid']),
 'history': (['order','history'], {'max':int,'days':int}, []),
 'order_status': (['order','status'], {'order-uuid':str}, ['order-uuid'])
}


def binary():
    return Path.home()/'.local/share/worldlet/dd-cli'/VERSION/'dd-cli-v0.2.4-darwin-arm64'


def marker(home):
    return Path(home)/'doordash_enabled.json'


def enabled(home):
    return marker(home).is_file()


def valid_checkout(url):
    try:
        p=urlparse(url)
        return p.scheme=='https' and not p.username and not p.password and p.port in (None,443) and (p.hostname=='doordash.com' or p.hostname.endswith('.doordash.com'))
    except (ValueError,AttributeError):
        return False


def clean(value):
    if isinstance(value,dict):
        return {k:clean(v) for k,v in value.items() if not any(word in k.lower() for word in ('token','authorization','secret','password','assistant_instruction'))}
    if isinstance(value,list):
        return [clean(v) for v in value]
    return value


def argv(operation, parameters):
    if operation not in COMMANDS or not isinstance(parameters,dict):
        raise ValueError('Unsupported DoorDash operation.')
    command,allowed,required=COMMANDS[operation]
    if set(parameters)-set(allowed) or any(k not in parameters for k in required):
        raise ValueError('Missing or unsupported DoorDash parameters.')
    values=dict(parameters)
    if operation=='search': values.setdefault('limit',5)
    if operation=='history': values.setdefault('max',10);values.setdefault('days',30)
    args=['--json-output',*command]
    for key,value in values.items():
        if type(value) is not allowed[key]: raise ValueError('Invalid parameter type: '+key)
        if isinstance(value,str) and (not value or len(value)>20000 or '\0' in value): raise ValueError('Invalid parameter: '+key)
        if type(value) is int and not 1<=value<=({'limit':10,'max':20,'days':365}.get(key,100)): raise ValueError('Parameter exceeds request limit.')
        if key=='fulfillment' and value not in ('delivery','pickup'): raise ValueError('Choose delivery or pickup.')
        if key=='items-json':
            items=json.loads(value)
            if not isinstance(items,list) or not 1<=len(items)<=30: raise ValueError('Choose 1–30 items.')
            for item in items:
                if not isinstance(item,dict) or not item.get('item_id') or not item.get('item_name') or type(item.get('quantity')) is not int or not 1<=item['quantity']<=20: raise ValueError('Each item needs an ID, name and quantity (1–20).')
        if type(value) is bool:
            if value: args.append('--'+key)
        else: args += ['--'+key,str(value)]
    return args+['--intent',INTENT]


def execute(args, timeout=60, mutation=False):
    # Never print raw stderr: authentication failures can contain sensitive URLs.
    try:
        env={k:v for k,v in os.environ.items() if not k.startswith('DD_')}
        result=subprocess.run([str(binary()),*args],stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=timeout,env=env)
    except subprocess.TimeoutExpired:
        return {'ok':False,'error':'DoorDash timed out. '+('Cart changes may have applied. Inspect the cart before trying again.' if mutation else 'Try again when ready.'),'uncertain':mutation}
    if result.returncode:
        return {'ok':False,'error':'DoorDash could not complete the request. '+('Cart changes may have applied. Inspect the cart before trying again.' if mutation else 'Check sign-in and early-access approval in the DoorDash Applet.'),'exitCode':result.returncode,'uncertain':mutation}
    if len(result.stdout)>1_000_000:
        return {'ok':False,'error':'DoorDash returned too much data. Narrow the request.','uncertain':mutation}
    try: value=json.loads(result.stdout)
    except ValueError:
        return {'ok':False,'error':'DoorDash returned an unexpected response. Inspect the cart before repeating any changes.','uncertain':mutation}
    value=clean(value)
    failed=isinstance(value,dict) and (value.get('error') or value.get('success') is False or value.get('ok') is False or value.get('item_errors'))
    return {'ok':not bool(failed),'data':value,**({'error':'DoorDash reported a failure or partial result; '+('inspect the cart before repeating changes.' if mutation else 'inspect returned data before continuing.'),'uncertain':mutation} if failed else {})}


def run(body, home):
    operation=body.get('operation','status')
    installed=binary().is_file() and os.access(binary(),os.X_OK)
    if operation=='status':
        return {'ok':True,'installed':installed,'enabled':enabled(home),'version':VERSION if installed else None,'accountVerified':False}
    if operation=='disconnect':
        marker(home).unlink(missing_ok=True)
        return {'ok':True}
    if not installed:
        return {'ok':False,'error':'Install the official DoorDash CLI with npm run setup:doordash, then sign in here.'}
    if operation=='login':
        # Login opens DoorDash's own browser flow; credentials stay in its Keychain.
        try:
            env={k:v for k,v in os.environ.items() if not k.startswith('DD_')}
            result=subprocess.run([str(binary()),'login'],stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=180,env=env)
        except subprocess.TimeoutExpired:
            return {'ok':False,'error':'DoorDash sign-in timed out. Finish in the browser and try again.'}
        if result.returncode: return {'ok':False,'error':'DoorDash sign-in did not finish. Check the browser and early-access approval.'}
        verified=execute(argv('cart_list',{}))
        if not verified['ok']: return verified
        marker(home).parent.mkdir(parents=True,exist_ok=True)
        marker(home).write_text('{"enabled":true}\n');marker(home).chmod(0o600)
        return {'ok':True,'enabled':True,'accountVerified':True}
    if not enabled(home):
        return {'ok':False,'error':'Connect DoorDash from its bridge-side Applet first.'}
    args=argv(operation,body.get('parameters',{}))
    result=execute(args,mutation=operation in ('cart_add','cart_remove','preview'))
    if operation=='checkout' and result['ok']:
        # Only official secure checkout links may reach Fox.
        def check(value):
            if isinstance(value,str) and value.startswith(('http:','https:')) and not valid_checkout(value): raise ValueError('DoorDash returned an unsupported checkout host.')
            if isinstance(value,dict):
                for v in value.values(): check(v)
            if isinstance(value,list):
                for v in value: check(v)
        check(result['data'])
    return result
