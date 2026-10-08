#!/usr/bin/env python3
"""Dependency-free protocol example, not an AI model. Replace respond() with your harness."""
import json
import sys
import time

CAPABILITIES = dict(streaming=True, tools=True, cancel=True, steer=False, memory=False, sessions=False)

def send(kind, **fields):
    print(json.dumps(dict(type=kind, **fields)), flush=True)

def read():
    line = sys.stdin.readline()
    if not line:
        raise EOFError()
    return json.loads(line)

def respond(body, request_id):
    action = body.get('action')
    if action == 'status':
        return dict(ready=True, name='Protocol example', capabilities=CAPABILITIES)
    if action != 'chat':
        raise ValueError('This example supports chat only; it does not implement account services.')
    text = body.get('text', '')
    send('response_start', requestId=request_id)
    if text.strip().lower() == 'open browser':
        send('tool', requestId=request_id, id='open-browser', name='open_applet', args={'id': 'app-browser'})
        receipt = read()
        if receipt.get('type') != 'tool_result' or receipt.get('id') != 'open-browser':
            raise ValueError('Tool receipt mismatch')
        message = 'Browser is open.' if receipt['result'].get('ok') else 'Browser could not open: ' + str(receipt['result'].get('error', 'unavailable'))
    elif text.strip().lower() == 'recall companion':
        send('tool', requestId=request_id, id='recall', name='read_companion_archive', args={'query': 'trains'})
        receipt = read()
        if receipt.get('type') != 'tool_result' or receipt.get('id') != 'recall':
            raise ValueError('Recall receipt mismatch')
        records = receipt['result'].get('records', [])
        message = records[0]['text'] if records else 'No matching portable memory.'
    else:
        message = 'Hello from the independent example adapter. You said: ' + text
    for word in message.split(' '):
        send('delta', requestId=request_id, text=word + ' ')
        time.sleep(0.015)
    return dict(message=message)

def main():
    hello = read()
    if hello != dict(type='hello', protocolVersion=1):
        raise ValueError('Unsupported Worldlet protocol')
    send('hello', protocolVersion=1, id='example', capabilities=CAPABILITIES)
    request = read()
    if request.get('type') != 'request':
        raise ValueError('Expected request')
    try:
        send('result', requestId=request['id'], value=respond(request['body'], request['id']))
    except Exception as error:
        send('error', requestId=request['id'], message=str(error))

if __name__ == '__main__':
    main()
