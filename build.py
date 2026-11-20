#!/usr/bin/env python3
"""Bundle Blockscape into one self-contained HTML file you can double-click.

Usage:  python3 build.py
Writes Blockscape.html next to this script with three.js and every game script inlined,
so it runs offline from any folder.
"""
import os
import re

# 67
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'Blockscape.html')

# 67

def read(rel):
    with open(os.path.join(HERE, rel), encoding='utf-8') as f:
        return f.read()

# 67

# 67
def inline(js):
    # A literal "</script" inside a script would end the tag early.
    return '<script>\n' + js.replace('</script', '<\\/script') + '\n</script>'

# 67

html = read('index.html')
# The CDN fallback only matters for the multi-file version.
html = re.sub(r'<script>window\.THREE \|\|.*?</script>\n', '', html)
html = html.replace('<script src="vendor/three.min.js"></script>', inline(read('vendor/three.min.js')))
for name in re.findall(r'<script src="(js/[a-z]+\.js)"></script>', html):
    html = html.replace('<script src="%s"></script>' % name, inline(read(name)))

# 67
assert 'src="js/' not in html and 'src="vendor/' not in html, 'a script was not inlined'
with open(OUT, 'w', encoding='utf-8') as f:
    f.write(html)
print('Wrote %s (%.0f KB)' % (OUT, os.path.getsize(OUT) / 1024))

# 67