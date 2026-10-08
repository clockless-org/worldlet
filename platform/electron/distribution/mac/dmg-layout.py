"""Write the installer layout directly; packaging must not depend on Finder UI."""
import pathlib
import sys

from ds_store import DSStore
from mac_alias import Alias, Bookmark

mount = pathlib.Path(sys.argv[1]).resolve()
background = str(mount / '.background/background.png')
with DSStore.open(str(mount / '.DS_Store'), 'w+') as store:
    store['.']['vSrn'] = ('long', 1)
    store['.']['icvl'] = ('type', b'icnv')
    store['.']['bwsp'] = {
        'WindowBounds': '{{360, 160}, {800, 488}}',
        'ShowStatusBar': False, 'ShowToolbar': False, 'ShowPathbar': False,
        'ShowSidebar': False, 'ContainerShowSidebar': False,
        'PreviewPaneVisibility': False, 'ShowTabView': False, 'SidebarWidth': 0,
    }
    store['.']['icvp'] = {
        'viewOptionsVersion': 1, 'backgroundType': 2,
        'backgroundImageAlias': Alias.for_file(background).to_bytes(),
        'gridOffsetX': 0.0, 'gridOffsetY': 0.0, 'gridSpacing': 100.0,
        'arrangeBy': 'none', 'showIconPreview': True, 'showItemInfo': False,
        'labelOnBottom': True, 'textSize': 12.0, 'iconSize': 160.0,
        'scrollPositionX': 0.0, 'scrollPositionY': 0.0,
    }
    store['.']['pBBk'] = Bookmark.for_file(background)
    store['Worldlet.app']['Iloc'] = (200, 220)
    store['Applications']['Iloc'] = (600, 220)

with DSStore.open(str(mount / '.DS_Store'), 'r') as store:
    assert store['Worldlet.app']['Iloc'] == (200, 220)
    assert store['Applications']['Iloc'] == (600, 220)
    assert store['.']['icvp']['iconSize'] == 160.0
print('Installer window layout written and verified without Finder.')
