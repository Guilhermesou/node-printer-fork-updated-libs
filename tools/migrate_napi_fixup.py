import re

with open('src/node_printer_posix.cc', 'r') as f:
    text = f.read()

text = text.replace('const char filename.c_str();', 'const char* filename;')
text = text.replace('env.Null(;', 'env.Null();')
text = text.replace('env.Undefined(;', 'env.Undefined();')

with open('src/node_printer_posix.cc', 'w') as f:
    f.write(text)

with open('src/node_printer_win.cc', 'r') as f:
    text_win = f.read()

text_win = text_win.replace('env.Null(;', 'env.Null();')
text_win = text_win.replace('env.Undefined(;', 'env.Undefined();')

with open('src/node_printer_win.cc', 'w') as f:
    f.write(text_win)

