import re

with open('src/node_printer_posix.cc', 'r') as f:
    text = f.read()

# Function signatures
text = re.sub(r'MY_NODE_MODULE_CALLBACK\((.*?)\)', r'Napi::Value \1(const Napi::CallbackInfo& info)', text)
text = text.replace('MY_NODE_MODULE_HANDLESCOPE;', 'Napi::Env env = info.Env();')
text = text.replace('v8::Local<v8::Object>', 'Napi::Object')
text = text.replace('v8::Local<v8::Array>', 'Napi::Array')
text = text.replace('v8::Local<v8::Value>', 'Napi::Value')

# Nan::Set(obj, V8_STRING_NEW_UTF8("key"), ...) -> obj.Set("key", ...)
def replace_nan_set(match):
    obj = match.group(1)
    key = match.group(2)
    val = match.group(3)
    # cleanup key
    if 'V8_STRING_NEW_UTF8' in key:
        key = re.sub(r'V8_STRING_NEW_UTF8\((.*?)\)', r'\1', key)
    # cleanup value
    if 'V8_VALUE_NEW(Number, ' in val:
        val = re.sub(r'V8_VALUE_NEW\(Number,\s*(.*?)\)', r'Napi::Number::New(env, \1)', val)
    if 'V8_VALUE_NEW(Boolean, ' in val:
        val = re.sub(r'V8_VALUE_NEW\(Boolean,\s*(.*?)\)', r'Napi::Boolean::New(env, \1)', val)
    if 'V8_STRING_NEW_UTF8' in val:
        val = re.sub(r'V8_STRING_NEW_UTF8\((.*?)\)', r'Napi::String::New(env, \1)', val)
    if 'Nan::New<v8::Date>' in val:
        val = re.sub(r'Nan::New<v8::Date>\((.*?)\)\.ToLocalChecked\(\)', r'Napi::Date::New(env, \1)', val)

    return f'{obj}.Set({key}, {val});'

text = re.sub(r'Nan::Set\(([^,]+),\s*([^,]+),\s*(.+?)\);', replace_nan_set, text)

# Array creations
text = re.sub(r'V8_VALUE_NEW_DEFAULT\(Array\)', 'Napi::Array::New(env)', text)
text = re.sub(r'V8_VALUE_NEW_DEFAULT\(Object\)', 'Napi::Object::New(env)', text)
text = re.sub(r'V8_VALUE_NEW\(Array,\s*(.*?)\)', r'Napi::Array::New(env, \1)', text)
text = re.sub(r'MY_NODE_MODULE_ISOLATE_DECL', 'Napi::Env env = result_printer.Env();', text)

text = text.replace('MY_NODE_MODULE_RETURN_VALUE(', 'return ')
text = re.sub(r'return (.*?);', r'return \1;', text)

# Exceptions
def replace_exception(match):
    msg = match.group(1)
    return f'Napi::Error::New(env, {msg}).ThrowAsJavaScriptException();\n    return env.Null();'

text = re.sub(r'RETURN_EXCEPTION_STR\((.*?)\);', replace_exception, text)

# Args
text = text.replace('REQUIRE_ARGUMENTS(iArgs, 1);', 'if (info.Length() < 1) { Napi::Error::New(env, "Expected 1 arguments").ThrowAsJavaScriptException(); return env.Null(); }')
text = text.replace('REQUIRE_ARGUMENTS(iArgs, 2);', 'if (info.Length() < 2) { Napi::Error::New(env, "Expected 2 arguments").ThrowAsJavaScriptException(); return env.Null(); }')
text = text.replace('REQUIRE_ARGUMENTS(iArgs, 3);', 'if (info.Length() < 3) { Napi::Error::New(env, "Expected 3 arguments").ThrowAsJavaScriptException(); return env.Null(); }')
text = text.replace('REQUIRE_ARGUMENTS(iArgs, 5);', 'if (info.Length() < 5) { Napi::Error::New(env, "Expected 5 arguments").ThrowAsJavaScriptException(); return env.Null(); }')

# String args
text = re.sub(r'REQUIRE_ARGUMENT_STRING\(iArgs,\s*0,\s*(.*?)\);', r'if (!info[0].IsString()) { Napi::Error::New(env, "Argument 0 must be a string").ThrowAsJavaScriptException(); return env.Null(); }\n    std::string \1 = info[0].As<Napi::String>().Utf8Value();', text)
text = re.sub(r'REQUIRE_ARGUMENT_STRING\(iArgs,\s*1,\s*(.*?)\);', r'if (!info[1].IsString()) { Napi::Error::New(env, "Argument 1 must be a string").ThrowAsJavaScriptException(); return env.Null(); }\n    std::string \1 = info[1].As<Napi::String>().Utf8Value();', text)
text = re.sub(r'REQUIRE_ARGUMENT_STRING\(iArgs,\s*2,\s*(.*?)\);', r'if (!info[2].IsString()) { Napi::Error::New(env, "Argument 2 must be a string").ThrowAsJavaScriptException(); return env.Null(); }\n    std::string \1 = info[2].As<Napi::String>().Utf8Value();', text)
text = re.sub(r'REQUIRE_ARGUMENT_STRING\(iArgs,\s*3,\s*(.*?)\);', r'if (!info[3].IsString()) { Napi::Error::New(env, "Argument 3 must be a string").ThrowAsJavaScriptException(); return env.Null(); }\n    std::string \1 = info[3].As<Napi::String>().Utf8Value();', text)

text = re.sub(r'REQUIRE_ARGUMENT_INTEGER\(iArgs,\s*1,\s*(.*?)\);', r'if (!info[1].IsNumber()) { Napi::Error::New(env, "Argument 1 must be an integer").ThrowAsJavaScriptException(); return env.Null(); }\n    int \1 = info[1].As<Napi::Number>().Int32Value();', text)
text = re.sub(r'REQUIRE_ARGUMENT_OBJECT\(iArgs,\s*3,\s*(.*?)\);', r'if (!info[3].IsObject()) { Napi::Error::New(env, "Argument 3 must be an object").ThrowAsJavaScriptException(); return env.Null(); }\n    Napi::Object \1 = info[3].As<Napi::Object>();', text)
text = re.sub(r'REQUIRE_ARGUMENT_OBJECT\(iArgs,\s*4,\s*(.*?)\);', r'if (!info[4].IsObject()) { Napi::Error::New(env, "Argument 4 must be an object").ThrowAsJavaScriptException(); return env.Null(); }\n    Napi::Object \1 = info[4].As<Napi::Object>();', text)


text = text.replace('MY_NODE_MODULE_RETURN_UNDEFINED();', 'return env.Undefined();')

with open('src/node_printer_posix_napi.cc', 'w') as f:
    f.write(text)

