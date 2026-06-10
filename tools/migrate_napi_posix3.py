import re

with open('src/node_printer_posix.cc', 'r') as f:
    text = f.read()

text = text.replace('*jobCommandV8', 'jobCommandV8')
text = text.replace('iArgs.', 'info.')
text = text.replace('iArgs[0]', 'info[0]')
text = text.replace('*printer,', 'printer.c_str(),')
text = text.replace('Napi::Value arg0(info[0]);', 'Napi::Value arg0 = info[0];')

with open('src/node_printer_posix.cc', 'w') as f:
    f.write(text)

with open('src/node_printer_win.cc', 'r') as f:
    text_win = f.read()

text_win = text_win.replace('*jobCommandV8', 'jobCommandV8')
text_win = text_win.replace('iArgs.', 'info.')
text_win = text_win.replace('iArgs[0]', 'info[0]')
text_win = text_win.replace('Napi::Value arg0(info[0]);', 'Napi::Value arg0 = info[0];')
text_win = text_win.replace('(*printer)', '(printer)')

with open('src/node_printer_win.cc', 'w') as f:
    f.write(text_win)

