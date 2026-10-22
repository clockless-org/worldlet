"""Pure release ordering policy, shared by publication and deterministic tests."""
NAMESPACE = '{http://www.andymatuschak.org/xml-namespaces/sparkle}'

def version(item):
    return tuple(int(x) for x in item.findtext(NAMESPACE+'version','0').split('.'))

def publication_state(old, target):
    if any(version(item)>version(target) for item in old):
        raise ValueError('A newer build is already published.')
    same=[item for item in old if version(item)==version(target)]
    if not same:
        return 'publish'
    if len(same)!=1:
        raise ValueError('Duplicate published build entries.')
    prior, new = same[0].find('enclosure'), target.find('enclosure')
    for field in ['url','length',NAMESPACE+'edSignature']:
        if not new.get(field) or prior.get(field)!=new.get(field):
            raise ValueError('Published bytes differ; never replace an existing build.')
    return 'retry'
