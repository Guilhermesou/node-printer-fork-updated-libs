import re

with open('src/node_printer_posix.cc', 'r') as f:
    text = f.read()

text = re.sub(r'return (.*?)\);', r'return \1;', text)
text = text.replace('*printername', 'printername.c_str()')
text = text.replace('*docname', 'docname.c_str()')
text = text.replace('*filename', 'filename.c_str()')
text = text.replace('*type', 'type.c_str()')

with open('src/node_printer_posix.cc', 'w') as f:
    f.write(text)
