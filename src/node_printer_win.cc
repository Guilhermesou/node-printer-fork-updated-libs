#include "node_printer.hpp"

#if _MSC_VER
#include <windows.h>
#include <Winspool.h>
#include <Wingdi.h>
#pragma  comment(lib, "Winspool.lib")
#else
#error "Unsupported compiler for windows. Feel free to add it."
#endif

#include <string>
#include <map>
#include <utility>
#include <sstream>
#include <fstream>
#include <thread>
#include <chrono>


namespace{
    typedef std::map<std::string, DWORD> StatusMapType;

    /** Memory value class management to avoid memory leak
    */
    template<typename Type>
    class MemValue: public MemValueBase<Type> {
    public:
        /** Constructor of allocating iSizeKbytes bytes memory;
        * @param iSizeKbytes size in bytes of required allocating memory
        */
        MemValue(const DWORD iSizeKbytes) {
            _value = (Type*)malloc(iSizeKbytes);
        }
		
        ~MemValue () {
            free();
        }
    protected:
        virtual void free() {
            if(_value != NULL)
            {
                ::free(_value);
                _value = NULL;
            }
        }
    };

    struct PrinterHandle
    {
        PrinterHandle(LPWSTR iPrinterName)
        {
            _ok = OpenPrinterW(iPrinterName, &_printer, NULL);
        }
        ~PrinterHandle()
        {
            if(_ok)
            {
                ClosePrinter(_printer);
            }
        }
        operator HANDLE() {return _printer;}
        operator bool() { return (!!_ok;}
        HANDLE & operator *() { return _printer;}
        HANDLE * operator ->() { return &_printer;}
        const HANDLE & operator ->() const { return _printer;}
        HANDLE _printer;
        BOOL _ok;
    };

    const StatusMapType& getStatusMap()
    {
        static StatusMapType result;
        if(!result.empty())
        {
            return result;
        }
        // add only first time
#define STATUS_PRINTER_ADD(value, type) result.insert(std::make_pair(value, type))
        STATUS_PRINTER_ADD("BUSY", PRINTER_STATUS_BUSY);
        STATUS_PRINTER_ADD("DOOR-OPEN", PRINTER_STATUS_DOOR_OPEN);
        STATUS_PRINTER_ADD("ERROR", PRINTER_STATUS_ERROR);
        STATUS_PRINTER_ADD("INITIALIZING", PRINTER_STATUS_INITIALIZING);
        STATUS_PRINTER_ADD("IO-ACTIVE", PRINTER_STATUS_IO_ACTIVE);
        STATUS_PRINTER_ADD("MANUAL-FEED", PRINTER_STATUS_MANUAL_FEED);
        STATUS_PRINTER_ADD("NO-TONER", PRINTER_STATUS_NO_TONER);
        STATUS_PRINTER_ADD("NOT-AVAILABLE", PRINTER_STATUS_NOT_AVAILABLE);
        STATUS_PRINTER_ADD("OFFLINE", PRINTER_STATUS_OFFLINE);
        STATUS_PRINTER_ADD("OUT-OF-MEMORY", PRINTER_STATUS_OUT_OF_MEMORY);
        STATUS_PRINTER_ADD("OUTPUT-BIN-FULL", PRINTER_STATUS_OUTPUT_BIN_FULL);
        STATUS_PRINTER_ADD("PAGE-PUNT", PRINTER_STATUS_PAGE_PUNT);
        STATUS_PRINTER_ADD("PAPER-JAM", PRINTER_STATUS_PAPER_JAM);
        STATUS_PRINTER_ADD("PAPER-OUT", PRINTER_STATUS_PAPER_OUT);
        STATUS_PRINTER_ADD("PAPER-PROBLEM", PRINTER_STATUS_PAPER_PROBLEM);
        STATUS_PRINTER_ADD("PAUSED", PRINTER_STATUS_PAUSED);
        STATUS_PRINTER_ADD("PENDING-DELETION", PRINTER_STATUS_PENDING_DELETION);
        STATUS_PRINTER_ADD("POWER-SAVE", PRINTER_STATUS_POWER_SAVE);
        STATUS_PRINTER_ADD("PRINTING", PRINTER_STATUS_PRINTING);
        STATUS_PRINTER_ADD("PROCESSING", PRINTER_STATUS_PROCESSING);
        STATUS_PRINTER_ADD("SERVER-UNKNOWN", PRINTER_STATUS_SERVER_UNKNOWN);
        STATUS_PRINTER_ADD("TONER-LOW", PRINTER_STATUS_TONER_LOW);
        STATUS_PRINTER_ADD("USER-INTERVENTION", PRINTER_STATUS_USER_INTERVENTION);
        STATUS_PRINTER_ADD("WAITING", PRINTER_STATUS_WAITING);
        STATUS_PRINTER_ADD("WARMING-UP", PRINTER_STATUS_WARMING_UP);
#undef STATUS_PRINTER_ADD
        return result;
    }

    const StatusMapType& getJobStatusMap()
    {
        static StatusMapType result;
        if(!result.empty())
        {
            return result;
        }
        // add only first time
#define STATUS_PRINTER_ADD(value, type) result.insert(std::make_pair(value, type))
        // Common statuses
        STATUS_PRINTER_ADD("PRINTING", JOB_STATUS_PRINTING);
        STATUS_PRINTER_ADD("PRINTED", JOB_STATUS_PRINTED);
        STATUS_PRINTER_ADD("PAUSED", JOB_STATUS_PAUSED);

        // Specific statuses
        STATUS_PRINTER_ADD("BLOCKED-DEVQ", JOB_STATUS_BLOCKED_DEVQ);
        STATUS_PRINTER_ADD("DELETED", JOB_STATUS_DELETED);
        STATUS_PRINTER_ADD("DELETING", JOB_STATUS_DELETING);
        STATUS_PRINTER_ADD("ERROR", JOB_STATUS_ERROR);
        STATUS_PRINTER_ADD("OFFLINE", JOB_STATUS_OFFLINE);
        STATUS_PRINTER_ADD("PAPEROUT", JOB_STATUS_PAPEROUT);
        STATUS_PRINTER_ADD("RESTART", JOB_STATUS_RESTART);
        STATUS_PRINTER_ADD("SPOOLING", JOB_STATUS_SPOOLING);
        STATUS_PRINTER_ADD("USER-INTERVENTION", JOB_STATUS_USER_INTERVENTION);
        // XP and later
#ifdef JOB_STATUS_COMPLETE
        STATUS_PRINTER_ADD("COMPLETE", JOB_STATUS_COMPLETE);
#endif
#ifdef JOB_STATUS_RETAINED
        STATUS_PRINTER_ADD("RETAINED", JOB_STATUS_RETAINED);
#endif

#undef STATUS_PRINTER_ADD
        return result;
    }

    const StatusMapType& getAttributeMap()
    {
        static StatusMapType result;
        if(!result.empty())
        {
            return result;
        }
        // add only first time
#define ATTRIBUTE_PRINTER_ADD(value, type) result.insert(std::make_pair(value, type))
        ATTRIBUTE_PRINTER_ADD("DIRECT", PRINTER_ATTRIBUTE_DIRECT);
        ATTRIBUTE_PRINTER_ADD("DO-COMPLETE-FIRST", PRINTER_ATTRIBUTE_DO_COMPLETE_FIRST);
        ATTRIBUTE_PRINTER_ADD("ENABLE-DEVQ", PRINTER_ATTRIBUTE_ENABLE_DEVQ);
        ATTRIBUTE_PRINTER_ADD("HIDDEN", PRINTER_ATTRIBUTE_HIDDEN);
        ATTRIBUTE_PRINTER_ADD("KEEPPRINTEDJOBS", PRINTER_ATTRIBUTE_KEEPPRINTEDJOBS);
        ATTRIBUTE_PRINTER_ADD("LOCAL", PRINTER_ATTRIBUTE_LOCAL);
        ATTRIBUTE_PRINTER_ADD("NETWORK", PRINTER_ATTRIBUTE_NETWORK);
        ATTRIBUTE_PRINTER_ADD("PUBLISHED", PRINTER_ATTRIBUTE_PUBLISHED);
        ATTRIBUTE_PRINTER_ADD("QUEUED", PRINTER_ATTRIBUTE_QUEUED);
        ATTRIBUTE_PRINTER_ADD("RAW-ONLY", PRINTER_ATTRIBUTE_RAW_ONLY);
        ATTRIBUTE_PRINTER_ADD("SHARED", PRINTER_ATTRIBUTE_SHARED);
        ATTRIBUTE_PRINTER_ADD("OFFLINE", PRINTER_ATTRIBUTE_WORK_OFFLINE);
        // XP
#ifdef PRINTER_ATTRIBUTE_FAX
        ATTRIBUTE_PRINTER_ADD("FAX", PRINTER_ATTRIBUTE_FAX);
#endif
        // vista
#ifdef PRINTER_ATTRIBUTE_FRIENDLY_NAME
        ATTRIBUTE_PRINTER_ADD("FRIENDLY-NAME", PRINTER_ATTRIBUTE_FRIENDLY_NAME);
        ATTRIBUTE_PRINTER_ADD("MACHINE", PRINTER_ATTRIBUTE_MACHINE);
        ATTRIBUTE_PRINTER_ADD("PUSHED-USER", PRINTER_ATTRIBUTE_PUSHED_USER);
        ATTRIBUTE_PRINTER_ADD("PUSHED-MACHINE", PRINTER_ATTRIBUTE_PUSHED_MACHINE);
#endif
        // server 2003
#ifdef PRINTER_ATTRIBUTE_TS
        ATTRIBUTE_PRINTER_ADD("TS", PRINTER_ATTRIBUTE_TS);
#endif
#undef ATTRIBUTE_PRINTER_ADD
        return result;
    }

    const StatusMapType& getJobCommandMap()
    {
        static StatusMapType result;
        if(!result.empty())
        {
            return result;
        }
        // add only first time
#define COMMAND_JOB_ADD(value, type) result.insert(std::make_pair(value, type))
        COMMAND_JOB_ADD("CANCEL", JOB_CONTROL_CANCEL);
        COMMAND_JOB_ADD("PAUSE", JOB_CONTROL_PAUSE);
        COMMAND_JOB_ADD("RESTART", JOB_CONTROL_RESTART);
        COMMAND_JOB_ADD("RESUME", JOB_CONTROL_RESUME);
        COMMAND_JOB_ADD("DELETE", JOB_CONTROL_DELETE);
        COMMAND_JOB_ADD("SENT-TO-PRINTER", JOB_CONTROL_SENT_TO_PRINTER);
        COMMAND_JOB_ADD("LAST-PAGE-EJECTED", JOB_CONTROL_LAST_PAGE_EJECTED);
#ifdef JOB_CONTROL_RETAIN
        COMMAND_JOB_ADD("RETAIN", JOB_CONTROL_RETAIN);
#endif
#ifdef JOB_CONTROL_RELEASE
        COMMAND_JOB_ADD("RELEASE", JOB_CONTROL_RELEASE);
#endif
#undef COMMAND_JOB_ADD
        return result;
    }

    void parseJobObject(JOB_INFO_2W *job, Napi::Object result_printer_job)
    {
        Napi::Env env = result_printer_job.Env();
        //Common fields
        //DWORD                JobId;
        result_printer_job.Set("id", Napi::Number::New(env, job->JobId));
#define ADD_V8_STRING_PROPERTY(name, key) if((job->##key != NULL) && (*job->##key != L'\0'))    \
        {                                   \
            result_printer_job.Set(#name, Napi::String::New(env, (char16_t*)(uint16_t*)job->##key)); \
        }
        //LPTSTR               pPrinterName;
        ADD_V8_STRING_PROPERTY(name, pPrinterName)
        //LPTSTR               pPrinterName;
        ADD_V8_STRING_PROPERTY(printerName, pPrinterName);
        //LPTSTR               pUserName;
        ADD_V8_STRING_PROPERTY(user, pUserName);
        //LPTSTR               pDatatype;
        ADD_V8_STRING_PROPERTY(format, pDatatype);
        //DWORD                Priority;
        result_printer_job.Set("priority", Napi::Number::New(env, job->Priority));
        //DWORD                Size;
        result_printer_job.Set("size", Napi::Number::New(env, job->Size));
        //DWORD                Status;
        Napi::Array result_printer_job_status = Napi::Array::New(env);
        int i_status = 0;
        for(StatusMapType::const_iterator itStatus = getJobStatusMap().begin(); itStatus != getJobStatusMap().end(); ++itStatus)
        {
            if(job->Status & itStatus->second)
            {
                result_printer_job_status.Set(i_status++, Napi::String::New(env, itStatus->first.c_str()));
            }
        }
        //LPTSTR               pStatus;
        if((job->pStatus != NULL) && (*job->pStatus != L'\0'))
        {
            result_printer_job_status.Set(i_status++, Napi::String::New(env, (char16_t*)(uint16_t*)job->pStatus));
        }
        result_printer_job.Set("status", result_printer_job_status);

        // Specific fields
        //LPTSTR               pMachineName;
        ADD_V8_STRING_PROPERTY(machineName, pMachineName);
        //LPTSTR               pDocument;
        ADD_V8_STRING_PROPERTY(document, pDocument);
        //LPTSTR               pNotifyName;
        ADD_V8_STRING_PROPERTY(notifyName, pNotifyName);
        //LPTSTR               pPrintProcessor;
        ADD_V8_STRING_PROPERTY(printProcessor, pPrintProcessor);
        //LPTSTR               pParameters;
        ADD_V8_STRING_PROPERTY(parameters, pParameters);
        //LPTSTR               pDriverName;
        ADD_V8_STRING_PROPERTY(driverName, pDriverName);
#undef ADD_V8_STRING_PROPERTY
        //LPDEVMODE            pDevMode;
        //PSECURITY_DESCRIPTOR pSecurityDescriptor;
        //DWORD                Position;
        result_printer_job.Set("position", Napi::Number::New(env, job->Position));
        //DWORD                StartTime;
        result_printer_job.Set("startTime", Napi::Number::New(env, job->StartTime));
        //DWORD                UntilTime;
        result_printer_job.Set("untilTime", Napi::Number::New(env, job->UntilTime));
        //DWORD                TotalPages;
        result_printer_job.Set("totalPages", Napi::Number::New(env, job->TotalPages));
        //SYSTEMTIME           Submitted;
        //DWORD                Time;
        result_printer_job.Set("time", Napi::Number::New(env, job->Time));
        //DWORD                PagesPrinted;
        result_printer_job.Set("pagesPrinted", Napi::Number::New(env, job->PagesPrinted));
    }

    /**
     * Returns last error code and message string
     */
    std::string getLastErrorCodeAndMessage() {
    	std::ostringstream s;
    	DWORD erroCode = GetLastError();
    	s << "code: " << erroCode;
    	DWORD retSize;
    	LPTSTR pTemp = NULL;
    	retSize = FormatMessage(FORMAT_MESSAGE_ALLOCATE_BUFFER|
                                FORMAT_MESSAGE_FROM_SYSTEM|
                                FORMAT_MESSAGE_ARGUMENT_ARRAY,
                                NULL,
                                erroCode,
                                LANG_NEUTRAL,
                                (LPTSTR)&pTemp,
                                0,
                                NULL );
        if (retSize && pTemp != NULL) {
	    //pTemp[strlen(pTemp)-2]='\0'; //remove cr and newline character
	    //TODO: check if it is needed to convert c string to std::string
	    std::string stringMessage(pTemp);
	    s << ", message: " << stringMessage;
	    LocalFree((HLOCAL)pTemp);
	}

    	return s.str();
    }

    std::string retrieveAndParseJobs(const LPWSTR iPrinterName,
                                     const DWORD& iTotalJobs,
                                     Napi::Object result_printer_jobs,
                                     PrinterHandle& iPrinterHandle)
    {
        Napi::Env env = result_printer_jobs.Env();
        DWORD bytes_needed = 0, totalJobs = 0;
        BOOL bError = EnumJobsW(*iPrinterHandle, 0, iTotalJobs, 2, NULL, bytes_needed, &bytes_needed, &totalJobs);
        MemValue<JOB_INFO_2W> jobs(bytes_needed);
        if(!jobs)
        {
            std::string error_str("Error on allocating memory for jobs: ");
            error_str += getLastErrorCodeAndMessage();
            Napi::Object result_printer_job = Napi::Object::New(env);
            result_printer_job.Set("error", Napi::String::New(env, error_str.c_str()));
            result_printer_jobs.Set(0, result_printer_job);
            return std::string("";
        }
        DWORD dummy_bytes = 0;
        bError = EnumJobsW(*iPrinterHandle, 0, iTotalJobs, 2, (LPBYTE)jobs.get(), bytes_needed, &dummy_bytes, &totalJobs);
        if(!bError)
        {
            std::string error_str("Error on EnumJobsW: ");
            error_str += getLastErrorCodeAndMessage();
            Napi::Object result_printer_job = Napi::Object::New(env);
            result_printer_job.Set("error", Napi::String::New(env, error_str.c_str()));
            result_printer_jobs.Set(0, result_printer_job);
            return std::string("";
        }
        JOB_INFO_2W *job = jobs.get();
        for(DWORD i = 0; i < totalJobs; ++i, ++job)
        {
            Napi::Object result_printer_job = Napi::Object::New(env);
            parseJobObject(job, result_printer_job);
            result_printer_jobs.Set(i, result_printer_job);
        }
        return std::string("";
    }

    std::string parsePrinterInfo(const PRINTER_INFO_2W *printer, Napi::Object result_printer, PrinterHandle& iPrinterHandle)
    {
        Napi::Env env = result_printer.Env();
    #define ADD_V8_STRING_PROPERTY(name, key) if((printer->##key != NULL) && (*printer->##key != L'\0'))    \
        {                                   \
            result_printer.Set(#name, Napi::String::New(env, (char16_t*)(uint16_t*)printer->##key)); \
        }
        //LPTSTR               pPrinterName;
        ADD_V8_STRING_PROPERTY(name, pPrinterName)
        //LPTSTR               pServerName;
        ADD_V8_STRING_PROPERTY(serverName, pServerName)
        //LPTSTR               pShareName;
        ADD_V8_STRING_PROPERTY(shareName, pShareName)
        //LPTSTR               pPortName;
        ADD_V8_STRING_PROPERTY(portName, pPortName)
        //LPTSTR               pDriverName;
        ADD_V8_STRING_PROPERTY(driverName, pDriverName)
        //LPTSTR               pComment;
        ADD_V8_STRING_PROPERTY(comment, pComment)
        //LPTSTR               pLocation;
        ADD_V8_STRING_PROPERTY(location, pLocation)
        //LPTSTR               pSepFile;
        ADD_V8_STRING_PROPERTY(sepFile, pSepFile)
        //LPTSTR               pPrintProcessor;
        ADD_V8_STRING_PROPERTY(printProcessor, pPrintProcessor)
        //LPTSTR               pDatatype;
        ADD_V8_STRING_PROPERTY(datatype, pDatatype)
        //LPTSTR               pParameters;
        ADD_V8_STRING_PROPERTY(parameters, pParameters)
    #undef ADD_V8_STRING_PROPERTY
        //DWORD                Status;
        // statuses from:
        // http://msdn.microsoft.com/en-gb/library/windows/desktop/dd162845(v=vs.85).aspx
        Napi::Array result_printer_status = Napi::Array::New(env);
        int i_status = 0;
        for(StatusMapType::const_iterator itStatus = getStatusMap().begin(); itStatus != getStatusMap().end(); ++itStatus)
        {
            if(printer->Status & itStatus->second)
            {
                result_printer_status.Set(i_status, Napi::String::New(env, itStatus->first.c_str()));
                ++i_status;
            }
        }
        result_printer.Set("status", result_printer_status);
        result_printer.Set("statusNumber", Napi::Number::New(env, printer->Status));
        //DWORD                Attributes;
        Napi::Array result_printer_attributes = Napi::Array::New(env);
        int i_attribute = 0;
        for(StatusMapType::const_iterator itAttribute = getAttributeMap().begin(); itAttribute != getAttributeMap().end(); ++itAttribute)
        {
            if(printer->Attributes & itAttribute->second)
            {
                result_printer_attributes.Set(i_attribute, Napi::String::New(env, itAttribute->first.c_str()));
                ++i_attribute;
            }
        }
        result_printer.Set("attributes", result_printer_attributes);
        //DWORD                Priority;
        result_printer.Set("priority", Napi::Number::New(env, printer->Priority));
        //DWORD                DefaultPriority;
        result_printer.Set("defaultPriority", Napi::Number::New(env, printer->DefaultPriority));
        //DWORD                cJobs;
        //result_printer.Set("jobs", Napi::Number::New(env, printer->cJobs));
        //DWORD                AveragePPM;
        result_printer.Set("averagePPM", Napi::Number::New(env, printer->AveragePPM));

        //DWORD                StartTime;
        if(printer->StartTime > 0)
        {
            result_printer.Set("startTime", Napi::Number::New(env, printer->StartTime));
        }
        //DWORD                UntilTime;
        if(printer->UntilTime > 0)
        {
            result_printer.Set("untilTime", Napi::Number::New(env, printer->UntilTime));
        }

        //TODO: to finish to extract all data
        //LPDEVMODE            pDevMode;
        //PSECURITY_DESCRIPTOR pSecurityDescriptor;

        if(printer->cJobs > 0)
        {
            Napi::Array result_printer_jobs = Napi::Array::New(env, printer->cJobs);
            // get jobs
            std::string error_str = retrieveAndParseJobs(printer->pPrinterName, printer->cJobs, result_printer_jobs, iPrinterHandle);
            if(!error_str.empty())
            {
                return error_str;
            }
            result_printer.Set("jobs", result_printer_jobs);
        }
        return "";
    }
}

Napi::Value getPrinters(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    DWORD printers_size = 0;
    DWORD printers_size_bytes = 0, dummyBytes = 0;
    DWORD Level = 2;
    DWORD flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;// https://msdn.microsoft.com/en-us/library/cc244669.aspx
    // First try to retrieve the number of printers
    BOOL bError = EnumPrintersW(flags, NULL, 2, NULL, 0, &printers_size_bytes, &printers_size);
    // allocate the required memmory
    MemValue<PRINTER_INFO_2W> printers(printers_size_bytes);
    if(!printers)
    {
        Napi::Error::New(env, "Error on allocating memory for printers").ThrowAsJavaScriptException();
    return env.Null();
    }

    bError = EnumPrintersW(flags, NULL, 2, (LPBYTE)(printers.get()), printers_size_bytes, &dummyBytes, &printers_size);
    if(!bError)
    {
        std::string error_str("Error on EnumPrinters: ");
	error_str += getLastErrorCodeAndMessage();
        Napi::Error::New(env, error_str.c_str()).ThrowAsJavaScriptException();
    return env.Null();
    }
    Napi::Array result = Napi::Array::New(env, printers_size);
    // http://msdn.microsoft.com/en-gb/library/windows/desktop/dd162845(v=vs.85).aspx
	PRINTER_INFO_2W *printer = printers.get();
	DWORD i = 0;
    for(; i < printers_size; ++i, ++printer)
    {
        Napi::Object result_printer = Napi::Object::New(env);
        PrinterHandle printerHandle((LPWSTR)(printer->pPrinterName));
        std::string error_str = parsePrinterInfo(printer, result_printer, printerHandle);
        if(!error_str.empty())
        {
            Napi::Error::New(env, error_str.c_str()).ThrowAsJavaScriptException();
    return env.Null();
        }
        result.Set(i, result_printer);
    }
    return result;
}

class GetPrintersWorker : public Napi::AsyncWorker {
public:
    GetPrintersWorker(Napi::Env env, Napi::Promise::Deferred deferred)
        : Napi::AsyncWorker(env, "GetPrintersWorker"),
          deferred(deferred), printers_size(0), printers(0) {}

    void Execute() override {
        DWORD printers_size_bytes = 0, dummyBytes = 0;
        DWORD flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
        BOOL bError = EnumPrintersW(flags, NULL, 2, NULL, 0, &printers_size_bytes, &printers_size);

        printers.allocate(printers_size_bytes);
        if(!printers) {
            SetError("Error on allocating memory for printers");
            return;
        }

        bError = EnumPrintersW(flags, NULL, 2, (LPBYTE)(printers.get()), printers_size_bytes, &dummyBytes, &printers_size);
        if(!bError) {
            std::string error_str("Error on EnumPrinters: ");
            error_str += getLastErrorCodeAndMessage();
            SetError(error_str);
            return;
        }
    }

    void OnOK() override {
        Napi::Env env = Env();
        Napi::Array result = Napi::Array::New(env, printers_size);
        PRINTER_INFO_2W *printer = printers.get();
        
        for(DWORD i = 0; i < printers_size; ++i, ++printer) {
            Napi::Object result_printer = Napi::Object::New(env);
            PrinterHandle printerHandle((LPWSTR)(printer->pPrinterName));
            std::string error_str = parsePrinterInfo(printer, result_printer, printerHandle);
            if(!error_str.empty()) {
                deferred.Reject(Napi::Error::New(env, error_str).Value());
                return;
            }
            result.Set(i, result_printer);
        }
        deferred.Resolve(result);
    }

    void OnError(const Napi::Error& e) override {
        deferred.Reject(e.Value());
    }

private:
    Napi::Promise::Deferred deferred;
    DWORD printers_size;
    MemValue<PRINTER_INFO_2W> printers;
};

Napi::Value getPrintersAsync(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);
    GetPrintersWorker* worker = new GetPrintersWorker(env, deferred);
    worker->Queue();
    return deferred.Promise();
}


Napi::Value getDefaultPrinterName(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    // size in chars of the printer name: https://msdn.microsoft.com/en-us/library/windows/desktop/dd144876(v=vs.85).aspx
    DWORD cSize = 0;
    GetDefaultPrinterW(NULL, &cSize);

    if(cSize == 0) {
        return Napi::String::New(env, "");
    }

    MemValue<uint16_t> bPrinterName(cSize*sizeof(uint16_t));
    BOOL res = GetDefaultPrinterW((LPWSTR)(bPrinterName.get()), &cSize);

    if(!res) {
        return Napi::String::New(env, "");
    }

    return Napi::String::New(env, (char16_t*)(uint16_t*)bPrinterName.get());
}

Napi::Value getPrinter(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 1) { Napi::Error::New(env, "Expected 1 arguments").ThrowAsJavaScriptException(); return env.Null(); }
    if (!info[0].IsString()) { Napi::Error::New(env, "Argument 0 must be a string").ThrowAsJavaScriptException(); return env.Null(); }
    std::u16string printername_u16 = info[0].As<Napi::String>().Utf16Value();
    auto printername = printername_u16.c_str();

    // Open a handle to the printer.
    PrinterHandle printerHandle((LPWSTR)(printername));
    if(!printerHandle)
    {
        std::string error_str("error on PrinterHandle: ");
        error_str += getLastErrorCodeAndMessage();
        Napi::Error::New(env, error_str.c_str()).ThrowAsJavaScriptException();
    return env.Null();
    }
    DWORD printers_size_bytes = 0, dummyBytes = 0;
    GetPrinterW(*printerHandle, 2, NULL, printers_size_bytes, &printers_size_bytes);
    MemValue<PRINTER_INFO_2W> printer(printers_size_bytes);
    if(!printer)
    {
        Napi::Error::New(env, "Error on allocating memory for printers").ThrowAsJavaScriptException();
    return env.Null();
    }
    BOOL bOK = GetPrinterW(*printerHandle, 2, (LPBYTE)(printer.get()), printers_size_bytes, &printers_size_bytes);
    if(!bOK)
    {
        std::string error_str("Error on GetPrinter: ");
	error_str += getLastErrorCodeAndMessage();
        Napi::Error::New(env, error_str.c_str()).ThrowAsJavaScriptException();
    return env.Null();
    }
    Napi::Object result_printer = Napi::Object::New(env);
    std::string error_str = parsePrinterInfo(printer.get(), result_printer, printerHandle);
    if(!error_str.empty())
    {
        Napi::Error::New(env, error_str.c_str()).ThrowAsJavaScriptException();
    return env.Null();
    }

    return result_printer;
}

class GetPrinterWorker : public Napi::AsyncWorker {
public:
    GetPrinterWorker(Napi::Env env, Napi::Promise::Deferred deferred, std::u16string printername)
        : Napi::AsyncWorker(env, "GetPrinterWorker"),
          deferred(deferred), printername(printername), printer(0) {}

    void Execute() override {
        PrinterHandle printerHandle((LPWSTR)printername.c_str());
        if(!printerHandle) {
            std::string error_str("error on PrinterHandle: ");
            error_str += getLastErrorCodeAndMessage();
            SetError(error_str);
            return;
        }

        DWORD printers_size_bytes = 0;
        GetPrinterW(*printerHandle, 2, NULL, printers_size_bytes, &printers_size_bytes);
        printer.allocate(printers_size_bytes);

        if(!printer) {
            SetError("Error on allocating memory for printers");
            return;
        }

        BOOL bOK = GetPrinterW(*printerHandle, 2, (LPBYTE)(printer.get()), printers_size_bytes, &printers_size_bytes);
        if(!bOK) {
            std::string error_str("Error on GetPrinter: ");
            error_str += getLastErrorCodeAndMessage();
            SetError(error_str);
            return;
        }
    }

    void OnOK() override {
        Napi::Env env = Env();
        Napi::Object result_printer = Napi::Object::New(env);
        PrinterHandle printerHandle((LPWSTR)printername.c_str());
        
        std::string error_str = parsePrinterInfo(printer.get(), result_printer, printerHandle);
        if(!error_str.empty()) {
            deferred.Reject(Napi::Error::New(env, error_str).Value());
            return;
        }
        deferred.Resolve(result_printer);
    }

    void OnError(const Napi::Error& e) override {
        deferred.Reject(e.Value());
    }

private:
    Napi::Promise::Deferred deferred;
    std::u16string printername;
    MemValue<PRINTER_INFO_2W> printer;
};

Napi::Value getPrinterAsync(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1) { Napi::Error::New(env, "Expected 1 arguments").ThrowAsJavaScriptException(); return env.Null(); }
    if (!info[0].IsString()) { Napi::Error::New(env, "Argument 0 must be a string").ThrowAsJavaScriptException(); return env.Null(); }
    std::u16string printername_u16 = info[0].As<Napi::String>().Utf16Value();

    Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);
    GetPrinterWorker* worker = new GetPrinterWorker(env, deferred, printername_u16);
    worker->Queue();

    return deferred.Promise();
}

Napi::Value getPrinterDriverOptions(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    Napi::Error::New(env, "not supported on windows").ThrowAsJavaScriptException();
    return env.Null();
}

Napi::Value getJob(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 2) { Napi::Error::New(env, "Expected 2 arguments").ThrowAsJavaScriptException(); return env.Null(); }
    if (!info[0].IsString()) { Napi::Error::New(env, "Argument 0 must be a string").ThrowAsJavaScriptException(); return env.Null(); }
    std::u16string printername_u16 = info[0].As<Napi::String>().Utf16Value();
    auto printername = printername_u16.c_str();
    if (!info[1].IsNumber()) { Napi::Error::New(env, "Argument 1 must be an integer").ThrowAsJavaScriptException(); return env.Null(); }
    int jobId = info[1].As<Napi::Number>().Int32Value();
    if(jobId < 0)
    {
        Napi::Error::New(env, "Wrong job number").ThrowAsJavaScriptException();
    return env.Null();
    }
    // Open a handle to the printer.
    PrinterHandle printerHandle((LPWSTR)(printername));
    if(!printerHandle)
    {
        std::string error_str("error on PrinterHandle: ");
	error_str += getLastErrorCodeAndMessage();
        Napi::Error::New(env, error_str.c_str()).ThrowAsJavaScriptException();
    return env.Null();
    }
    DWORD size_bytes = 0, dummyBytes = 0;
    GetJobW(*printerHandle, static_cast<DWORD>(jobId), 2, NULL, size_bytes, &size_bytes);
    MemValue<JOB_INFO_2W> job(size_bytes);
    if(!job)
    {
        Napi::Error::New(env, "Error on allocating memory for printers").ThrowAsJavaScriptException();
    return env.Null();
    }
    BOOL bOK = GetJobW(*printerHandle, static_cast<DWORD>(jobId), 2, (LPBYTE)job.get(), size_bytes, &dummyBytes);
    if(!bOK)
    {
        std::string error_str("Error on GetJob. Wrong job id or it was deleted: ");
	error_str += getLastErrorCodeAndMessage();
        Napi::Error::New(env, error_str.c_str()).ThrowAsJavaScriptException();
    return env.Null();
    }
    Napi::Object result_printer_job = Napi::Object::New(env);
    parseJobObject(job.get(), result_printer_job);
    return result_printer_job;
}

Napi::Value setJob(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 3) { Napi::Error::New(env, "Expected 3 arguments").ThrowAsJavaScriptException(); return env.Null(); }
    if (!info[0].IsString()) { Napi::Error::New(env, "Argument 0 must be a string").ThrowAsJavaScriptException(); return env.Null(); }
    std::u16string printername_u16 = info[0].As<Napi::String>().Utf16Value();
    auto printername = printername_u16.c_str();
    if (!info[1].IsNumber()) { Napi::Error::New(env, "Argument 1 must be an integer").ThrowAsJavaScriptException(); return env.Null(); }
    int jobId = info[1].As<Napi::Number>().Int32Value();
    if (!info[2].IsString()) { Napi::Error::New(env, "Argument 2 must be a string").ThrowAsJavaScriptException(); return env.Null(); }
    std::string jobCommandV8 = info[2].As<Napi::String>().Utf8Value();
    if(jobId < 0)
    {
        Napi::Error::New(env, "Wrong job number").ThrowAsJavaScriptException();
    return env.Null();
    }
    std::string jobCommandStr(jobCommandV8);
    StatusMapType::const_iterator itJobCommand = getJobCommandMap().find(jobCommandStr);
    if(itJobCommand == getJobCommandMap().end())
    {
        Napi::Error::New(env, "wrong job command. use getSupportedJobCommands to see the possible commands").ThrowAsJavaScriptException();
    return env.Null();
    }
    DWORD jobCommand = itJobCommand->second;
    // Open a handle to the printer.
    PrinterHandle printerHandle((LPWSTR)(printername));
    if(!printerHandle)
    {
        std::string error_str("error on PrinterHandle: ");
        error_str += getLastErrorCodeAndMessage();
        Napi::Error::New(env, error_str.c_str()).ThrowAsJavaScriptException();
    return env.Null();
    }
    // TODO: add the possibility to set job properties
    // http://msdn.microsoft.com/en-us/library/windows/desktop/dd162978(v=vs.85).aspx
    BOOL ok = SetJobW(*printerHandle, (DWORD)jobId, 0, NULL, jobCommand);
    return Napi::Boolean::New(env, ok == TRUE);
}

Napi::Value getSupportedJobCommands(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    Napi::Array result = Napi::Array::New(env);
    int i = 0;
    for(StatusMapType::const_iterator itJob = getJobCommandMap().begin(); itJob != getJobCommandMap().end(); ++itJob)
    {
        result.Set(i++, Napi::String::New(env, itJob->first.c_str()));
    }
    return result;
}

Napi::Value getSupportedPrintFormats(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    Napi::Array result = Napi::Array::New(env);
    int format_i = 0;

    LPTSTR name = NULL;
    DWORD numBytes = 0, processorsNum = 0;

    // Check the amount of bytes required
    LPWSTR nullVal = NULL;
    EnumPrintProcessorsW(nullVal, nullVal, 1, (LPBYTE)(NULL), numBytes, &numBytes, &processorsNum);
    MemValue<_PRINTPROCESSOR_INFO_1W> processors(numBytes);
    // Retrieve processors
    BOOL isOK = EnumPrintProcessorsW(nullVal, nullVal, 1, (LPBYTE)(processors.get()), numBytes, &numBytes, &processorsNum);

    if(!isOK) {
        std::string error_str("error on EnumPrintProcessorsW: ");
        error_str += getLastErrorCodeAndMessage();
        Napi::Error::New(env, error_str.c_str()).ThrowAsJavaScriptException();
    return env.Null();
    }

    _PRINTPROCESSOR_INFO_1W *pProcessor = processors.get();

    for(DWORD processor_i = 0; processor_i < processorsNum; ++processor_i, ++pProcessor) {
        numBytes = 0;
        DWORD dataTypesNum = 0;
        EnumPrintProcessorDatatypesW(nullVal, pProcessor->pName, 1, (LPBYTE)(NULL), numBytes, &numBytes, &dataTypesNum);
        MemValue<_DATATYPES_INFO_1W> dataTypes(numBytes);
        isOK = EnumPrintProcessorDatatypesW(nullVal, pProcessor->pName, 1, (LPBYTE)(dataTypes.get()), numBytes, &numBytes, &dataTypesNum);

        if(!isOK) {
            std::string error_str("error on EnumPrintProcessorDatatypesW: ");
            error_str += getLastErrorCodeAndMessage();
            Napi::Error::New(env, error_str.c_str()).ThrowAsJavaScriptException();
    return env.Null();
        }

        _DATATYPES_INFO_1W *pDataType = dataTypes.get();
        for(DWORD j = 0; j < dataTypesNum; ++j, ++pDataType) {
            result.Set(format_i++, Napi::String::New(env, (char16_t*)(uint16_t*)(pDataType->pName)));
        }
    }

    return result;
}

class PrintDirectWorker : public Napi::AsyncWorker {
public:
    PrintDirectWorker(Napi::Env env, Napi::Promise::Deferred deferred,
                      std::string data, std::u16string printername, std::u16string docname,
                      std::u16string type)
        : Napi::AsyncWorker(env, "PrintDirectWorker"),
          deferred(deferred), data(data), printername(printername), 
          docname(docname), type(type), job_id(0) {}

    void Execute() override {
        BOOL bStatus = true;
        PrinterHandle printerHandle((LPWSTR)printername.c_str());
        DOC_INFO_1W DocInfo;

        if (!printerHandle)
        {
            std::string error_str("error on PrinterHandle: ");
            error_str += getLastErrorCodeAndMessage();
            SetError(error_str);
            return;
        }

        DocInfo.pDocName = (LPWSTR)docname.c_str();
        DocInfo.pOutputFile =  NULL;
        DocInfo.pDatatype = (LPWSTR)type.c_str();

        job_id = StartDocPrinterW(*printerHandle, 1, (LPBYTE)&DocInfo );
        if (job_id > 0) {
            bStatus = StartPagePrinter(*printerHandle);
            if (bStatus) {
                DWORD totalWritten = 0;
                DWORD remaining = (DWORD)data.size();

                while (remaining > 0) {
                    DWORD bytesWritten = 0;
                    bStatus = WritePrinter(*printerHandle, (LPVOID)(data.c_str() + totalWritten),
                                           remaining, &bytesWritten);
                    if (!bStatus || bytesWritten == 0) {
                        EndPagePrinter(*printerHandle);
                        EndDocPrinter(*printerHandle);
                        std::string error_str("WritePrinter failed after ");
                        error_str += std::to_string(totalWritten);
                        error_str += " of ";
                        error_str += std::to_string(data.size());
                        error_str += " bytes: ";
                        error_str += getLastErrorCodeAndMessage();
                        SetError(error_str);
                        return;
                    }
                    totalWritten += bytesWritten;
                    remaining -= bytesWritten;
                }
                EndPagePrinter(*printerHandle);
            } else {
                std::string error_str("StartPagePrinter error: ");
                error_str += getLastErrorCodeAndMessage();
                SetError(error_str);
                return;
            }
            EndDocPrinter(*printerHandle);
        } else {
            std::string error_str("StartDocPrinterW error: ");
            error_str += getLastErrorCodeAndMessage();
            SetError(error_str);
            return;
        }
    }

    void OnOK() override {
        Napi::Env env = Env();
        deferred.Resolve(Napi::Number::New(env, job_id));
    }

    void OnError(const Napi::Error& e) override {
        deferred.Reject(e.Value());
    }

private:
    Napi::Promise::Deferred deferred;
    std::string data;
    std::u16string printername;
    std::u16string docname;
    std::u16string type;
    DWORD job_id;
};

Napi::Value PrintDirect(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 5) { Napi::Error::New(env, "Expected 5 arguments").ThrowAsJavaScriptException(); return env.Null(); }

    if(info.Length()<=0)
    {
        Napi::Error::New(env, "Argument 0 missing").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string data;
    Napi::Value arg0 = info[0];
    if (!getStringOrBufferFromNapiValue(arg0, data))
    {
        Napi::Error::New(env, "Argument 0 must be a string or Buffer").ThrowAsJavaScriptException();
        return env.Null();
    }

    if (!info[1].IsString()) { Napi::Error::New(env, "Argument 1 must be a string").ThrowAsJavaScriptException(); return env.Null(); }
    std::u16string printername_u16 = info[1].As<Napi::String>().Utf16Value();
    if (!info[2].IsString()) { Napi::Error::New(env, "Argument 2 must be a string").ThrowAsJavaScriptException(); return env.Null(); }
    std::u16string docname_u16 = info[2].As<Napi::String>().Utf16Value();
    if (!info[3].IsString()) { Napi::Error::New(env, "Argument 3 must be a string").ThrowAsJavaScriptException(); return env.Null(); }
    std::u16string type_u16 = info[3].As<Napi::String>().Utf16Value();

    Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);
    PrintDirectWorker* worker = new PrintDirectWorker(env, deferred, data, printername_u16, docname_u16, type_u16);
    worker->Queue();

    return deferred.Promise();
}

class PrintFileWorker : public Napi::AsyncWorker {
public:
    PrintFileWorker(Napi::Env env, Napi::Promise::Deferred deferred,
                    std::string filenameUtf8, std::u16string printername, std::u16string docname)
        : Napi::AsyncWorker(env, "PrintFileWorker"),
          deferred(deferred), filenameUtf8(filenameUtf8), 
          printername(printername), docname(docname), job_id(0) {}

    void Execute() override {
        std::ifstream file(filenameUtf8.c_str(), std::ios::binary | std::ios::ate);
        if (!file.is_open()) {
            SetError("Unable to open file for printing");
            return;
        }

        std::streamsize fileSize = file.tellg();
        if (fileSize <= 0) {
            SetError("File is empty or unable to determine file size");
            return;
        }
        file.seekg(0, std::ios::beg);

        std::string data((size_t)fileSize, '\0');
        if (!file.read(&data[0], fileSize)) {
            SetError("Unable to read file contents");
            return;
        }
        file.close();

        PrinterHandle printerHandle((LPWSTR)printername.c_str());
        if (!printerHandle)
        {
            std::string error_str("error on PrinterHandle: ");
            error_str += getLastErrorCodeAndMessage();
            SetError(error_str);
            return;
        }

        DOC_INFO_1W DocInfo;
        DocInfo.pDocName = (LPWSTR)docname.c_str();
        DocInfo.pOutputFile = NULL;
        DocInfo.pDatatype = (LPWSTR)L"RAW";

        job_id = StartDocPrinterW(*printerHandle, 1, (LPBYTE)&DocInfo );
        if (job_id > 0) {
            if (StartPagePrinter(*printerHandle)) {
                DWORD totalWritten = 0;
                DWORD remaining = (DWORD)data.size();

                while (remaining > 0) {
                    DWORD bytesWritten = 0;
                    if (!WritePrinter(*printerHandle, (LPVOID)(data.c_str() + totalWritten),
                                      remaining, &bytesWritten) || bytesWritten == 0) {
                        EndPagePrinter(*printerHandle);
                        EndDocPrinter(*printerHandle);
                        std::string error_str("WritePrinter failed: ");
                        error_str += getLastErrorCodeAndMessage();
                        SetError(error_str);
                        return;
                    }
                    totalWritten += bytesWritten;
                    remaining -= bytesWritten;
                }
                EndPagePrinter(*printerHandle);
            } else {
                std::string error_str("StartPagePrinter error: ");
                error_str += getLastErrorCodeAndMessage();
                SetError(error_str);
                return;
            }
            EndDocPrinter(*printerHandle);
        } else {
            std::string error_str("StartDocPrinterW error: ");
            error_str += getLastErrorCodeAndMessage();
            SetError(error_str);
            return;
        }
    }

    void OnOK() override {
        Napi::Env env = Env();
        deferred.Resolve(Napi::Number::New(env, job_id));
    }

    void OnError(const Napi::Error& e) override {
        deferred.Reject(e.Value());
    }

private:
    Napi::Promise::Deferred deferred;
    std::string filenameUtf8;
    std::u16string printername;
    std::u16string docname;
    DWORD job_id;
};

Napi::Value PrintFile(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 4) { Napi::Error::New(env, "Expected 4 arguments").ThrowAsJavaScriptException(); return env.Null(); }

    if (!info[0].IsString()) { Napi::Error::New(env, "Argument 0 must be a string").ThrowAsJavaScriptException(); return env.Null(); }
    std::string filenameUtf8 = info[0].As<Napi::String>().Utf8Value();
    if (!info[1].IsString()) { Napi::Error::New(env, "Argument 1 must be a string").ThrowAsJavaScriptException(); return env.Null(); }
    std::u16string docname_u16 = info[1].As<Napi::String>().Utf16Value();
    if (!info[2].IsString()) { Napi::Error::New(env, "Argument 2 must be a string").ThrowAsJavaScriptException(); return env.Null(); }
    std::u16string printername_u16 = info[2].As<Napi::String>().Utf16Value();

    Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);
    PrintFileWorker* worker = new PrintFileWorker(env, deferred, filenameUtf8, printername_u16, docname_u16);
    worker->Queue();

    return deferred.Promise();
}

/**
 * Native Windows Job Monitoring
 */
struct WinJobWatchContext {
    std::u16string printerName;
    DWORD jobId;
    Napi::ThreadSafeFunction tsfn;
};

void watchJobThreadWin(WinJobWatchContext* context) {
    HANDLE hPrinter = NULL;
    if (!OpenPrinterW((LPWSTR)context->printerName.c_str(), &hPrinter, NULL)) {
        context->tsfn.Release();
        delete context;
        return;
    }

    // Connect to printer notifications
    HANDLE hNotify = FindFirstPrinterChangeNotification(hPrinter, PRINTER_CHANGE_JOB, 0, NULL);
    if (hNotify == INVALID_HANDLE_VALUE) {
        ClosePrinter(hPrinter);
        context->tsfn.Release();
        delete context;
        return;
    }

    bool finished = false;
    while (!finished) {
        // Wait for change or timeout (3 sec timeout to allow checking if thread should stop)
        DWORD dwWait = WaitForSingleObject(hNotify, 3000);
        
        if (dwWait == WAIT_OBJECT_0) {
            DWORD dwChange;
            if (FindNextPrinterChangeNotification(hNotify, &dwChange, NULL, NULL)) {
                // Check job status
                DWORD dwNeeded = 0;
                GetJobW(hPrinter, context->jobId, 2, NULL, 0, &dwNeeded);
                if (dwNeeded > 0) {
                    MemValue<JOB_INFO_2W> jobInfo;
                    jobInfo.set((JOB_INFO_2W*)malloc(dwNeeded));
                    if (GetJobW(hPrinter, context->jobId, 2, (LPBYTE)jobInfo.get(), dwNeeded, &dwNeeded)) {
                        DWORD currentState = jobInfo.get()->Status;
                        
                        auto callback = [context, currentState](Napi::Env env, Napi::Function jsCallback) {
                            Napi::Object result = Napi::Object::New(env);
                            Napi::Array statusArr = Napi::Array::New(env);
                            
                            // Map Windows status to strings
                            int i = 0;
                            if (currentState & JOB_STATUS_PRINTING) statusArr.Set(i++, Napi::String::New(env, "PRINTING"));
                            if (currentState & JOB_STATUS_PRINTED) statusArr.Set(i++, Napi::String::New(env, "PRINTED"));
                            if (currentState & JOB_STATUS_PAUSED) statusArr.Set(i++, Napi::String::New(env, "PAUSED"));
                            if (currentState & JOB_STATUS_ERROR) statusArr.Set(i++, Napi::String::New(env, "ERROR"));
                            if (currentState & JOB_STATUS_DELETED) statusArr.Set(i++, Napi::String::New(env, "DELETED"));
                            if (currentState & JOB_STATUS_OFFLINE) statusArr.Set(i++, Napi::String::New(env, "OFFLINE"));
                            if (currentState & JOB_STATUS_PAPEROUT) statusArr.Set((uint32_t)i++, Napi::String::New(env, "PAPER_OUT"));
                            
                            if (i == 0) statusArr.Set((uint32_t)0, Napi::String::New(env, "PENDING"));

                            result.Set("id", Napi::Number::New(env, context->jobId));
                            result.Set("status", statusArr);
                            jsCallback.Call({result});
                        };
                        context->tsfn.BlockingCall(callback);

                        // If job is gone or done
                        if (currentState & (JOB_STATUS_PRINTED | JOB_STATUS_DELETED | JOB_STATUS_ERROR)) {
                            finished = true;
                        }
                    }
                } else {
                    // Job might be gone (completed and cleared)
                    finished = true;
                }
            }
        } else if (dwWait == WAIT_FAILED) {
            finished = true;
        }
    }

    FindClosePrinterChangeNotification(hNotify);
    ClosePrinter(hPrinter);
    context->tsfn.Release();
    delete context;
}

Napi::Value watchJob(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 3) return env.Null();

    std::u16string printerName = info[0].As<Napi::String>().Utf16Value();
    DWORD jobId = info[1].As<Napi::Number>().Uint32Value();
    Napi::Function callback = info[2].As<Napi::Function>();

    WinJobWatchContext* context = new WinJobWatchContext();
    context->printerName = printerName;
    context->jobId = jobId;
    context->tsfn = Napi::ThreadSafeFunction::New(env, callback, "JobMonitor", 0, 1);

    std::thread(watchJobThreadWin, context).detach();
    return env.Undefined();
}

