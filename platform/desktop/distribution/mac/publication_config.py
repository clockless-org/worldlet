"""Separate approved storage routing from immutable candidate update identity."""
def publication_config(candidate, reviewed):
    if reviewed.get('bucket') != 'worldlet-releases':
        raise ValueError('Publication is blocked until reviewed tools target worldlet-releases.')
    for key in ('feedURL', 'intelFeedURL', 'publicKey', 'keychainAccount', 'bucket'):
        if not isinstance(candidate.get(key), str) or not candidate[key]:
            raise ValueError('Candidate update configuration is incomplete.')
    identity = lambda config: {key: value for key, value in config.items() if key != 'bucket'}
    if identity(candidate) != identity(reviewed):
        raise ValueError('Candidate update identity differs from reviewed tools; only storage routing may change.')
    return dict(reviewed)
