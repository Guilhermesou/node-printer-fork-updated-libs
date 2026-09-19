import re
def fix_v8(content):
    content = re.sub(r'V8_VALUE_NEW\(Number,\s*(.*?)\)', r'Napi::Number::New(env, \1)', content)
    content = re.sub(r'V8_VALUE_NEW\(Boolean,\s*(.*?)\)', r'Napi::Boolean::New(env, \1)', content)
    content = re.sub(r'V8_STRING_NEW_UTF8\((.*?)\)', r'Napi::String::New(env, \1)', content)
    content = re.sub(r'V8_STRING_NEW_2BYTES\((.*?)\)', r'Napi::String::New(env, (char16_t*)\1)', content)
    return content

for fn in ['src/node_printer_win.cc', 'src/node_printer_posix.cc']:
    with open(fn, 'r') as f: c = f.read()
    with open(fn, 'w') as f: f.write(fix_v8(c))
