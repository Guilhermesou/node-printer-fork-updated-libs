#include "node_printer.hpp"

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("getPrinters", Napi::Function::New(env, getPrinters));
    exports.Set("getPrintersAsync", Napi::Function::New(env, getPrintersAsync));
    exports.Set("getDefaultPrinterName", Napi::Function::New(env, getDefaultPrinterName));
    exports.Set("getPrinter", Napi::Function::New(env, getPrinter));
    exports.Set("getPrinterAsync", Napi::Function::New(env, getPrinterAsync));
    exports.Set("getPrinterDriverOptions", Napi::Function::New(env, getPrinterDriverOptions));
    exports.Set("getJob", Napi::Function::New(env, getJob));
    exports.Set("setJob", Napi::Function::New(env, setJob));
    exports.Set("printDirect", Napi::Function::New(env, PrintDirect));
    exports.Set("printFile", Napi::Function::New(env, PrintFile));
    exports.Set("getSupportedPrintFormats", Napi::Function::New(env, getSupportedPrintFormats));
    exports.Set("getSupportedJobCommands", Napi::Function::New(env, getSupportedJobCommands));
    return exports;
}

NODE_API_MODULE(node_printer, Init)

// Helpers

bool getStringOrBufferFromNapiValue(Napi::Value iValue, std::string &oData)
{
    if(iValue.IsString())
    {
        oData = iValue.As<Napi::String>().Utf8Value();
        return true;
    }
    if(iValue.IsBuffer())
    {
        Napi::Buffer<char> buffer = iValue.As<Napi::Buffer<char>>();
        oData.assign(buffer.Data(), buffer.Length());
        return true;
    }
    return false;
}
