"""Native Drive list and Google Docs text; no external URLs or arbitrary downloads."""
import re
import csv
import io

FIELDS = 'id,name,mimeType,modifiedTime,description,capabilities(canDownload)'
DOC = 'application/vnd.google-apps.document'
SHEET = 'application/vnd.google-apps.spreadsheet'
SLIDES = 'application/vnd.google-apps.presentation'
KINDS = {'google-docs': DOC, 'google-sheets': SHEET, 'google-slides': SLIDES}


def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,256}', value):
        raise ValueError('Invalid Drive file ID.')
    return value


def file_row(value):
    if not isinstance(value, dict) or not isinstance(value.get('name'), str):
        raise ValueError('Drive returned an invalid file.')
    key = identifier(value.get('id'))
    return {'id': key, 'title': value['name'], 'list': value.get('modifiedTime', ''),
            'description': value.get('description', ''), 'mimeType': value.get('mimeType', ''),
            'url': ('https://docs.google.com/' + {DOC: 'document', SHEET: 'spreadsheets', SLIDES: 'presentation'}[value.get('mimeType')] + '/d/' + key + '/edit') if value.get('mimeType') in (DOC, SHEET, SLIDES) else 'https://drive.google.com/file/d/' + key + '/view',
            'details': {'modified': value.get('modifiedTime', ''), 'type': value.get('mimeType', '')}}


def read(api, body):
    operation = body.get('readOperation')
    applet = body.get('applet', 'google-drive')
    if applet not in ('google-drive', *KINDS):
        raise ValueError('Unsupported Drive Applet.')
    kind = KINDS.get(applet)
    if operation == 'list':
        cursor = body.get('cursor', '')
        if not isinstance(cursor, str) or len(cursor) > 4096:
            raise ValueError('Invalid Drive cursor.')
        result = api.files().list(q='trashed = false' + (" and mimeType = '" + kind + "'" if kind else ''), pageSize=20, orderBy='modifiedTime desc',
            fields='nextPageToken,files(' + FIELDS + ')', supportsAllDrives=True,
            includeItemsFromAllDrives=True, **({'pageToken': cursor} if cursor else {})).execute()
        if not isinstance(result.get('files'), list):
            raise RuntimeError('Drive did not return a file list.')
        return {'pages': [file_row(row) for row in result['files']], 'next': result.get('nextPageToken'),
                'connected': True, 'scope': 'Recent files · Export reader · Read only'}
    if operation != 'read':
        raise ValueError('Unsupported Drive read.')
    key = identifier(body.get('id'))
    metadata = api.files().get(fileId=key, fields=FIELDS, supportsAllDrives=True).execute()
    result = file_row(metadata)
    if result['id'] != key:
        raise RuntimeError('Drive returned a different file.')
    mime = metadata.get('mimeType')
    if kind and mime != kind:
        raise ValueError('This file no longer belongs to this Applet. Refresh the list.')
    if mime not in (DOC, SHEET, SLIDES):
        return {**result, 'text': result['description'], 'partial': True,
                'notice': 'File details only. Open Web to read this file in its original format.'}
    if metadata.get('capabilities', {}).get('canDownload') is not True:
        return {**result, 'text': result['description'], 'partial': True,
                'notice': 'This document does not allow export. Open Web to read it.'}
    raw = api.files().export_media(fileId=key, mimeType='text/csv' if mime == SHEET else 'text/plain').execute()
    if not isinstance(raw, bytes):
        raise RuntimeError('Drive did not return document text.')
    if len(raw) > 2 * 1024 * 1024:
        return {**result, 'text': result['description'], 'partial': True,
                'notice': 'This document is too large for the native reader. Open Web for the complete original.'}
    if mime == SHEET:
        csv.field_size_limit(2 * 1024 * 1024)
        rows = []
        for row in csv.reader(io.StringIO(raw.decode('utf-8-sig'))):
            if len(rows) >= 2000 or len(row) > 100:
                return {**result, 'text': result['description'], 'partial': True,
                        'notice': 'This worksheet exceeds the native reader limit (2,000 rows or 100 columns). Open Web for the complete original.'}
            rows.append(row)
        return {**result, 'text': raw.decode('utf-8-sig'), 'table': rows, 'partial': True,
                'notice': 'First worksheet only. Displayed values, without formulas, charts, comments or formatting. Open Web for all sheets and editing.'}
    # Export contains the complete plain text, not a summary. Layout, images and comments remain on Web.
    return {**result, 'text': raw.decode('utf-8-sig'), 'partial': False,
            'notice': 'Plain text export. Images, comments, slide layout and original formatting are available in Web.'}
