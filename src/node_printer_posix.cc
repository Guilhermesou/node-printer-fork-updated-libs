#include "node_printer.hpp"

#include <string>
#include <map>
#include <utility>
#include <sstream>


#include <cups/cups.h>
#include <cups/ppd.h>

#pragma GCC diagnostic ignored "-Wdeprecated-declarations"

namespace
{
    typedef std::map<std::string, int> StatusMapType;
    typedef std::map<std::string, std::string> FormatMapType;

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
        STATUS_PRINTER_ADD("PRINTING", IPP_JOB_PROCESSING);
        STATUS_PRINTER_ADD("PRINTED", IPP_JOB_COMPLETED);
        STATUS_PRINTER_ADD("PAUSED", IPP_JOB_HELD);
        // Specific statuses
        STATUS_PRINTER_ADD("PENDING", IPP_JOB_PENDING);
        STATUS_PRINTER_ADD("PAUSED", IPP_JOB_STOPPED);
        STATUS_PRINTER_ADD("CANCELLED", IPP_JOB_CANCELLED);
        STATUS_PRINTER_ADD("ABORTED", IPP_JOB_ABORTED);

#undef STATUS_PRINTER_ADD
        return result;
    }

    const FormatMapType& getPrinterFormatMap()
    {
        static FormatMapType result;
        if(!result.empty())
        {
            return result;
        }
        result.insert(std::make_pair("RAW", CUPS_FORMAT_RAW));
        result.insert(std::make_pair("TEXT", CUPS_FORMAT_TEXT));
#ifdef CUPS_FORMAT_PDF
        result.insert(std::make_pair("PDF", CUPS_FORMAT_PDF));
#endif
#ifdef CUPS_FORMAT_JPEG
        result.insert(std::make_pair("JPEG", CUPS_FORMAT_JPEG));
#endif
#ifdef CUPS_FORMAT_POSTSCRIPT
        result.insert(std::make_pair("POSTSCRIPT", CUPS_FORMAT_POSTSCRIPT));
#endif
#ifdef CUPS_FORMAT_COMMAND
        result.insert(std::make_pair("COMMAND", CUPS_FORMAT_COMMAND));
#endif
#ifdef CUPS_FORMAT_AUTO
        result.insert(std::make_pair("AUTO", CUPS_FORMAT_AUTO));
#endif
        return result;
    }

    /** Parse job info object.
     * @return error string. if empty, then no error
     */
    std::string parseJobObject(const cups_job_t *job, Napi::Object result_printer_job)
    {
        Napi::Env env = result_printer_job.Env();
        //Common fields
        result_printer_job.Set("id", Napi::Number::New(env, job->id));
        result_printer_job.Set("name", Napi::String::New(env, job->title));
        result_printer_job.Set("printerName", Napi::String::New(env, job->dest));
        result_printer_job.Set("user", Napi::String::New(env, job->user));
        std::string job_format(job->format);

        // Try to parse the data format, otherwise will write the unformatted one
        for(FormatMapType::const_iterator itFormat = getPrinterFormatMap().begin(); itFormat != getPrinterFormatMap().end(); ++itFormat)
        {
            if(itFormat->second == job_format)
            {
                job_format = itFormat->first;
                break;
            }
        }

        result_printer_job.Set("format", Napi::String::New(env, job_format.c_str()));
        result_printer_job.Set("priority", Napi::Number::New(env, job->priority));
        result_printer_job.Set("size", Napi::Number::New(env, job->size));
        Napi::Array result_printer_job_status = Napi::Array::New(env);
        int i_status = 0;
        for(StatusMapType::const_iterator itStatus = getJobStatusMap().begin(); itStatus != getJobStatusMap().end(); ++itStatus)
        {
            if(job->state == itStatus->second)
            {
                result_printer_job_status.Set(i_status++, Napi::String::New(env, itStatus->first.c_str()));
                // only one status could be on posix
                break;
            }
        }
        if(i_status == 0)
        {
            // A new status? report as unsupported
            std::ostringstream s;
            s << "unsupported job status: " << job->state;
            result_printer_job_status.Set(i_status++, Napi::String::New(env, s.str().c_str()));
        }

        result_printer_job.Set("status", result_printer_job_status);

        //Specific fields
        // Ecmascript store time in milliseconds, but time_t in seconds

        double creationTime = ((double)job->creation_time) * 1000;
        double completedTime = ((double)job->completed_time) * 1000;
        double processingTime = ((double)job->processing_time) * 1000;

        result_printer_job.Set("completedTime", Napi::Date::New(env, completedTime));
        result_printer_job.Set("creationTime", Napi::Date::New(env, creationTime));
        result_printer_job.Set("processingTime", Napi::Date::New(env, processingTime));

        // No error. return an empty string
        return "";
    }

    /** Parses printer driver PPD options
     */
    void populatePpdOptions(Napi::Object ppd_options, ppd_file_t  *ppd, ppd_group_t *group)
    {
        int i, j;
        ppd_option_t *option;
        ppd_choice_t *choice;
        ppd_group_t *subgroup;

        for (i = group->num_options, option = group->options; i > 0; --i, ++option)
        {
            Napi::Env env = ppd_options.Env();
            Napi::Object ppd_suboptions = Napi::Object::New(env);
            for (j = option->num_choices, choice = option->choices;
                 j > 0;
                 --j, ++choice)
            {
                ppd_suboptions.Set(choice->choice, Napi::Boolean::New(env, static_cast<bool>(choice->marked)));
            }

            ppd_options.Set(option->keyword, ppd_suboptions);
        }

        for (i = group->num_subgroups, subgroup = group->subgroups; i > 0; --i, ++subgroup) {
            populatePpdOptions(ppd_options, ppd, subgroup);
        }
    }

    /** Parse printer driver options
     * @return error string.
     */
    std::string parseDriverOptions(const cups_dest_t * printer, Napi::Object ppd_options)
    {
        const char* filename;
        ppd_file_t *ppd;
        ppd_group_t *group;
        int i;

        std::ostringstream error_str; // error string

        if ((filename = cupsGetPPD(printer->name)) != NULL)
        {
            if ((ppd = ppdOpenFile(filename)) != NULL)
            {
                 ppdMarkDefaults(ppd);
                 cupsMarkOptions(ppd, printer->num_options, printer->options);

                 for (i = ppd->num_groups, group = ppd->groups; i > 0; --i, ++group)
                 {
                    populatePpdOptions(ppd_options, ppd, group);
                 }
                 ppdClose(ppd);
            }
            else
            {
                error_str << "Unable to open PPD filename " << filename << " ";
            }
            unlink(filename);
        }
        else
        {
            error_str << "Unable to get CUPS PPD driver file. ";
        }

        return error_str.str();
    }


    /** Parse printer info object
     * @return error string.
     */
    std::string parsePrinterInfo(const cups_dest_t * printer, Napi::Object result_printer)
    {
        Napi::Env env = result_printer.Env();
        result_printer.Set("name", Napi::String::New(env, printer->name));
        result_printer.Set("isDefault", Napi::Boolean::New(env, static_cast<bool>(printer->is_default)));

        if(printer->instance)
        {
            result_printer.Set("instance", Napi::String::New(env, printer->instance));
        }

        Napi::Object result_printer_options = Napi::Object::New(env);
        cups_option_t *dest_option = printer->options;
        for(int j = 0; j < printer->num_options; ++j, ++dest_option)
        {
            result_printer_options.Set(dest_option->name, Napi::String::New(env, dest_option->value));
        }
        result_printer.Set("options", result_printer_options);
        // Get printer jobs
        cups_job_t * jobs;
        int totalJobs = cupsGetJobs(&jobs, printer->name, 0 /*0 means all users*/, CUPS_WHICHJOBS_ACTIVE);
        std::string error_str;
        if(totalJobs > 0)
        {
            Napi::Array result_priner_jobs = Napi::Array::New(env, totalJobs);
            int jobi =0;
            cups_job_t * job = jobs;
            for(; jobi < totalJobs; ++jobi, ++job)
            {
                Napi::Object result_printer_job = Napi::Object::New(env);
                error_str = parseJobObject(job, result_printer_job);
                if(!error_str.empty())
                {
                    // got an error? break then.
                    break;
                }
                result_priner_jobs.Set(jobi, result_printer_job);
            }
            result_printer.Set("jobs", result_priner_jobs);
        }
        cupsFreeJobs(totalJobs, jobs);
        return error_str;
    }

    /// cups option class to automatically free memory.
    class CupsOptions: public MemValueBase<cups_option_t> {
    protected:
        int num_options;
        virtual void free() {
            if(_value != NULL)
            {
                cupsFreeOptions(num_options, get());
                _value = NULL;
                num_options = 0;
            }
        }
    public:
        CupsOptions(): num_options(0) {}
        ~CupsOptions () { free(); }

        /// Add options from Napi::Object
        CupsOptions(Napi::Object iV8Options): num_options(0) {
            Napi::Array props = iV8Options.GetPropertyNames();

            for(unsigned int i = 0; i < props.Length(); ++i) {
                Napi::Value key = props.Get(i);
                std::string keyStr = key.As<Napi::String>().Utf8Value();
                std::string valStr = iV8Options.Get(key).As<Napi::String>().Utf8Value();

                num_options = cupsAddOption(keyStr.c_str(), valStr.c_str(), num_options, &_value);
            }
        }

        const int& getNumOptions() { return num_options; }
    };
}

Napi::Value getPrinters(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();

    cups_dest_t *printers = NULL;
    int printers_size = cupsGetDests(&printers);
    Napi::Array result = Napi::Array::New(env, printers_size);
    cups_dest_t *printer = printers;
    std::string error_str;
    for(int i = 0; i < printers_size; ++i, ++printer)
    {
        Napi::Object result_printer = Napi::Object::New(env);
        error_str = parsePrinterInfo(printer, result_printer);
        if(!error_str.empty())
        {
            // got an error? break then
            break;
        }
        result.Set(i, result_printer);
    }
    cupsFreeDests(printers_size, printers);
    if(!error_str.empty())
    {
        // got an error? return the error then
        Napi::Error::New(env, error_str.c_str()).ThrowAsJavaScriptException();
        return env.Null();
    }
    return result;
}

// AsyncWorker for getPrintersAsync
struct PrinterData {
    cups_dest_t dest;
    int num_jobs;
    cups_job_t* jobs;
};

class GetPrintersWorker : public Napi::AsyncWorker {
public:
    GetPrintersWorker(Napi::Env env, Napi::Promise::Deferred deferred)
        : Napi::AsyncWorker(env, "GetPrintersWorker"),
          deferred(deferred), dests(nullptr), num_dests(0) {}

    ~GetPrintersWorker() {
        if (dests) {
            cupsFreeDests(num_dests, dests);
        }
        for (auto& pd : printerData) {
            if (pd.jobs) cupsFreeJobs(pd.num_jobs, pd.jobs);
        }
    }

    void Execute() override {
        num_dests = cupsGetDests(&dests);
        for (int i = 0; i < num_dests; i++) {
            PrinterData pd;
            pd.dest = dests[i];
            pd.jobs = nullptr;
            pd.num_jobs = cupsGetJobs(&pd.jobs, dests[i].name, 0, CUPS_WHICHJOBS_ACTIVE);
            printerData.push_back(pd);
        }
    }

    void OnOK() override {
        Napi::Env env = Env();
        Napi::Array result = Napi::Array::New(env, num_dests);
        
        for (int i = 0; i < num_dests; i++) {
            Napi::Object result_printer = Napi::Object::New(env);
            
            result_printer.Set("name", Napi::String::New(env, printerData[i].dest.name));
            result_printer.Set("isDefault", Napi::Boolean::New(env, static_cast<bool>(printerData[i].dest.is_default)));
            
            if(printerData[i].dest.instance) {
                result_printer.Set("instance", Napi::String::New(env, printerData[i].dest.instance));
            }

            Napi::Object result_printer_options = Napi::Object::New(env);
            cups_option_t *dest_option = printerData[i].dest.options;
            for(int j = 0; j < printerData[i].dest.num_options; ++j, ++dest_option) {
                result_printer_options.Set(dest_option->name, Napi::String::New(env, dest_option->value));
            }
            result_printer.Set("options", result_printer_options);

            if (printerData[i].num_jobs > 0) {
                Napi::Array result_printer_jobs = Napi::Array::New(env, printerData[i].num_jobs);
                cups_job_t * job = printerData[i].jobs;
                for(int jobi = 0; jobi < printerData[i].num_jobs; ++jobi, ++job) {
                    Napi::Object result_printer_job = Napi::Object::New(env);
                    std::string err = parseJobObject(job, result_printer_job);
                    if(!err.empty()) break;
                    result_printer_jobs.Set(jobi, result_printer_job);
                }
                result_printer.Set("jobs", result_printer_jobs);
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
    cups_dest_t *dests;
    int num_dests;
    std::vector<PrinterData> printerData;
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
    //This does not return default user printer name according to https://www.cups.org/documentation.php/doc-2.0/api-cups.html#cupsGetDefault2
    //so leave as undefined and JS implementation will loop in all printers
    /*
    const char * printerName = cupsGetDefault();

    // return default printer name only if defined
    if(printerName != NULL) {
        return Napi::String::New(env, printerName);
    }
    */
    return env.Undefined();
}

Napi::Value getPrinter(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 1) { Napi::Error::New(env, "Expected 1 arguments").ThrowAsJavaScriptException(); return env.Null(); }
    if (!info[0].IsString()) { Napi::Error::New(env, "Argument 0 must be a string").ThrowAsJavaScriptException(); return env.Null(); }
    std::string printername = info[0].As<Napi::String>().Utf8Value();

    cups_dest_t *printers = NULL, *printer = NULL;
    int printers_size = cupsGetDests(&printers);
    printer = cupsGetDest(printername.c_str(), NULL, printers_size, printers);
    Napi::Object result_printer = Napi::Object::New(env);
    if(printer != NULL)
    {
        parsePrinterInfo(printer, result_printer);
    }
    cupsFreeDests(printers_size, printers);
    if(printer == NULL)
    {
        // printer not found
        Napi::Error::New(env, "Printer not found").ThrowAsJavaScriptException();
        return env.Null();
    }
    return result_printer;
}

class GetPrinterWorker : public Napi::AsyncWorker {
public:
    GetPrinterWorker(Napi::Env env, Napi::Promise::Deferred deferred, std::string printername)
        : Napi::AsyncWorker(env, "GetPrinterWorker"),
          deferred(deferred), printername(printername), dests(nullptr), num_dests(0), printer(nullptr), jobs(nullptr), num_jobs(0) {}

    ~GetPrinterWorker() {
        if (dests) cupsFreeDests(num_dests, dests);
        if (jobs) cupsFreeJobs(num_jobs, jobs);
    }

    void Execute() override {
        num_dests = cupsGetDests(&dests);
        printer = cupsGetDest(printername.c_str(), NULL, num_dests, dests);
        if (!printer) {
            SetError("Printer not found");
            return;
        }
        num_jobs = cupsGetJobs(&jobs, printer->name, 0, CUPS_WHICHJOBS_ACTIVE);
    }

    void OnOK() override {
        Napi::Env env = Env();
        Napi::Object result_printer = Napi::Object::New(env);
        
        result_printer.Set("name", Napi::String::New(env, printer->name));
        result_printer.Set("isDefault", Napi::Boolean::New(env, static_cast<bool>(printer->is_default)));
        
        if(printer->instance) {
            result_printer.Set("instance", Napi::String::New(env, printer->instance));
        }

        Napi::Object result_printer_options = Napi::Object::New(env);
        cups_option_t *dest_option = printer->options;
        for(int j = 0; j < printer->num_options; ++j, ++dest_option) {
            result_printer_options.Set(dest_option->name, Napi::String::New(env, dest_option->value));
        }
        result_printer.Set("options", result_printer_options);

        if (num_jobs > 0) {
            Napi::Array result_printer_jobs = Napi::Array::New(env, num_jobs);
            cups_job_t * job = jobs;
            for(int jobi = 0; jobi < num_jobs; ++jobi, ++job) {
                Napi::Object result_printer_job = Napi::Object::New(env);
                std::string err = parseJobObject(job, result_printer_job);
                if(!err.empty()) break;
                result_printer_jobs.Set(jobi, result_printer_job);
            }
            result_printer.Set("jobs", result_printer_jobs);
        }

        deferred.Resolve(result_printer);
    }

    void OnError(const Napi::Error& e) override {
        deferred.Reject(e.Value());
    }

private:
    Napi::Promise::Deferred deferred;
    std::string printername;
    cups_dest_t *dests;
    int num_dests;
    cups_dest_t *printer;
    cups_job_t *jobs;
    int num_jobs;
};

Napi::Value getPrinterAsync(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1) { Napi::Error::New(env, "Expected 1 arguments").ThrowAsJavaScriptException(); return env.Null(); }
    if (!info[0].IsString()) { Napi::Error::New(env, "Argument 0 must be a string").ThrowAsJavaScriptException(); return env.Null(); }
    std::string printername = info[0].As<Napi::String>().Utf8Value();

    Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);
    GetPrinterWorker* worker = new GetPrinterWorker(env, deferred, printername);
    worker->Queue();

    return deferred.Promise();
}

Napi::Value getPrinterDriverOptions(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 1) { Napi::Error::New(env, "Expected 1 arguments").ThrowAsJavaScriptException(); return env.Null(); }
    if (!info[0].IsString()) { Napi::Error::New(env, "Argument 0 must be a string").ThrowAsJavaScriptException(); return env.Null(); }
    std::string printername = info[0].As<Napi::String>().Utf8Value();

    cups_dest_t *printers = NULL, *printer = NULL;
    int printers_size = cupsGetDests(&printers);
    printer = cupsGetDest(printername.c_str(), NULL, printers_size, printers);
    Napi::Object driver_options = Napi::Object::New(env);
    if(printer != NULL)
    {
        parseDriverOptions(printer, driver_options);
    }
    cupsFreeDests(printers_size, printers);
    if(printer == NULL)
    {
        // printer not found
        Napi::Error::New(env, "Printer not found").ThrowAsJavaScriptException();
    return env.Null();
    }
    return driver_options;
}

Napi::Value getJob(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 2) { Napi::Error::New(env, "Expected 2 arguments").ThrowAsJavaScriptException(); return env.Null(); }
    if (!info[0].IsString()) { Napi::Error::New(env, "Argument 0 must be a string").ThrowAsJavaScriptException(); return env.Null(); }
    std::string printername = info[0].As<Napi::String>().Utf8Value();
    if (!info[1].IsNumber()) { Napi::Error::New(env, "Argument 1 must be an integer").ThrowAsJavaScriptException(); return env.Null(); }
    int jobId = info[1].As<Napi::Number>().Int32Value();

    Napi::Object result_printer_job = Napi::Object::New(env);
    // Get printer jobs
    cups_job_t *jobs = NULL, *jobFound = NULL;
    int totalJobs = cupsGetJobs(&jobs, printername.c_str(), 0 /*0 means all users*/, CUPS_WHICHJOBS_ALL);
    if(totalJobs > 0)
    {
        int jobi =0;
        cups_job_t * job = jobs;
        for(; jobi < totalJobs; ++jobi, ++job)
        {
            if(job->id != jobId)
            {
                continue;
            }
            // Job Found
            jobFound = job;
            parseJobObject(job, result_printer_job);
            break;
        }
    }
    cupsFreeJobs(totalJobs, jobs);
    if(jobFound == NULL)
    {
        // printer not found
        Napi::Error::New(env, "Printer job not found").ThrowAsJavaScriptException();
    return env.Null();
    }
    return result_printer_job;
}

Napi::Value setJob(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 3) { Napi::Error::New(env, "Expected 3 arguments").ThrowAsJavaScriptException(); return env.Null(); }
    if (!info[0].IsString()) { Napi::Error::New(env, "Argument 0 must be a string").ThrowAsJavaScriptException(); return env.Null(); }
    std::string printername = info[0].As<Napi::String>().Utf8Value();
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
    bool result_ok = false;
    if(jobCommandStr == "CANCEL")
    {
        result_ok = (cupsCancelJob(printername.c_str(), jobId) == 1);
    }
    else
    {
        Napi::Error::New(env, "wrong job command. use getSupportedJobCommands to see the possible commands").ThrowAsJavaScriptException();
    return env.Null();
    }
    return Napi::Boolean::New(env, result_ok);
}

Napi::Value getSupportedJobCommands(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    Napi::Array result = Napi::Array::New(env);
    int i = 0;
    result.Set(i++, Napi::String::New(env, "CANCEL"));
    return result;
}

Napi::Value getSupportedPrintFormats(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    Napi::Array result = Napi::Array::New(env);
    int i = 0;
    for(FormatMapType::const_iterator itFormat = getPrinterFormatMap().begin(); itFormat != getPrinterFormatMap().end(); ++itFormat)
    {
        result.Set(i++, Napi::String::New(env, itFormat->first.c_str()));
    }
    return result;
}

class PrintDirectWorker : public Napi::AsyncWorker {
public:
    PrintDirectWorker(Napi::Env env, Napi::Promise::Deferred deferred, 
                      std::string data, std::string printername, std::string docname, 
                      std::string type, CupsOptions* options)
        : Napi::AsyncWorker(env, "PrintDirectWorker"),
          deferred(deferred), data(data), printername(printername), 
          docname(docname), type(type), options(options), job_id(0) {}

    ~PrintDirectWorker() {
        delete options;
    }

    void Execute() override {
        job_id = cupsCreateJob(CUPS_HTTP_DEFAULT, printername.c_str(), docname.c_str(), options->getNumOptions(), options->get());
        if(job_id == 0) {
            SetError(cupsLastErrorString());
            return;
        }

        if(HTTP_CONTINUE != cupsStartDocument(CUPS_HTTP_DEFAULT, printername.c_str(), job_id, docname.c_str(), type.c_str(), 1)) {
            SetError(cupsLastErrorString());
            return;
        }

        const size_t CHUNK_SIZE = 64 * 1024;
        const char* ptr = data.data();
        size_t remaining = data.size();

        while (remaining > 0) {
            size_t writeSize = (remaining < CHUNK_SIZE) ? remaining : CHUNK_SIZE;
            if (HTTP_CONTINUE != cupsWriteRequestData(CUPS_HTTP_DEFAULT, ptr, writeSize)) {
                cupsFinishDocument(CUPS_HTTP_DEFAULT, printername.c_str());
                SetError(cupsLastErrorString());
                return;
            }
            ptr += writeSize;
            remaining -= writeSize;
        }

        cupsFinishDocument(CUPS_HTTP_DEFAULT, printername.c_str());
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
    std::string printername;
    std::string docname;
    std::string type;
    CupsOptions* options;
    int job_id;
};

Napi::Value PrintDirect(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 5) { Napi::Error::New(env, "Expected 5 arguments").ThrowAsJavaScriptException(); return env.Null(); }

    if(info.Length() <= 0)
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
    std::string printername = info[1].As<Napi::String>().Utf8Value();
    if (!info[2].IsString()) { Napi::Error::New(env, "Argument 2 must be a string").ThrowAsJavaScriptException(); return env.Null(); }
    std::string docname = info[2].As<Napi::String>().Utf8Value();
    if (!info[3].IsString()) { Napi::Error::New(env, "Argument 3 must be a string").ThrowAsJavaScriptException(); return env.Null(); }
    std::string type = info[3].As<Napi::String>().Utf8Value();
    if (!info[4].IsObject()) { Napi::Error::New(env, "Argument 4 must be an object").ThrowAsJavaScriptException(); return env.Null(); }
    Napi::Object print_options = info[4].As<Napi::Object>();

    std::string type_str(type.c_str());
    FormatMapType::const_iterator itFormat = getPrinterFormatMap().find(type_str);
    if(itFormat == getPrinterFormatMap().end())
    {
        Napi::Error::New(env, "unsupported format type").ThrowAsJavaScriptException();
        return env.Null();
    }
    type_str = itFormat->second;

    CupsOptions* options = new CupsOptions(print_options);

    Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);
    PrintDirectWorker* worker = new PrintDirectWorker(env, deferred, data, printername, docname, type_str, options);
    worker->Queue();

    return deferred.Promise();
}

class PrintFileWorker : public Napi::AsyncWorker {
public:
    PrintFileWorker(Napi::Env env, Napi::Promise::Deferred deferred, 
                    std::string filename, std::string printer, std::string docname, 
                    CupsOptions* options)
        : Napi::AsyncWorker(env, "PrintFileWorker"),
          deferred(deferred), filename(filename), printer(printer), 
          docname(docname), options(options), job_id(0) {}

    ~PrintFileWorker() {
        delete options;
    }

    void Execute() override {
        job_id = cupsPrintFile(printer.c_str(), filename.c_str(), docname.c_str(), options->getNumOptions(), options->get());
        if(job_id == 0){
            SetError(cupsLastErrorString());
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
    std::string filename;
    std::string printer;
    std::string docname;
    CupsOptions* options;
    int job_id;
};

Napi::Value PrintFile(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 4) { Napi::Error::New(env, "Expected 4 arguments").ThrowAsJavaScriptException(); return env.Null(); }

    if (!info[0].IsString()) { Napi::Error::New(env, "Argument 0 must be a string").ThrowAsJavaScriptException(); return env.Null(); }
    std::string filename = info[0].As<Napi::String>().Utf8Value();
    if (!info[1].IsString()) { Napi::Error::New(env, "Argument 1 must be a string").ThrowAsJavaScriptException(); return env.Null(); }
    std::string docname = info[1].As<Napi::String>().Utf8Value();
    if (!info[2].IsString()) { Napi::Error::New(env, "Argument 2 must be a string").ThrowAsJavaScriptException(); return env.Null(); }
    std::string printer = info[2].As<Napi::String>().Utf8Value();
    if (!info[3].IsObject()) { Napi::Error::New(env, "Argument 3 must be an object").ThrowAsJavaScriptException(); return env.Null(); }
    Napi::Object print_options = info[3].As<Napi::Object>();

    CupsOptions* options = new CupsOptions(print_options);

    Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);
    PrintFileWorker* worker = new PrintFileWorker(env, deferred, filename, printer, docname, options);
    worker->Queue();

    return deferred.Promise();
}
