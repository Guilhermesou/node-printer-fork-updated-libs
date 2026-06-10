import re

for fn in ['src/node_printer_posix.cc', 'src/node_printer_win.cc']:
    with open(fn, 'r') as f:
        text = f.read()

    text = text.replace('getStringOrBufferFromV8Value', 'getStringOrBufferFromNapiValue')

    with open(fn, 'w') as f:
        f.write(text)

